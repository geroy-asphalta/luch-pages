// Administrative reminders for the local-only patient calendar.
// A checkmark acknowledges a reminder; it never orders chemo or discharges a patient.
import {addDays} from './planner.mjs';
import {nextWorkingDay} from './work-calendar.mjs';
import {courseProgress} from './course-progress.mjs';
import {phoneDigitsRU} from './patient-model.mjs';

const eligible=(course,people)=>['active','planned'].includes(course?.status)&&!people.get(course.personId)?.archived;
const surname=name=>String(name||'Пациент').trim().split(/\s+/)[0]||'Пациент';

export function activePatientCount(state){
 const people=new Map((state.people||[]).map(person=>[person.id,person]));
 return new Set((state.patients||[]).filter(c=>eligible(c,people)).map(c=>c.personId)).size;
}

export function todayTaskCandidates(state,today){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(today||'')))return [];
 const people=new Map((state.people||[]).map(person=>[person.id,person]));
 const tomorrow=addDays(today,1);
 const courses=(state.patients||[]).filter(course=>eligible(course,people));
 const results=[];
 for(const course of courses){
  const person=people.get(course.personId);
  const fullName=String(person?.name||course.name||'Пациент').trim();
  const name=surname(fullName);
  if(courseProgress(state,course,today).finalDate===tomorrow){
   results.push({
    id:'discharge-prep:'+course.id+':'+tomorrow,kind:'discharge-prep',courseId:course.id,
    personId:course.personId,surname:name,fullName,
    label:'Сделай выписку — '+name,phoneHref:null
   });
  }
  // The call-and-schedule reminder is a setup task, not a daily reminder
  // for a course whose chemotherapy is already in the live calendar.
  // Use actual infusion events (not the firstDate template), so a manually
  // moved weekly series immediately suppresses the obsolete setup reminder.
  const chemoScheduled=(state.events||[]).some(event=>
   event.patientId===course.id&&event.type==='chemo'&&
   ['planned','administered','given'].includes(event.status));
  if(course.treatmentType==='ХЛТ'&&!chemoScheduled){
   const digits=phoneDigitsRU(person?.phone||'');
   results.push({
    id:'hlt-call:'+course.id,kind:'hlt-call',courseId:course.id,
    personId:course.personId,surname:name,fullName,
    label:'Назначь ХТ — '+name+', и позвони ему',
    phoneHref:digits.length===10?'+7'+digits:null
   });
  }
 }
 // A scheduled lab/referral date is not evidence that blood was collected.
 // Show an administrative review prompt on the next working day for non-HLT
 // patients only. If the person has ANY current HLT course, leave all blood
 // reminders to the separate HLT rule (not implemented here).
 const courseById=new Map(courses.map(course=>[course.id,course]));
 const hltPeople=new Set(courses.filter(course=>course.treatmentType==='ХЛТ')
  .map(course=>course.personId));
 const seenPeople=new Set();
 for(const event of state.events||[]){
  if(event.type!=='lab'||!['todo','issued'].includes(event.status)||
    nextWorkingDay(state,event.date)!==today)continue;
  const course=courseById.get(event.patientId);
  if(!course||course.treatmentType==='ХЛТ'||hltPeople.has(course.personId)||
    seenPeople.has(course.personId))continue;
  const person=people.get(course.personId);
  const fullName=String(person?.name||course.name||'Пациент').trim();
  const name=surname(fullName);
  results.push({
   id:'lab-review:'+course.personId+':'+event.date,kind:'lab-review',
   courseId:course.id,personId:course.personId,surname:name,fullName,
   label:'Посмотри анализы — '+name,phoneHref:null
  });
  seenPeople.add(course.personId);
 }
 // Discharge preparation first, then next-day labs, then HLT call reminders.
 const priority={'discharge-prep':0,'lab-review':1,'hlt-call':2};
 return results.sort((a,b)=>(priority[a.kind]??99)-(priority[b.kind]??99)||
  a.surname.localeCompare(b.surname,'ru')||a.id.localeCompare(b.id));
}

export function todayTasks(state,today){
 const completed=state.todayTaskChecks||{};
 return todayTaskCandidates(state,today).map(task=>({
  ...task,done:Boolean(Object.prototype.hasOwnProperty.call(completed,task.id))
 }));
}

// One catalog entry per task; daily history stores IDs only. This avoids
// repeatedly embedding the same HLT call in every day's Firebase snapshot.
const historyDay=(state,date)=>{
 const entries=state.todayTaskHistory?.[date]||[];
 return entries.map(item=>typeof item==='string'?state.todayTaskCatalog?.[item]:item)
  .filter(Boolean);
};
const storedId=item=>typeof item==='string'?item:item?.id;
const storedTask=task=>Object.fromEntries(Object.entries(task)
 .filter(([key])=>key!=='done'));

export function captureTodayTaskHistoryDraft(state,date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return {state,changed:false};
 const candidates=todayTaskCandidates(state,date);
 const existing=state.todayTaskHistory?.[date]||[];
 const known=new Set(existing.map(storedId));
 const added=candidates.filter(task=>!known.has(task.id));
 if(!added.length&&Array.isArray(state.todayTaskHistory?.[date]))return {state,changed:false};
 const catalog={...(state.todayTaskCatalog||{})};
 for(const task of added)catalog[task.id]=storedTask(task);
 const history={...(state.todayTaskHistory||{}),
  [date]:[...existing,...added.map(task=>task.id)]};
 return {state:{...state,todayTaskHistory:history,todayTaskCatalog:catalog},changed:true};
}

// Historical snapshots are authoritative where they exist. Prior to adoption,
// reconstruct what is still calculable from current scheduling data and warn the UI.
export function tasksForDate(state,date,today=date){
 const snapshot=Array.isArray(state.todayTaskHistory?.[date]);
 const history=snapshot?historyDay(state,date):[];
 const candidates=todayTaskCandidates(state,date);
 const checks=state.todayTaskChecks||{};
 let base;
 if(date===today){
  // Today's list is LIVE: once a course, infusion or blood-date changes,
  // neither stale pending nor stale checked snapshots belong here.
  // Snapshots and checks remain untouched for browsing prior dates.
  base=candidates;
 }else base=snapshot?history:candidates;
 return {tasks:base.map(task=>({...task,
  done:Object.prototype.hasOwnProperty.call(checks,task.id)
 })),snapshot};
}

export function toggleTodayTaskDraft(state,id,today){
 const current=[...todayTaskCandidates(state,today),...historyDay(state,today)]
  .find(task=>task.id===id);
 if(!current)return {state,changed:false,error:'Задача больше не актуальна. Обнови список.'};
 const checks={...(state.todayTaskChecks||{})};
 const completed=Object.prototype.hasOwnProperty.call(checks,id);
 if(completed)delete checks[id];
 else checks[id]=today;
 // Save a task snapshot along with the check. This works for a historical
 // reminder whose current patient/course is already archived.
 const captured=captureTodayTaskHistoryDraft(state,today);
 const history={...(captured.state.todayTaskHistory||{})};
 const previous=history[today]||[];
 const catalog={...(captured.state.todayTaskCatalog||{})};
 if(!previous.some(item=>storedId(item)===current.id)){
  history[today]=[...previous,current.id];
  catalog[current.id]=storedTask(current);
 }
 return {state:{...captured.state,todayTaskChecks:checks,
  todayTaskHistory:history,todayTaskCatalog:catalog},changed:true,done:!completed};
}
