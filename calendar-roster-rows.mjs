// Read-only representation of people without courses in the unified Patients grid.
// Do not create treatment courses, planned sessions, dates, doses or events.
import {orderedPersonIds,comparePatientEntries} from './patient-order.mjs';

export function calendarRosterRows(state,scheduledCourses,{filter='',sort='order'}={}){
  if(filter)return scheduledCourses; // Apparatus filter applies only to assigned courses.
  const hasAnyCourse=new Set((state.patients||[]).map(c=>c.personId));
  const withoutCourses=(state.people||[])
    .filter(p=>!p.archived&&!hasAnyCourse.has(p.id))
    .map(p=>({
      id:'NO-COURSE-'+p.id,personId:p.id,name:p.name,
      courseName:'Без курса',ctv:'',machine:'',treatmentType:'',
      noCourse:true,status:''
    }));
  const positions=new Map(orderedPersonIds(state).map((id,index)=>[id,index]));
  return [...scheduledCourses,...withoutCourses]
    .sort((a,b)=>comparePatientEntries(a,b,sort,positions));
}
