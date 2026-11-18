// Spreadsheet-like register for synthetic patients. One row per course and one
// row for a person with no courses. Read-only projection: never mutates saved state.
import {schedule,addDays} from './planner.mjs';
import {ICD_C_LOOKUP} from './clinical-dictionaries.mjs';
import {currentCtvName} from './ctv-display.mjs';
import {fieldText} from './dose-zones.mjs';
import {courseProgress,localToday} from './course-progress.mjs';
import {orderedPersonIds,comparePatientEntries} from './patient-order.mjs';

const normalize=value=>String(value??'').trim().toLocaleLowerCase('ru-RU').replaceAll('ё','е');
const statuses={active:'На лечении',planned:'Ожидает начала',completed:'Завершён',early_completed:'Досрочно завершён',archived:'В архиве'};
const currentCourse=c=>c&&['active','planned'].includes(c.status);
const endCache=new WeakMap(); // state is replaced on every committed edit
function courseEnd(state,course){
 if(!course||!course.start||!currentCourse(course))return '';
 // A planned final session is not evidence of a completed treatment.
 let byCourse=endCache.get(state);
 if(!byCourse){byCourse=new Map();endCache.set(state,byCourse);}
 const key=[course.start,course.status,course.machine,course.total,course.ctv].join('|');
 const prior=byCourse.get(course.id);
 if(prior?.key===key)return prior.end;
 const until=addDays(course.start,700);
 const events=schedule(course,state,until);
 let end='';
 for(const [date,entry] of events)if(entry.kind==='session'&&entry.final){end=date;break;}
 byCourse.set(course.id,{key,end});
 return end;
}
function rowFor(state,person,course){
 const archived=Boolean(person.archived||course?.status==='archived');
 const status=archived?'В архиве':course?statuses[course.status]||course.status:'Без курса';
 const notes=[person.notes,course?.notes].filter(Boolean).join(' · ');
 const details=ICD_C_LOOKUP.get(course?.diagnosis);
 const progress=course?courseProgress(state,course,localToday()):null;
 return {
  key:person.id+'|'+(course?.id||'none'),
  personId:person.id,courseId:course?.id||'',
  id:person.id,name:person.name||person.id,courseName:course?.courseName||'',
  diagnosis:course?.diagnosis||'',diagnosisName:details?.name||'',
  ctv:course?currentCtvName(state,course):'',ctvOriginal:course?.ctv||'',boost:Boolean(course?.boost),
  machine:course?.machine||'',eln:person.eln||'',phone:person.phone||'',
  notes,treatmentType:course?.treatmentType||'',
  start:course?.start||'',status,
  progress:progress?(course?.earlyDischarge?course.earlyDischarge.elapsedByCalendar+' / '+course.earlyDischarge.totalAtDecision+' (по датам)':course?.dischargeReview?.decision==='yes'?'Завершён':progress.elapsed+' / '+progress.total):'',
  discharge:course?.dischargeReview?.decision||'',
  total:Number.isFinite(Number(course?.total))?Number(course.total):null,
  rod:course?fieldText(course,'rod'):'',sod:course?fieldText(course,'sod'):'',
  plannedEnd:courseEnd(state,course)||course?.earlyDischarge?.plannedEnd||course?.dischargeReview?.finalDate||'',chemoDate:course?.chemo?.firstDate||'',
  earlyCompleted:Boolean(course?.earlyDischarge),
  archived
 };
}
export function registerRows(state,{search='',filter='all',sort='order'}={}){
 const courseMap=new Map();
 for(const course of state.patients||[]){
   const id=course.personId||course.id;
   if(!courseMap.has(id))courseMap.set(id,[]);
   courseMap.get(id).push(course);
 }
 let rows=[];
 for(const person of state.people||[]){
   const courses=courseMap.get(person.id)||[];
   if(!courses.length)rows.push(rowFor(state,person,null));
   else for(const course of courses)rows.push(rowFor(state,person,course));
 }
 // Legacy courses with no person record remain visible until repaired in the editor.
 const knownPeople=new Set((state.people||[]).map(p=>p.id));
 for(const [id,courses] of courseMap)if(!knownPeople.has(id)){
   const person={id,name:courses[0]?.name||id,phone:'',eln:'',notes:'',archived:false};
   for(const course of courses)rows.push(rowFor(state,person,course));
 }
 const query=normalize(search).split(/\s+/).filter(Boolean);
 rows=rows.filter(row=>{
   if(filter==='active'&&row.status!=='На лечении')return false;
   if(filter==='planned'&&!['Ожидает начала','Без курса'].includes(row.status))return false;
   if(filter==='finished'&&!['Завершён','Досрочно завершён','В архиве'].includes(row.status))return false;
   if(!query.length)return true;
   const text=normalize([
     row.id,row.name,row.courseName,row.diagnosis,row.diagnosisName,row.ctv,row.ctvOriginal,
     row.machine,row.phone,row.notes,row.treatmentType,row.status,row.eln,
     row.start,row.chemoDate,row.total,row.rod,row.sod
   ].join(' '));
   return query.every(word=>text.includes(word));
 });
 const positions=new Map(orderedPersonIds(state).map((id,index)=>[id,index]));
 return rows.sort((a,b)=>comparePatientEntries(a,b,sort,positions));
}
export function registerStats(state,rows){
 return {
  people:(state.people||[]).length,
  courses:(state.patients||[]).length,
  shownRows:rows.length,
  shownPeople:new Set(rows.map(r=>r.personId)).size,
  activeRows:rows.filter(r=>r.status==='На лечении').length
 };
}
