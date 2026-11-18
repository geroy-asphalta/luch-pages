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
  if(course.treatmentType==='ХЛТ'){
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

export function toggleTodayTaskDraft(state,id,today){
 const current=todayTaskCandidates(state,today).find(task=>task.id===id);
 if(!current)return {state,changed:false,error:'Задача больше не актуальна. Обнови список.'};
 const checks={...(state.todayTaskChecks||{})};
 const completed=Object.prototype.hasOwnProperty.call(checks,id);
 if(completed)delete checks[id];
 else checks[id]=today;
 return {state:{...state,todayTaskChecks:checks},changed:true,done:!completed};
}
