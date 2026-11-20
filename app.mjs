import {MACHINES,datesForMonth,monthShift,pretty,isWeekend,schedule,labAt,action,maintenanceAdd,maintenanceRemove,maintenanceFinalCandidates,maintenanceFinalDraft,machineAt,issueWeekDraft,weekBounds,addDays} from './planner.mjs';
import {isWorkingDay,effectiveDay,effectiveDayLabel} from './work-calendar.mjs';
import {createWorkdayUI} from './workday-ui.mjs?v=2';
import {createOperationalUI} from './operations-ui.mjs';
import {ensurePatientModel} from './patient-model.mjs';
import {createPatientUI} from './patient-ui.mjs?v=11';
import {createCatalogUI} from './catalog-ui.mjs';
import {currentCtvName} from './ctv-display.mjs';
import {courseProgress,localToday,radiationSessionCompletion,dischargeCandidates,dischargeBatchDraft} from './course-progress.mjs?v=3';
import {activePatientCount,todayTasks,toggleTodayTaskDraft,tasksForDate,captureTodayTaskHistoryDraft} from './today-tasks.mjs?v=4';
import {orderedPersonIds,comparePatientEntries,reorderPatientDraft} from './patient-order.mjs';
import {setupPatientReordering} from './patient-drag.mjs';
import {labSingleButtonDraft} from './lab-batch-preview.mjs';
import {labButtonIntent,issueButtonIntent,skipButtonIntent,calendarActionIcon} from './calendar-action-ui.mjs?v=2';
import {scrollCalendarToWeek,calendarWindowDates,enableCalendarHorizontalWheel} from './calendar-viewport.mjs?v=8';
import {calendarContact} from './calendar-contact.mjs';
import {setupCalendarInlineNotes} from './calendar-note-inline.mjs';
import {calendarElnIndicator} from './calendar-eln-indicator.mjs';
import {calendarPatientNameParts} from './calendar-patient-name.mjs?v=2';
import {notesColumnWidth} from './notes-column-width.mjs';
import {initialPhoneExpanded,savePhoneExpanded} from './calendar-phone-prefs.mjs';
import {calendarTreatmentCellContent} from './calendar-event-icons.mjs?v=2';
import {chemoAdministrationState,chemoAdministrationSummary,chemoAdministrationDraft} from './chemo-administration.mjs?v=2';
import {calendarMaintenanceCellContent} from './calendar-maintenance-icon.mjs';
import {setupCalendarRangeSelection,calendarClickSelection} from './calendar-range-select.mjs?v=2';
import {setupCalendarCellContextMenu} from './calendar-cell-context-menu.mjs?v=4';
import {setupChemoChangeUI} from './chemo-change-ui.mjs?v=2';
import {setupPatientCardDrawer} from './patient-card-drawer.mjs';
import {createImportedDemoState,installImportedDemoRoster} from './demo-roster.mjs?v=5';
import {installPhotoDemoRoster} from './demo-photo-roster.mjs';
import {installPhotoCourseAssignments} from './demo-photo-course-assignments.mjs';
import {calendarRosterRows} from './calendar-roster-rows.mjs';
import {syncCourseStartStatusesDraft} from './course-start-status.mjs';
import {installImportedLabColors} from './demo-lab-colors.mjs?v=1';
import {createFirebaseDemoSync} from './firebase-demo-state-ui.mjs';
import {setupDischargeTextReportUI} from './discharge-text-ui.mjs?v=2';

const store='luch-demo-v1';
let state;
try { state=JSON.parse(localStorage.getItem(store)); } catch { state=null; }
// Once per browser, replace the old synthetic roster; subsequent edits persist.
state=installImportedDemoRoster(state);
state=installImportedLabColors(state);
state=installPhotoDemoRoster(state);
state=installPhotoCourseAssignments(state);
state.breakdowns??=[];state.transfers??=[];state.audit??=[];
state=ensurePatientModel(state);
state=syncCourseStartStatusesDraft(state,localToday()).state;
// Persist safe migration of pending HLT blood dates; issued referrals are untouched.
try { localStorage.setItem(store,JSON.stringify(state)); } catch {}
let month=localToday().slice(0,7),view='calendar',selected=new Set(),anchor=null,filter='',patientSort='order';
let phoneExpanded=initialPhoneExpanded(localStorage,window.matchMedia('(max-width:700px)').matches);
const el=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const visibleCourse=p=>['active','planned'].includes(p.status)&&!state.people.find(x=>x.id===p.personId)?.archived;
let cloudUI=null,inlineNotesUI=null,applyingRemoteState=false;
let taskPanelOpen=false,taskShowCompleted=false,taskViewDate=localToday(),taskLastToday=localToday();
const save=()=>{state=captureTodayTaskHistoryDraft(state,localToday()).state;localStorage.setItem(store,JSON.stringify(state));cloudUI?.localChanged();};
function notice(message){const t=el('toast');t.textContent=message;t.classList.add('show');clearTimeout(notice.timer);notice.timer=setTimeout(()=>t.classList.remove('show'),2900);}
setupDischargeTextReportUI({getState:()=>state,notice});
const cellKey=(id,date)=>id+'|'+date;
const selectionItems=()=>[...selected].map(x=>{const [patientId,date]=x.split('|');return {patientId,date};});
function buttonClick(kind){
 if(!selected.size){notice('Сначала выбери ячейки пациентов в календаре');return;}
 hideWeekPreview();
 const outcome=action(state,selectionItems(),kind);
 state=outcome.state;save();render();
 notice('Изменено Х: '+outcome.changed+' · без изменений: '+outcome.skipped);
}
function applyLabAction(){
 hideWeekPreview();
 const result=labSingleButtonDraft(state,selectionItems());
 if(result.error){notice(result.error);return;}
 if(!result.changed){
   notice('Изменений нет. Выданные направления сохранены.');
   return;
 }
 state=result.state;save();render();
 notice(result.kind==='lab-assign'
  ? 'Анализов назначено: '+result.assigned+' · без изменений: '+result.unchanged
  : 'Назначений снято: '+result.cancelled+' · без изменений: '+result.unchanged);
}
let weekPending=null;
function hideWeekPreview(){
 weekPending=null;
 const dlg=el('issue-dialog');
 if(dlg.open)dlg.close();
 el('issue-week-preview').innerHTML='';
}
function renderWeekPreview(){
 const date=el('issue-week-date').value,week=weekBounds(date);
 const selector=el('issue-week-options');
 selector.value=week&&[...selector.options].some(o=>o.value===week.start)?week.start:'custom';
 if(!week){
  weekPending=null;
  el('issue-week-preview').textContent='Выбери дату недели.';
  el('issue-week-confirm').disabled=true;
  return;
 }
 const draft=issueWeekDraft(state,date);
 if(draft.error){
  weekPending=null;
  el('issue-week-preview').textContent=draft.error;
  el('issue-week-confirm').disabled=true;
  return;
 }
 weekPending=draft.changed?draft:null;
 el('issue-week-confirm').disabled=!draft.changed;
 const rows=draft.entries.map(x=>'<tr><td>'+esc(x.patientName)+'</td><td>'+esc(x.courseName)+'</td><td>'+pretty(x.date)+'</td></tr>').join('');
 el('issue-week-preview').innerHTML='<p class="issue-period"><b>Неделя: '+pretty(draft.start)+' — '+pretty(draft.end)+'</b></p>'+
  (draft.changed?'<p>Направлений к выдаче: <b>'+draft.changed+'</b>. Проверь список:</p>'+
  '<div class="scroll"><table class="data-table"><thead><tr><th>Пациент</th><th>Курс</th><th>Дата анализа</th></tr></thead><tbody>'+rows+'</tbody></table></div>':
  '<p class="muted">На эту неделю нет назначенных анализов со статусом «Нужно оформить». Можно выбрать другую неделю.</p>');
}
function openWeekDialog(){
 const weeks=[...new Set(calendarWindowDates(month).map(d=>weekBounds(d)?.start).filter(Boolean))];
 el('issue-week-options').innerHTML=weeks.map(start=>{
  const bounds=weekBounds(start);
  return '<option value="'+start+'">'+pretty(bounds.start)+' — '+pretty(bounds.end)+'</option>';
 }).join('')+'<option value="custom">Другая неделя (выбери дату)</option>';
 const d=new Date();
 const today=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 el('issue-week-date').value=today.slice(0,7)===month?today:month+'-01';
 renderWeekPreview();
 const dlg=el('issue-dialog');
 if(typeof dlg.showModal==='function')dlg.showModal();else dlg.setAttribute('open','');
}
function issueWeekClick(){
 if(selected.size){
  hideWeekPreview();
  // Mixed selections issue missing referrals first, without cancelling issued ones.
  // When all selected cells are issued, repeat click undoes the issued marks.
  const intent=issueButtonIntent(state,selectionItems());
  const outcome=action(state,intent.cells,'issue');
  if(!outcome.changed){
   notice('Ничего не изменено: курс недоступен.');
   return;
  }
  state=outcome.state;save();render();
  notice('Выдано: '+outcome.issued+' · отменена выдача: '+outcome.issueUndone+(outcome.skipped?' · без изменений: '+outcome.skipped:''));
  return;
 }
 openWeekDialog();
}
function selectCell(id,date,event){
 hideWeekPreview();
 const key=cellKey(id,date);
 if(event.shiftKey && anchor){
   const [startId,startDate]=anchor.split('|');
   const patients=visiblePatients(), allDates=calendarWindowDates(month);
   const a=patients.findIndex(x=>x.id===startId),b=patients.findIndex(x=>x.id===id);
   const da=allDates.indexOf(startDate),db=allDates.indexOf(date);
   if(a>=0&&b>=0&&da>=0&&db>=0){
     selected.clear();
     for(let i=Math.min(a,b);i<=Math.max(a,b);i++)
       for(let j=Math.min(da,db);j<=Math.max(da,db);j++)selected.add(cellKey(patients[i].id,allDates[j]));
   }
 }else{
   selected=calendarClickSelection(selected,key,{
     additive:event.metaKey||event.ctrlKey||window.matchMedia('(pointer: coarse)').matches
   });
 }
 // An empty selection should have no shift-range anchor. If one of several
 // selected cells was removed, keep the anchor on a cell that remains.
 anchor=selected.size?(selected.has(key)?key:[...selected].at(-1)):null;
 render();
}
function previewCalendarRange(keys){
 el('selected-count').textContent=keys.size?'Выбрано: '+keys.size:'Ничего не выбрано';
 el('clear-selected').classList.toggle('hidden',!keys.size);
}
function commitCalendarRange(keys,start){
 hideWeekPreview();
 selected=new Set(keys);
 anchor=cellKey(start.patientId,start.date);
 render();
}
function visiblePatients(){
 const dates=calendarWindowDates(month);
 const names=new Map((state.people||[]).map(p=>[p.id,p.name]));
 const positions=new Map(orderedPersonIds(state).map((id,index)=>[id,index]));
 return state.patients.filter(p=>visibleCourse(p)&&(!filter||dates.some(d=>machineAt(p,state,d)===filter)))
  .sort((a,b)=>comparePatientEntries({...a,name:names.get(a.personId)||a.name},{...b,name:names.get(b.personId)||b.name},patientSort,positions));
}
// Position the single task list outside the clipped calendar workspace.
function positionTodayTasksPopover(){
 if(!taskPanelOpen||view!=='calendar')return;
 const trigger=el('stats').querySelector('[data-task-collapse]');
 const popup=el('today-tasks-popover');
 if(!trigger||popup.classList.contains('hidden'))return;
 const rect=trigger.getBoundingClientRect(),padding=10;
 const width=Math.min(360,Math.max(0,window.innerWidth-2*padding));
 const left=Math.max(padding,Math.min(rect.left+(rect.width-width)/2,window.innerWidth-width-padding));
 const top=Math.max(padding,rect.bottom+8);
 popup.style.left=left+'px';
 popup.style.top=top+'px';
 popup.style.width=width+'px';
 popup.style.maxHeight=Math.max(120,window.innerHeight-top-padding)+'px';
}

function renderStats(){
 const today=localToday();
 if(taskLastToday!==today){
  if(taskViewDate===taskLastToday)taskViewDate=today;
  taskLastToday=today;
 }
 if(taskViewDate>today)taskViewDate=today;
 // Store today's tasks even if no user clicks them. A past day with no saved
 // snapshot can only be reconstructed from current course and lab records.
 const captured=applyingRemoteState?{state,changed:false}:captureTodayTaskHistoryDraft(state,today);
 if(captured.changed){
  state=captured.state;
  save(); // propagate the new daily snapshot through opt-in demo sync
 }
 const {tasks,snapshot}=tasksForDate(state,taskViewDate,today);
 const pendingTasks=tasks.filter(task=>!task.done),completedTasks=tasks.filter(task=>task.done);
 const pending=pendingTasks.length;
 const date=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'})
  .format(new Date(taskViewDate+'T12:00:00'));
 const taskRow=task=>{
  const call=task.kind==='hlt-call'?(task.phoneHref
   ?'<a class="today-task-call" href="tel:'+esc(task.phoneHref)+'" title="Позвонить: '+esc(task.fullName)+'" aria-label="Позвонить: '+esc(task.fullName)+'"><span aria-hidden="true">☎</span></a>'
   :'<span class="today-task-call is-unavailable" role="img" aria-label="Номер телефона не указан" title="Номер телефона не указан">☎</span>'):'';
  return '<li class="today-task'+(task.done?' is-done':'')+'">'
   +'<button type="button" class="today-task-check" data-today-task-id="'+esc(task.id)+'" aria-pressed="'+task.done+'" aria-label="'+esc((task.done?'Снять отметку выполнения: ':'Отметить выполненной: ')+task.label)+'"><span aria-hidden="true">'+(task.done?'✓':'')+'</span></button>'
   +'<span class="today-task-text" title="'+esc(task.fullName)+'">'+esc(task.label)+'</span>'
   +call+'</li>';
 };
 const active=activePatientCount(state);
 el('calendar-active-count').textContent=String(active);
 el('calendar-add-patient').setAttribute('aria-label','Добавить пациента. Активных пациентов: '+active);
 const completedCount=completedTasks.length;
 // The toolbar badge ALWAYS counts today's open tasks, even while viewing history.
 const todayPending=taskViewDate===today?pending:todayTasks(state,today).filter(task=>!task.done).length;
 const header='<button type="button" class="today-tasks-toggle" data-task-collapse aria-controls="today-tasks-popover" aria-expanded="'+taskPanelOpen+'" aria-label="Задачи на сегодня. Невыполнено: '+todayPending+'">'
  +'<svg class="today-tasks-icon" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 4h11M9 10h11M9 16h11M3.5 4l1.5 1.5L7 3M3.5 10l1.5 1.5L7 9M3.5 16l1.5 1.5L7 15"/></svg>'
  +'<span id="today-tasks-title" class="today-tasks-title-long">Задачи на сегодня</span>'
  +'<span class="today-tasks-title-short" aria-hidden="true">Задачи</span>'
  +'<span class="today-tasks-count'+(todayPending?' has-pending':'')+'" aria-hidden="true">'+todayPending+'</span>'
  +'<span class="today-tasks-chevron" aria-hidden="true">'+(taskPanelOpen?'▴':'▾')+'</span></button>';
 const nav='<div class="today-tasks-nav" aria-label="Выбор даты задач">'
  +'<button type="button" data-task-shift="-1" aria-label="Предыдущий день" title="Предыдущий день">‹</button>'
  +'<input type="date" data-task-date-picker value="'+taskViewDate+'" max="'+today+'" aria-label="Дата задач">'
  +'<button type="button" data-task-shift="1" '+(taskViewDate>=today?'disabled':'')+' aria-label="Следующий день" title="Следующий день">›</button>'
  +'<button type="button" class="today-tasks-back" data-task-today '+(taskViewDate===today?'disabled':'')+'>Сегодня</button>'
  +'</div>';
 const currentRows=pendingTasks.map(taskRow).join('');
 const completedRows=completedTasks.map(taskRow).join('');
 const doneButton=completedCount?'<button type="button" class="today-tasks-completed-toggle" data-task-completed aria-expanded="'+taskShowCompleted+'">'
  +(taskShowCompleted?'Скрыть выполненные':'Показать выполненные')+' ('+completedCount+')'
  +' <span aria-hidden="true">'+(taskShowCompleted?'▴':'▾')+'</span></button>':'';
 const body='<div class="today-tasks-body">'+nav
  +(taskViewDate!==today&&!snapshot?'<p class="today-tasks-history-note">Для этой даты нет сохранённого снимка. Показаны задачи, которые удалось восстановить по текущему расписанию.</p>':'')
  +(pending?'<ul class="today-tasks-list">'+currentRows+'</ul>':
    '<p class="today-tasks-empty">'+(tasks.length?'Нет невыполненных задач':'На выбранную дату задач нет')+'</p>')
  +doneButton
  +(taskShowCompleted&&completedCount?'<ul class="today-tasks-list today-tasks-completed-list" aria-label="Выполненные задачи">'+completedRows+'</ul>':'')
  +'</div>';
 el('stats').innerHTML='<section class="today-tasks" aria-labelledby="today-tasks-title">'+header+'</section>';
 const popup=el('today-tasks-popover');
 const previousScroll=popup.scrollTop;
 popup.innerHTML=taskPanelOpen
  ?'<div class="today-tasks-popover-head"><strong>'+(taskViewDate===today?'Задачи на сегодня':'Задачи за день')+'</strong><small>'+esc(date)+'</small>'
    +'<span class="today-tasks-popover-count">'+(tasks.length?(pending?pending+' не выполнено':'Все выполнено'):'Нет задач')+'</span></div>'+body
  :'';
 popup.classList.toggle('hidden',!taskPanelOpen||view!=='calendar');
 if(taskPanelOpen){popup.scrollTop=previousScroll;positionTodayTasksPopover();}

}

function renderCalendar(){
 inlineNotesUI?.beforeRender();
 // Preserve the user's horizontal position when a selection or plan re-renders the grid.
 const scroller=el('calendar').closest('.scroll'),previousLeft=scroller?.scrollLeft??0;
 const dates=calendarWindowDates(month),patients=visiblePatients();
 const tableRows=calendarRosterRows(state,patients,{filter,sort:patientSort});
 el('calendar').style.setProperty('--notes-column-width',notesColumnWidth(tableRows.map(p=>calendarContact(state,p).notes))+'px');
 el('calendar').classList.toggle('calendar-phone-collapsed',!phoneExpanded);
 const dow=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
 const cells=dates.map(d=>{
   const holiday=effectiveDay(state,d),working=isWorkingDay(state,d);
   const weekend=isWeekend(d)&&!working;
   return '<th data-date="'+d+'" class="'+(!working?'off ':'')+(weekend?'weekend-head ':'')+(holiday?.holiday?'holiday-head ':'')+(holiday?.working?'working-exception':'')+'" title="'+esc(effectiveDayLabel(state,d))+'">'+pretty(d)+
    '<small>'+dow[(new Date(d+'T00:00:00Z').getUTCDay()+6)%7]+'</small>'+(holiday?'<small class="holiday-marker">'+(holiday.working?'●':'✳')+'</small>':'')+'</th>';
 }).join('');
 el('calendar').querySelector('thead').innerHTML='<tr><th class="id sticky">ID</th><th class="name sticky">Пациент</th><th class="machine sticky">Установка</th><th class="calendar-phone sticky"><button type="button" id="calendar-phone-toggle" class="calendar-phone-toggle" aria-expanded="'+phoneExpanded+'" aria-label="'+(phoneExpanded?'Свернуть телефоны':'Показать телефоны')+'" title="'+(phoneExpanded?'Свернуть телефоны':'Показать телефоны')+'">'+(phoneExpanded?'Телефон <span aria-hidden="true">−</span>':'<span aria-hidden="true">☎</span> <span class="sr-only">Телефон</span> <span aria-hidden="true">+</span>')+'</button></th><th class="calendar-notes sticky">Примечание</th>'+cells+'<th class="calendar-tail" aria-hidden="true"></th></tr>';
 const until=dates.at(-1);
 el('calendar').querySelector('tbody').innerHTML=tableRows.map(p=>{
   const plan=p.noCourse?new Map():schedule(p,state,until),contact=calendarContact(state,p);
   const phone=contact.phone?esc(contact.phone):'<span class="calendar-empty">—</span>';
   const ctvDisplay=p.noCourse?'':currentCtvName(state,p);
   const radiationCounter=p.noCourse?null:courseProgress(state,p,localToday());
   const radiationCounterMarkup=radiationCounter?'<span class="calendar-lt-counter" title="Выполнено ЛТ: '+radiationCounter.completed+' из '+radiationCounter.total+
    ' · автоматически по календарю: '+radiationCounter.calendarCompleted+
    ' · подтверждено отдельно: '+radiationCounter.explicit+
    '">ЛТ '+radiationCounter.completed+'/'+radiationCounter.total+'</span>':'';
   const chemoCounter=p.treatmentType==='ХЛТ'&&p.chemo?.count?chemoAdministrationSummary(state,p.id,localToday()):null;
   const chemoCounterMarkup=chemoCounter?'<span class="calendar-chemo-counter" title="Выполнено ХТ: '+chemoCounter.completed+' из '+chemoCounter.total+
    ' · вручную подтверждено: '+chemoCounter.confirmed+
    ' · учтено только по календарю: '+chemoCounter.assumed+
    ' · не проводилась: '+chemoCounter.notGiven+' · отменено по плану: '+chemoCounter.cancelled+
    '">ХТ '+chemoCounter.completed+'/'+chemoCounter.total+'</span>':'';
   const patientMeta='<small class="calendar-patient-meta">'+(p.noCourse?'<span>Без курса</span>':ctvDisplay?'<span class="calendar-patient-ctv" title="'+esc(ctvDisplay)+'">'+esc(ctvDisplay)+'</span>':'')+radiationCounterMarkup+chemoCounterMarkup+'</small>';
   const notes=contact.notes?'<span class="calendar-note-value" title="'+esc(contact.notes)+'">'+esc(contact.notes)+'</span>':'<span class="calendar-empty">—</span>';
   const tds=dates.map(d=>{
     if(p.noCourse)return '<td class="calendar-no-course-day" title="Курс лечения пока не назначен"></td>';
     const c=plan.get(d),sessionCompletion=radiationSessionCompletion(c,d,localToday()),elapsed=sessionCompletion.source==='calendar',lab=labAt(state,p.id,d),sourceLab=state.events.find(e=>e.patientId===p.id&&e.date===d&&e.type==='lab'&&e.status!=='cancelled'&&e.source==='talbichka-cell-color'),chemo=state.events.some(e=>e.patientId===p.id&&e.date===d&&e.type==='chemo'&&['planned','administered','given'].includes(e.status)),key=cellKey(p.id,d);
     const chemoEvent=state.events.find(e=>e.patientId===p.id&&e.date===d&&e.type==='chemo'&&e.source==='hlt');
     const chemoCancelled=chemoEvent?.status==='cancelled';
     const chemoOutcome=chemoAdministrationState(chemoEvent,localToday());
     const chemoMissed=chemoOutcome==='not-given'||chemoCancelled;
     const chemoDescription={
      assumed:' · ХТ выполнена автоматически по календарю (без подтверждения факта)',
      confirmed:' · проведение ХТ подтверждено вручную',
      'not-given':' · ХТ не проводилась (ручная отметка)',
      planned:' · ХТ запланирована'
     }[chemoOutcome]||'';
     const working=isWorkingDay(state,d),weekend=isWeekend(d)&&!working;
     const cl=['day',!working?'off':'',weekend?'weekend-day':'',effectiveDay(state,d)?.holiday?'holiday-day':'',c?.kind||'',c?.final?'final':'',c?.beforeMaintenance?'maintenance-final':'',c?.delivered?'delivered':'',elapsed?'elapsed':'',lab==='todo'?'lab':lab==='issued'?'issued':'',chemo?'chemo-day':'',lab||chemo?'has-treatment-event':'',lab?'has-lab-event':'',chemo?'has-chemo-event':'',chemoCancelled?'chemo-cancelled':'',selected.has(key)?'selected':''].join(' ');
     const label=c?.label||'';
     const transfer=(state.transfers||[]).find(t=>t.patientId===p.id&&t.date===d);
     const title=p.name+' · '+p.courseName+' · '+pretty(d)+' · '+machineAt(p,state,d)+(c?.kind==='breakdown'?' · АППАРАТ НЕ РАБОТАЕТ':'')+(c?.delivered?' · проведён до поломки':'')+(elapsed?' · ЛТ выполнена автоматически по календарю (без подтверждения факта)':'')+(transfer?' · перевод на '+transfer.to:'')+(c?.kind==='maintenance'?' · ТО':c?.kind==='skip'?' · пропуск':c?.kind==='session'?' · сеанс '+c.n:'')+(lab==='todo'?' · кровь назначена':lab==='issued'?' · направление выдано':'')+(sourceLab?' · отметка по цвету из «Талбички» — статус направления требуется подтвердить':'')+(chemo?' · запланировано введение ХТ':'')+chemoDescription+(chemoCancelled?' · введение ХТ отменено':'')+(chemoEvent?.originalDate&&chemoEvent.originalDate!==d?' · капельница перенесена с '+chemoEvent.originalDate:'')+(chemoEvent?.nominalDate&&chemoEvent.nominalDate!==d?' · по схеме '+chemoEvent.nominalDate+', перенос на ближайший рабочий день':'')+(c?.beforeMaintenance?' · последняя фракция утром до ТО (план, не факт проведения)':'')+(effectiveDay(state,d)?' · '+effectiveDayLabel(state,d):'');
     const treatmentContent=calendarTreatmentCellContent({label:c?.kind==='maintenance'?'':label,isSession:c?.kind==='session',labStatus:lab,chemoPlanned:chemo||chemoCancelled,chemoNotGiven:chemoMissed});
     const cellContent=calendarMaintenanceCellContent({isMaintenance:c?.kind==='maintenance',hasTreatmentEvent:Boolean(lab||chemo||chemoCancelled),content:treatmentContent});
     return '<td class="'+cl+'" data-id="'+p.id+'" data-date="'+d+'" title="'+esc(title)+'">'+cellContent+(c?.delivered?'<span class="delivered-mark">✓</span>':elapsed?'<span class="elapsed-mark">✓</span>':'')+(transfer?'<span class="transfer-mark">↗</span>':'')+(lab?'<i class="lab-dot"></i>':'')+(c?.beforeMaintenance?'<span class="maintfinal-mark">до ТО</span>':'')+'</td>';
   }).join('');
   const nameParts=calendarPatientNameParts(p.name);
   return '<tr data-person-id="'+esc(p.personId)+'" data-course-id="'+(p.noCourse?'':esc(p.id))+'"'+(p.noCourse?' class="calendar-no-course-row"':'')+'><td class="sticky id">'+esc(p.personId)+calendarElnIndicator(contact.eln)+'</td><td class="sticky name"><div class="calendar-patient-primary"><button type="button" class="patient-open" data-person-id="'+esc(p.personId)+'" title="'+esc(p.name)+'" aria-label="Открыть карточку пациента: '+esc(p.name)+'"><span class="patient-name-short" aria-hidden="true"><span class="patient-name-surname">'+esc(nameParts.surname)+'</span>'+(nameParts.compactRemainder?'<span class="patient-name-remainder">'+esc(nameParts.compactRemainder)+'</span>':'')+'</span><span class="patient-name-full" aria-hidden="true"><span class="patient-name-surname">'+esc(nameParts.surname)+'</span>'+(nameParts.fullRemainder?'<span class="patient-name-remainder">'+esc(nameParts.fullRemainder)+'</span>':'')+'</span></button>'+(p.treatmentType==='ХЛТ'?'<span class="type-tag">ХЛТ</span>':'')+'</div>'+patientMeta+'</td><td class="sticky machine">'+(p.noCourse?'<span class="calendar-empty">—</span>':machineAt(p,state,until)+(p.machine!==machineAt(p,state,until)?'<small>с '+p.machine+'</small>':''))+'</td><td class="sticky calendar-phone" title="'+esc(contact.phone)+'"><span class="calendar-phone-value">'+phone+'</span><span class="calendar-phone-icon" aria-hidden="true">'+(contact.phone?'☎':'—')+'</span></td><td class="sticky calendar-notes"><button type="button" class="calendar-note-trigger" data-calendar-note-open title="'+esc(contact.notes||'Добавить примечание')+'" aria-label="Изменить примечание пациента: '+esc(p.name)+'">'+notes+'</button></td>'+tds+'<td class="calendar-tail" aria-hidden="true"></td></tr>';
 }).join('');
 el('selected-count').textContent=selected.size?'Выбрано: '+selected.size:'Ничего не выбрано';
 el('clear-selected').classList.toggle('hidden',!selected.size);
 if(scroller)scroller.scrollLeft=previousLeft;
 el('calendar').querySelectorAll('td.day').forEach(td=>td.addEventListener('click',e=>selectCell(td.dataset.id,td.dataset.date,e)));
 el('calendar').querySelectorAll('.patient-open').forEach(btn=>btn.onclick=()=>patientUI.selectPerson(btn.dataset.personId));
 el('calendar-phone-toggle').onclick=()=>{
  phoneExpanded=!phoneExpanded;
  savePhoneExpanded(localStorage,phoneExpanded);
  el('calendar').classList.toggle('calendar-phone-collapsed',!phoneExpanded);
  const button=el('calendar-phone-toggle');
  button.setAttribute('aria-expanded',String(phoneExpanded));
  button.setAttribute('aria-label',phoneExpanded?'Свернуть телефоны':'Показать телефоны');
  button.title=button.getAttribute('aria-label');
  button.innerHTML=phoneExpanded?'Телефон <span aria-hidden="true">−</span>':'<span aria-hidden="true">☎</span> <span class="sr-only">Телефон</span> <span aria-hidden="true">+</span>';
 };
 inlineNotesUI?.afterRender();
}
function renderActionButtons(){
 const selection=selectionItems();
 for(const [id,which,intent] of [
   ['assign','lab',labButtonIntent(state,selection)],
   ['issue','issue',issueButtonIntent(state,selection)],
   ['skip','skip',skipButtonIntent(state,selection)]
 ]){
   const button=el(id);
   button.dataset.mode=intent.mode;
   button.disabled=intent.disabled;
   button.dataset.tooltip=intent.label+' — '+intent.title;
   button.setAttribute('aria-label',intent.label+'. '+intent.title);
   button.querySelector('.action-icon').innerHTML=calendarActionIcon(which,intent.mode);
 }
}
function renderPatients(){patientUI.render();}
let maintPending=null;
function maintenancePreview(result){
 if(result.error){notice(result.error);return;}
 const m=(state.maintenance||[]).find(x=>x.id===result.entry.id),p=result.patient;
 const ending=s=>[...schedule(s.patients.find(x=>x.id===p.id),s,addDays(m.date,120))]
  .filter(([,c])=>c.kind==='session'&&c.final).at(-1)?.[0];
 const oldEnd=ending(state),newEnd=ending(result.state);
 maintPending=result.state;
 el('maint-preview').classList.remove('hidden');
 el('maint-preview').innerHTML='<h3>Подтвердить исключение в день ТО</h3>'+
  '<p><b>'+esc(p.name)+' · '+esc(p.courseName)+'</b> · '+esc(m.machine)+' · '+pretty(m.date)+'</p>'+
  '<p>Последняя фракция: '+(oldEnd?pretty(oldEnd):'—')+' → '+(newEnd?pretty(newEnd):'—')+'</p>'+
  '<p class="safety-note">Разрешаем только планирование последней фракции утром до передачи аппарата на ТО. Не отмечаем её как фактически проведённую. Другие пациенты остаются исключены из расписания на время ТО; при поломке разрешение не действует.</p>'+
  '<div class="preview-actions"><button type="button" id="maint-confirm" class="primary">Подтвердить</button><button type="button" id="maint-cancel">Отмена</button></div>';
 el('maint-confirm').onclick=()=>{if(!maintPending)return;state=maintPending;maintPending=null;save();render();el('maint-preview').classList.add('hidden');notice('Последняя фракция до ТО обновлена');};
 el('maint-cancel').onclick=()=>{maintPending=null;el('maint-preview').classList.add('hidden');};
 el('maint-preview').scrollIntoView({block:'nearest',behavior:'smooth'});
}
function renderMaintenance(){
 const entries=(state.maintenance||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
 el('maintenance-list').innerHTML=entries.length?entries.map(m=>{
   const candidates=maintenanceFinalCandidates(state,m.id),selected=new Set(m.finalBeforeService||[]);
   const previouslySelected=(m.finalBeforeService||[]).map(id=>state.patients.find(x=>x.id===id)).filter(Boolean);
   return '<div class="maintenance-entry">'+
    '<div class="maintenance-entry-head"><div><b>'+pretty(m.date)+' · '+esc(m.machine)+'</b><small> '+esc(effectiveDayLabel(state,m.date))+'</small></div>'+
    '<button data-maint-id="'+esc(m.id)+'" type="button">Удалить ТО</button></div>'+
    '<p class="muted">Последняя фракция утром до ТО · только по отдельному подтверждению</p>'+
    '<div class="maintenance-exceptions">'+
    previouslySelected.map(p=>'<div class="maintenance-choice"><span><b>'+esc(p.name)+'</b> · '+esc(p.courseName)+' · запланирована до ТО</span><button type="button" data-maint-final-remove="'+esc(m.id)+'" data-patient-id="'+esc(p.id)+'">Снять</button></div>').join('')+
    candidates.filter(p=>!selected.has(p.id)).map(p=>'<div class="maintenance-choice"><span><b>'+esc(p.name)+'</b> · '+esc(p.courseName)+' · последняя фракция</span><button type="button" data-maint-final-add="'+esc(m.id)+'" data-patient-id="'+esc(p.id)+'">Запланировать до ТО</button></div>').join('')+
    (!candidates.length&&!previouslySelected.length?'<p class="muted">Подходящих последних фракций нет'+(!isWorkingDay(state,m.date)?' — этот день сейчас нерабочий.':'')+'</p>':'')+
    '</div></div>';
 }).join(''):'<p class="muted">ТО пока не запланировано.</p>';
 el('maintenance-list').querySelectorAll('[data-maint-id]').forEach(b=>b.onclick=()=>{
   const entry=(state.maintenance||[]).find(m=>m.id===b.dataset.maintId);
   if(!confirm('Удалить ТО '+pretty(entry.date)+'? Все исключения «последняя фракция до ТО» этой записи также удалятся.'))return;
   state=maintenanceRemove(state,b.dataset.maintId);save();render();notice('ТО удалено');
 });
 el('maintenance-list').querySelectorAll('[data-maint-final-add],[data-maint-final-remove]').forEach(b=>b.onclick=()=>{
   maintenancePreview(maintenanceFinalDraft(state,b.dataset.maintFinalAdd||b.dataset.maintFinalRemove,b.dataset.patientId,Boolean(b.dataset.maintFinalAdd)));
 });
}
const operations=createOperationalUI({getState:()=>state,commitState:next=>{state=next;save();},render:()=>render(),notice});
function movePatient(sourceId,targetId,placement){
 const result=reorderPatientDraft(state,sourceId,targetId,placement);
 if(result.error){notice(result.error);return;}
 if(!result.changed)return;
 state=result.state;patientSort='order';save();render();notice('Порядок пациентов сохранён');
}
const cardDrawer=setupPatientCardDrawer({
 dialog:el('patient-card-dialog'),
 closeButton:el('patient-card-close'),
 toggleButton:el('patient-card-register-toggle'),
 register:el('patient-card-register')
});
const patientUI=createPatientUI({getState:()=>state,commitState:next=>{state=next;save();},renderApp:()=>render(),notice,onDischargeRequest:courseId=>showDischargeDialog(courseId),onOpenCard:()=>cardDrawer.open(),getSort:()=>patientSort,onSortChange:next=>{patientSort=next;render();},
  onPersonCreated:()=>{
    // Creation takes priority over previous alphabetical/status sort or machine filter.
    patientSort='order';filter='';el('filter').value='';
    selected.clear();anchor=null;
    const scroller=el('calendar').closest('.scroll');
    if(scroller)scroller.scrollTop=0;
  }});
const chemoChangeUI=setupChemoChangeUI({getState:()=>state,commitState:next=>{state=next;save();},renderApp:()=>render(),notice});
const catalogUI=createCatalogUI({getState:()=>state,commitState:next=>{state=next;save();},renderApp:()=>render(),notice});
const workdayUI=createWorkdayUI({getState:()=>state,commitState:next=>{state=next;save();},renderApp:()=>render(),notice});
inlineNotesUI=setupCalendarInlineNotes({calendar:el('calendar'),getState:()=>state,
 commitState:next=>{state=next;save();},renderApp:()=>render(),notice,
 onClosed:()=>cloudUI?.checkRemote()});
cloudUI=createFirebaseDemoSync({
 getState:()=>state,
 replaceState:(next,payload)=>{
  applyingRemoteState=true;
  try{
   state=next;
   localStorage.setItem(store,payload);
   selected.clear();anchor=null;
   hideWeekPreview();render();
  }finally{applyingRemoteState=false;}
 },
 canApplyRemote:()=>!inlineNotesUI?.isEditing()&&![...document.querySelectorAll('dialog')]
  .some(d=>d.open&&d.id!=='cloud-dialog')
});
// The final-fraction question is grouped by day. A single explicit action
// records every choice together; postponing only suppresses this tab's prompts.
const dischargeSuppressed=new Set();
let promptCheckedOnDay='',dischargePendingIds=[],dischargeDialogDay='';
function closeDischargeDialog(){
 const dialog=el('discharge-dialog');
 dischargePendingIds=[];
 dischargeDialogDay='';
 if(dialog.open)dialog.close();
}
function updateDischargeButton(){
 const inputs=[...el('discharge-info').querySelectorAll('[data-discharge-course]')];
 const checked=inputs.filter(input=>input.checked).length;
 el('discharge-confirm').textContent=checked?'Подтвердить выписку ('+checked+')':'Оставить всех на лечении';
}
function showDischargeDialog(courseId=null){
 const dlg=el('discharge-dialog'),today=localToday();
 if(dlg.open||[...document.querySelectorAll('dialog')].some(d=>d.open))return;
 let entries;
 if(courseId){
  const course=state.patients.find(c=>c.id===courseId);
  const progress=courseProgress(state,course,today);
  if(!['active','planned'].includes(course?.status)||!progress.finalDate||progress.finalDate>today){
   notice('Для решения о выписке нужна наступившая дата последней плановой фракции.');return;
  }
  entries=[{course,progress,person:state.people?.find(p=>p.id===course.personId)}];
 }else{
  entries=dischargeCandidates(state,today).filter(x=>!dischargeSuppressed.has(x.course.id+'|'+today));
 }
 if(!entries.length)return;
 dischargeDialogDay=today;
 dischargePendingIds=entries.map(x=>x.course.id);
 el('discharge-dialog-title').textContent=entries.length===1?'Подтверждение выписки':'Выписка пациентов · '+entries.length;
 el('discharge-info').innerHTML='<p class="discharge-list-intro">Отметь тех, кого выписываем. По умолчанию выбраны все '+entries.length+' курс(а). Сними галочку, если выписку нужно отложить.</p>'+
  '<div class="discharge-list">'+entries.map(({course,person,progress})=>{
   const chemoAfter=course.treatmentType==='ХЛТ'&&(state.events||[]).some(event=>
    event.patientId===course.id&&event.type==='chemo'&&event.source==='hlt'&&
    event.status!=='cancelled'&&event.date>progress.finalDate);
   return '<label class="discharge-choice"><input type="checkbox" data-discharge-course="'+esc(course.id)+'" checked>'+
    '<span class="discharge-choice-content"><b>'+esc(person?.name||course.name)+'</b><span>'+esc(course.courseName||'Курс')+
    ' · '+esc(course.machine)+' · '+esc(progress.finalDate)+' · '+progress.total+' фр.</span>'+
    (chemoAfter?'<small class="discharge-deferred">По плану ХЛТ есть введения ХТ после последней фракции ЛТ. Проверь план до выписки.</small>':'')+
    (course.dischargeReview?.decision==='no'?'<small class="discharge-deferred">Ранее выписка была отложена.</small>':'')+
    '</span></label>';
  }).join('')+'</div>';
 updateDischargeButton();
 if(typeof dlg.showModal==='function')dlg.showModal();else dlg.setAttribute('open','');
}
function confirmDischargeBatch(){
 if(!dischargePendingIds.length)return;
 if(localToday()!==dischargeDialogDay){
  closeDischargeDialog();render();notice('Наступил новый день. Проверь обновлённый список.');return;
 }
 const inputs=[...el('discharge-info').querySelectorAll('[data-discharge-course]')];
 const choices=inputs.map(input=>({courseId:input.dataset.dischargeCourse,discharge:input.checked}));
 if(choices.length!==dischargePendingIds.length||
  choices.some((choice,index)=>choice.courseId!==dischargePendingIds[index])){
  notice('Список изменился. Открой выписку заново.');return;
 }
 const result=dischargeBatchDraft(state,choices,{today:dischargeDialogDay});
 if(result.error){notice(result.error);return;}
 state=result.state;save();
 closeDischargeDialog();
 render();
 notice('Выписано: '+result.discharged+' · оставлено на лечении: '+result.deferred);
}
function maybeAskDischarge(){
 const today=localToday();
 if(promptCheckedOnDay!==today){dischargeSuppressed.clear();promptCheckedOnDay=today;}
 if([...document.querySelectorAll('dialog')].some(d=>d.open))return;
 showDischargeDialog();
}

function renderJournal(){
 const arr=state.audit.slice().reverse();
 el('journal-list').innerHTML=arr.length?arr.map(a=>
 '<div class="list-item"><span><b>'+esc(a.patientId||a.machine||'Оборудование')+'</b> · '+esc(a.day||'')+' · '+({lab:'Кровь назначена','lab-assign':'Кровь назначена','lab-remove':'Назначение крови снято',issue:'Направление выдано','issue-undo':'Отмена выдачи направления',skip:'Пропуск',unskip:'Отмена пропуска',breakdown:'Поломка','breakdown-update':'Обновлено восстановление', 'breakdown-remove':'Отмена поломки',transfer:'Перевод аппарата','transfer-remove':'Отмена перевода','chemo-move':'Перенос капельницы','chemo-cancel':'Отмена капельницы','chemo-restore':'Восстановление капельницы','chemo-calendar-adjust':'Корректировка ХТ по рабочему календарю','chemo-administration-not-given':'ХТ не проводилась','chemo-administration-given':'Проведение ХТ подтверждено','chemo-administration-reset':'Снята ручная отметка ХТ','person-create':'Новый пациент','person-update':'Изменена карточка','person-archive':'Пациент в архиве','person-restore':'Пациент восстановлен','course-create':'Новый курс','course-update':'Изменён курс','course-archive':'Курс в архиве','course-restore':'Курс восстановлен','course-discharge':'Подтверждена выписка','course-start-auto':'Статус по первой фракции','course-discharge-early':'Досрочно завершён курс','course-discharge-deferred':'Выписка отложена','ctv-create':'Добавлена схема CTV','ctv-update':'Изменена схема CTV','ctv-hide':'CTV скрыт','ctv-show':'CTV восстановлен','ctv-reset':'CTV сброшен к исходному','chemo-plan':'План введений ХТ','calendar-day':'Рабочий календарь: дата изменена','calendar-day-remove':'Рабочий календарь: исключение удалено','patient-reorder':'Изменён порядок пациентов','patient-photo-roster':'Обновлён демонстрационный список','patient-photo-course':'Добавлены плановые курсы по снимку','maintenance-final':'Последняя фракция до ТО запланирована','maintenance-final-remove':'Исключение последней фракции до ТО снято','hlt-lab-align':'Дата анализа перед ХТ исправлена'}[a.kind]||a.kind)+(a.detail?' · '+esc(a.detail):'')+'</span><small>'+new Date(a.date).toLocaleString('ru-RU')+'</small></div>'
 ).join(''):'<div class="empty">Пока изменений нет — попробуй назначить анализы на календаре.</div>';
}
function setView(next){
 view=next;
 if(next!=='calendar'&&taskPanelOpen){
  taskPanelOpen=false;
  el('stats').querySelector('[data-task-collapse]')?.setAttribute('aria-expanded','false');
 }
 el('today-tasks-popover').classList.toggle('hidden',next!=='calendar'||!taskPanelOpen);
 if(next==='calendar')positionTodayTasksPopover();
 document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===next));
 document.querySelectorAll('[data-panel]').forEach(x=>x.classList.toggle('hidden',x.dataset.panel!==next));
 el('title').textContent=({calendar:'Пациенты','ctv-catalog':'Справочник CTV',workdays:'Рабочие дни и праздники',maintenance:'Техническое обслуживание',journal:'История действий',breakdowns:'Поломки аппаратов',transfers:'Переводы пациентов'})[next];
}
function showCurrentWeek(){
 const today=localToday(),currentMonth=today.slice(0,7);
 if(month!==currentMonth){
  hideWeekPreview();month=currentMonth;selected.clear();anchor=null;render();
 }
 setView('calendar');
 scrollCalendarToWeek(el('calendar'),weekBounds(today)?.start);
}
function render(){
 // Keep the stored course status synchronized on day rollover and after edits,
 // using the first actual planned fraction rather than the raw entered start.
 // Never echo a freshly downloaded Firebase revision back to the server.
 if(!applyingRemoteState){
  const sync=syncCourseStartStatusesDraft(state,localToday());
  if(sync.changed){state=sync.state;save();}
 }
 const [y,m]=month.split('-');el('month').textContent=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(new Date(Date.UTC(Number(y),Number(m)-1,1)));
 renderStats();renderCalendar();renderActionButtons();renderPatients();catalogUI.render();workdayUI.render();renderMaintenance();operations.renderBreakdowns();operations.renderTransfers();renderJournal();setView(view);maybeAskDischarge();
}
MACHINES.forEach(m=>{
 const o=document.createElement('option');o.value=m;o.textContent=m;el('filter').append(o.cloneNode(true));el('maint-machine').append(o);
});
function onTodayTasksClick(event){
 const collapse=event.target.closest('[data-task-collapse]');
 if(collapse){
  taskPanelOpen=!taskPanelOpen;
  renderStats();
  el('stats').querySelector('[data-task-collapse]')?.focus({preventScroll:true});
  return;
 }
 const showDone=event.target.closest('[data-task-completed]');
 if(showDone){taskShowCompleted=!taskShowCompleted;renderStats();return;}
 const back=event.target.closest('[data-task-today]');
 if(back){taskViewDate=localToday();taskShowCompleted=false;renderStats();return;}
 const shift=event.target.closest('[data-task-shift]');
 if(shift){
  const date=addDays(taskViewDate,Number(shift.dataset.taskShift));
  if(date<=localToday()){
   taskViewDate=date;taskShowCompleted=false;renderStats();
  }
  return;
 }
 const button=event.target.closest('button[data-today-task-id]');
 if(!button)return;
 const outcome=toggleTodayTaskDraft(state,button.dataset.todayTaskId,taskViewDate);
 if(!outcome.changed){notice(outcome.error);renderStats();return;}
 state=outcome.state;save();renderStats();
}
function onTodayTasksChange(event){
 if(!event.target.matches('[data-task-date-picker]'))return;
 const date=event.target.value;
 if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<=localToday()){
  taskViewDate=date;taskShowCompleted=false;
 }else notice('Можно открыть только сегодняшние и прошедшие даты.');
 renderStats();
}
for(const host of [el('stats'),el('today-tasks-popover')]){
 host.addEventListener('click',onTodayTasksClick);
 host.addEventListener('change',onTodayTasksChange);
}
document.addEventListener('pointerdown',event=>{
 if(!taskPanelOpen||el('stats').contains(event.target)||el('today-tasks-popover').contains(event.target))return;
 taskPanelOpen=false;renderStats();
});
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape'||!taskPanelOpen)return;
 taskPanelOpen=false;renderStats();
 el('stats').querySelector('[data-task-collapse]')?.focus({preventScroll:true});
});
window.addEventListener('resize',positionTodayTasksPopover);
document.addEventListener('scroll',positionTodayTasksPopover,true);
el('filter').onchange=e=>{hideWeekPreview();filter=e.target.value;selected.clear();render();};
el('calendar-add-patient').onclick=()=>patientUI.createNew();
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>b.dataset.view==='calendar'?showCurrentWeek():setView(b.dataset.view));
el('prev').onclick=()=>{hideWeekPreview();month=monthShift(month,-1);selected.clear();el('calendar').style.removeProperty('--calendar-trailing-width');render();el('calendar').closest('.scroll').scrollLeft=0;};
el('next').onclick=()=>{hideWeekPreview();month=monthShift(month,1);selected.clear();el('calendar').style.removeProperty('--calendar-trailing-width');render();el('calendar').closest('.scroll').scrollLeft=0;};
el('reset-month').onclick=showCurrentWeek;
el('assign').onclick=applyLabAction;
el('issue').onclick=issueWeekClick;
el('clear-selected').onclick=()=>{selected.clear();anchor=null;hideWeekPreview();render();};
el('issue-week-options').onchange=e=>{if(e.target.value!=='custom'){el('issue-week-date').value=e.target.value;renderWeekPreview();}};
el('issue-week-date').onchange=renderWeekPreview;
el('issue-week-confirm').onclick=()=>{
 if(!weekPending)return;
 const count=weekPending.changed;
 state=weekPending.state;save();hideWeekPreview();render();notice('Направлений отмечено «Выдано»: '+count);
};
el('issue-week-cancel').onclick=hideWeekPreview;
el('issue-dialog-close').onclick=hideWeekPreview;
el('issue-dialog').addEventListener('close',()=>{weekPending=null;});
el('skip').onclick=()=>buttonClick('skip');
el('discharge-info').addEventListener('change',event=>{
 if(event.target.matches('[data-discharge-course]'))updateDischargeButton();
});
el('discharge-confirm').onclick=confirmDischargeBatch;
el('discharge-later').onclick=()=>{
 for(const id of dischargePendingIds)dischargeSuppressed.add(id+'|'+dischargeDialogDay);
 closeDischargeDialog();
};
el('discharge-dialog-close').onclick=el('discharge-later').onclick;
el('discharge-dialog').addEventListener('cancel',event=>{event.preventDefault();el('discharge-later').click();});
window.addEventListener('focus',()=>{render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
// When an open tab crosses midnight, update inferred session marks and final-day prompts.
setInterval(()=>{if(localToday()!==promptCheckedOnDay)render();},60000);

el('maint-form').onsubmit=e=>{
 e.preventDefault();const result=maintenanceAdd(state,el('maint-date').value,el('maint-machine').value);
 if(result.changed){state=result.state;save();render();notice('ТО добавлено');}
 else notice('Такая дата ТО уже записана');
};
operations.setup();
patientUI.setup();
el('calendar').addEventListener('contextmenu',event=>{
 const cell=event.target.closest('td.name'),row=cell?.closest('tr[data-person-id]');
 if(!row||!el('calendar').contains(row))return;
 event.preventDefault();
 patientUI.openContextMenu({
  personId:row.dataset.personId,courseId:row.dataset.courseId,
  x:event.clientX,y:event.clientY
 });
});
setupPatientReordering({container:el('patient-list'),onMove:movePatient,getEnabled:()=>patientSort==='order',notice});
setupPatientReordering({container:el('calendar'),onMove:movePatient,getEnabled:()=>patientSort==='order',notice});
setupCalendarCellContextMenu({
 calendar:el('calendar'),menu:el('calendar-cell-menu'),
 getState:()=>state,getSelected:()=>selected,
 onSelect:(keys,cell)=>{
  hideWeekPreview();
  selected=keys;anchor=cellKey(cell.patientId,cell.date);
  render();
 },
 onAction:(which,cell)=>{
  if(which==='skip')buttonClick('skip');
  else if(which==='lab')applyLabAction();
  else if(which==='issue')issueWeekClick();
  else if(['chemo-not-given','chemo-outcome-reset'].includes(which)){
   const event=(state.events||[]).find(e=>e.patientId===cell?.patientId&&e.date===cell?.date&&e.type==='chemo'&&e.source==='hlt');
   const decision={'chemo-not-given':'not-given','chemo-outcome-reset':'reset'}[which];
   const updated=chemoAdministrationDraft(state,{eventId:event?.id,decision},localToday());
   if(!updated.changed){notice(updated.error||'ХТ не изменена');return;}
   state=updated.state;save();render();
   notice(decision==='not-given'?'ХТ не проводилась — капельница выделена красным':
    'Ручная отметка ХТ снята — учёт по календарю восстановлен');
  }
  else if(which.startsWith('chemo-'))chemoChangeUI.open(cell,which);
 }
});
setupCalendarRangeSelection({
 calendar:el('calendar'),
 getPatients:()=>visiblePatients(),
 getDates:()=>calendarWindowDates(month),
 getSelected:()=>selected,
 onPreview:previewCalendarRange,
 onCommit:commitCalendarRange
});
enableCalendarHorizontalWheel(el('calendar'));
catalogUI.setup();
workdayUI.setup();
el('reset').onclick=()=>{
 if(!confirm('Восстановить демонстрационные данные? Локальные изменения в этом браузере будут потеряны.'))return;
 if(!cloudUI.canReset())return;
 inlineNotesUI?.abort();
 state=ensurePatientModel(createImportedDemoState());state=installImportedLabColors(state);state=installPhotoDemoRoster(state);state=installPhotoCourseAssignments(state);patientSort='order';selected.clear();hideWeekPreview();save();operations.reset();patientUI.reset();catalogUI.reset();workdayUI.reset();render();notice('Демонстрационные данные восстановлены');
};
cloudUI.setup();
render();
scrollCalendarToWeek(el('calendar'),weekBounds(localToday())?.start);
