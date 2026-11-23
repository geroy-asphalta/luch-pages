// iPhone card-week view. Pure presentation of the SAME planner/state as desktop.
// Never persists medical data or changes clinical planning rules.
import {addDays,labAt,machineAt,schedule,isWeekend} from './planner.mjs';
import {isWorkingDay} from './work-calendar.mjs';
import {calendarRosterRows} from './calendar-roster-rows.mjs';
import {calendarContact} from './calendar-contact.mjs';
import {currentCtvName} from './ctv-display.mjs';
import {courseProgress,localToday,radiationSessionCompletion} from './course-progress.mjs';
import {tasksForDate,todayTasks} from './today-tasks.mjs';
import {calendarCellContextActions} from './calendar-cell-context-menu.mjs';
import {skippedFractionIcon,bloodTubeIcon,chemoInfusionIcon,chemoInfusionMissedIcon} from './calendar-event-icons.mjs?v=4';
import {maintenanceWrenchSvg} from './calendar-maintenance-icon.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const weekDays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
export function mobileWeekStart(date){
 const day=new Date(date+'T12:00:00Z');
 if(Number.isNaN(day.getTime()))return null;
 return addDays(date,-((day.getUTCDay()+6)%7));
}
export function mobileWeekDates(date){
 const monday=mobileWeekStart(date);
 return monday?Array.from({length:7},(_,index)=>addDays(monday,index)):[];
}
export function mobileDayState(state,course,date,today=localToday(),plan=null){
 if(course.noCourse)return {kind:'empty',label:'—',secondary:'',title:'Курс ещё не назначен'};
 const item=(plan||schedule(course,state,date)).get(date);
 const lab=labAt(state,course.id,date);
 const infusion=(state.events||[]).find(e=>e.patientId===course.id&&e.date===date&&e.type==='chemo'&&
  (['planned','administered','given'].includes(e.status)||e.status==='cancelled'));
 const chemo=Boolean(infusion);
 const infusionMissed=infusion?.status==='cancelled'||infusion?.administrationOutcome==='not-given';
 const working=isWorkingDay(state,date);
 const completion=radiationSessionCompletion(item,date,today);
 let kind=item?.kind||(!working?'off':'empty');
 if(item?.kind==='session'&&item.final)kind='final';
 let label=item?.kind==='session'?(completion.completed?'✓':'ЛТ'):
  item?.kind==='maintenance'?'ТО':item?.kind==='breakdown'?'!':
  item?.kind==='skip'?'Х':'—';
 let secondary=chemo&&lab?(infusionMissed?'ХТ×':'ХТ')+'·'+(lab==='issued'?'В':'АН'):
  lab==='todo'?'АН':lab==='issued'?'ВЫД':chemo?(infusionMissed?'ХТ×':'ХТ'):'';
 if(!item||item.kind==='session'){
  if(lab&&!chemo){kind=lab==='issued'?'issued':'lab';if(!item){label=lab==='issued'?'ВЫД':'АН';secondary='';}}
  if(chemo&&!lab){kind=infusionMissed?'chemo-missed':'chemo';if(!item){label=infusionMissed?'ХТ×':'ХТ';secondary='';}}
  if(chemo&&lab){kind='lab-chemo';if(!item){label='ХТ';secondary=lab==='issued'?'ВЫД':'АН';}}
 }
 // A final fraction is still visually final, even with adjacent lab/HT events.
 if(item?.final)kind='final';
 const title=[date,item?.kind==='session'?'Сеанс ЛТ '+item.n:
  item?.kind==='skip'?'Пропуск ЛТ':item?.kind==='maintenance'?'ТО установки':
  item?.kind==='breakdown'?'Поломка аппарата':!working?'Нерабочий день':'Нет сеанса',
  lab==='todo'?'Анализ крови':lab==='issued'?'Направление выдано':'',
  chemo?(infusionMissed?'ХТ не проводилась':'Запланирована ХТ'):'',
  completion.source==='calendar'?'ЛТ учтена автоматически по прошедшей дате, не клиническое подтверждение':'',
  item?.beforeMaintenance?'Последняя фракция до ТО':''].filter(Boolean).join(' · ');
 return {kind,label,secondary,title,completed:completion.completed,weekend:isWeekend(date)&&!working,
  final:Boolean(item?.final),selected:false,fraction:item?.kind==='session'?item.n:null,
  isSession:item?.kind==='session',labStatus:lab,chemoPlanned:chemo,chemoMissed:infusionMissed,
  maintenance:item?.kind==='maintenance'||Boolean(item?.beforeMaintenance),
  breakdown:item?.kind==='breakdown',skip:item?.kind==='skip',completionSource:completion.source};
}
export function mobileVisibleRows(state,scheduled,{filter='',search='',today=localToday()}={}){
 const rows=calendarRosterRows(state,scheduled,{filter});
 const q=search.trim().toLocaleLowerCase('ru');
 return rows.filter(course=>{
  if(!q)return true;
  const contact=calendarContact(state,course),ctv=course.noCourse?'':currentCtvName(state,course);
  return [course.name,course.personId,course.id,course.courseName,ctv,course.machine,contact.phone,contact.notes]
   .some(v=>String(v??'').toLocaleLowerCase('ru').includes(q));
 });
}
// Keep surname and initials readable in the one-row compact iPhone card.
// Full name remains accessible in aria-label and in the expanded detail.
export function compactPatientName(name){
 const parts=String(name??'').trim().split(/\s+/).filter(Boolean);
 if(parts.length<2)return parts[0]||'Пациент';
 return parts[0]+' '+parts.slice(1,3).map(part=>part.charAt(0).toLocaleUpperCase('ru')+'.').join(' ');
}
export function renderMobilePatientCards(state,rows,{weekDate=localToday(),selected=new Set(),expanded=new Set(),windowStarts=new Map(),today=localToday()}={}){
 return rows.map(course=>{
  const start=windowStarts.get(course.id)||mobileWeekStart(weekDate)||weekDate;
  const dates=Array.from({length:7},(_,i)=>addDays(start,i)),end=dates.at(-1);
  const contact=calendarContact(state,course);
  const plan=course.noCourse?new Map():schedule(course,state,end);
  const ctv=course.noCourse?'Без курса':currentCtvName(state,course)||course.courseName||'Схема не указана';
  const phoneDigits=contact.phone.replace(/[^\d+]/g,'');
  const machine=course.noCourse?'Установка не назначена':machineAt(course,state,weekDate);
  const progress=course.noCourse?null:courseProgress(state,course,today);
  const cells=dates.map(date=>{
   const data=mobileDayState(state,course,date,today,plan),key=course.id+'|'+date;
   const daySelected=selected.has(key),todayCell=date===today;
   const weekday=weekDays[(new Date(date+'T12:00:00Z').getUTCDay()+6)%7];
   const fraction=data.fraction!=null?'№'+data.fraction:'—';
   const icons=[
    data.completed&&data.isSession?'<span class="mobile-date-completion" title="Сеанс учтён"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m3 8 3.1 3 6.8-7"/></svg></span>':'',
    data.labStatus?bloodTubeIcon:'',
    data.chemoPlanned?(data.chemoMissed?chemoInfusionMissedIcon:chemoInfusionIcon):'',
    data.maintenance?maintenanceWrenchSvg:'',
    data.breakdown?'<span class="mobile-date-alert" aria-hidden="true">!</span>':'',
    data.skip?skippedFractionIcon:''
   ].join('');
   return '<button type="button" class="mobile-date-cell mobile-date-'+data.kind+
    (data.weekend?' mobile-date-weekend':'')+
    (data.isSession?(data.completed?' is-session-complete':' is-session-planned'):'')+
    (todayCell?' is-today':'')+(daySelected?' is-selected':'')+
    '" data-mobile-cell data-course-id="'+esc(course.id)+'" data-date="'+date+
    '"'+(course.noCourse?' disabled':'')+' aria-pressed="'+daySelected+'" aria-label="'+esc(course.name+', '+data.title+
    (daySelected?', выделено':'') )+'" title="'+esc(data.title)+'">'+
    '<span class="mobile-date-weekday">'+weekday+'</span>'+
    '<span class="mobile-date-day">'+date.slice(8)+'</span>'+
    '<span class="mobile-date-symbol">'+(data.skip?'—':esc(fraction))+'</span>'+
    '<span class="mobile-date-events" aria-hidden="true">'+icons+'</span></button>';
  }).join('');
  const carousel='<div class="mobile-week-carousel" data-mobile-course-carousel="'+esc(course.id)+'">'+
   '<div class="mobile-week-carousel-head">'+
    '<button type="button" class="mobile-week-carousel-nav" data-mobile-carousel-shift="-1" data-course-id="'+esc(course.id)+'" aria-label="Предыдущий день">‹</button>'+
    '<span class="mobile-week-carousel-range">'+dates[0].slice(8)+'.'+dates[0].slice(5,7)+' — '+dates.at(-1).slice(8)+'.'+dates.at(-1).slice(5,7)+'</span>'+
    '<button type="button" class="mobile-week-carousel-nav" data-mobile-carousel-shift="1" data-course-id="'+esc(course.id)+'" aria-label="Следующий день">›</button>'+
   '</div><div class="mobile-patient-week" role="group" aria-label="Даты и сеансы пациента: '+esc(course.name)+'">'+cells+'</div></div>';
  const isExpanded=expanded.has(course.id),patientName=esc(course.name);
  const isChemoradiation=!course.noCourse&&course.treatmentType==='ХЛТ';
  const elnActive=contact.eln==='Да';
  const callIcon='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.34 1.91.67 2.83a2 2 0 0 1-.45 2.11L8.06 9.94a16 16 0 0 0 6 6l1.28-1.27a2 2 0 0 1 2.11-.45c.92.33 1.87.55 2.83.67A2 2 0 0 1 22 16.92z"/></svg>';
  const editIcon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21l4.2-1 12.7-12.7a2.1 2.1 0 0 0-3-3L4.2 17z"/><path d="m14.8 6.2 3 3"/></svg>';
  const call=phoneDigits?
   '<a class="mobile-summary-call" href="tel:'+esc(phoneDigits)+'" aria-label="Позвонить пациенту: '+patientName+'"'+(isExpanded?' aria-hidden="true" inert tabindex="-1"':'')+'>'+callIcon+'</a>':
   '<span class="mobile-summary-call is-unavailable" aria-label="Телефон не указан"'+(isExpanded?' aria-hidden="true" inert':'')+'>'+callIcon+'</span>';
  const edit='<button type="button" class="mobile-summary-edit" data-mobile-patient="'+esc(course.personId)+'" aria-label="Редактировать пациента: '+patientName+'"'+(isExpanded?'':' aria-hidden="true" inert tabindex="-1"')+'>'+editIcon+'</button>';
  return '<article class="mobile-patient-card'+(isExpanded?' is-expanded':'')+(isChemoradiation?' is-chemoradiation':'')+'" data-mobile-course-id="'+esc(course.id)+'" data-mobile-person-id="'+esc(course.personId)+'">'+
   '<div class="mobile-patient-summary">'+
    '<button type="button" class="mobile-summary-toggle" data-mobile-expand="'+esc(course.id)+'" aria-expanded="'+isExpanded+'" aria-controls="mobile-detail-'+esc(course.id)+'" aria-label="'+(isExpanded?'Свернуть':'Развернуть')+' пациента '+patientName+'. СТВ: '+esc(ctv)+(progress?'. ЛТ: '+progress.completed+' из '+progress.total:'')+(elnActive?'. ЭЛН оформлен':'')+'">'+
     '<span class="mobile-summary-name" title="'+patientName+'">'+
      '<span class="mobile-summary-name-short" aria-hidden="true">'+esc(compactPatientName(course.name))+'</span>'+
      '<span class="mobile-summary-name-full" aria-hidden="true">'+patientName+'</span></span>'+
     '<span class="mobile-summary-extras" aria-hidden="'+isExpanded+'">'+
      '<span class="mobile-summary-ctv" title="СТВ: '+esc(ctv)+'">'+esc(ctv)+'</span>'+
      (progress?'<span class="mobile-summary-progress" title="Сеансов ЛТ: '+progress.completed+' из '+progress.total+'">'+progress.completed+'/'+progress.total+'</span>':'')+
      (elnActive?'<span class="mobile-summary-eln" title="ЭЛН оформлен">ЭЛН</span>':'')+
     '</span></button>'+
    '<span class="mobile-summary-action">'+call+edit+'</span></div>'+
   '<div class="mobile-patient-expansion" id="mobile-detail-'+esc(course.id)+'" aria-hidden="'+(!isExpanded)+'"'+(isExpanded?'':' inert')+'>'+
    '<div class="mobile-patient-expansion-content">'+
     '<div class="mobile-patient-details">'+
      (elnActive?'<span class="mobile-eln">ЭЛН</span>':'')+
      (course.treatmentType==='ХЛТ'?'<span class="mobile-hlt">ХЛТ</span>':'')+
      (progress?'<span class="mobile-patient-progress">ЛТ '+progress.completed+'/'+progress.total+'</span>':'')+
     '</div><div class="mobile-patient-description">'+esc(ctv)+'</div>'+
     '<div class="mobile-patient-meta"><span>'+esc(machine)+'</span>'+
      (phoneDigits?'<a class="mobile-patient-phone" href="tel:'+esc(phoneDigits)+'" aria-label="Позвонить пациенту '+patientName+': '+esc(contact.phone)+'">'+esc(contact.phone)+'</a>':'')+
     '</div>'+carousel+
     (contact.notes?'<p class="mobile-patient-note" title="'+esc(contact.notes)+'">'+esc(contact.notes)+'</p>':'')+
    '</div></div></article>';
 }).join('');
}
/* Use the exact icon nodes already mounted in the desktop UI.
   This keeps iPhone's "Ещё" in sync when PC artwork changes. */
export const desktopMoreIconSources=[
 ['section','ctv-catalog','.sidebar [data-view="ctv-catalog"] > span'],
 ['section','workdays','.sidebar [data-view="workdays"] > span'],
 ['section','maintenance','.sidebar [data-view="maintenance"] > span'],
 ['section','breakdowns','.sidebar [data-view="breakdowns"] > span'],
 ['section','transfers','.sidebar [data-view="transfers"] > span'],
 ['section','journal','.sidebar [data-view="journal"] > span'],
 ['command','register','.sidebar [data-view="calendar"] > span'],
 ['command','export','#discharge-text-open .action-icon'],
 ['command','cloud','#cloud-open > span:first-child'],
 // The full table uses the existing calendar navigation glyph (no new artwork).
 ['command','desktop','#mobile-bottom-nav [data-mobile-tab="calendar"] > svg'],
 ['command','reset','#reset']
];
export function copyDesktopMoreIcons(root,documentRef=document){
 for(const [kind,name,selector] of desktopMoreIconSources){
  const icon=root.querySelector('[data-mobile-'+kind+'="'+name+'"] > .mobile-more-icon');
  const source=documentRef.querySelector(selector);
  if(!icon||!source)continue;
  const nodes=source.id==='reset'?[source.firstChild]:
   source.tagName.toLowerCase()==='svg'?[source]:[...source.childNodes];
  icon.replaceChildren(...nodes.filter(Boolean).map(node=>node.cloneNode(true)));
 }
}

export function createMobileWeekUI({
 root,tabbar,actionsDialog,getState,getRows,getSelected,getFilter=()=>'',onFilter=()=>{},
 onSelect,onPatient,onAdd,onOpenRegister,onOpenExport,onOpenCloud,onOpenView,onOpenDesktop,onReset,onClearSelection,
 onAction,onToggleTask,onCopyDischarge=()=>{},onNotice=()=>{},onCalendarShown=()=>{},isMobile=()=>window.matchMedia('(max-width:700px)').matches,
 today=localToday
}){
 if(!root||!tabbar||!actionsDialog)throw new Error('Мобильный интерфейс ЛУЧ не найден.');
 let tab='patients',weekDate=today(),search='',taskDate=today(),lastCell=null,actionCell=null,desktop=false,fullDesktop=false,calendarAligned=false,activeView='calendar';
 const expandedCards=new Set(),carouselStarts=new Map();
 const $=selector=>root.querySelector(selector);
 copyDesktopMoreIcons(root);
 const searchControl=$('#mobile-search-expandable'),searchInput=$('#mobile-search');
 const searchToggle=$('#mobile-search-toggle'),searchClose=$('#mobile-search-close');
 let searchOpen=false;
 function setSearchOpen(open,{clear=false}={}){
  if(clear&&search){search='';renderCardsOnly();}
  searchOpen=open;
  searchControl.classList.toggle('is-open',open);
  searchToggle.setAttribute('aria-expanded',String(open));
  searchToggle.setAttribute('aria-label',open?'Поиск пациентов':'Открыть поиск пациентов');
  searchInput.disabled=!open;
  searchClose.disabled=!open;
  if(open)searchInput.focus({preventScroll:true});
  else if(document.activeElement===searchInput)searchInput.blur();
 }
 const dates=()=>mobileWeekDates(weekDate);
 const two=date=>date.slice(8)+'.'+date.slice(5,7);
 const fullDate=date=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date(date+'T12:00:00'));
 function tabTo(next){
  tab=next;
  // The "Календарь" tab shows the EXISTING desktop grid, not a second copy
  // of schedule logic. The patient tab keeps its touch-friendly cards.
  desktop=next==='calendar';
  fullDesktop=false;
  if(activeView!=='calendar')onOpenView('calendar');
  render();
  if(desktop&&!calendarAligned){
   calendarAligned=true;
   // The grid is measurable only after its scroll container becomes visible.
   requestAnimationFrame(()=>{
    if(desktop&&tab==='calendar'&&activeView==='calendar')onCalendarShown();
   });
  }
 }
 function mobileActions(){
  const selected=[...getSelected()].map(key=>{
   const [patientId,date]=key.split('|');
   return {patientId,date};
  });
  if(!selected.length){onNotice('Выбери одну или несколько ячеек');return;}
  actionCell=lastCell&&selected.some(cell=>cell.patientId===lastCell.patientId&&cell.date===lastCell.date)
   ?lastCell:selected.at(-1);
  const items=calendarCellContextActions(getState(),selected,actionCell,today());
  actionsDialog.querySelector('#mobile-actions-summary').textContent=
   selected.length===1?'Выбрана 1 ячейка':'Выбрано ячеек: '+selected.length;
  actionsDialog.querySelector('#mobile-actions-list').innerHTML=items.map(item=>
   '<button type="button" data-mobile-action="'+esc(item.id)+'"'+(item.disabled?' disabled':'')+
   ' title="'+esc(item.title)+'"><span>'+esc(item.label)+'</span><span aria-hidden="true">›</span></button>'
  ).join('');
  if(typeof actionsDialog.showModal==='function')actionsDialog.showModal();
  else actionsDialog.setAttribute('open','');
 }
 function closeActions(){
  if(typeof actionsDialog.close==='function'&&actionsDialog.open)actionsDialog.close();
  else actionsDialog.removeAttribute('open');
 }
 function renderTasks(){
  const {tasks,snapshot}=tasksForDate(getState(),taskDate,today());
  const pending=tasks.filter(item=>!item.done),completed=tasks.filter(item=>item.done);
  $('#mobile-task-list').innerHTML=
   (taskDate!==today()&&!snapshot?'<p class="mobile-hint">Нет сохранённого снимка за этот день. Восстановлены доступные задачи.</p>':'')+
   (pending.length?pending.map(item=>taskRow(item)).join(''):'<p class="mobile-empty">Невыполненных задач нет</p>')+
   (completed.length?'<h3 class="mobile-task-subtitle">Выполнено: '+completed.length+'</h3>'+completed.map(item=>taskRow(item)).join(''):'');
  $('#mobile-task-date').value=taskDate;$('#mobile-task-date').max=today();
  $('#mobile-task-day').textContent=fullDate(taskDate);
  $('#mobile-task-today').disabled=taskDate===today();
  $('#mobile-task-next').disabled=taskDate>=today();
 }
 function taskRow(item){
  const call=item.phoneHref?'<a href="tel:'+esc(item.phoneHref)+'" aria-label="Позвонить: '+esc(item.fullName)+'">☎</a>':'';
  const dischargeCopy=item.kind==='weekly-discharge'?
   '<button type="button" class="mobile-task-discharge-copy" data-mobile-copy-discharge="'+esc(item.id)+'" aria-label="Скопировать список выписок на следующую неделю" title="Скопировать список выписок на следующую неделю">⧉</button>':'';
  return '<div class="mobile-task-row'+(item.done?' is-done':'')+'">'+
   '<button type="button" data-mobile-task="'+esc(item.id)+'" aria-pressed="'+item.done+
   '" aria-label="'+esc((item.done?'Снять выполнение: ':'Выполнить: ')+item.label)+'">'+(item.done?'✓':'○')+'</button>'+
   '<span>'+esc(item.label)+'</span>'+call+dischargeCopy+'</div>';
 }
 function render(){
  if(!isMobile())return;
  const appState=getState(),selected=getSelected(),mobilePanel=activeView==='calendar'&&!desktop;
  root.classList.toggle('hidden',!mobilePanel);
  tabbar.querySelectorAll('[data-mobile-tab]').forEach(b=>{
   const active=activeView!=='calendar'?b.dataset.mobileTab==='more':b.dataset.mobileTab===tab;
   b.classList.toggle('is-current',active);b.setAttribute('aria-current',active?'page':'false');
  });
  document.body.classList.toggle('mobile-desktop-table',desktop&&activeView==='calendar');
  document.body.classList.toggle('mobile-full-table',fullDesktop&&desktop&&activeView==='calendar');
  if(!mobilePanel)return; // never repaint card lists beneath other sections
  const cards=$('#mobile-card-view'),tasks=$('#mobile-task-view'),more=$('#mobile-more-view');
  cards.hidden=tab==='tasks'||tab==='more';tasks.hidden=tab!=='tasks';more.hidden=tab!=='more';
  $('#mobile-page-title').textContent=tab==='tasks'?'Задачи':tab==='more'?'Ещё':tab==='calendar'?'Календарь':'Пациенты';
  $('#mobile-search').value=search;
  const filterValue=getFilter(),filterSelect=$('#mobile-filter');
  filterSelect.value=filterValue;
  const filterControl=$('#mobile-filter-control');
  const filterName=filterSelect.selectedOptions[0]?.textContent?.trim()||'Все установки';
  filterControl.classList.toggle('is-filtered',Boolean(filterValue));
  filterControl.title=filterName;
  filterSelect.setAttribute('aria-label','Фильтр установок: '+filterName);
  $('#mobile-week-range').textContent=two(dates()[0])+' — '+two(dates()[6]);
  $('#mobile-week-date').value=weekDate;
  const count=selected.size;
  $('#mobile-selection').hidden=count===0;
  $('#mobile-selection-count').textContent=count===1?'1 ячейка':'Выбрано: '+count;
  const rows=mobileVisibleRows(appState,getRows(),{filter:getFilter(),search,today:today()});
  $('#mobile-card-list').innerHTML=renderMobilePatientCards(appState,rows,{weekDate,selected,expanded:expandedCards,windowStarts:carouselStarts,today:today()})||
   '<p class="mobile-empty">По выбранным условиям пациентов нет</p>';
  const pending=todayTasks(appState,today()).filter(x=>!x.done).length;
  tabbar.querySelector('#mobile-tab-tasks-count').textContent=pending?String(pending):'';
  renderTasks();
 }
 function shiftPatientCarousel(courseId,days){
  if(!expandedCards.has(courseId)||!Number.isInteger(days)||Math.abs(days)!==1)return;
  const start=carouselStarts.get(courseId)||mobileWeekStart(weekDate);
  if(!start)return;
  carouselStarts.set(courseId,addDays(start,days));
  renderCardsOnly();
  const card=[...$('#mobile-card-list').querySelectorAll('.mobile-patient-card')]
   .find(node=>node.dataset.mobileCourseId===courseId);
  const strip=card?.querySelector('.mobile-patient-week');
  if(strip)strip.classList.add(days>0?'is-step-forward':'is-step-back');
 }
 let lastCarouselSwipeAt=0;
 root.addEventListener('click',event=>{
  // A horizontal swipe over a date button must never also select the date.
  if(Date.now()-lastCarouselSwipeAt<450&&event.target.closest('.mobile-week-carousel')){
   event.preventDefault();return;
  }
  if(event.target.closest('#mobile-search-toggle')){
   if(searchOpen)searchInput.focus({preventScroll:true});else setSearchOpen(true);
   return;
  }
  if(event.target.closest('#mobile-search-close')){setSearchOpen(false,{clear:true});return;}
  const target=event.target.closest('button[data-mobile-cell],button[data-mobile-carousel-shift],button[data-mobile-expand],button[data-mobile-patient],button[data-mobile-action-open],button[data-mobile-command],button[data-mobile-task],button[data-mobile-copy-discharge],button[data-mobile-section],button[data-mobile-week-shift],button[data-mobile-task-shift],button[data-mobile-tab-shortcut]');
  if(!target)return;
  if(target.dataset.mobileCarouselShift!==undefined){
   shiftPatientCarousel(target.dataset.courseId,Number(target.dataset.mobileCarouselShift));
  }else if(target.dataset.mobileCell!==undefined){
   lastCell={patientId:target.dataset.courseId,date:target.dataset.date};
   onSelect(lastCell.patientId,lastCell.date,{metaKey:true,ctrlKey:false,shiftKey:false});
  }else if(target.dataset.mobileExpand!==undefined){
   const id=target.dataset.mobileExpand,card=target.closest('.mobile-patient-card');
   if(!card)return;
   const open=!expandedCards.has(id);
   if(open)expandedCards.add(id);else expandedCards.delete(id);
   card.classList.toggle('is-expanded',open);
   target.setAttribute('aria-expanded',String(open));
   target.setAttribute('aria-label',(open?'Свернуть':'Развернуть')+' пациента '+(card.querySelector('.mobile-summary-name-full')?.textContent||''));
   const extra=card.querySelector('.mobile-summary-extras');
   if(extra)extra.setAttribute('aria-hidden',String(open));
   const phone=card.querySelector('.mobile-summary-call');
   const editButton=card.querySelector('.mobile-summary-edit');
   for(const [control,visible] of [[phone,!open],[editButton,open]]){
    if(!control)continue;
    control.inert=!visible;
    control.setAttribute('aria-hidden',String(!visible));
    if(control.matches('a,button'))control.tabIndex=visible?0:-1;
   }
   const detail=card.querySelector('.mobile-patient-expansion');
   if(detail){detail.inert=!open;detail.setAttribute('aria-hidden',String(!open));}
  }else if(target.dataset.mobilePatient){onPatient(target.dataset.mobilePatient);}
  else if(target.dataset.mobileActionOpen!==undefined)mobileActions();
  else if(target.dataset.mobileCopyDischarge){
   void onCopyDischarge(taskDate);
  }else if(target.dataset.mobileTask){
   const result=onToggleTask(target.dataset.mobileTask,taskDate);
   if(result?.error)onNotice(result.error);render();
  }else if(target.dataset.mobileWeekShift){
   weekDate=addDays(weekDate,7*Number(target.dataset.mobileWeekShift));carouselStarts.clear();render();
  }else if(target.dataset.mobileTaskShift){
   const value=addDays(taskDate,Number(target.dataset.mobileTaskShift));
   if(value<=today()){taskDate=value;render();}
  }else if(target.dataset.mobileTabShortcut)tabTo(target.dataset.mobileTabShortcut);
  else if(target.dataset.mobileSection){
   onOpenView(target.dataset.mobileSection);
  }else if(target.dataset.mobileCommand){
   const cmd=target.dataset.mobileCommand;
   if(cmd==='add')onAdd();
   else if(cmd==='register')onOpenRegister();
   else if(cmd==='reset')onReset();
   else if(cmd==='export')onOpenExport();
   else if(cmd==='cloud')onOpenCloud();
   else if(cmd==='clear'){lastCell=null;onClearSelection();}
   else if(cmd==='today'){weekDate=today();carouselStarts.clear();tab='patients';render();}
   else if(cmd==='week'){tab='calendar';render();}
   else if(cmd==='tasks-today'){taskDate=today();render();}
   else if(cmd==='desktop'){desktop=true;fullDesktop=true;onOpenDesktop();render();}
  }
 });
 root.addEventListener('input',event=>{
  if(event.target.id==='mobile-search'){search=event.target.value;renderCardsOnly();}
 });
 root.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&searchOpen){event.preventDefault();setSearchOpen(false,{clear:true});searchToggle.focus();}
 });
 document.addEventListener('pointerdown',event=>{
  if(searchOpen&&!search.trim()&&!searchControl.contains(event.target))setSearchOpen(false);
 },{passive:true});
 function renderCardsOnly(){
  const rows=mobileVisibleRows(getState(),getRows(),{filter:getFilter(),search,today:today()});
  $('#mobile-card-list').innerHTML=renderMobilePatientCards(getState(),rows,{weekDate,selected:getSelected(),expanded:expandedCards,windowStarts:carouselStarts,today:today()})||
   '<p class="mobile-empty">По выбранным условиям пациентов нет</p>';
 }
 root.addEventListener('change',event=>{
  if(event.target.id==='mobile-filter'){
   // After a native iOS picker choice, release focus to restore page scale.
   const select=event.target;
   onFilter(select.value);render();
   requestAnimationFrame(()=>select.blur());
  }
  else if(event.target.id==='mobile-week-date'&&/^\d{4}-\d\d-\d\d$/.test(event.target.value)){
   weekDate=event.target.value;carouselStarts.clear();render();
  }else if(event.target.id==='mobile-task-date'&&/^\d{4}-\d\d-\d\d$/.test(event.target.value)&&event.target.value<=today()){
   taskDate=event.target.value;render();
  }
 });
 tabbar.addEventListener('click',event=>{
  const button=event.target.closest('button[data-mobile-tab]');
  if(button)tabTo(button.dataset.mobileTab);
 });
 actionsDialog.addEventListener('click',event=>{
  const button=event.target.closest('button[data-mobile-action]');
  if(button&&!button.disabled){
   const which=button.dataset.mobileAction;
   closeActions();
   onAction(which,actionCell);
  }else if(event.target.closest('[data-mobile-actions-close]'))closeActions();
  else if(event.target===actionsDialog)closeActions();
 });
 // Swipe only the expanded patient's date carousel, one day at a time.
 // Vertical page scrolling and the existing card-list gestures stay available.
 let dateSwipe=null;
 const cardList=$('#mobile-card-list');
 cardList.addEventListener('touchstart',event=>{
  const strip=event.target.closest('.mobile-patient-week');
  if(!strip||event.touches.length!==1){dateSwipe=null;return;}
  const card=strip.closest('.mobile-patient-card');
  dateSwipe=card?{courseId:card.dataset.mobileCourseId,
   x:event.touches[0].clientX,y:event.touches[0].clientY}:null;
 },{passive:true});
 cardList.addEventListener('touchend',event=>{
  if(!dateSwipe||!event.changedTouches.length)return;
  const dx=event.changedTouches[0].clientX-dateSwipe.x;
  const dy=event.changedTouches[0].clientY-dateSwipe.y;
  const id=dateSwipe.courseId;
  dateSwipe=null;
  if(Math.abs(dx)>43&&Math.abs(dx)>Math.abs(dy)*1.45){
   lastCarouselSwipeAt=Date.now();
   shiftPatientCarousel(id,dx<0?1:-1);
  }
 },{passive:true});
 // Outside the carousel, the whole-card gesture still switches weeks.
 let swipe=null;
 $('#mobile-card-list').addEventListener('touchstart',event=>{
  if(event.touches.length!==1||event.target.closest('.mobile-week-carousel,button,a,input,select')){swipe=null;return;}
  swipe={x:event.touches[0].clientX,y:event.touches[0].clientY};
 },{passive:true});
 $('#mobile-card-list').addEventListener('touchend',event=>{
  if(!swipe||!event.changedTouches.length)return;
  const dx=event.changedTouches[0].clientX-swipe.x,dy=event.changedTouches[0].clientY-swipe.y;
  swipe=null;
  if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.6){
   weekDate=addDays(weekDate,dx<0?7:-7);carouselStarts.clear();render();
  }
 },{passive:true});
 function syncView(next){
  activeView=next;
  if(next!=='calendar'){desktop=false;fullDesktop=false;}
  render();
 }
 function exitDesktop(){tabTo('patients');}
 return {render,syncView,exitDesktop,setTab:tabTo,selectedCount:()=>getSelected().size};
}
