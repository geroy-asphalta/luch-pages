// Administrative changes to a course's scheduled HLT infusions.
// Moving infusion N also moves every subsequent slot to N + 7-day intervals.
// Earlier administrations, doses, and actual treatment confirmations are untouched.
import {addDays} from './planner.mjs';
import {isWorkingDay,nextWorkingDay} from './work-calendar.mjs';
import {bloodDateBeforeChemo} from './chemo-schedule.mjs?v=2';

const copy=value=>JSON.parse(JSON.stringify(value));
const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&
 !Number.isNaN(Date.parse(date))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
const eligible=(course,state)=>course?.treatmentType==='ХЛТ'&&
 ['active','planned'].includes(course.status)&&
 !(state.people||[]).some(person=>person.id===course.personId&&person.archived);
const isInfusion=event=>event.type==='chemo'&&event.source==='hlt';
const isLinkedLab=event=>event.type==='lab'&&event.source==='hlt';
// The seven-day medical/organizational anchor is NOT shifted by holidays.
// Only the scheduled appointment is moved to the next working date.
export const effectiveChemoDate=(state,nominal)=>isWorkingDay(state,nominal)?nominal:nextWorkingDay(state,nominal);


export function chemoEventAt(state,courseId,date){
 return (state.events||[]).find(event=>event.patientId===courseId&&
  event.date===date&&isInfusion(event)&&['planned','cancelled'].includes(event.status))||null;
}
export function chemoChangeDraft(state,{eventId,kind,targetDate='',reason=''}={}){
 const events=state.events||[];
 const initial=events.find(event=>event.id===eventId&&isInfusion(event));
 if(!initial)return {error:'Введение ХТ не найдено. Обнови календарь.'};
 const course=(state.patients||[]).find(item=>item.id===initial.patientId);
 if(!eligible(course,state))return {error:'Изменение доступно только для активного курса ХЛТ.'};
 if(!['move','cancel','restore'].includes(kind))return {error:'Неизвестное действие с капельницей.'};
 const note=String(reason??'').trim();
 if(note.length>300)return {error:'Причина изменения ХТ не должна превышать 300 символов.'};
 if(kind==='restore'?initial.status!=='cancelled':initial.status!=='planned')
  return {error:'Статус введения изменился. Обнови календарь.'};
 if(['given','not-given'].includes(initial.administrationOutcome))
  return {error:'Перед изменением плана ХТ сначала сними ручную отметку о проведении или пропуске.'};
 const index=initial.chemoIndex,count=Number(course.chemo?.count);
 if(!Number.isInteger(index)||!Number.isInteger(count)||index<0||index>=count)
  return {error:'Не удалось определить номер введения ХТ в курсе.'};
 const currentDate=initial.date;
 const date=kind==='move'?String(targetDate??'').trim():currentDate;
 if(kind==='move'&&!validDate(date))
  return {error:'Укажи корректную дату для переноса ХТ.'};
if(kind==='restore'&&(!validDate(date)||!isWorkingDay(state,date)))
  return {error:'Восстановить капельницу можно только на рабочий день.'};
 if(kind==='move'&&date===currentDate)
  return {error:'Выбери новую дату капельницы.'};
 const infusions=events.filter(event=>event.patientId===course.id&&isInfusion(event));
 const byIndex=new Map(infusions.map(event=>[event.chemoIndex,event]));
 if(kind==='move'){
  const preceding=byIndex.get(index-1);
  if(preceding&&effectiveChemoDate(state,date)<=preceding.date)
   return {error:'Новая дата должна быть позже предыдущего введения ХТ №'+index+' ('+preceding.date+').'};
 }
 const affected=[];
 if(kind==='move'){
  for(let i=index;i<count;i++){
   const infusion=byIndex.get(i);
   if(!infusion)return {error:'Не найдена капельница №'+(i+1)+'. Проверь целостность плана ХТ.'};
   if(!['planned','cancelled'].includes(infusion.status))
    return {error:'Введение ХТ №'+(i+1)+' уже имеет фактический статус. Менять его дату нельзя.'};
   if(['given','not-given'].includes(infusion.administrationOutcome))
    return {error:'Введение ХТ №'+(i+1)+' имеет ручную отметку о проведении или пропуске. Сначала сними её.'};
   const nominalDate=addDays(date,(i-index)*7);
   const nextDate=effectiveChemoDate(state,nominalDate);
   if(!nextDate)return {error:'Не удалось найти рабочий день для ХТ №'+(i+1)+'.'};
   affected.push({event:infusion,index:i,oldDate:infusion.date,newDate:nextDate,
    nominalDate,status:infusion.status});
  }
 }else{
  affected.push({event:initial,index,oldDate:initial.date,newDate:initial.date,status:initial.status});
 }
 // A future planned infusion may not collide with earlier untouched infusions
 // or with a plan for another course of the same person.
 const affectedIds=new Set(affected.map(entry=>entry.event.id));
 const newDates=new Set();
 for(const entry of affected){
  if(kind==='cancel'||(kind==='move'&&entry.status==='cancelled'))continue;
  if(newDates.has(entry.newDate))
   return {error:'Два введения ХТ попадают на '+entry.newDate+'.'};
  newDates.add(entry.newDate);
  const conflict=events.find(other=>isInfusion(other)&&
   !affectedIds.has(other.id)&&!['cancelled'].includes(other.status)&&
   (state.patients||[]).some(otherCourse=>otherCourse.id===other.patientId&&
    otherCourse.personId===course.personId)&&other.date===entry.newDate);
  if(conflict)return {error:'На '+entry.newDate+' у этого пациента уже есть другое введение ХТ.'};
 }
 const labs=[],warnings=[];
 if(kind==='move'){
  for(const entry of affected){
   const linked=events.find(event=>event.patientId===course.id&&isLinkedLab(event)&&
    event.chemoIndex===entry.index);
   const from=linked?.date||bloodDateBeforeChemo(entry.oldDate,state);
   const to=bloodDateBeforeChemo(entry.newDate,state);
   if(!to)return {error:'Не удалось вычислить дату анализа перед ХТ №'+(entry.index+1)+'.'};
   const external=events.filter(event=>event.patientId===course.id&&event.type==='lab'&&
    event.source!=='hlt'&&event.date===from&&event.status!=='cancelled');
   if(to!==from&&(linked?.status==='issued'||external.some(event=>event.status==='issued')))
    return {error:'Перед ХТ №'+(entry.index+1)+' направление на кровь за '+from+
     ' уже выдано. Сначала отдельно проверь и отмени выдачу.'};
   if(linked&&to!==from&&!['todo','cancelled'].includes(linked.status))
    return {error:'Анализ перед ХТ №'+(entry.index+1)+' уже имеет подтверждённый статус. Автоперенос запрещён.'};
   if(external.length&&from!==to)
    warnings.push('Ручной анализ за '+from+' останется без изменений. Проверь его отдельно.');
   labs.push({index:entry.index,linked,from,to,move:Boolean(linked&&from!==to),
    create:!linked});
  }
  const movingIds=new Set(labs.filter(lab=>lab.move).map(lab=>lab.linked.id));
  const destinationDates=new Set();
  for(const lab of labs){
   if(!lab.linked&&events.some(event=>event.patientId===course.id&&
    event.type==='lab'&&event.date===lab.to&&event.status!=='cancelled'&&
    !movingIds.has(event.id)))lab.create=false;
   if(!lab.move&&!lab.create)continue;
   const duplicate=events.some(other=>other.patientId===course.id&&other.type==='lab'&&
    other.status!=='cancelled'&&other.date===lab.to&&!movingIds.has(other.id)&&
    other.id!==lab.linked?.id);
   if(duplicate)return {error:'На '+lab.to+' уже есть активное направление на кровь. Проверь его перед переносом.'};
   if(destinationDates.has(lab.to))
    return {error:'Несколько связанных анализов попадают на '+lab.to+'. Нужна отдельная проверка.'};
   destinationDates.add(lab.to);
  }
  if(affected.some(entry=>entry.status==='cancelled'))
   warnings.push('Ранее отменённые введения останутся отменёнными, но их даты в последовательности обновятся.');
 }else if(kind==='cancel'){
  warnings.push('Отменяется только выбранное введение. Последующие даты не меняются. Связанные анализы и выданные направления остаются без изменений.');
 }else{
  warnings.push('Восстановление создаёт плановое введение, но не подтверждает его фактическое проведение. Проверь назначение крови.');
 }
 const s=copy(state);
 const changes=[];
 if(kind==='move'){
  for(const entry of affected){
   const mutable=s.events.find(event=>event.id===entry.event.id);
   // Store the nominal date even when the next working day is currently
   // the same as the old actual date; later calendar changes may undo shifts.
   mutable.nominalDate=entry.nominalDate;
   mutable.manualChange=true;
   if(entry.oldDate!==entry.newDate){
    mutable.originalDate??=entry.oldDate;
    mutable.date=entry.newDate;
   }
   if(note)mutable.changeReason=note;
   changes.push({index:entry.index,oldDate:entry.oldDate,newDate:entry.newDate,
    nominalDate:entry.nominalDate,status:entry.status,labBefore:labs.find(lab=>lab.index===entry.index)?.from,
    labAfter:labs.find(lab=>lab.index===entry.index)?.to});
  }
  for(const lab of labs){
   if(lab.move){
    const mutable=s.events.find(event=>event.id===lab.linked.id);
    mutable.date=lab.to;
    mutable.chemoDate=affected.find(entry=>entry.index===lab.index)?.newDate;
   }else if(lab.create){
    const labId='hlt-lab-'+course.id+'-'+lab.index;
    if(s.events.some(event=>event.id===labId))
     return {error:'Идентификатор анализа уже занят; обнови курс перед переносом.'};
    s.events.push({id:labId,patientId:course.id,date:lab.to,type:'lab',
     status:'todo',source:'hlt',chemoIndex:lab.index,
     chemoDate:affected.find(entry=>entry.index===lab.index)?.newDate});
   }
   if(lab.linked&&!lab.move&&lab.linked.status!=='issued'){
    s.events.find(event=>event.id===lab.linked.id).chemoDate=affected.find(entry=>entry.index===lab.index)?.newDate;
   }
   if(lab.linked?.status==='issued'&&lab.from===lab.to&&
      affected.some(entry=>entry.index===lab.index&&entry.oldDate!==entry.newDate))
    warnings.push('Уже выданное направление за '+lab.from+' не изменено. Проверь его связь с новой датой ХТ.');
  }
  // Keep the series' official anchor in sync when its first infusion moves.
  if(index===0)s.patients.find(item=>item.id===course.id).chemo.firstDate=date;
 }else{
  const mutable=s.events.find(event=>event.id===initial.id);
  mutable.status=kind==='cancel'?'cancelled':'planned';
  mutable.manualChange=true;
  if(note)mutable.changeReason=note;
  changes.push({index,oldDate:currentDate,newDate:currentDate,status:mutable.status});
 }
 const title=kind==='move'?'Перенос серии ХТ':kind==='cancel'?'Отмена ХТ':'Восстановление ХТ';
 (s.audit??=[]).push({
  date:new Date().toISOString(),kind:'chemo-'+kind,patientId:course.id,
  day:date,detail:title+' · начиная с №'+(index+1)+' · '+currentDate+
   (kind==='move'?' → '+date+'; последующие через 7 дней':'')+
   ' · затронуто: '+changes.length+(note?' · Причина: '+note:'')
 });
 return {state:s,entry:s.events.find(event=>event.id===initial.id),kind,
  previousDate:currentDate,newDate:date,changes,warnings,
  labDescription:kind==='move'?'Даты связанных невыданных анализов пересчитаны перед новыми введениями ХТ.':
   warnings.join(' ')};
}


// Recalculate ONLY explicitly stored nominal dates after a change to the
// department calendar. The seven-day anchor is immutable; an observed
// nonworking date is moved forward, but never used as the next anchor.
// This operates on a new draft and aborts atomically on any unsafe change.
export function reconcileChemoWorkdayDraft(state){
 const events=state.events||[],courses=state.patients||[];
 const byCourse=new Map(courses.map(c=>[c.id,c]));
 const changes=[];
 for(const infusion of events.filter(isInfusion)){
  const course=byCourse.get(infusion.patientId);
  if(!eligible(course,state)||!validDate(infusion.nominalDate))continue;
  if(!['planned','cancelled'].includes(infusion.status)||
    ['given','not-given'].includes(infusion.administrationOutcome))continue; // factual history is immutable
  const newDate=effectiveChemoDate(state,infusion.nominalDate);
  if(!newDate)return {error:'Не найден рабочий день для капельницы ХТ №'+(infusion.chemoIndex+1)+'.'};
  if(newDate!==infusion.date)changes.push({event:infusion,oldDate:infusion.date,newDate});
 }
 if(!changes.length)return {state,adjusted:0,warnings:[]};
 const byId=new Map(changes.map(c=>[c.event.id,c]));
 // Respect already-delivered infusions and other unchanged plans as well:
 // validate the chronological series and duplicate dates against FINAL dates.
 for(const course of courses){
  const series=events.filter(e=>e.patientId===course.id&&isInfusion(e))
   .sort((a,b)=>a.chemoIndex-b.chemoIndex);
  let lastDate='';
  for(const infusion of series){
   const actual=byId.get(infusion.id)?.newDate||infusion.date;
   if(lastDate&&actual<=lastDate)
    return {error:'Изменение календаря нарушает порядок введений ХТ по курсу '+course.id+
     '. Измени дату или проверь подтверждённые введения.'};
   lastDate=actual;
  }
 }
 for(const change of changes){
  if(change.event.status==='cancelled')continue;
  const course=byCourse.get(change.event.patientId);
  const other=events.find(e=>isInfusion(e)&&e.id!==change.event.id&&e.status!=='cancelled'&&
   byCourse.get(e.patientId)?.personId===course.personId&&
   (byId.get(e.id)?.newDate||e.date)===change.newDate);
  if(other)return {error:'На '+change.newDate+' уже есть другое введение ХТ для этого пациента.'};
 }
 const labs=[],warnings=[];
 for(const change of changes){
  const infusion=change.event;
  const linked=events.find(e=>e.patientId===infusion.patientId&&isLinkedLab(e)&&
   e.chemoIndex===infusion.chemoIndex);
  const to=bloodDateBeforeChemo(change.newDate,state);
  if(!to)return {error:'Не рассчитана дата крови перед ХТ №'+(infusion.chemoIndex+1)+'.'};
  const from=linked?.date||bloodDateBeforeChemo(change.oldDate,state);
  if(linked&&linked.date!==to&&!['todo','cancelled'].includes(linked.status))
   return {error:'Направление на кровь перед ХТ №'+(infusion.chemoIndex+1)+
    ' уже выдано или подтверждено. Автоматический перенос блокирован.'};
  if(from!==to&&events.some(e=>e.patientId===infusion.patientId&&e.type==='lab'&&
   e.source!=='hlt'&&e.date===from&&e.status==='issued'))
   return {error:'Уже выдано отдельное направление на кровь за '+from+
    '. Сначала проверь его перед изменением рабочего календаря.'};
  if(linked?.status==='issued')
   warnings.push('Выданное направление за '+linked.date+' оставлено без изменений. Проверь его связь с новой датой ХТ.');
  labs.push({infusion,linked,from,to});
 }
 const movingLabIds=new Set(labs.filter(x=>x.linked&&x.linked.date!==x.to).map(x=>x.linked.id));
 const destinationDates=new Set();
 for(const lab of labs){
  const key=lab.infusion.patientId+'|'+lab.to;
  if(destinationDates.has(key))
   return {error:'Несколько анализов перед ХТ попадают на '+lab.to+'. Нужна ручная проверка.'};
  destinationDates.add(key);
  if(lab.linked?.date===lab.to)continue;
  const duplicate=events.some(e=>e.patientId===lab.infusion.patientId&&e.type==='lab'&&
   e.status!=='cancelled'&&e.date===lab.to&&!movingLabIds.has(e.id));
  if(duplicate)return {error:'На '+lab.to+' уже запланирован анализ. Автоперенос ХТ остановлен.'};
 }
 const copyState=copy(state);
 for(const change of changes){
  const mutable=copyState.events.find(e=>e.id===change.event.id);
  mutable.date=change.newDate;
  mutable.calendarAdjusted=true;
 }
 for(const lab of labs){
  if(lab.linked?.status==='issued')continue; // Issued records are immutable.
  if(lab.linked){
   const mutable=copyState.events.find(e=>e.id===lab.linked.id);
   mutable.date=lab.to;
   mutable.chemoDate=byId.get(lab.infusion.id).newDate;
  }else{
   // Preserve the same stable linked lab ID as the HLT planner.
   const id='hlt-lab-'+lab.infusion.patientId+'-'+lab.infusion.chemoIndex;
   if(copyState.events.some(e=>e.id===id))
    return {error:'Неоднозначный идентификатор анализа ХТ; проверь данные курса.'};
   copyState.events.push({id,patientId:lab.infusion.patientId,date:lab.to,
    type:'lab',status:'todo',source:'hlt',chemoIndex:lab.infusion.chemoIndex,
    chemoDate:byId.get(lab.infusion.id).newDate});
  }
 }
 for(const change of changes){
  (copyState.audit??=[]).push({date:new Date().toISOString(),
   kind:'chemo-calendar-adjust',patientId:change.event.patientId,day:change.newDate,
   detail:'Рабочий календарь: ХТ №'+(change.event.chemoIndex+1)+
    ' (расчётная '+change.event.nominalDate+') · '+change.oldDate+' → '+change.newDate});
 }
 return {state:copyState,adjusted:changes.length,warnings};
}
