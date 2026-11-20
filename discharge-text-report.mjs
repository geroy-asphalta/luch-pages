// Plain-text discharge list for a single calendar month.
// Read-only organizational export; it never attests that a planned
// final fraction has actually been delivered.
import {courseProgress} from './course-progress.mjs';

const validMonth=month=>typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
const hasArchivedCourse=(c,previous)=>c.status==='archived'&&c.previousStatus===previous;
const completedNormally=c=>c.dischargeReview?.decision==='yes'&&
 c.dischargeReview?.operatorConfirmedLastFraction===true&&
 (c.status==='completed'||hasArchivedCourse(c,'completed'));
const completedEarly=c=>Boolean(c.earlyDischarge?.date)&&
 (c.status==='early_completed'||hasArchivedCourse(c,'early_completed'));
const validDay=day=>typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&
 !Number.isNaN(Date.parse(day))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;

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

// Strictly separate confirmed discharges from tentative final-fraction dates.
// The tentative mode excludes already answered "do not discharge" decisions.
export function dischargeTextReport(state,{month,mode='confirmed'}={}){
 if(!validMonth(month))return {error:'Выбери месяц для списка выписок.'};
 if(!['confirmed','planned'].includes(mode))
  return {error:'Неизвестный режим списка выписок.'};
 const persons=new Map((state.people||[]).map(person=>[person.id,person]));
 const grouped=new Map();
 for(const course of state.patients||[]){
  const person=persons.get(course.personId);
  if(!person||!dischargeShortName(person.name))continue;
  let date='';
  if(mode==='confirmed'){
   if(completedEarly(course))date=course.earlyDischarge.date;
   else if(completedNormally(course))date=course.dischargeReview.finalDate;
  }else{
   if(!['active','planned'].includes(course.status)||person.archived||
    course.dischargeReview?.decision==='no'||course.dischargeReview?.decision==='yes')continue;
   date=courseProgress(state,course,month+'-01').finalDate||'';
  }
  if(!validDay(date)||date.slice(0,7)!==month)continue;
  if(!grouped.has(date))grouped.set(date,new Map());
  grouped.get(date).set(person.id,dischargeShortName(person.name));
 }
 const comparator=new Intl.Collator('ru-RU',{sensitivity:'base'}).compare;
 const rows=[...grouped.keys()].sort().map(date=>({
  date,people:[...grouped.get(date).values()].sort(comparator)
 }));
 const text=rows.map(row=>row.date.slice(8,10)+'.'+row.date.slice(5,7)+
  ': '+row.people.join(', ')).join('\n');
 return {month,mode,rows,text,dates:rows.length,people:rows.reduce((total,row)=>total+row.people.length,0)};
}
