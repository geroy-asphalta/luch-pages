// Hospital overrides take precedence over the official Russian five-day calendar.
// The federal schedule is bundled for 2026/2027; local/regional days remain user-controlled.
import {ruProductionDay} from './ru-production-calendar.mjs';
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const clone=s=>JSON.parse(JSON.stringify(s));
export const baseWeekend=d=>[0,6].includes(new Date(d+'T00:00:00Z').getUTCDay());
export const calendarDay=(state,date)=>(state?.calendarDays||[]).find(x=>x.date===date)||null;
// Only explicit local overrides can modify a federal holiday or a transferred workday.
export const productionDay=(state,date)=>state?.productionRegion==='RU'?ruProductionDay(date):null;
export const effectiveDay=(state,date)=>calendarDay(state,date)||productionDay(state,date);
export const isWorkingDay=(state,date)=>{
 const entry=effectiveDay(state,date);
 return entry?Boolean(entry.working):!baseWeekend(date);
};
export const isHoliday=(state,date)=>Boolean(effectiveDay(state,date)?.holiday);
export const effectiveDayLabel=(state,date)=>{
 const own=calendarDay(state,date);
 if(own)return (own.title|| (own.holiday?'Праздник':'Исключение'))+' · '+(own.working?'работаем':'не работаем')+' (решение отделения)';
 const federal=productionDay(state,date);
 if(federal)return federal.title+' · '+(federal.working?'работаем':'не работаем')+' (РФ, пятидневка)';
 return baseWeekend(date)?'Выходной':'Рабочий день';
};
export function priorWorkingDay(state,date,{limit=366}={}){
 if(!validDate(date))return null;
 let day=new Date(date+'T00:00:00Z');
 for(let i=0;i<limit;i++){
   day.setUTCDate(day.getUTCDate()-1);
   const result=day.toISOString().slice(0,10);
   if(isWorkingDay(state,result))return result;
 }
 return null;
}
// Find the next department working date, respecting federal production-calendar
// transfers and local overrides. The source date itself is never returned.
export function nextWorkingDay(state,date,{limit=366}={}){
 if(!validDate(date))return null;
 let day=new Date(date+'T00:00:00Z');
 for(let i=0;i<limit;i++){
  day.setUTCDate(day.getUTCDate()+1);
  const result=day.toISOString().slice(0,10);
  if(isWorkingDay(state,result))return result;
 }
 return null;
}
export function calendarDayDraft(state,{date,title='',holiday=true,working=false}){
 if(!validDate(date))return {error:'Укажи корректную дату.'};
 const name=String(title??'').trim().slice(0,90);
 if(holiday&&!name)return {error:'Укажи название праздничного дня.'};
 const s=clone(state);
 s.calendarDays??=[];
 const previous=calendarDay(s,date);
 const entry={date,title:name,holiday:Boolean(holiday),working:Boolean(working)};
 if(previous)Object.assign(previous,entry);
 else s.calendarDays.push(entry);
 (s.audit??=[]).push({date:new Date().toISOString(),kind:'calendar-day',day:date,detail:(entry.holiday?'Праздник · ':'Исключение · ')+(name||date)+' · '+(entry.working?'работаем':'не работаем')});
 return {state:s,entry,previous:previous?clone(calendarDay(state,date)):null};
}
export function calendarDayRemoveDraft(state,date){
 const s=clone(state),before=calendarDay(s,date);
 if(!before)return {error:'Исключение на эту дату не найдено.'};
 s.calendarDays=s.calendarDays.filter(x=>x.date!==date);
 (s.audit??=[]).push({date:new Date().toISOString(),kind:'calendar-day-remove',day:date,detail:before.title||'Возврат обычного недельного графика'});
 return {state:s,entry:before};
}
