// Administrative early closure of a synthetic radiotherapy course.
// Does not attest that any scheduled fraction was clinically delivered.
import {schedule,addDays} from './planner.mjs';
import {localToday} from './course-progress.mjs';

export const EARLY_DISCHARGE_REASONS=Object.freeze({
  medical:'По медицинским показаниям',
  refusal:'Отказ пациента',
  transfer:'Перевод в другое учреждение',
  other:'Другая причина'
});
const copy=s=>JSON.parse(JSON.stringify(s));
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&
  !Number.isNaN(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;

export function earlyDischargeCourseDraft(state,courseId,{date,reason,comment=''}={},today=localToday()){
  const course=(state.patients||[]).find(c=>c.id===courseId);
  if(!course)return {error:'Курс лечения не найден.'};
  if(!['active','planned'].includes(course.status))
    return {error:'Досрочно завершить можно только активный или запланированный курс.'};
  if(state.people?.find(p=>p.id===course.personId)?.archived)
    return {error:'Карточка пациента в архиве. Сначала восстанови её.'};
  if(!course.start)return {error:'Для досрочного завершения укажи дату начала курса.'};
  if(!validDate(date))return {error:'Выбери корректную дату досрочного завершения.'};
  if(date<course.start)return {error:'Дата выписки не может быть раньше начала курса.'};
  if(!validDate(today)||date>today)return {error:'Дата выписки не может быть в будущем.'};
  if(!Object.hasOwn(EARLY_DISCHARGE_REASONS,reason))
    return {error:'Выбери причину досрочного завершения.'};
  if(typeof comment!=='string'||comment.trim().length>500)
    return {error:'Комментарий должен содержать не более 500 символов.'};
  const note=comment.trim();
  if(reason==='other'&&!note)return {error:'Укажи причину в комментарии.'};

  // Read the current administrative plan BEFORE changing the status.
  // Do not overwrite confirmed sessions, clinical data or historical events.
  const planned=[...schedule(course,state,addDays(course.start,700))]
    .filter(([,entry])=>entry.kind==='session');
  const plannedEnd=planned.find(([,entry])=>entry.final)?.[0]||null;
  if(plannedEnd&&date>=plannedEnd)
    return {error:'Последняя плановая фракция уже наступила. Используй обычное подтверждение выписки.'};
  if((state.breakdowns||[]).some(b=>b.start>date&&(b.completed||[]).includes(courseId)))
    return {error:'Есть подтверждённые сеансы позже выбранной даты. Сначала проверь историю лечения.'};
  if(planned.some(([day,entry])=>day>date&&entry.delivered))
    return {error:'Есть подтверждённые сеансы позже выбранной даты. Сначала проверь историю лечения.'};
  const elapsedByCalendar=planned.filter(([day])=>day<=date).length;
  const explicitlyRecorded=planned.filter(([day,entry])=>day<=date&&entry.delivered).length;

  const next=copy(state),updated=next.patients.find(c=>c.id===courseId);
  const recordedAt=new Date().toISOString();

  // The planned "last fraction before maintenance" is no longer possible after
  // early closure. Release ONLY this course's permissions so the workday
  // calendar is not blocked by an obsolete maintenance exception.
  // Keep provenance in the course record and the append-only audit log.
  const releasedMaintenanceFinals=[];
  for(const maintenance of next.maintenance||[]){
    if(!(maintenance.finalBeforeService||[]).includes(courseId))continue;
    maintenance.finalBeforeService=maintenance.finalBeforeService.filter(id=>id!==courseId);
    releasedMaintenanceFinals.push({
      id:maintenance.id,date:maintenance.date,machine:maintenance.machine
    });
  }

  updated.earlyDischarge={
    date,reason,comment:note,recordedAt,
    priorStatus:course.status,plannedEnd,
    elapsedByCalendar,explicitlyRecorded,totalAtDecision:Number(course.total)||0,
    releasedMaintenanceFinals
  };
  updated.status='early_completed';
  for(const released of releasedMaintenanceFinals){
    (next.audit??=[]).push({
      date:recordedAt,kind:'maintenance-final-remove',
      patientId:course.id,personId:course.personId,day:released.date,
      machine:released.machine,maintenanceId:released.id,
      detail:'Исключение последней фракции перед ТО снято из-за досрочного завершения курса'
    });
  }
  (next.audit??=[]).push({
    date:recordedAt,kind:'course-discharge-early',
    patientId:course.id,personId:course.personId,day:date,
    old:course.status,newStatus:'early_completed',
    detail:course.courseName+' · '+EARLY_DISCHARGE_REASONS[reason]+
      ' · по календарю '+elapsedByCalendar+' из '+course.total+' фракций'
  });
  return {state:next,entry:updated};
}
