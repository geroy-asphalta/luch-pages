// Scheduling of *planned* chemotherapy administrations and blood-test referral requests.
// Demo only. These events are administrative reminders, not orders, prescriptions, or treatment confirmation.
// A course's first chemotherapy date is frozen once assigned, so maintenance/outages do not silently move chemo.
import {schedule,addDays} from './planner.mjs';
import {priorWorkingDay} from './work-calendar.mjs';

const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
export const isBreastDiagnosis=code=>String(code||'').toUpperCase().slice(0,3)==='C50';
export const isHlt=course=>course?.treatmentType==='ХЛТ';
// Always schedule blood tests BEFORE chemotherapy, on the nearest preceding Mon–Fri.
// Regional/public holidays are not represented in the demo calendar.
export function bloodDateBeforeChemo(chemoDate,state=null){
 if(!validDate(chemoDate))return null;
 return priorWorkingDay(state||{},chemoDate);
}
export function firstRadiationFraction(course,state){
 if(!course.start||!['active','planned'].includes(course.status))return null;
 const events=schedule(course,state,addDays(course.start,400));
 for(const [date,detail] of events)if(detail.kind==='session')return date;
 return null;
}
export function weeklyChemoDates(firstDate,count){
 if(!validDate(firstDate)||!Number.isInteger(count)||count<1||count>52)return [];
 return Array.from({length:count},(_,index)=>addDays(firstDate,index*7));
}
export const chemoEventsFor=(state,courseId)=>state.events.filter(e=>e.patientId===courseId&&e.type==='chemo'&&e.source==='hlt').sort((a,b)=>(a.chemoIndex??0)-(b.chemoIndex??0));
export const linkedLabsFor=(state,courseId)=>state.events.filter(e=>e.patientId===courseId&&e.type==='lab'&&e.source==='hlt').sort((a,b)=>(a.chemoIndex??0)-(b.chemoIndex??0));
export function chemoWarningsFor(state,course){
 const results=[],chemo=course.chemo;
 if(!isHlt(course)||!chemo?.count)return results;
 if(!chemo.firstDate){results.push('Начало ЛТ ещё не известно или нет доступного первого сеанса: даты ХТ и анализов пока не сформированы.');return results;}
 for(const [i,baseDate] of weeklyChemoDates(chemo.firstDate,chemo.count).entries()){
   const changed=(state.events||[]).find(e=>e.patientId===course.id&&e.type==='chemo'&&e.source==='hlt'&&e.chemoIndex===i);
   const date=changed?.date||baseDate;
   if(changed?.nominalDate&&date!==changed.nominalDate)
    results.push('ХТ №'+(i+1)+' по 7-дневному графику '+changed.nominalDate+
     ' перенесена на ближайший рабочий день '+date+'.');
   if(changed?.status==='cancelled'){
    results.push('Введение ХТ №'+(i+1)+' на '+date+' отменено. Проверь связанный анализ и выданные направления.');
    continue;
   }
   const blood=bloodDateBeforeChemo(date,state),original=addDays(date,-1);
   if(original!==blood)results.push('Анализ перед ХТ №'+(i+1)+' перенесён с нерабочего дня '+original+' на предыдущий рабочий день '+blood+'.');
   const issuedWrong=(state.events||[]).find(e=>e.patientId===course.id&&e.type==='lab'&&e.source==='hlt'&&e.chemoIndex===i&&e.status==='issued'&&e.date!==blood);
   if(issuedWrong)results.push('Направление за '+issuedWrong.date+' уже выдано; его нельзя переносить автоматически на '+blood+'. Проверь вручную.');
   const nextDay=addDays(date,1);
   const unrelated=(state.events||[]).find(e=>e.patientId===course.id&&e.type==='lab'&&e.source!=='hlt'&&e.date===nextDay&&e.status!=='cancelled');
   if(unrelated)results.push('Есть отдельное ранее назначенное направление на '+nextDay+' — после ХТ №'+(i+1)+' ('+date+'). Оно не связано автоматически с введением. Проверь, нужно ли его отменить.');
 }
 if(course.start&&course.status!=='archived'){
   const lastFraction=[...schedule(course,state,addDays(course.start,400))].filter(([,c])=>c.kind==='session').at(-1)?.[0]||null;
   const activeDates=weeklyChemoDates(chemo.firstDate,chemo.count).flatMap((baseDate,i)=>{
    const actual=(state.events||[]).find(e=>e.patientId===course.id&&e.type==='chemo'&&e.source==='hlt'&&e.chemoIndex===i);
    return actual?.status==='cancelled'?[]:[actual?.date||baseDate];
   });
   const lastChemo=activeDates.sort().at(-1)||'';
   if(lastFraction&&lastChemo>lastFraction)results.push('Последнее введение ХТ запланировано позже последней расчётной фракции ЛТ: проверь даты.');
 }
 return results;
}
function sameEventDate(event,date){return event&&event.date===date;}
// Mutates only a draft (deep-cloned by the course draft creator/updater).
// Protect issued referrals and confirmed administrations from silent relocation or deletion.
export function applyHltPlanDraft(draft,course,previous,data){
 const before=previous?.chemo||null;
 const oldEvents=draft.events.filter(e=>e.patientId===course.id&&e.source==='hlt'&&['lab','chemo'].includes(e.type));
 if(!isHlt(course)){
   for(const event of oldEvents){
     if(event.type==='lab'&&event.status==='issued')return {error:'Сначала проверь и отмени уже выданное направление на кровь ('+event.date+'), затем отключай ХЛТ.'};
     if(event.type==='chemo'&&event.status!=='planned'&&event.status!=='cancelled')return {error:'Сначала проверь фактически проведённое введение ХТ ('+event.date+').'};
   }
   draft.events=draft.events.filter(e=>!oldEvents.includes(e));
   course.chemo=null;
   return {dates:[],warnings:[]};
 }
 // Keep individual manual decisions on routine edits; protect them from
 // a global change of count, mode, or first date.
 const individuallyChanged=oldEvents.some(e=>e.type==='chemo'&&e.manualChange);
 const count=Number(data.chemoCount);
 if(!Number.isInteger(count)||count<1||count>52)return {error:'Укажи количество введений ХТ: от 1 до 52.'};
 const mode=isBreastDiagnosis(course.diagnosis)?'manual':'first-fraction';
 let firstDate='';
 if(mode==='manual'){
   firstDate=String(data.chemoFirstDate||'').trim();
   if(!validDate(firstDate))return {error:'Для C50 + ХЛТ выбери дату первого введения ХТ в календаре.'};
 }else{
   const sameMode=before?.mode===mode&&previous?.treatmentType==='ХЛТ';
   firstDate=sameMode&&!data.chemoReanchor&&validDate(before.firstDate)?before.firstDate:firstRadiationFraction(course,draft)||'';
 }
 const dates=firstDate?weeklyChemoDates(firstDate,count):[];
 if(individuallyChanged){
  if(before?.firstDate!==firstDate||before?.count!==count||before?.mode!==mode)
   return {error:'Есть индивидуально перенесённые или отменённые капельницы. Изменение всей схемы ХТ может их стереть. Сначала согласуй изменения в календаре.'};
  course.chemo={mode,count,firstDate,intervalDays:7};
  return {dates,warnings:chemoWarningsFor(draft,course)};
 }
 // Manually issued referrals are never moved or detached silently, even when they
 // came from the earlier Google Sheets demonstration rather than this HLT planner.
 if(before?.firstDate&&before.count){
   const beforeDates=weeklyChemoDates(before.firstDate,before.count);
   for(const [index,oldDate] of beforeDates.entries()){
     const originalLabDate=bloodDateBeforeChemo(oldDate,previous?{...draft,calendarDays:previous.calendarDays??draft.calendarDays}:draft);
     const updatedLabDate=dates[index]?bloodDateBeforeChemo(dates[index],draft):null;
     if(originalLabDate===updatedLabDate)continue;
     if(draft.events.some(e=>e.patientId===course.id&&e.type==='lab'&&e.source!=='hlt'&&e.date===originalLabDate&&e.status==='issued'))
       return {error:'На '+originalLabDate+' уже выдано ранее созданное направление на кровь. Проверь и отмени выдачу в календаре перед переносом введения ХТ.'};
   }
 }
 // Preserve existing events at the same dates, including a manually cancelled lab referral.
 // A changed date is blocked if the linked test was already marked "issued".
 for(const previousEvent of oldEvents){
   const newChemoDate=dates[previousEvent.chemoIndex];
   const target=previousEvent.type==='lab'&&newChemoDate?bloodDateBeforeChemo(newChemoDate,draft):newChemoDate;
   if(sameEventDate(previousEvent,target))continue;
   if(previousEvent.type==='lab'&&previousEvent.status==='issued')
     return {error:'Направление на кровь за '+previousEvent.date+' уже выдано. Отмени его в календаре и проверь дату перед изменением плана ХТ.'};
   if(previousEvent.type==='chemo'&&!['planned','cancelled'].includes(previousEvent.status))
     return {error:'Введение ХТ за '+previousEvent.date+' отмечено как проведённое. Нельзя менять его дату автоматически.'};
 }
 const other=draft.events.filter(e=>!oldEvents.includes(e)),newEvents=[];
 for(const [chemoIndex,date] of dates.entries()){
   const bloodDate=bloodDateBeforeChemo(date,draft);
   const chemoOld=oldEvents.find(e=>e.type==='chemo'&&e.chemoIndex===chemoIndex&&e.date===date);
   newEvents.push(chemoOld||{id:'hlt-chem-'+course.id+'-'+chemoIndex,patientId:course.id,date,type:'chemo',status:'planned',source:'hlt',chemoIndex});
   const labOld=oldEvents.find(e=>e.type==='lab'&&e.chemoIndex===chemoIndex&&e.date===bloodDate);
   if(labOld){newEvents.push(labOld);continue;}
   // Respect manual assignments instead of duplicating the same course/day blood event.
   const existingManual=other.find(e=>e.type==='lab'&&e.patientId===course.id&&e.date===bloodDate);
   if(existingManual)continue;
   newEvents.push({id:'hlt-lab-'+course.id+'-'+chemoIndex,patientId:course.id,date:bloodDate,type:'lab',status:'todo',source:'hlt',chemoIndex,chemoDate:date});
 }
 draft.events=other.concat(newEvents);
 const changed=!before||before.count!==count||before.firstDate!==firstDate||before.mode!==mode;
 course.chemo={mode,count,firstDate,intervalDays:7};
 if(changed)(draft.audit??=[]).push({date:new Date().toISOString(),kind:'chemo-plan',patientId:course.id,day:firstDate,detail:(firstDate||'Ожидает даты')+' · '+count+' введений ХТ, анализы накануне'});
 return {dates,warnings:chemoWarningsFor(draft,course)};
}

// Upgrade existing pending browser-local HLT blood reminders to the corrected
// previous-working-day rule. Already-issued referrals stay in place for explicit review.
export function migrateHltBloodDates(state){
 state.events??=[];
 const now=()=>new Date().toISOString();
 for(const course of state.patients||[]){
  if(!isHlt(course)||['completed','archived'].includes(course.status)||!course.chemo?.firstDate||!course.chemo.count)continue;
  for(const [chemoIndex,baseDate] of weeklyChemoDates(course.chemo.firstDate,course.chemo.count).entries()){
   const infusion=state.events.find(e=>e.patientId===course.id&&e.type==='chemo'&&e.source==='hlt'&&e.chemoIndex===chemoIndex);
   if(infusion?.status==='cancelled')continue;
   const chemoDate=infusion?.date||baseDate;
   const target=bloodDateBeforeChemo(chemoDate,state);
   if(!target)continue;
   const lab=state.events.find(e=>e.patientId===course.id&&e.type==='lab'&&e.source==='hlt'&&e.chemoIndex===chemoIndex);
   if(!lab)continue; // Manual referrals may have been reused in an earlier version.
   if(lab.date===target)continue;
   if(lab.status==='issued')continue; // Issued referrals need manual cancellation first.
   const other=state.events.find(e=>e!==lab&&e.patientId===course.id&&e.type==='lab'&&e.date===target&&e.status!=='cancelled');
   const previousDate=lab.date;
   if(other)state.events=state.events.filter(e=>e!==lab);
   else{lab.date=target;lab.chemoDate=chemoDate;}
   (state.audit??=[]).push({date:now(),kind:'hlt-lab-align',patientId:course.id,day:target,detail:'Анализ перед ХТ перенесён с '+previousDate+' на '+target+' (предыдущий рабочий день)'});
  }
 }
 return state;
}
