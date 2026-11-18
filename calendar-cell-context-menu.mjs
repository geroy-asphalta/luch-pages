// Right-click actions for calendar session cells. Reuses the same intent helpers
// as the toolbar; the controller never mutates treatment or laboratory data.
import {labButtonIntent,issueButtonIntent,skipButtonIntent,calendarActionIcon} from './calendar-action-ui.mjs';

const cellKey=cell=>cell.patientId+'|'+cell.date;
const fromKeys=keys=>[...keys].map(key=>{
 const [patientId,date]=key.split('|');
 return {patientId,date};
});
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));

export function calendarCellContextSelection(selected,cell){
 const key=cellKey(cell);
 // A right-click inside the current rectangle acts on ALL highlighted cells.
 // Outside the rectangle, it targets only the newly right-clicked cell.
 return selected?.has(key)?new Set(selected):new Set([key]);
}

export function calendarCellContextActions(state,cells){
 const skip=skipButtonIntent(state,cells);
 const lab=labButtonIntent(state,cells);
 const issue=issueButtonIntent(state,cells);
 return [
  {id:'skip',label:skip.label,title:skip.title,disabled:!cells.length||(lab.disabled&&issue.disabled),icon:calendarActionIcon('skip',skip.mode)},
  {id:'lab',label:lab.label,title:lab.title,disabled:lab.disabled,icon:calendarActionIcon('lab',lab.mode)},
  {id:'issue',label:issue.label,title:issue.title,disabled:issue.disabled,icon:calendarActionIcon('issue',issue.mode)}
 ];
}

export function setupCalendarCellContextMenu({
 calendar,menu,getState,getSelected,onSelect,onAction,
 doc=typeof document==='undefined'?null:document,
 win=typeof window==='undefined'?null:window
}){
 if(!calendar?.addEventListener||!menu?.addEventListener||!doc?.addEventListener||!win?.addEventListener)
  throw new Error('Не найдены элементы контекстного меню календаря.');
 let opened=false;
 function close(){
  if(!opened)return;
  opened=false;
  menu.classList.add('hidden');
  menu.innerHTML='';
 }
 calendar.addEventListener('contextmenu',event=>{
  const td=event.target?.closest?.('td.day[data-id][data-date]');
  if(!td||!calendar.contains(td))return; // Do not alter the existing ФИО context menu.
  event.preventDefault();
  close();
  const cell={patientId:td.dataset.id,date:td.dataset.date};
  const selected=calendarCellContextSelection(getSelected(),cell);
  onSelect(selected,cell);
  const actions=calendarCellContextActions(getState(),fromKeys(selected));
  const count=selected.size;
  menu.innerHTML='<div class="calendar-cell-menu-summary">'+
    (count===1?'Действия с ячейкой':'Выбрано ячеек: '+count)+'</div>'+
    actions.map(item=>'<button type="button" role="menuitem" data-calendar-cell-action="'+item.id+'" title="'+esc(item.title)+'"'+
      (item.disabled?' disabled':'')+'><span class="calendar-cell-menu-icon" aria-hidden="true">'+item.icon+'</span>'+
      '<span>'+esc(item.label)+'</span></button>').join('');
  menu.classList.remove('hidden');
  opened=true;
  const width=menu.offsetWidth,height=menu.offsetHeight;
  const x=event.clientX||td.getBoundingClientRect().left;
  const y=event.clientY||td.getBoundingClientRect().bottom;
  menu.style.left=Math.max(8,Math.min(x,win.innerWidth-width-8))+'px';
  menu.style.top=Math.max(8,Math.min(y,win.innerHeight-height-8))+'px';
  menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
 });
 menu.addEventListener('click',event=>{
  const button=event.target?.closest?.('button[data-calendar-cell-action]');
  if(!opened||!button||button.disabled)return;
  const which=button.dataset.calendarCellAction;
  if(!['skip','lab','issue'].includes(which))return;
  close();
  onAction(which); // Use the existing toolbar operation against the same selection.
 });
 doc.addEventListener('pointerdown',event=>{
  if(opened&&!menu.contains(event.target))close();
 },true);
 doc.addEventListener('contextmenu',event=>{
  if(opened&&!menu.contains(event.target))close();
 },true);
 doc.addEventListener('keydown',event=>{
  if(!opened)return;
  if(event.key==='Escape'){event.preventDefault();close();}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   const buttons=[...menu.querySelectorAll('button:not(:disabled)')];
   const current=buttons.indexOf(doc.activeElement);
   if(!buttons.length)return;
   const offset=event.key==='ArrowDown'?1:-1;
   buttons[(current+offset+buttons.length)%buttons.length].focus();
   event.preventDefault();
  }
 },true);
 doc.addEventListener('scroll',close,true);
 win.addEventListener('resize',close);
 return {close};
}
