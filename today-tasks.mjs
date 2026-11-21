// Administrative reminders for the local-only patient calendar.
// A checkmark acknowledges a reminder; it never orders chemo or discharges a patient.
import {weekBounds} from './planner.mjs';
import {nextWorkingDay,priorWorkingDay} from './work-calendar.mjs';
import {courseProgress} from './course-progress.mjs';
import {phoneDigitsRU} from './patient-model.mjs';

const eligible=(course,people)=>['active','planned'].includes(course?.status)&&!people.get(course.personId)?.archived;
const surname=name=>String(name||'Пациент').trim().split(/\s+/)[0]||'Пациент';

// Distinguish names only when DIFFERENT active people share a surname.
// Multiple courses of the same person do not count as namesakes.
const patientTaskLabels=(courses,people)=>{
 const activeNames=new Map();
 for(const course of courses){
  if(activeNames.has(course.personId))continue;
  activeNames.set(course.personId,String(people.get(course.personId)?.name||
   course.name||'Пациент').trim().replace(/\s+/g,' '));
 }
 const groups=new Map();
 for(const [id,full] of activeNames){
  const key=surname(full).toLocaleLowerCase('ru-RU');
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({id,full});
 }
 const labels=new Map();
 const shortName=full=>{
  const words=full.split(/\s+/);
  const initials=words.slice(1,3).map(word=>{
   const letter=word.match(/\p{L}/u)?.[0];
   return letter?letter.toLocaleUpperCase('ru-RU')+'.':'';
  }).join('');
  return surname(full)+(initials?' '+initials:'');
 };
 for(const group of groups.values()){
  if(group.length===1){
   labels.set(group[0].id,surname(group[0].full));
   continue;
  }
  const initialsCount=new Map();
  for(const item of group){
   const key=shortName(item.full).toLocaleLowerCase('ru-RU');
   initialsCount.set(key,(initialsCount.get(key)||0)+1);
  }
  for(const item of group){
   const abbreviated=shortName(item.full);
   labels.set(item.id,initialsCount.get(abbreviated.toLocaleLowerCase('ru-RU'))>1?
    item.full:abbreviated);
  }
 }
 return labels;
};

export function activePatientCount(state){
 const people=new Map((state.people||[]).map(person=>[person.id,person]));
 return new Set((state.patients||[]).filter(c=>eligible(c,people)).map(c=>c.personId)).size;
}

export function todayTaskCandidates(state,today){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(today||'')))return [];
 const people=new Map((state.people||[]).map(person=>[person.id,person]));
 const courses=(state.patients||[]).filter(course=>eligible(course,people));
 const displayNames=patientTaskLabels(courses,people);
 const results=[];
 // One organizational reminder every Thursday, regardless of whether there
 // are currently patients due for discharge. Its date is stable in history.
 if(weekBounds(today)&&new Date(today+'T12:00:00Z').getUTCDay()===4){
  results.push({
   id:'weekly-discharge:'+today,kind:'weekly-discharge',date:today,
   courseId:null,personId:null,surname:'',fullName:'Подать выписку',
   label:'Подать выписку',phoneHref:null
  });
 }
 for(const course of courses){
  const person=people.get(course.personId);
  const fullName=String(person?.name||course.name||'Пациент').trim();
  const name=surname(fullName);
  const shownName=displayNames.get(course.personId)||name;
  const finalDate=courseProgress(state,course,today).finalDate;
  if(finalDate&&priorWorkingDay(state,finalDate)===today){
   results.push({
    id:'discharge-prep:'+course.id+':'+finalDate,kind:'discharge-prep',courseId:course.id,
    personId:course.personId,surname:name,fullName,
    label:'Сделай выписку — '+shownName,phoneHref:null
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
    label:'Назначь ХТ — '+shownName+', и позвони ему',
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
   label:'Посмотри анализы — '+(displayNames.get(course.personId)||name),phoneHref:null
  });
  seenPeople.add(course.personId);
 }
 // Discharge preparation first, then next-day labs, then HLT call reminders.
 const priority={'weekly-discharge':-1,'discharge-prep':0,'lab-review':1,'hlt-call':2};
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
 }else if(snapshot){
  // Old snapshots predate this recurring reminder. Backfill ONLY this
  // date-based Thursday task, not other possibly obsolete course tasks.
  const oldIds=new Set(history.map(task=>task.id));
  base=[...candidates.filter(task=>task.kind==='weekly-discharge'&&!oldIds.has(task.id)),...history];
 }else base=candidates;
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
