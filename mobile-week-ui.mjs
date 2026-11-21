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
import {skippedFractionIcon} from './calendar-event-icons.mjs?v=3';

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
  final:Boolean(item?.final),selected:false};
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
export function renderMobilePatientCards(state,rows,{weekDate=localToday(),selected=new Set(),today=localToday()}={}){
 const dates=mobileWeekDates(weekDate),end=dates.at(-1);
 return rows.map(course=>{
  const contact=calendarContact(state,course);
  const plan=course.noCourse?new Map():schedule(course,state,end);
  const ctv=course.noCourse?'Без курса':currentCtvName(state,course)||course.courseName||'Схема не указана';
  const phoneDigits=contact.phone.replace(/[^\d+]/g,'');
  const machine=course.noCourse?'Установка не назначена':machineAt(course,state,weekDate);
  const progress=course.noCourse?null:courseProgress(state,course,today);
  const cells=dates.map((date,i)=>{
   const data=mobileDayState(state,course,date,today,plan),key=course.id+'|'+date;
   const daySelected=selected.has(key),todayCell=date===today;
   return '<button type="button" class="mobile-date-cell mobile-date-'+data.kind+
    (data.weekend?' mobile-date-weekend':'')+(todayCell?' is-today':'')+(daySelected?' is-selected':'')+
    '" data-mobile-cell data-course-id="'+esc(course.id)+'" data-date="'+date+
    '"'+(course.noCourse?' disabled':'')+' aria-pressed="'+daySelected+'" aria-label="'+esc(course.name+', '+data.title+
    (daySelected?', выделено':'') )+'" title="'+esc(data.title)+'">'+
    '<span class="mobile-date-weekday">'+weekDays[i]+'</span>'+
    '<span class="mobile-date-day">'+date.slice(8)+'</span>'+
    '<span class="mobile-date-symbol">'+(data.kind==='skip'?skippedFractionIcon:esc(data.label))+'</span>'+
    (data.secondary?'<span class="mobile-date-secondary">'+esc(data.secondary)+'</span>':'')+'</button>';
  }).join('');
  return '<article class="mobile-patient-card" data-mobile-person-id="'+esc(course.personId)+'">'+
   '<button type="button" class="mobile-patient-name" data-mobile-patient="'+esc(course.personId)+'" aria-label="Открыть карточку: '+esc(course.name)+'">'+
    '<span>'+esc(course.name)+'</span><span aria-hidden="true">›</span></button>'+
   '<div class="mobile-patient-details"><span class="mobile-person-id">'+esc(course.personId)+'</span>'+
   (contact.eln==='Да'?'<span class="mobile-eln">ЭЛН</span>':'')+
   (course.treatmentType==='ХЛТ'?'<span class="mobile-hlt">ХЛТ</span>':'')+
   (progress?'<span class="mobile-patient-progress">ЛТ '+progress.completed+'/'+progress.total+'</span>':'')+
   '</div><div class="mobile-patient-description">'+esc(ctv)+'</div>'+
   '<div class="mobile-patient-meta"><span>'+esc(machine)+'</span>'+
   (phoneDigits?'<a href="tel:'+esc(phoneDigits)+'" aria-label="Позвонить пациенту: '+esc(course.name)+'">☎ '+esc(contact.phone)+'</a>':'')+
   '</div><div class="mobile-patient-week" role="group" aria-label="Неделя пациента: '+esc(course.name)+'">'+cells+'</div>'+
   (contact.notes?'<p class="mobile-patient-note" title="'+esc(contact.notes)+'">'+esc(contact.notes)+'</p>':'')+
  '</article>';
 }).join('');
}
export function createMobileWeekUI({
 root,tabbar,actionsDialog,getState,getRows,getSelected,getFilter=()=>'',onFilter=()=>{},
 onSelect,onPatient,onAdd,onOpenRegister,onOpenExport,onOpenCloud,onOpenView,onOpenDesktop,onReset,onClearSelection,
 onAction,onToggleTask,onCopyDischarge=()=>{},onNotice=()=>{},isMobile=()=>window.matchMedia('(max-width:700px)').matches,
 today=localToday
}){
 if(!root||!tabbar||!actionsDialog)throw new Error('Мобильный интерфейс ЛУЧ не найден.');
 let tab='patients',weekDate=today(),search='',taskDate=today(),lastCell=null,actionCell=null,desktop=false,activeView='calendar';
 const $=selector=>root.querySelector(selector);
 const dates=()=>mobileWeekDates(weekDate);
 const two=date=>date.slice(8)+'.'+date.slice(5,7);
 const fullDate=date=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date(date+'T12:00:00'));
 function tabTo(next){
  tab=next;
  desktop=false;
  document.body.classList.remove('mobile-desktop-table');
  if(activeView!=='calendar')onOpenView('calendar');
  render();
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
  if(!mobilePanel)return; // never repaint card lists beneath other sections
  const cards=$('#mobile-card-view'),tasks=$('#mobile-task-view'),more=$('#mobile-more-view');
  cards.hidden=tab==='tasks'||tab==='more';tasks.hidden=tab!=='tasks';more.hidden=tab!=='more';
  $('#mobile-page-title').textContent=tab==='tasks'?'Задачи':tab==='more'?'Ещё':tab==='calendar'?'Календарь':'Пациенты';
  $('#mobile-search').value=search;
  $('#mobile-filter').value=getFilter();
  $('#mobile-week-range').textContent=two(dates()[0])+' — '+two(dates()[6]);
  $('#mobile-week-date').value=weekDate;
  $('#mobile-segment-today').setAttribute('aria-pressed',String(tab==='patients'));
  $('#mobile-segment-week').setAttribute('aria-pressed',String(tab==='calendar'));
  const count=selected.size;
  $('#mobile-selection').hidden=count===0;
  $('#mobile-selection-count').textContent=count===1?'1 ячейка':'Выбрано: '+count;
  const rows=mobileVisibleRows(appState,getRows(),{filter:getFilter(),search,today:today()});
  $('#mobile-patient-count').textContent='Пациентов: '+rows.length;
  $('#mobile-card-list').innerHTML=renderMobilePatientCards(appState,rows,{weekDate,selected,today:today()})||
   '<p class="mobile-empty">По выбранным условиям пациентов нет</p>';
  const pending=todayTasks(appState,today()).filter(x=>!x.done).length;
  $('#mobile-task-count').textContent=String(pending);
  $('#mobile-task-count').classList.toggle('has-pending',pending>0);
  tabbar.querySelector('#mobile-tab-tasks-count').textContent=pending?String(pending):'';
  renderTasks();
 }
 root.addEventListener('click',event=>{
  const target=event.target.closest('button[data-mobile-cell],button[data-mobile-patient],button[data-mobile-action-open],button[data-mobile-command],button[data-mobile-task],button[data-mobile-copy-discharge],button[data-mobile-section],button[data-mobile-week-shift],button[data-mobile-task-shift],button[data-mobile-tab-shortcut]');
  if(!target)return;
  if(target.dataset.mobileCell!==undefined){
   lastCell={patientId:target.dataset.courseId,date:target.dataset.date};
   onSelect(lastCell.patientId,lastCell.date,{metaKey:true,ctrlKey:false,shiftKey:false});
  }else if(target.dataset.mobilePatient){onPatient(target.dataset.mobilePatient);}
  else if(target.dataset.mobileActionOpen!==undefined)mobileActions();
  else if(target.dataset.mobileCopyDischarge){
   void onCopyDischarge(taskDate);
  }else if(target.dataset.mobileTask){
   const result=onToggleTask(target.dataset.mobileTask,taskDate);
   if(result?.error)onNotice(result.error);render();
  }else if(target.dataset.mobileWeekShift){
   weekDate=addDays(weekDate,7*Number(target.dataset.mobileWeekShift));render();
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
   else if(cmd==='today'){weekDate=today();tab='patients';render();}
   else if(cmd==='week'){tab='calendar';render();}
   else if(cmd==='tasks-today'){taskDate=today();render();}
   else if(cmd==='desktop'){desktop=true;onOpenDesktop();render();}
  }
 });
 root.addEventListener('input',event=>{
  if(event.target.id==='mobile-search'){search=event.target.value;renderCardsOnly();}
 });
 function renderCardsOnly(){
  const rows=mobileVisibleRows(getState(),getRows(),{filter:getFilter(),search,today:today()});
  $('#mobile-patient-count').textContent='Пациентов: '+rows.length;
  $('#mobile-card-list').innerHTML=renderMobilePatientCards(getState(),rows,{weekDate,selected:getSelected(),today:today()})||
   '<p class="mobile-empty">По выбранным условиям пациентов нет</p>';
 }
 root.addEventListener('change',event=>{
  if(event.target.id==='mobile-filter'){onFilter(event.target.value);render();}
  else if(event.target.id==='mobile-week-date'&&/^\d{4}-\d\d-\d\d$/.test(event.target.value)){
   weekDate=event.target.value;render();
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
 // Horizontal card-list gesture changes a WEEK only if it is clearly not a
 // vertical scroll or a press on a button or phone link.
 let swipe=null;
 $('#mobile-card-list').addEventListener('touchstart',event=>{
  if(event.touches.length!==1||event.target.closest('button,a,input,select')){swipe=null;return;}
  swipe={x:event.touches[0].clientX,y:event.touches[0].clientY};
 },{passive:true});
 $('#mobile-card-list').addEventListener('touchend',event=>{
  if(!swipe||!event.changedTouches.length)return;
  const dx=event.changedTouches[0].clientX-swipe.x,dy=event.changedTouches[0].clientY-swipe.y;
  swipe=null;
  if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.6){
   weekDate=addDays(weekDate,dx<0?7:-7);render();
  }
 },{passive:true});
 function syncView(next){
  activeView=next;
  if(next!=='calendar')desktop=false;
  render();
 }
 function exitDesktop(){desktop=false;tab='patients';document.body.classList.remove('mobile-desktop-table');render();}
 return {render,syncView,exitDesktop,setTab:tabTo,selectedCount:()=>getSelected().size};
}
