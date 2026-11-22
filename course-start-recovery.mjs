// Lossless recovery of previously saved DEMO course start dates.
// Never infer dates from course duration, source photographs or today's date.
import {addDays,schedule} from './planner.mjs';
import {automaticCourseStatus} from './course-start-status.mjs';

export const PHOTO_COURSE_SOURCE='fictional-course-apparatus-2026-11-19-v1';
const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&
 !Number.isNaN(Date.parse(date))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
const supportedAudit=new Set(['course-create','course-update','course-start-recovered']);
const copy=value=>JSON.parse(JSON.stringify(value));

export function missingPhotoCourseStarts(state){
 return (state?.patients||[]).filter(course=>
  course?.importReview?.source===PHOTO_COURSE_SOURCE&&
  !course.start&&['active','planned'].includes(course.status)&&
  (state?.people||[]).some(p=>p.id===course.personId&&!p.archived));
}

// Sources are historical, validated snapshots supplied by this browser,
// not guessed dates. Compare BOTH ids so unrelated courses never mix.
export function collectMissingCourseStartCandidates(state,sources=[]){
 const targets=missingPhotoCourseStarts(state);
 const verifiedSources=[{label:'Журнал текущей базы',state},...sources];
 return targets.map(course=>{
  const possible=new Map();
  const person=(state.people||[]).find(p=>p.id===course.personId);
  function add(date,label,stamp=''){
   if(!validDate(date))return;
   const old=possible.get(date)||{date,sources:[],stamp:''};
   if(!old.sources.includes(label))old.sources.push(label);
   if(stamp>old.stamp)old.stamp=stamp;
   possible.set(date,old);
  }
  for(const source of verifiedSources){
   const historic=source?.state;
   if(!Array.isArray(historic?.patients))continue;
   const matched=historic.patients.find(c=>c.id===course.id&&c.personId===course.personId);
   if(!matched)continue;
   if(matched.start)add(matched.start,source.label||'Сохранённая копия');
   for(const entry of historic.audit||[]){
    if(entry.patientId!==course.id||!supportedAudit.has(entry.kind))continue;
    add(entry.day,(source.label||'Копия')+' · журнал',entry.date||'');
   }
  }
  const options=[...possible.values()].sort((a,b)=>b.stamp.localeCompare(a.stamp)||b.date.localeCompare(a.date));
  return {courseId:course.id,personId:course.personId,name:person?.name||course.name||course.id,
   total:course.total,options};
 });
}

export function restoreMissingCourseStartsDraft(state,choices,offers,{today}={}){
 if(!Array.isArray(choices)||!choices.length)return {error:'Нет выбранных дат для восстановления.'};
 const allowed=new Map((offers||[]).map(p=>[p.courseId,new Set(p.options.map(o=>o.date))]));
 const next=copy(state),restored=[],visited=new Set();
 for(const choice of choices){
  if(!choice||visited.has(choice.courseId))return {error:'Повторяющийся или неверный курс.'};
  visited.add(choice.courseId);
  if(!validDate(choice.date)||!allowed.get(choice.courseId)?.has(choice.date))
   return {error:'Дата не найдена в сохранённой истории курса. Ничего не изменено.'};
  const course=next.patients.find(c=>c.id===choice.courseId);
  if(!course||course.start||course.importReview?.source!==PHOTO_COURSE_SOURCE||
     !['planned','active'].includes(course.status))
   return {error:'Курс уже изменён или не подлежит восстановлению. Ничего не изменено.'};
  const person=next.people.find(p=>p.id===course.personId);
  if(!person||person.archived)return {error:'Карточка пациента недоступна. Ничего не изменено.'};
  course.start=choice.date;
  course.status=automaticCourseStatus(next,course,today)||course.status;
  const planned=[...schedule(course,next,addDays(choice.date,700))]
   .filter(([,event])=>event.kind==='session');
  if(!planned.length)return {error:'Не удалось построить сеансы для '+person.name+'. Ничего не изменено.'};
  restored.push({courseId:course.id,personId:person.id,name:person.name,
   start:choice.date,first:planned[0][0],last:planned.at(-1)[0],count:planned.length});
 }
 const date=new Date().toISOString();
 for(const entry of restored)next.audit.push({date,kind:'course-start-recovered',
  patientId:entry.courseId,day:entry.start,
  detail:'Дата начала восстановлена из существующей записи; подтверждено оператором'});
 return {state:next,restored};
}
