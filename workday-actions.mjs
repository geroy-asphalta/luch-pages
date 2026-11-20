// Administrative work-calendar actions. The physician's treatment rules are not changed.
import {ruProductionDays} from './ru-production-calendar.mjs';
import {calendarDay,productionDay,isWorkingDay,calendarDayDraft,calendarDayRemoveDraft} from './work-calendar.mjs';
import {previewChanges,schedule,addDays} from './planner.mjs';
import {migrateHltBloodDates,chemoWarningsFor} from './chemo-schedule.mjs?v=2';
import {reconcileChemoWorkdayDraft} from './chemo-change.mjs?v=2';

export function productionMonths(year){
 const months=new Map();
 for(const entry of ruProductionDays(year)){
  const key=entry.date.slice(0,7);
  if(!months.has(key)){
   const month=Number(key.slice(-2));
   const name=new Intl.DateTimeFormat('ru-RU',{month:'long',timeZone:'UTC'})
    .format(new Date(Date.UTC(Number(year),month-1,1)));
   months.set(key,{key,title:name.charAt(0).toLocaleUpperCase('ru-RU')+name.slice(1),days:[]});
  }
  months.get(key).days.push(entry);
 }
 return [...months.values()];
}

// Repeated clicks restore the federal schedule instead of leaving a redundant override.
export function productionToggleDraft(state,date){
 const federal=productionDay(state,date);
 if(!federal)return {error:'Для этой даты нет федеральной записи.'};
 const local=calendarDay(state,date);
 const nextWorking=!isWorkingDay(state,date);
 if(local&&nextWorking===Boolean(federal.working)){
  return calendarDayRemoveDraft(state,date);
 }
 return calendarDayDraft(state,{
  date,title:local?.title||federal.title,holiday:local?.holiday??federal.holiday,
  working:nextWorking
 });
}

// Apply the same safety checks that the previous preview/confirmation path used.
export function safeWorkdayChange(before,result,fromDate){
 if(result.error)return {error:result.error};
 const adjustedChemo=reconcileChemoWorkdayDraft(result.state);
 if(adjustedChemo.error)return {error:adjustedChemo.error};
 const after=migrateHltBloodDates(adjustedChemo.state);
 for(const course of before.patients.filter(p=>['active','planned'].includes(p.status))){
  const completed=(before.breakdowns||[]).filter(b=>(b.completed||[]).includes(course.id));
  if(!completed.length)continue;
  const horizon=addDays(completed.map(b=>b.start).sort().at(-1),120);
  const beforeFractions=[...schedule(course,before,horizon)]
   .filter(([,v])=>v.delivered).map(([date,v])=>date+'#'+v.n);
  const changedCourse=after.patients.find(p=>p.id===course.id);
  if(!changedCourse)return {error:'Курс '+course.id+' не найден после изменения календаря.'};
  const afterFractions=[...schedule(changedCourse,after,horizon)]
   .filter(([,v])=>v.delivered).map(([date,v])=>date+'#'+v.n);
  if(beforeFractions.join('|')!==afterFractions.join('|')){
   return {error:'Изменение затрагивает историю проведённых сеансов '+course.name+'. Сначала проверь историю курса.'};
  }
 }
 for(const maintenance of before.maintenance||[]){
  for(const courseId of maintenance.finalBeforeService||[]){
   const course=after.patients.find(p=>p.id===courseId);
   const final=course?schedule(course,after,maintenance.date).get(maintenance.date):null;
   if(!final?.beforeMaintenance||!final.final){
    return {error:'Изменение рабочего календаря затронет последнюю фракцию перед ТО ('+
     maintenance.date+'). Сначала сними исключение в разделе ТО.'};
   }
  }
 }
 const affected=previewChanges(before,after,fromDate);
 const aligned=(after.audit||[]).filter(a=>a.kind==='hlt-lab-align').length-
  (before.audit||[]).filter(a=>a.kind==='hlt-lab-align').length;
 const warnings=[...adjustedChemo.warnings,...after.patients.filter(p=>p.chemo?.firstDate)
  .flatMap(p=>chemoWarningsFor(after,p).filter(w=>w.includes('выдано')&&w.includes('перенос')))];
 return {state:after,affected,aligned,warnings,chemoAdjusted:adjustedChemo.adjusted};
}
