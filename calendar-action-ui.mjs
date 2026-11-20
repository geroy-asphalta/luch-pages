// Read-only UI state for the calendar's appointment/referral buttons.
import {labAt} from './planner.mjs';
import {bloodTubeIcon} from './calendar-event-icons.mjs?v=2';

function eligibleCells(state,selection){
 const active=new Set((state.patients||[]).filter(p=>
  ['active','planned'].includes(p.status)&&!(state.people||[]).some(person=>person.id===p.personId&&person.archived)
 ).map(p=>p.id));
 const unique=new Map();
 for(const cell of selection||[]){
  if(!cell?.patientId||!cell?.date||!active.has(cell.patientId))continue;
  unique.set(cell.patientId+'|'+cell.date,{patientId:cell.patientId,date:cell.date});
 }
 return [...unique.values()];
}

// The existing lab action adds missing appointments first, removes pending ones second,
// and never removes an appointment whose referral was already issued.
export function labButtonIntent(state,selection){
 const cells=eligibleCells(state,selection);
 if(!selection?.length)return {mode:'add',disabled:true,label:'Назначить анализ',title:'Сначала выбери ячейки для назначения анализов крови'};
 const statuses=cells.map(c=>labAt(state,c.patientId,c.date));
 if(statuses.some(s=>s===null))return {mode:'add',disabled:false,label:'Назначить анализ',title:'Назначить недостающие анализы крови'};
 if(statuses.some(s=>s==='todo'))return {mode:'remove',disabled:false,label:'Снять назначение',title:'Снять ещё не выданные назначения анализов крови'};
 return {mode:'locked',disabled:true,label:'Назначение выдано',title:'Выданные направления нельзя снять кнопкой назначения; сначала отмени выдачу'};
}

// A week is chosen only when there are no selected cells. For mixed selections,
// issue missing referrals first; already issued referrals stay intact. Only when
// all selected referrals are issued does the same button undo their issued marks.
export function issueButtonIntent(state,selection){
 if(!selection?.length)return {mode:'week',cells:[],disabled:false,label:'Выдать за неделю',title:'Выбрать неделю для выдачи направлений'};
 const cells=eligibleCells(state,selection);
 const toIssue=cells.filter(c=>labAt(state,c.patientId,c.date)!=='issued');
 const undo=toIssue.length===0;
 return {
  mode:undo?'undo':'issue',
  cells:undo?cells:toIssue,
  disabled:cells.length===0,
  label:undo?'Отменить выдачу':'Выдать направления',
  title:undo?'Снять отметку «Выдано» для выбранных ячеек, включая прошедшие даты':
   'Отметить выбранные направления как выданные; ранее выданные остаются без изменений'
 };
}

// The planner already toggles each selected skip independently, including undo.
// This read-only helper selects the icon/tooltip; it must never alter the schedule.
export function skipButtonIntent(state,selection){
 const cells=eligibleCells(state,selection);
 if(!cells.length)return {mode:'skip',label:'Пропустить сеанс',title:'Сначала выбери ячейки пациентов в календаре'};
 const active=cells.filter(c=>(state.events||[]).some(e=>
  e.patientId===c.patientId&&e.date===c.date&&e.type==='skip'&&e.status==='active'
 )).length;
 if(active===cells.length)return {mode:'unskip',label:'Отменить пропуск',title:'Вернуть выбранные пропущенные сеансы в расписание'};
 if(active>0)return {mode:'mixed',label:'Переключить пропуски',title:'Пропущенные сеансы восстановятся, остальные допустимые сеансы будут пропущены'};
 return {mode:'skip',label:'Пропустить сеанс',title:'Пометить выбранные сеансы как пропущенные; повторное нажатие отменяет пропуск'};
}

const base='viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true"';
// The same pink lab test tube is drawn in date cells and in the toolbar.
const toolbarTubeDrawing=bloodTubeIcon.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');
const badge=(mode)=>{
 if(mode==='locked')return '<circle cx="18.5" cy="18" r="4.6" fill="#fff" stroke="#7D858D"/><path d="M16.9 17.4v-1a1.6 1.6 0 0 1 3.2 0v1M16.7 17.4h3.6v3h-3.6z" stroke="#7D858D" fill="#fff"/>';
 const color=mode==='remove'||mode==='undo'?'#C74F57':'#288A5E';
 const sign=mode==='remove'||mode==='undo'?'<path d="M16 18h4.8" stroke="'+color+'" stroke-width="2.2"/>':
  mode==='add'?'<path d="M18.5 15.6v4.8M16.1 18h4.8" stroke="'+color+'" stroke-width="2.1"/>':
  '<path d="M16 18l1.6 1.6 3.2-3.4" stroke="'+color+'" stroke-width="2.1"/>';
 return '<circle cx="18.5" cy="18" r="4.6" fill="#fff" stroke="'+color+'"/>'+sign;
};
export function calendarActionIcon(which,mode){
 if(which==='skip'){
  // Same calendar silhouette, stroke and 24px size as the adjacent calendar action.
  // Only the colored status badge changes: X, undo arrow, or bidirectional arrows.
  const color=mode==='unskip'?'#288A5E':mode==='mixed'?'#AF812D':'#C74F57';
  const symbol=mode==='unskip'
   ?'<path d="M20.8 17.5a2.4 2.4 0 1 1-1.3-2.2M17.9 15.3h1.6v1.6" stroke="'+color+'" stroke-width="1.6"/>'
   :mode==='mixed'
    ?'<path d="M16.3 16.8h4.3m0 0-1.1-1.1m1.1 1.1-1.1 1.1M20.7 19.2h-4.3m0 0 1.1-1.1m-1.1 1.1 1.1 1.1" stroke="'+color+'" stroke-width="1.45"/>'
    :'<path d="M16.8 16.3l3.4 3.4m0-3.4-3.4 3.4" stroke="'+color+'" stroke-width="1.9"/>';
  return '<svg '+base+'><path d="M4 5h14a2 2 0 0 1 2 2v7M4 5v13a2 2 0 0 0 2 2h8M8 3v4M16 3v4M4 9h16M7.5 12.5h2M12 12.5h2M7.5 16h2" />'+
   '<circle cx="18.5" cy="18" r="4.6" fill="#fff" stroke="'+color+'"/>'+symbol+'</svg>';
 }
 if(which==='issue'&&mode==='week'){
  return '<svg '+base+'><path d="M4 5h14a2 2 0 0 1 2 2v7M4 5v13a2 2 0 0 0 2 2h8M8 3v4M16 3v4M4 9h16M7.5 12.5h2M12 12.5h2M7.5 16h2" />'+badge('issue')+'</svg>';
 }
 if(which==='issue'){
  return '<svg '+base+'><path d="M6 3h9l4 4v7M6 3v16a2 2 0 0 0 2 2h6M15 3v4h4M9 10h6M9 13h6M9 16h4" />'+badge(mode)+'</svg>';
 }
 // Same tube shape and colors as the blood-test calendar cells.
 // A small corner badge retains the existing add, remove and locked meanings.
 // The scaled drawing fits 24px without changing date-cell pictograms.
 return '<svg '+base+'><g transform="translate(2 0.5) scale(0.5 0.53)">'+toolbarTubeDrawing+'</g>'+badge(mode)+'</svg>';
}
