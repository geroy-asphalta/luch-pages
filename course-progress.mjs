// Administrative estimates for synthetic radiotherapy courses. A date passing
// is NOT independent evidence of clinical delivery. Only existing explicit
// delivered flags are evidence recorded by the demo's breakdown workflow.
import {schedule,addDays} from './planner.mjs';

export function localToday(now=new Date()){
 const d=now instanceof Date?now:new Date(now);
 if(Number.isNaN(d.getTime()))return '';
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
const activeCourse=c=>c&&['active','planned'].includes(c.status);
export function courseProgress(state,course,today=localToday()){
 if(!course)return {total:0,elapsed:0,explicit:0,finalDate:null,finalToday:false,completedByCalendar:false};
 const total=Number(course.total)||0;
 if(!activeCourse(course)||!course.start){
   return {total,elapsed:course.dischargeReview?.decision==='yes'?course.dischargeReview.elapsedAtDecision??total:0,
    explicit:course.dischargeReview?.operatorConfirmedLastFraction?1:0,
    finalDate:course.dischargeReview?.finalDate||null,finalToday:false,completedByCalendar:false};
 }
 const until=addDays(course.start,700);
 const events=schedule(course,state,until);
 let elapsed=0,explicit=0,finalDate=null;
 for(const [date,entry] of events){
   if(entry.kind!=='session')continue;
   if(date<today)elapsed++;
   if(entry.delivered)explicit++;
   if(entry.final)finalDate=date;
 }
 return {total,elapsed,explicit,finalDate,finalToday:finalDate===today,
  completedByCalendar:Boolean(finalDate&&finalDate<today)};
}
export function dischargeCandidates(state,today=localToday()){
 return (state.patients||[]).filter(c=>{
   if(!activeCourse(c)||state.people?.find(p=>p.id===c.personId)?.archived)return false;
   if(c.dischargeReview?.finalDate===today)return false; // answered on this last-fraction date
   return courseProgress(state,c,today).finalToday;
 }).map(c=>({course:c,person:state.people?.find(p=>p.id===c.personId),progress:courseProgress(state,c,today)}));
}
// A YES is an explicit user attestation for the last fraction, not an automatic
// inference from the date. It finishes this course but NEVER archives the whole
// person, since other courses may exist.
export function dischargeDecisionDraft(state,courseId,{decision,today=localToday(),confirmFinal=false}={}){
 if(!['yes','no'].includes(decision))return {error:'Выбери «Выписываем» или «Не выписываем».'};
 const course=(state.patients||[]).find(c=>c.id===courseId);
 if(!activeCourse(course))return {error:'Курс не активен или уже завершён.'};
 const progress=courseProgress(state,course,today);
 if(!progress.finalDate||progress.finalDate>today)
  return {error:'Последняя плановая фракция ещё не наступила или дата курса неизвестна.'};
 if(decision==='yes'&&!confirmFinal)return {error:'Перед выпиской подтверди, что последняя фракция действительно проведена и данные сверены.'};
 const next=JSON.parse(JSON.stringify(state)),updated=next.patients.find(x=>x.id===courseId);
 const now=new Date().toISOString();
 updated.dischargeReview={
   decision,finalDate:progress.finalDate,reviewedAt:now,operatorConfirmedLastFraction:decision==='yes'&&Boolean(confirmFinal),
   elapsedAtDecision:Math.min(progress.total,progress.elapsed+(decision==='yes'&&progress.finalToday?1:0))
 };
 if(decision==='yes')updated.status='completed';
 (next.audit??=[]).push({
  date:now,kind:decision==='yes'?'course-discharge':'course-discharge-deferred',
  patientId:courseId,day:progress.finalDate,
  detail:updated.courseName+' · '+(decision==='yes'?'Курс завершён после явного подтверждения последней фракции':'Выписку отложили; курс остаётся активным')
 });
 return {state:next,entry:updated,decision};
}


// Apply all decisions from one dialog as an atomic draft: any invalid course
// rejects the whole batch, so a later error cannot leave half the list discharged.
export function dischargeBatchDraft(state,choices,{today=localToday()}={}){
 if(!Array.isArray(choices)||!choices.length)return {error:'Список пациентов для выписки пуст.'};
 const ids=new Set();
 let next=state;
 for(const choice of choices){
  if(!choice||typeof choice.courseId!=='string'||typeof choice.discharge!=='boolean')
   return {error:'Некорректная отметка в списке выписки.'};
  if(ids.has(choice.courseId))return {error:'В списке выписки повторяется один курс.'};
  ids.add(choice.courseId);
  const result=dischargeDecisionDraft(next,choice.courseId,{
   today,decision:choice.discharge?'yes':'no',confirmFinal:choice.discharge
  });
  if(result.error)return {error:result.error};
  next=result.state;
 }
 return {state:next,discharged:choices.filter(x=>x.discharge).length,deferred:choices.filter(x=>!x.discharge).length};
}
