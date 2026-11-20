// A read-only organizational list by the week of the LAST PLANNED LT fraction.
// A planned last fraction is not proof of treatment or actual discharge.
import {addDays,weekBounds} from './planner.mjs';
import {courseProgress,localToday} from './course-progress.mjs';

export function dischargeShortName(value){
 const full=String(value||'').trim().replace(/\s+/g,' ');
 if(!full)return '';
 const parts=full.split(' ');
 const surname=parts[0];
 if(parts.length===1)return surname;
 const initial=word=>{
  const letter=(word.match(/[\p{L}]/u)||[])[0];
  return letter?letter.toLocaleUpperCase('ru-RU')+'.':'';
 };
 const name=initial(parts[1]),patronymic=parts.length>2?initial(parts[2]):'';
 return surname+(name||patronymic?' '+name+patronymic:'');
}

export function nextDischargeWeekStart(today=localToday()){
 const week=weekBounds(today);
 return week?addDays(week.start,7):null;
}

export function dischargeTextReport(state,{weekStart}={}){
 const week=weekBounds(weekStart);
 if(!week)return {error:'Выбери дату недели для списка выписок.'};
 const people=new Map((state.people||[]).map(person=>[person.id,person]));
 const groups=new Map();
 for(const course of state.patients||[]){
  // An early discharge is NOT the planned final fraction. It is deliberately
  // absent from this list. Archived completed courses remain visible in history.
  const eligible=['active','planned','completed'].includes(course.status)||
   (course.status==='archived'&&course.previousStatus==='completed');
  if(!eligible||!course.start)continue;
  const person=people.get(course.personId);
  if(!person||!dischargeShortName(person.name))continue;
  if(person.archived&&['active','planned'].includes(course.status))continue;
  const confirmedEnd=course.dischargeReview?.decision==='yes'?
   course.dischargeReview.finalDate:null;
  const finalDate=confirmedEnd||
   courseProgress(state,{...course,status:'active'},week.start).finalDate;
  if(!finalDate||finalDate<week.start||finalDate>week.end)continue;
  if(!groups.has(finalDate))groups.set(finalDate,new Map());
  groups.get(finalDate).set(person.id,dischargeShortName(person.name));
 }
 const collator=new Intl.Collator('ru-RU',{sensitivity:'base'});
 const rows=[...groups.keys()].sort().map(date=>({
  date,people:[...groups.get(date).values()].sort(collator.compare)
 }));
 return {
  weekStart:week.start,weekEnd:week.end,rows,
  dates:rows.length,
  people:rows.reduce((total,row)=>total+row.people.length,0),
  text:rows.map(row=>row.date.slice(8,10)+'.'+row.date.slice(5,7)+': '+
   row.people.join(', ')).join('\n')
 };
}
