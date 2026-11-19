// Administrative course status based on the FIRST scheduled radiotherapy fraction.
// This never confirms a fraction as delivered and never alters clinical assignments.
import {schedule,addDays} from './planner.mjs';
import {localToday} from './course-progress.mjs';

const eligible=course=>Boolean(course&&['active','planned'].includes(course.status));
const isoDate=date=>/^\d{4}-\d{2}-\d{2}$/.test(String(date||''));

export function firstScheduledFractionDate(state,course){
 if(!eligible(course)||!isoDate(course.start))return '';
 // Use the existing calendar engine, including weekends, Russian holidays,
 // workday exceptions, skips, downtime and technical maintenance.
 const plan=schedule(course,state,addDays(course.start,700));
 for(const [date,entry] of plan)if(entry.kind==='session')return date;
 return '';
}

export function automaticCourseStatus(state,course,today=localToday()){
 if(!eligible(course)||!isoDate(course.start)||!isoDate(today))return null;
 const first=firstScheduledFractionDate(state,course);
 // Without a schedulable first fraction, the course has not begun.
 return first&&first<=today?'active':'planned';
}

// Pure draft operation. Keep finished, archived, early-closed and undated courses
// untouched; never add treatment events or change the planned treatment calendar.
export function syncCourseStartStatusesDraft(state,today=localToday()){
 if(!state||!Array.isArray(state.patients))return {state,changed:false,count:0};
 let next=null,count=0;
 for(const course of state.patients){
   if(state.people?.some(p=>p.id===course.personId&&p.archived))continue;
   const status=automaticCourseStatus(state,course,today);
   if(!status||status===course.status)continue;
   if(!next)next=JSON.parse(JSON.stringify(state));
   const target=next.patients.find(p=>p.id===course.id);
   const old=target.status;
   target.status=status;
   (next.audit??=[]).push({
     date:new Date().toISOString(),kind:'course-start-auto',
     patientId:course.id,day:firstScheduledFractionDate(state,course),
     old,newStatus:status,detail:'Статус курса рассчитан по дате первой плановой фракции'
   });
   count++;
 }
 return {state:next||state,changed:Boolean(next),count};
}
