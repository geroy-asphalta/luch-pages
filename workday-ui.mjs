// Operator-owned Russian calendar of holidays and local working-day exceptions.
// Changing organizational dates immediately recalculates demo plans; no clinical orders.
import {calendarDay,productionDay,effectiveDayLabel,calendarDayDraft,calendarDayRemoveDraft,isWorkingDay,baseWeekend} from './work-calendar.mjs';
import {RU_PRODUCTION_YEARS} from './ru-production-calendar.mjs';
import {pretty} from './planner.mjs';
import {productionMonths,productionToggleDraft,safeWorkdayChange} from './workday-actions.mjs';

const el=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yes=v=>v?'Работаем':'Не работаем';

export function createWorkdayUI({getState,commitState,renderApp,notice}){
 const expandedMonths=new Set();

 function renderProduction(){
  const list=el('production-list');
  // Keep the currently expanded months open after every calendar recalculation.
  for(const month of list.querySelectorAll('details[data-production-month]')){
   const key=month.dataset.productionMonth;
   if(month.open)expandedMonths.add(key);
   else expandedMonths.delete(key);
  }
  const year=Number(el('production-year').value||RU_PRODUCTION_YEARS[0]);
  const state=getState();
  list.innerHTML=productionMonths(year).map(month=>{
   const workingCount=month.days.filter(d=>isWorkingDay(state,d.date)).length;
   const overridden=month.days.filter(d=>calendarDay(state,d.date)).length;
   const days=month.days.map(day=>{
    const local=calendarDay(state,day.date);
    const working=isWorkingDay(state,day.date);
    const type=day.kind==='working-transfer'?'Перенесённый рабочий день':
     day.kind==='transfer'?'Перенесённый выходной':'Государственный праздник';
    return '<div class="holiday-day-row'+(local?' is-overridden':'')+'">'+
     '<div class="holiday-day-info"><b>'+pretty(day.date)+' · '+esc(day.title)+'</b>'+
     '<small>'+type+(local?' · решение отделения':'')+'</small></div>'+
     '<button class="holiday-toggle'+(working?' is-working':'')+'" type="button" '+
     'data-production-toggle="'+day.date+'" aria-pressed="'+working+'" '+
     'aria-label="'+esc(pretty(day.date)+' · '+day.title+': '+yes(working)+'. Нажми, чтобы переключить')+'">'+
     '<span aria-hidden="true">'+(working?'✓':'○')+'</span> '+yes(working)+'</button></div>';
   }).join('');
   return '<details class="holiday-month" data-production-month="'+month.key+'"'+
    (expandedMonths.has(month.key)?' open':'')+'>'+
    '<summary><span class="holiday-month-name">'+esc(month.title)+'</span>'+
    '<span class="holiday-month-meta">'+month.days.length+' дат'+
    (workingCount?' · работаем '+workingCount:'')+
    (overridden?' · изменено '+overridden:'')+'</span>'+
    '<span class="holiday-chevron" aria-hidden="true">⌄</span></summary>'+
    '<div class="holiday-month-days">'+days+'</div></details>';
  }).join('')||'<p class="muted">Для выбранного года праздничные дни не загружены.</p>';
 }

 function render(){
  renderProduction();
  const entries=(getState().calendarDays||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
  el('workday-list').innerHTML=entries.length?entries.map(entry=>
   '<div class="workday-row"><div><b>'+pretty(entry.date)+' · '+esc(entry.title||'Исключение')+'</b>'+
   '<small>'+(entry.holiday?'Праздник':'Исключение')+' · '+
   (baseWeekend(entry.date)?'обычно выходной':'обычно будний день')+'</small></div>'+
   '<div class="workday-actions">'+
   '<button type="button" data-work-toggle="'+entry.date+'" class="'+(entry.working?'working':'nonworking')+'">'+yes(entry.working)+'</button>'+
   '<button type="button" data-work-edit="'+entry.date+'">Изменить</button>'+
   '<button type="button" data-work-remove="'+entry.date+'">Удалить</button></div></div>'
  ).join(''):'<p class="workday-empty">Дополнительных решений отделения пока нет.</p>';
  const current=el('workday-date').value;
  el('workday-status').textContent=current?'По этой дате: '+effectiveDayLabel(getState(),current):'Выбери дату';
 }

 function edit(date){
  const item=calendarDay(getState(),date)||productionDay(getState(),date);
  el('workday-advanced').open=true;
  el('workday-date').value=date;
  el('workday-title').value=item?.title||'';
  el('workday-type').value=item?.holiday===false?'exception':'holiday';
  el('workday-working').checked=item?.working??!baseWeekend(date);
  render();
  el('workday-date').focus();
 }

 function apply(result,date){
  const outcome=safeWorkdayChange(getState(),result,date);
  if(outcome.error){notice(outcome.error);return;}
  commitState(outcome.state);
  renderApp();
  const message='Календарь обновлён. Изменено плановых курсов: '+outcome.affected.length+
   ' · перенесено невыданных анализов перед ХТ: '+outcome.aligned+'.';
  const warning=outcome.warnings.length?
   ' Внимание: ранее выданные направления не перенесены. Проверь их даты вручную.':'';
  el('workday-feedback').textContent=message+warning;
  el('workday-feedback').classList.remove('hidden');
  notice(outcome.warnings.length?'Календарь обновлён · проверь выданные направления':
   'Рабочий календарь обновлён');
 }

 function setup(){
  const dateInput=el('workday-date');
  dateInput.onchange=()=>{
   const previous=calendarDay(getState(),dateInput.value)||productionDay(getState(),dateInput.value);
   if(previous)edit(dateInput.value);
   else{
    el('workday-title').value='';
    el('workday-type').value='holiday';
    el('workday-working').checked=false;
    render();
   }
  };
  el('workday-form').onsubmit=event=>{
   event.preventDefault();
   const date=dateInput.value,holiday=el('workday-type').value==='holiday';
   apply(calendarDayDraft(getState(),{date,title:el('workday-title').value,
    holiday,working:el('workday-working').checked}),date);
  };
  el('production-year').onchange=renderProduction;
  el('production-list').addEventListener('toggle',event=>{
   const details=event.target;
   if(!details.matches?.('details[data-production-month]')||!details.isConnected)return;
   if(details.open)expandedMonths.add(details.dataset.productionMonth);
   else expandedMonths.delete(details.dataset.productionMonth);
  },true);
  el('production-list').onclick=event=>{
   const button=event.target.closest('button[data-production-toggle]');
   if(!button)return;
   const date=button.dataset.productionToggle;
   apply(productionToggleDraft(getState(),date),date);
  };
  el('workday-list').onclick=event=>{
   const button=event.target.closest('button');
   if(!button)return;
   if(button.dataset.workEdit){edit(button.dataset.workEdit);return;}
   const date=button.dataset.workToggle||button.dataset.workRemove;
   const entry=calendarDay(getState(),date);
   if(!entry)return;
   if(button.dataset.workToggle){
    apply(calendarDayDraft(getState(),{...entry,working:!entry.working}),date);
   }else if(button.dataset.workRemove){
    apply(calendarDayRemoveDraft(getState(),date),date);
   }
  };
  render();
 }

 function reset(){
  expandedMonths.clear();
  el('production-year').value='2026';
  el('workday-date').value='';
  el('workday-title').value='';
  el('workday-type').value='holiday';
  el('workday-working').checked=false;
  el('workday-feedback').textContent='';
  el('workday-feedback').classList.add('hidden');
  render();
 }
 return {setup,render,reset};
}
