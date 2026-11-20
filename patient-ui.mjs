// Patient cards and course editing for synthetic local-only demo data.
import {MACHINES,pretty,schedule,addDays} from './planner.mjs';
import {ICD_C_GROUPS,ICD_C_FAVORITES,ICD_C_LOOKUP,ICD_C_GROUP_LOOKUP} from './clinical-dictionaries.mjs';
import {schemesForDiagnosis,ctvSuggestion,ctvGroupFor,ctvConflict,schemeByName} from './ctv-logic.mjs';
import {fieldText,zoneSummary,asDoseText,courseIsBreast} from './dose-zones.mjs';
import {registerRows,registerStats} from './patient-register.mjs?v=3';
import {currentCtvName} from './ctv-display.mjs';
import {notesColumnWidth} from './notes-column-width.mjs';
import {courseProgress,localToday} from './course-progress.mjs';
import {courseCardProgress} from './course-card-progress.mjs';
import {isBreastDiagnosis,firstRadiationFraction,weeklyChemoDates,chemoEventsFor,chemoWarningsFor,bloodDateBeforeChemo} from './chemo-schedule.mjs';
import {chemoAdministrationState,chemoAdministrationSummary} from './chemo-administration.mjs';
import {COURSE_STATUSES,TREATMENT_TYPES,coursesFor,createPersonDraft,updatePersonDraft,setPersonArchivedDraft,createCourseDraft,updateCourseDraft,setCourseArchivedDraft,previewCourse,formatPhoneRU,phoneDigitsRU,ELN_VALUES} from './patient-model.mjs';
import {setupEarlyDischargeUI} from './patient-early-ui.mjs';
import {EARLY_DISCHARGE_REASONS} from './patient-early-discharge.mjs';

const el=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const datestr=d=>d?pretty(d):'—';
const opts=(entries,selected)=>entries.map(([value,label])=>'<option value="'+esc(value)+'" '+(value===selected?'selected':'')+'>'+esc(label)+'</option>').join('');
const stat=p=>COURSE_STATUSES[p.status]||p.status;
const dateMax='2026-11-10'; // A clearly synthetic initial value; the operator may replace it.
const elnClass=v=>v==='Да'?'eln-yes':v==='Нет'?'eln-no':'';
const elnBadge=v=>ELN_VALUES.includes(v)?'<span class="eln-badge '+elnClass(v)+'">'+esc(v)+'</span>':esc(v||'—');
function phoneCaret(formatted,digitsBefore){
 if(!digitsBefore)return formatted.startsWith('+7 (')?4:0;
 if(digitsBefore>=phoneDigitsRU(formatted).length)return formatted.length;
 let count=0;
 for(let i=4;i<formatted.length;i++){
   if(/\d/.test(formatted[i]))count++;
   if(count===digitsBefore)return i+1;
 }
 return formatted.length;
}
function wirePatientFields(form){
 const phone=form.elements.phone,eln=form.elements.eln;
 eln.addEventListener('change',()=>{eln.classList.remove('eln-yes','eln-no');const cls=elnClass(eln.value);if(cls)eln.classList.add(cls)});
 let previous=phone.value;
 phone.addEventListener('input',event=>{
   const raw=phone.value,caret=phone.selectionStart??raw.length;
   let digits=phoneDigitsRU(raw),before=phoneDigitsRU(raw.slice(0,caret)).length;
   // Backspace over a formatting separator should remove a digit rather than get stuck.
   if(event.inputType?.startsWith('delete')&&digits===phoneDigitsRU(previous)&&raw!==previous&&digits.length){
     const at=Math.max(0,Math.min(digits.length-1,event.inputType==='deleteContentForward'?before:before-1));
     digits=digits.slice(0,at)+digits.slice(at+1);
     before=at;
   }
   const formatted=formatPhoneRU(digits);
   phone.value=formatted;
   const pos=phoneCaret(formatted,Math.min(before,phoneDigitsRU(formatted).length));
   try{phone.setSelectionRange(pos,pos)}catch{}
   previous=formatted;
 });
 phone.addEventListener('blur',()=>{phone.value=formatPhoneRU(phone.value);previous=phone.value});
}



const icdGroup=code=>String(code||'').slice(0,3).toUpperCase();
const favoriteOrder=new Map(ICD_C_FAVORITES.map((c,i)=>[c,i]));
const favoriteGroups=[...ICD_C_GROUPS].sort((a,b)=>(favoriteOrder.get(a.code)??99)-(favoriteOrder.get(b.code)??99)||a.code.localeCompare(b.code));
const normalizedCode=query=>{
 const term=String(query||'').trim().toUpperCase().replace(/\s/g,'').replace(/^С/,'C');
 return /^\d{2}(?:\.[0-9A-Z]+)?$/.test(term)?'C'+term:term;
};
function diagnosisPicker(value){
 return '<div class="icd-field wide">'+
  '<label for="diagnosis-search">Диагноз (МКБ-10, категория C)</label>'+
  '<input id="diagnosis-search" type="search" autocomplete="off" placeholder="Поиск: 61, 67.2, C50 или название">'+
  '<div class="icd-picker"><div id="diagnosis-list" class="icd-list" role="group" aria-label="Основные категории МКБ-10"></div>'+
  '<div id="diagnosis-subpanel" class="icd-subpanel"><p class="muted">Выбери основную категорию, затем уточнение после точки.</p></div></div>'+
  '<input name="diagnosis" type="hidden" value="'+esc(value||'')+'">'+
  '<div id="diagnosis-selected" class="icd-current"></div></div>';
}
function wireDiagnosis(form,onGroupChange=()=>{}){
 const finder=form.querySelector('#diagnosis-search'),list=form.querySelector('#diagnosis-list');
 const panel=form.querySelector('#diagnosis-subpanel'),summary=form.querySelector('#diagnosis-selected');
 const field=form.elements.diagnosis;
 let group=ICD_C_GROUP_LOOKUP.get(icdGroup(field.value))||null;
 const updateSummary=()=>{
   const entry=ICD_C_LOOKUP.get(field.value);
   summary.textContent=entry?'Выбрано: '+entry.code+' — '+entry.name:'Диагноз не выбран';
 };
 const drawSub=()=>{
   if(!group){panel.innerHTML='<p class="muted">Выбери основную категорию, затем уточнение после точки.</p>';return;}
   if(!group.subcodes.length){panel.innerHTML='<div class="icd-sub-title">Уточнений нет</div><p class="muted">Выбран основной код '+esc(group.code)+'.</p>';return;}
   const code=group.subcodes.some(c=>c.code===field.value)?field.value:group.code;
   panel.innerHTML='<label for="diagnosis-sub-select">Уточнение по локализации</label>'+
     '<select id="diagnosis-sub-select">'+
     '<option value="'+esc(group.code)+'" '+(code===group.code?'selected':'')+'>'+esc(group.code)+' — без уточнения</option>'+
     group.subcodes.map(sub=>'<option value="'+esc(sub.code)+'" '+(code===sub.code?'selected':'')+'>'+esc(sub.code)+' · '+esc(sub.name)+'</option>').join('')+
     '</select><small>Подкоды появляются только после выбора основной категории.</small>';
   panel.querySelector('select').onchange=e=>{field.value=e.target.value;updateSummary()};
 };
 const matches=(g,query)=>{
   const q=query.trim().toLocaleLowerCase('ru-RU');
   if(!q)return true;
   const code=normalizedCode(q).toLocaleLowerCase('ru-RU');
   return g.code.toLocaleLowerCase('ru-RU').includes(code)||g.name.toLocaleLowerCase('ru-RU').includes(q)||
    g.subcodes.some(sub=>sub.code.toLocaleLowerCase('ru-RU').includes(code)||sub.name.toLocaleLowerCase('ru-RU').includes(q));
 };
 const drawGroups=()=>{
   const q=finder.value;
   const groups=favoriteGroups.filter(g=>matches(g,q));
   list.innerHTML=(q?'':'<div class="icd-list-head">★ Избранные · C61, C67, C50</div>')+
     (groups.length?groups.map(g=>'<button type="button" class="icd-group '+(group?.code===g.code?'active':'')+'" data-icd-group="'+g.code+'">'+
     '<strong>'+g.code+'</strong><span>'+esc(g.name)+'</span>'+(!q&&favoriteOrder.has(g.code)?'<small>★</small>':'')+'</button>').join(''):
     '<p class="muted">Нет совпадений. Проверь код или название.</p>');
 };
 function setChoice(code){
   const resolved=ICD_C_LOOKUP.get(code);
   if(!resolved)return;
   group=ICD_C_GROUP_LOOKUP.get(icdGroup(code));
   field.value=code;
   drawGroups();drawSub();updateSummary();onGroupChange(group?.code||'');
 }
 list.addEventListener('click',e=>{
   const target=e.target.closest('[data-icd-group]');
   if(target)setChoice(target.dataset.icdGroup);
 });
 finder.addEventListener('input',()=>{
   const exact=normalizedCode(finder.value);
   if(ICD_C_LOOKUP.has(exact))setChoice(exact);
   else drawGroups();
 });
 finder.addEventListener('keydown',e=>{
   if(e.key==='Enter'){
     e.preventDefault();
     const exact=normalizedCode(finder.value);
     if(ICD_C_LOOKUP.has(exact))setChoice(exact);
     else{
       const first=favoriteGroups.find(g=>matches(g,finder.value));
       if(first)setChoice(first.code);
     }
   }
 });
 if(group&&!ICD_C_LOOKUP.has(field.value))field.value=group.code;
 drawGroups();drawSub();updateSummary();onGroupChange(group?.code||'');
}
function wireChemo(form,course,getState){
 const treatment=form.elements.treatmentType;
 const count=form.elements.chemoCount,manualDate=form.elements.chemoFirstDate;
 const block=form.querySelector('#chemo-fields'),manual=form.querySelector('#chemo-manual-date');
 const automatic=form.querySelector('#chemo-auto-note'),reanchor=form.querySelector('#chemo-reanchor-wrap');
 let countAutomaticallySet=false;
 const update=()=>{
   const hlt=treatment.value==='ХЛТ';
   const breast=isBreastDiagnosis(form.elements.diagnosis.value);
   block.classList.toggle('hidden',!hlt);
   manual.classList.toggle('hidden',!hlt||!breast);
   automatic.classList.toggle('hidden',!hlt||breast);
   count.required=hlt;
   manualDate.required=hlt&&breast;
   reanchor.classList.toggle('hidden',!hlt||breast||!course?.chemo?.firstDate);
   if(hlt&&breast&&!count.value&&!countAutomaticallySet){
     // Breast courses may have a single administration; operator can choose more.
     count.value='1';countAutomaticallySet=true;
   }
   if(hlt&&!breast){
     const p={...(course||{}),id:course?.id||'preview-new-hlt',status:form.elements.status.value,diagnosis:form.elements.diagnosis.value,
       machine:form.elements.machine.value,start:form.elements.start.value,total:Number(form.elements.total.value)||1};
     const proposal=firstRadiationFraction(p,getState());
     const existing=course?.chemo?.mode==='first-fraction'&&course?.chemo?.firstDate&&!form.elements.chemoReanchor.checked?course.chemo.firstDate:null;
     automatic.innerHTML=existing?
       '<p>Первое ХТ закреплено на '+esc(datestr(existing))+'. Переносы ЛТ не изменят его автоматически. Для новой привязки отметь поле ниже.</p>':
       proposal?'<p>Первое ХТ: <b>'+esc(datestr(proposal))+'</b> (первая плановая фракция ЛТ). Следующие — через 7 календарных дней.</p>':
       '<p>Пока не указана дата начала ЛТ или нет доступного первого сеанса, расписание ХТ будет ожидать дату.</p>';
   }
 };
 for(const field of [treatment,form.elements.start,form.elements.machine,form.elements.status,form.elements.total])
   field.addEventListener('change',update);
 form.elements.chemoReanchor.addEventListener('change',update);
 count.addEventListener('input',()=>{countAutomaticallySet=Boolean(count.value)});
 return {update};
}
// Keep the previous visible percentages when the patient card is redrawn.
// This animates actual changes without inventing or modifying treatment data.
function previousCourseBarWidths(root){
 const previous=new Map();
 root.querySelectorAll?.('.course-progress-bars[data-course-id]').forEach(group=>{
  previous.set(group.dataset.courseId,[...group.querySelectorAll('.course-progress-track')]
   .map(track=>[...track.children].map(segment=>segment.style.width)));
 });
 return previous;
}
function animateCourseBarUpdates(root,previous){
 if(!previous.size||typeof requestAnimationFrame!=='function'||
    (typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches))return;
 const updates=[];
 root.querySelectorAll('.course-progress-bars[data-course-id]').forEach(group=>{
  const oldTracks=previous.get(group.dataset.courseId);
  if(!oldTracks)return;
  [...group.querySelectorAll('.course-progress-track')].forEach((track,index)=>{
   const old=oldTracks[index];
   if(!old)return;
   [...track.children].forEach((segment,i)=>{
    if(old[i]===undefined||old[i]===segment.style.width)return;
    const target=segment.style.width;
    segment.style.width=old[i];
    updates.push({segment,target});
   });
  });
 });
 if(!updates.length)return;
 // Commit the start values, then let CSS transition to the updated numbers.
 void root.offsetWidth;
 requestAnimationFrame(()=>{
  for(const {segment,target} of updates)if(segment.isConnected)segment.style.width=target;
 });
}
// LT retains separate verified/calendar colours; HT uses one automatic count.
function courseProgressRow(label,metric,{chemo=false}={}){
 const value=metric.counted;
 const caption=chemo?
  'Прошедшие даты учтены автоматически; пропуски исключаются вручную':
  'Подтверждено: '+metric.confirmed+' · по календарю: '+metric.inferred;
 const percent=n=>Number(n).toFixed(2)+'%';
 const bars=chemo?
  '<span class="course-progress-inferred" style="width:'+percent(metric.confirmedPercent+metric.inferredPercent)+'"></span>':
  '<span class="course-progress-confirmed" style="width:'+percent(metric.confirmedPercent)+'"></span>'+
  '<span class="course-progress-inferred" style="width:'+percent(metric.inferredPercent)+'"></span>';
 return '<div class="course-progress-item">'+
   '<div class="course-progress-label"><span>'+esc(label)+'</span><strong>'+value+' / '+metric.total+'</strong></div>'+
   '<div class="course-progress-track" role="progressbar" aria-label="'+esc(label+' (учёт по календарю)')+
   '" aria-valuemin="0" aria-valuemax="'+metric.total+'" aria-valuenow="'+value+'">'+
   bars+'</div>'+
   '<div class="course-progress-caption">'+esc(caption)+'</div></div>';
}
function courseProgressMarkup(state,course){
 const metrics=courseCardProgress(state,course,localToday());
 const early=course.earlyDischarge;
 const info=early?
   '<div class="course-progress-closure">Досрочно завершён '+esc(datestr(early.date))+
   ' · '+esc(EARLY_DISCHARGE_REASONS[early.reason]||'Другая причина')+
   (early.comment?' · '+esc(early.comment):'')+'</div>':
   course.dischargeReview?.decision==='yes'?
     '<div class="course-progress-closure">Выписка подтверждена</div>':
     course.dischargeReview?.decision==='no'?
       '<div class="course-progress-closure">Выписка отложена</div>':'';
 return '<div class="course-progress-bars" data-course-id="'+esc(course.id)+'" aria-label="Прогресс лечения">'+
   courseProgressRow('Сеансы ЛТ',metrics.lt)+
   (metrics.chemo?courseProgressRow('Капельницы ХТ',metrics.chemo,{chemo:true}):'')+
   info+'</div>';
}
function chemoCourseMarkup(state,course){
 if(course.treatmentType!=='ХЛТ')return '';
 const chemo=course.chemo;
 if(!chemo?.count)return '<p class="course-hint">ХЛТ · расписание введений ещё не задано.</p>';
 if(!chemo.firstDate)return '<p class="course-hint">ХЛТ · '+chemo.count+' введений. Ожидается дата начала ЛТ для первого ХТ.</p>';
 const dates=weeklyChemoDates(chemo.firstDate,chemo.count);
 const summary=chemoAdministrationSummary(state,course.id,localToday());
 const list=dates.map((baseDate,i)=>{
   const infusion=(state.events||[]).find(e=>e.patientId===course.id&&e.type==='chemo'&&e.source==='hlt'&&e.chemoIndex===i);
   const date=infusion?.date||baseDate;
   const linked=(state.events||[]).find(e=>e.patientId===course.id&&e.type==='lab'&&e.source==='hlt'&&e.chemoIndex===i);
   const labDate=linked?.date||bloodDateBeforeChemo(date,state);
   const event=(state.events||[]).find(e=>e.patientId===course.id&&e.type==='lab'&&e.date===labDate&&e.status!=='cancelled');
   const label=event?.status==='issued'?'направление выдано':event?.status==='todo'?'нужно оформить': 'не назначено';
   const holidayInfo=infusion?.nominalDate&&infusion.nominalDate!==date?
    ' · по 7-дневной схеме '+datestr(infusion.nominalDate)+' (перенос на рабочий день)':'';
   const status=(infusion?.status==='cancelled'?' · отменено':infusion?.originalDate&&infusion.originalDate!==date?' · перенесено с '+datestr(infusion.originalDate):'')+holidayInfo;
   const outcome=chemoAdministrationState(infusion,localToday());
   const deliveryLabel={
    confirmed:'Учтена выполненной (ранняя ручная отметка)',
    assumed:'Учтена выполненной по прошедшей дате',
    'not-given':'ХТ не проводилась',
    cancelled:'Запланированное введение отменено',
    planned:'Ожидается по плану'
   }[outcome]||'Статус требует проверки';
   return '<div class="hlt-plan-item"><b>Кровь '+datestr(labDate)+' → ХТ '+(i+1)+' · '+datestr(date)+esc(status)+'</b><span>Направление: '+esc(label)+'</span><span class="hlt-administration-status'+(outcome==='not-given'||outcome==='cancelled'?' hlt-admin-missed':'')+'">'+esc(deliveryLabel)+'</span></div>';
 }).join('');
 return '<details class="hlt-plan"><summary>ХЛТ · выполнено '+summary.completed+' / '+summary.total+' введений · первое '+datestr(chemo.firstDate)+'</summary>'+
   '<p class="hlt-administration-summary">Учтено выполненных: '+summary.completed+
   '; не проводилось: '+summary.notGiven+'; отменено по плану: '+summary.cancelled+
   '. Прошедшая дата учитывается автоматически, но не подтверждает клинический факт проведения.</p>'+
   '<div class="hlt-plan-grid">'+list+'</div>'+ 
   (chemoWarningsFor(state,course).length?'<div class="hlt-alert">'+chemoWarningsFor(state,course).map(w=>'<p>'+esc(w)+'</p>').join('')+'</div>':'')+'</details>';
}

function renderCtvOptions(form,group='',state=null){
 const select=form.querySelector('#ctv-quick');
 const matching=schemesForDiagnosis(group,state);
 const label=!group?'Сначала выбери диагноз (МКБ-10)':
   matching.length?'Выбрать CTV для '+group+' ('+matching.length+')':'Для '+group+' пока нет CTV в справочнике';
 select.innerHTML='<option value="">'+esc(label)+'</option>'+
   matching.map(x=>'<option value="'+esc(x.name)+'">'+esc(x.name)+'</option>').join('');
 select.disabled=!matching.length;
 const current=form.elements.ctv.value;
 select.value=matching.some(x=>x.name===current)?current:'';
 return matching;
}
export function wireCtv(form,{existing=false,getState=()=>null}={}){
 const select=form.querySelector('#ctv-quick'),notice=form.querySelector('#ctv-dose-suggestion');
 const ctvField=form.elements.ctv,fracField=form.elements.total,rodField=form.elements.dose,sodField=form.elements.sod;
 const boost=form.elements.boost,boostWrap=form.querySelector('#ctv-boost-wrap');
 let manualTouched=false;
 const norm=x=>String(x??'').replace(/\s/g,'').replace(/\./g,',');
 function updateBoostVisibility(){
   const available=courseIsBreast(form.elements.diagnosis.value);
   boostWrap.classList.toggle('hidden',!available);
   if(!available)boost.checked=false;
 }
 for(const field of [fracField,rodField,sodField])field.addEventListener('input',()=>{manualTouched=true;showSuggestion(false)});
 function apply(suggestion){
   fracField.value=suggestion.fractions==null?'':String(suggestion.fractions);
   rodField.value=suggestion.rodText;
   sodField.value=suggestion.sodText;
   showSuggestion(false);
 }
 function showSuggestion(tryAuto=false){
   const diagnosis=form.elements.diagnosis.value,ctv=ctvField.value.trim();
   const existingScheme=schemeByName(ctv,getState());
   if(ctvConflict(diagnosis,ctv,getState())){
     notice.innerHTML='<p class="ctv-caution">Этот CTV относится к '+esc(existingScheme.group)+', а выбран '+esc(ctvGroupFor(diagnosis))+'. Выбери подходящий CTV или исправь название.</p>';
     return;
   }
   const suggestion=ctvSuggestion(diagnosis,ctv,{boost:boost.checked,state:getState()});
   if(!suggestion){
     notice.innerHTML=!diagnosis?'<p class="muted">Выбери диагноз МКБ-10 — список CTV зависит от него.</p>':
       '<p class="muted">Для этого CTV нет согласованного шаблона. Значения фракций, РОД и СОД введи вручную.</p>';
     return;
   }
   if(tryAuto&&!existing&&!manualTouched){apply(suggestion);return;}
   const matches=Number(fracField.value)===suggestion.fractions &&
     norm(rodField.value)===norm(suggestion.rodText) && norm(sodField.value)===norm(suggestion.sodText);
   const zoneRows=suggestion.zones.map(z=>
     '<div class="ctv-zone-row"><b>'+esc(z.label)+'</b><span>РОД '+(z.rod==null?'—':asDoseText(z.rod))+' Гр · СОД '+(z.sod==null?'—':asDoseText(z.sod))+' Гр</span></div>').join('');
   notice.innerHTML='<div class="ctv-suggest-details"><b>'+esc(suggestion.name)+(suggestion.boost?' · с интегрированным бустом':'')+'</b>'+
     '<span>'+suggestion.fractions+' фракций · РОД '+esc(suggestion.rodText||'—')+' Гр · СОД '+esc(suggestion.sodText||'—')+' Гр</span>'+
     (suggestion.zones.length>1?'<div class="ctv-zones">'+zoneRows+'</div>':'')+
     '<small>Источник: '+esc(suggestion.source)+'. Параметры взяты из шаблона, проверь их перед сохранением; это не клиническое подтверждение дозы.</small>'+ 
     (suggestion.discrepancies?.length?'<small class="ctv-caution">Внимание: СОД отличается от РОД × фракции: '+esc(suggestion.discrepancies.join('; '))+'</small>':'')+
     (matches?'<span class="ctv-applied">Поля соответствуют шаблону</span>':
       '<small class="ctv-caution">Поля отличаются от шаблона. Чтобы заполнить их заново, выбери CTV в списке.</small>')+
     '</div>';
 }
 boost.addEventListener('change',()=>{
   const suggestion=ctvSuggestion(form.elements.diagnosis.value,ctvField.value,{boost:boost.checked,state:getState()});
   if(suggestion&&!manualTouched)apply(suggestion);
   else showSuggestion(false);
 });
 select.onchange=()=>{
   if(!select.value)return;
   ctvField.value=select.value;
   // Choosing a CTV explicitly fills the editor; changes reach storage only on Save.
   // Existing courses are not modified merely by opening the editor.
   const suggestion=ctvSuggestion(form.elements.diagnosis.value,ctvField.value,{boost:boost.checked,state:getState()});
   if(suggestion){manualTouched=false;apply(suggestion);}
   else showSuggestion(false);
 };
 ctvField.addEventListener('change',()=>{renderCtvOptions(form,ctvGroupFor(form.elements.diagnosis.value),getState());showSuggestion(true)});
 return {onDiagnosis(group){
   updateBoostVisibility();
   renderCtvOptions(form,group,getState());
   showSuggestion(false);
 }};
}

export function createPatientUI({getState,commitState,renderApp,notice,onDischargeRequest=()=>{},onOpenCard=()=>{},getSort=()=> 'order',onSortChange=()=>{},onPersonCreated=()=>{}}){
 let selectedId=null,editor=null,pending=null,search='',statusFilter='all';
 const people=()=>getState().people||[];
 const selected=()=>people().find(p=>p.id===selectedId);
 function closeEditor(){
   editor=null;pending=null;
   el('patient-editor').innerHTML='';el('patient-editor').classList.add('hidden');
   el('patient-preview').innerHTML='';el('patient-preview').classList.add('hidden');
 }
 function selectPerson(id){
   selectedId=id;
   closeEditor();
   render();
   onOpenCard();
 }
 function personRows(){
   const rows=registerRows(getState(),{search,filter:statusFilter,sort:getSort()});
   const info=registerStats(getState(),rows);
   el('patient-register-count').textContent='Показано: '+info.shownRows+' строк · '+info.shownPeople+' пациентов (всего '+info.people+')';
   const th=[
    ['ID','id'],['ФИО','name'],['Курс','course'],['Ds','dx'],['CTV','ctv'],
    ['Установка','machine'],['ЭЛН','eln'],['Телефон','phone'],['Примечания','notes'],
    ['ЛТ / ХЛТ','type'],['Начало ЛТ','start'],['Статус','status'],
    ['Фракций','fractions'],['Учтено по датам','progress'],['РОД, Гр','rod'],['СОД, Гр','sod'],
    ['Первое ХТ','chemo'],['Конец ЛТ (план)','end'],['Действия','actions']
   ];
   const header='<thead><tr>'+th.map(([label,key])=>
    '<th scope="col" class="reg-'+key+'">'+esc(label)+'</th>').join('')+'</tr></thead>';
   const td=(text,klass='',title='')=>'<td class="'+klass+'"'+(title?' title="'+esc(title)+'"':'')+'>'+text+'</td>';
   const blank='<span class="reg-empty">—</span>';
   const val=v=>v?esc(String(v)):blank;
   const day=v=>v?esc(datestr(v)):blank;
   const statusCls=s=>s==='На лечении'?'reg-status-active':s==='Ожидает начала'?'reg-status-planned':s==='В архиве'?'reg-status-archived':s==='Завершён'?'reg-status-done':s==='Досрочно завершён'?'reg-status-early':'reg-status-none';
   const body=rows.map(row=>{
     const pid=esc(row.personId),cid=esc(row.courseId),arch=row.archived;
     const pname='<div class="reg-person-wrap"><button type="button" class="reg-person-open" data-table-action="open" data-person-id="'+pid+'">'+esc(row.name)+'</button>'+ 
      '<button type="button" class="reg-menu-button" data-table-action="menu" data-person-id="'+pid+'" data-course-id="'+cid+'" aria-label="Действия с '+(row.courseId?'курсом':'пациентом')+'" title="Другие действия">⋯</button></div>';
     const diagnosis=row.diagnosis?'<b>'+esc(row.diagnosis)+'</b>':blank;
     const ctv=row.ctv?esc(row.ctv)+(row.boost?'<small class="reg-boost">+ буст</small>':''):blank;
     const actions='<div class="reg-actions"><button type="button" data-table-action="edit-person" data-person-id="'+pid+'" title="Изменить ЭЛН, телефон, ФИО или примечания">Данные</button>'+
      (row.courseId&&!row.earlyCompleted?'<button type="button" data-table-action="edit-course" data-person-id="'+pid+'" data-course-id="'+cid+'" title="Редактировать курс лечения">Курс</button>':
       !row.courseId?'<button type="button" data-table-action="add-course" data-person-id="'+pid+'" '+(arch?'disabled':'')+'>+ Курс</button>':'')+
      '</div>';
     const cells=[
      td(esc(row.id),'reg-id'),
      td(pname,'reg-name'),
      td(val(row.courseName),'reg-course'),
      td(diagnosis,'reg-dx',row.diagnosisName),
      td(ctv,'reg-ctv'),
      td(val(row.machine),'reg-machine'),
      td(elnBadge(row.eln),'reg-eln'),
      td(val(row.phone),'reg-phone'),
      td(val(row.notes),'reg-notes',row.notes),
      td(val(row.treatmentType),'reg-type'),
      td(day(row.start),'reg-start'),
      td('<span class="reg-status '+statusCls(row.status)+'">'+esc(row.status)+'</span>','reg-status-cell'),
      td(row.total==null?blank:String(row.total),'reg-number'),
      td(val(row.progress),'reg-progress'),
      td(val(row.rod),'reg-dose'),
      td(val(row.sod),'reg-dose'),
      td(day(row.chemoDate),'reg-chemo'),
      td(day(row.plannedEnd),'reg-end'),
      td(actions,'reg-actions-cell')
     ];
     return '<tr class="register-row '+(row.personId===selectedId?'reg-selected':'')+
      '" data-person-id="'+pid+'" data-course-id="'+cid+'">'+cells.join('')+'</tr>';
   }).join('');
   el('patient-list').innerHTML=rows.length?
    '<table class="patient-register-table" style="--notes-column-width:'+notesColumnWidth(rows.map(row=>row.notes))+'px"><caption class="sr-only">Список пациентов и курсов лечения</caption>'+
    header+'<tbody>'+body+'</tbody></table>':
    '<p class="reg-no-results">Ничего не найдено. Измени поиск или фильтр.</p>';
 }

 function detail(){
   const p=selected();
   el('patient-detail').classList.toggle('hidden',!p);
   if(!p){el('patient-detail').innerHTML='';return;}
   const cs=coursesFor(getState(),p.id).slice().sort((a,b)=>a.start.localeCompare(b.start));
   const personEditing=editor?.kind==='person-edit'&&editor.personId===p.id;
   // Preserve unsaved inline fields if another part of the app re-renders.
   if(personEditing&&el('patient-detail').querySelector?.('#patient-person-form'))return;
   const patientOverview=
    '<div class="patient-header"><div><h3>'+esc(p.name)+'</h3><p>'+esc(p.id)+' '+(p.archived?'· В архиве':'· Карточка активна')+'</p></div><div class="patient-header-actions">'+
    '<button type="button" data-p-action="edit">Изменить данные</button>'+
    '<button type="button" data-p-action="archive">'+(p.archived?'Восстановить':'В архив')+'</button></div></div>'+
    '<div class="patient-info"><span><b>ЭЛН:</b> '+elnBadge(p.eln)+'</span><span><b>Телефон:</b> '+esc(p.phone||'—')+'</span><span class="full"><b>Примечание:</b> '+esc(p.notes||'—')+'</span></div>';
   const detailRoot=el('patient-detail');
   const previousWidths=previousCourseBarWidths(detailRoot);
   detailRoot.innerHTML=(personEditing?personInlineForm(p):patientOverview)+
    '<div class="patient-courses-title"><h3>Схема лечения</h3><button type="button" data-p-action="add-course" '+(p.archived?'disabled':'')+'>+ Новый курс</button></div>'+
    (cs.length?cs.map(c=>
       '<div class="course-card"><div class="course-heading"><div><b>'+esc(c.courseName)+'</b></div><span class="course-type">'+esc(c.treatmentType||'ЛТ')+'</span><span class="course-status">'+esc(stat(c))+'</span></div>'+
       courseProgressMarkup(getState(),c)+
       '<div class="course-facts"><span><b>Ds:</b> '+esc(c.diagnosis||'—')+'</span><span><b>CTV:</b> '+esc(currentCtvName(getState(),c)||'—')+(c.boost?' · Буст':'')+'</span><span><b>Аппарат:</b> '+esc(c.machine)+'</span><span><b>Начало:</b> '+(c.start?datestr(c.start):'пока неизвестно')+'</span><span><b>Фракций:</b> '+c.total+'</span><span><b>РОД:</b> '+(fieldText(c,'rod')?esc(fieldText(c,'rod'))+' Гр':'не указана')+'</span><span><b>СОД:</b> '+(fieldText(c,'sod')?esc(fieldText(c,'sod'))+' Гр':'не указана')+'</span></div>'+ 
       (zoneSummary(c).length?'<div class="course-zone-details">'+zoneSummary(c).map(z=>'<span>'+esc(z.label)+': '+(z.rod==null?'—':asDoseText(z.rod))+' / '+(z.sod==null?'—':asDoseText(z.sod))+' Гр (РОД / СОД)</span>').join('')+'</div>':'')+
       chemoCourseMarkup(getState(),c)+
       '<div class="course-actions">'+((c.status==='early_completed'||c.status==='archived'&&c.previousStatus==='early_completed')?'':'<button type="button" data-c-action="edit" data-course-id="'+esc(c.id)+'">Редактировать</button>')+
       (['active','planned'].includes(c.status)&&courseProgress(getState(),c,localToday()).finalDate&&courseProgress(getState(),c,localToday()).finalDate<=localToday()?
       '<button type="button" class="course-discharge" data-c-action="discharge" data-course-id="'+esc(c.id)+'">Решить вопрос о выписке</button>':'')+
       '<button type="button" data-c-action="archive" data-course-id="'+esc(c.id)+'">'+(c.status==='archived'?'Восстановить курс':'Архивировать курс')+'</button></div></div>'
      ).join(''):'<div class="patient-empty">У этого пациента пока нет курсов. Нажми «Новый курс», чтобы добавить первый.</div>');
   animateCourseBarUpdates(detailRoot,previousWidths);
 }
 function render(){
   el('patient-sort').value=getSort();
   if(selectedId&&!people().some(p=>p.id===selectedId))selectedId=null;
   personRows();detail();
 }
 function personForm(p){
   const eln=p?.eln||'';
   return '<h3>'+(p?'Редактирование пациента':'Новый пациент')+'</h3><form id="patient-person-form" class="patient-form">'+
    '<label>ФИО <input name="name" value="'+esc(p?.name||'')+'" required maxlength="100"></label>'+
    '<label>ЭЛН <select name="eln" class="eln-select '+elnClass(eln)+'">'+opts([['','Не выбрано'],['Да','Да'],['Нет','Нет']],eln)+'</select></label>'+
    '<label>Телефон <input name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="+7 (999) 123-45-67" value="'+esc(formatPhoneRU(p?.phone||''))+'" maxlength="18"></label>'+
    '<label class="wide">Примечания <textarea name="notes" maxlength="500" rows="3">'+esc(p?.notes||'')+'</textarea></label>'+
    '<div class="patient-form-actions"><button type="submit" class="primary">Сохранить</button><button type="button" id="patient-edit-cancel">Отмена</button></div>'+
    '</form>';
 }
 function personInlineForm(p){
   const eln=p?.eln||'';
   // Edit the existing summary area, never create a second form below courses.
   return '<form id="patient-person-form" class="patient-detail-inline-form" aria-label="Редактирование данных пациента">'+
    '<div class="patient-header"><div class="patient-inline-name">'+
    '<label>ФИО <input name="name" value="'+esc(p.name)+'" required maxlength="100"></label>'+
    '<p>'+esc(p.id)+' '+(p.archived?'· В архиве':'· Карточка активна')+'</p></div>'+
    '<div class="patient-header-actions"><button type="submit" class="primary">Сохранить</button>'+
    '<button type="button" id="patient-edit-cancel">Отмена</button></div></div>'+
    '<div class="patient-info patient-info-editing">'+
    '<label>ЭЛН<select name="eln" class="eln-select '+elnClass(eln)+'">'+opts([['','Не выбрано'],['Да','Да'],['Нет','Нет']],eln)+'</select></label>'+
    '<label>Телефон<input name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="+7 (999) 123-45-67" value="'+esc(formatPhoneRU(p.phone||''))+'" maxlength="18"></label>'+
    '<label class="full">Примечание<textarea name="notes" maxlength="500" rows="2">'+esc(p.notes||'')+'</textarea></label>'+
    '</div></form>';
 }
 function courseForm(c,person){
   const d=c||{courseName:'Курс '+(coursesFor(getState(),person.id).length+1),diagnosis:'',ctv:'',machine:'Halcyon-kV',start:'',total:20,dose:null,sod:null,displayDose:false,treatmentType:'ЛТ',status:'planned',notes:''};
   const dose=fieldText(d,'rod');
   const sod=fieldText(d,'sod');
   const currentName=c?currentCtvName(getState(),c):'';
   const renamedNote=c&&currentName!==d.ctv?
    '<small class="muted wide">В справочнике это CTV теперь называется «'+esc(currentName)+'». В курсе хранится прежнее название; его изменение требует отдельного подтверждения, а дозы не меняются автоматически.</small>':'';
   return '<h3>'+(c?'Редактирование курса':'Новый курс')+' · '+esc(person.name)+'</h3><form id="patient-course-form" class="patient-form">'+
    '<label>Название курса / этапа <input name="courseName" value="'+esc(d.courseName)+'" maxlength="80" required></label>'+
    '<label>Тип лечения <select name="treatmentType">'+opts(TREATMENT_TYPES.map(x=>[x,x]),d.treatmentType)+'</select></label>'+
    diagnosisPicker(d.diagnosis)+
    '<label class="wide">CTV / область лечения <select id="ctv-quick" aria-label="Выбрать CTV из справочника"></select>'+
    '<input name="ctv" value="'+esc(d.ctv||'')+'" maxlength="100" placeholder="Можно выбрать выше или вписать вручную"></label>'+renamedNote+ 
    '<label id="ctv-boost-wrap" class="patient-tt wide hidden"><input name="boost" type="checkbox" '+(d.boost?'checked':'')+'> Буст (интегрированное облучение, C50, 15 фракций)</label>'+ 
    '<div id="ctv-dose-suggestion" class="ctv-dose-suggestion wide" aria-live="polite"></div>'+
    '<label>Аппарат <select name="machine" required>'+(d.machine?'':'<option value="" selected disabled>Выбери аппарат</option>')+opts(MACHINES.map(x=>[x,x]),d.machine)+'</select></label>'+
    '<label>Начало ЛТ (можно оставить пустым) <input name="start" type="date" value="'+esc(d.start||'')+'"></label>'+
    '<label>Количество фракций <input name="total" type="number" min="1" max="100" value="'+esc(d.total)+'" required></label>'+
    '<label>РОД, Гр <input name="dose" type="text" inputmode="decimal" maxlength="36" value="'+esc(dose)+'" placeholder="2,67 / 3,2"></label>'+
    '<label>СОД, Гр <input name="sod" type="text" inputmode="decimal" maxlength="36" value="'+esc(sod)+'" placeholder="40,05 / 48"></label>'+
    '<label class="patient-tt"><input name="displayDose" type="checkbox" '+(d.displayDose?'checked':'')+'> Показывать накопленную дозу вместо номера фракции</label>'+
    '<label>Статус <select name="status">'+opts(Object.entries(COURSE_STATUSES).filter(([key])=>key!=='early_completed'),d.status)+'</select></label>'+
    '<div id="chemo-fields" class="hlt-fields wide hidden"><h4>План введений ХТ</h4>'+
    '<label>Количество введений ХТ <input name="chemoCount" type="number" min="1" max="52" value="'+esc(d.chemo?.count||'')+'" placeholder="Укажи количество"></label>'+
    '<label id="chemo-manual-date" class="hidden">Дата первого введения ХТ (C50) <input name="chemoFirstDate" type="date" value="'+esc(d.chemo?.mode==='manual'?d.chemo.firstDate||'':'')+'"></label>'+
    '<div id="chemo-auto-note" class="hlt-auto-note hidden"></div>'+
    '<label id="chemo-reanchor-wrap" class="hlt-reanchor hidden"><input name="chemoReanchor" type="checkbox"> Пересчитать дату первого ХТ по первому сеансу ЛТ</label>'+
    '<p class="muted wide">Все последующие введения — с интервалом в 7 дней от первого. Направление на кровь создаётся автоматически за один календарный день до каждой ХТ. Число введений задаёшь ты.</p>'+
    '</div>'+
    '<label class="wide">Примечания к курсу <textarea name="notes" maxlength="500" rows="3">'+esc(d.notes||'')+'</textarea></label>'+
    '<div class="patient-hlt-note wide">Даты ХТ — административный план, а не подтверждение проведения или медицинское назначение. Перед сохранением проверь их и направления на анализы.</div>'+
    '<div class="patient-form-actions wide"><button type="submit" class="primary">Сохранить</button><button type="button" id="patient-edit-cancel">Закрыть</button></div>'+
    '</form>';
 }
 function edit(kind,courseId=null){
   const creating=kind==='person-create',s=getState(),p=creating?null:selected();
   if(!creating&&!p){notice('Сначала выбери пациента.');return;}
   const wasPersonEditing=editor?.kind==='person-edit';
   closeEditor();
   if(wasPersonEditing)detail();
   // Creating a new patient is independent of the currently selected card.
   // Hide that card and clear the row selection before showing the blank form.
   if(creating){selectedId=null;personRows();detail();}
   editor={kind,personId:creating?null:p.id,courseId:creating?null:courseId};
   const course=!creating&&courseId?s.patients.find(x=>x.id===courseId):null;
   if(kind==='person-edit'){
     detail();
     const form=el('patient-person-form');
     wirePatientFields(form);
     form.onsubmit=submitPerson;
     el('patient-edit-cancel').onclick=()=>{closeEditor();detail();};
     form.elements.name?.focus?.();
     el('patient-detail').scrollIntoView?.({block:'nearest',behavior:'smooth'});
     return;
   }
   const html=creating?personForm(null):courseForm(course,p);
   el('patient-editor').innerHTML=html;
   el('patient-editor').classList.remove('hidden');
   el('patient-edit-cancel').onclick=closeEditor;
   if(kind.startsWith('person')){const form=el('patient-person-form');wirePatientFields(form);form.onsubmit=submitPerson;form.elements.name?.focus?.();}
   else {
     const form=el('patient-course-form');
     const ctvControl=wireCtv(form,{existing:Boolean(course),getState});
     const chemoControl=wireChemo(form,course,getState);
     wireDiagnosis(form,group=>{ctvControl.onDiagnosis(group);chemoControl.update();});
     chemoControl.update();
     form.onsubmit=submitCourse;
   }
   el('patient-editor').scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 function showPreview(result,description,details='',afterCommitId=null,isNewPerson=false){
   if(result.error){notice(result.error);return;}
   pending={state:result.state,personId:afterCommitId||selectedId,isNewPerson};
   el('patient-preview').innerHTML='<h3>Предварительный просмотр</h3><p>'+description+'</p>'+details+
    '<p class="safety-note">Изменения касаются только демонстрационного расписания. Это не подтверждение лечебного плана, дозы или фактического проведения процедуры.</p>'+
    '<div class="preview-actions"><button type="button" id="patient-confirm" class="primary">Подтвердить</button><button type="button" id="patient-cancel">Отмена</button></div>';
   el('patient-preview').classList.remove('hidden');
   el('patient-confirm').onclick=()=>{
     if(!pending)return;
     const next=pending.state,personId=pending.personId,isNewPerson=pending.isNewPerson;
     closeEditor();
     selectedId=personId;
     commitState(next);
     if(isNewPerson){
       // A saved new patient is always visible in the first position.
       search='';statusFilter='all';
       el('patient-search').value='';
       el('patient-status-filter').value='all';
       onPersonCreated();
     }
     renderApp();
     if(isNewPerson){
       const listScroller=el('patient-list').closest?.('.scroll');
       if(listScroller)listScroller.scrollTop=0;
     }
     notice('Изменения карточки сохранены');
   };
   el('patient-cancel').onclick=()=>{pending=null;el('patient-preview').classList.add('hidden');};
   el('patient-preview').scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 function submitPerson(event){
   event.preventDefault();
   if(!editor||!['person-create','person-edit'].includes(editor.kind))return;
   const data=Object.fromEntries(new FormData(event.currentTarget));
   const isNew=editor.kind==='person-create';
   const s=getState();
   const result=isNew?createPersonDraft(s,data):updatePersonDraft(s,editor.personId,data);
   if(result.error){notice(result.error);return;}
   const personId=result.entry.id;
   closeEditor();
   selectedId=personId;
   commitState(result.state);
   if(isNew){
     search='';statusFilter='all';
     el('patient-search').value='';
     el('patient-status-filter').value='all';
     onPersonCreated();
   }
   renderApp();
   if(isNew){
     const listScroller=el('patient-list').closest?.('.scroll');
     if(listScroller)listScroller.scrollTop=0;
   }
   notice(isNew?'Пациент добавлен':'Данные пациента сохранены');
 }
 function submitCourse(event){
   event.preventDefault();
   if(!editor||!['course-create','course-edit'].includes(editor.kind))return;
   const form=event.currentTarget,data=Object.fromEntries(new FormData(form));
   data.displayDose=form.elements.displayDose.checked;
   data.boost=form.elements.boost.checked;
   data.chemoReanchor=form.elements.chemoReanchor.checked;
   const state=getState();
   const result=editor.kind==='course-create'?
     createCourseDraft(state,editor.personId,data):updateCourseDraft(state,editor.courseId,data);
   if(result.error){notice(result.error);return;}
   // Keep the existing administrative overlap warnings, without requiring a
   // second confirmation. Explicit Save is the only action that commits data.
   const before=state.patients.find(c=>c.id===result.entry.id);
   const plannedDays=c=>c.start?[...schedule(c,result.state,addDays(c.start,200))]
     .filter(([,value])=>value.kind==='session').map(([date])=>date):[];
   const newDates=new Set(plannedDays(result.entry));
   const overlaps=result.state.patients
     .filter(c=>c.personId===result.entry.personId&&c.id!==result.entry.id&&['active','planned'].includes(c.status))
     .filter(c=>plannedDays(c).some(date=>newDates.has(date)))
     .map(c=>c.courseName);
   const warnings=[];
   if(overlaps.length)warnings.push('Проверь совпадающие даты с курсами: '+overlaps.join(', '));
   if(before&&before.machine!==result.entry.machine)warnings.push('При смене аппарата проверь расписание переводов');
   if(result.chemoWarnings?.length)warnings.push('Проверь план ХТ и анализов: '+result.chemoWarnings.join('; '));
   const personId=editor.personId;
   closeEditor();
   selectedId=personId;
   commitState(result.state);
   renderApp();
   notice('Курс сохранён'+(warnings.length?'. '+warnings.join('. '):''));
 }
 function archivePerson(){
   const p=selected();if(!p)return;
   const result=setPersonArchivedDraft(getState(),p.id,!p.archived);
   showPreview(result,p.archived?'Восстановить карточку и снова показывать её курсы в календаре?':'Архивировать карточку? Все её курсы будут скрыты из активного календаря без удаления данных.','',p.id);
 }
 function archiveCourse(courseId){
   const c=getState().patients.find(x=>x.id===courseId);
   if(!c)return;
   const result=setCourseArchivedDraft(getState(),courseId,c.status!=='archived');
   const prev=previewCourse(getState(),result.state,courseId);
   showPreview(result,c.status==='archived'?'Восстановить курс в его прежнем статусе?':'Архивировать курс? История событий останется сохранена.',
    '<p>В календаре до изменения: '+prev.old.length+' плановых дат; после: '+prev.next.length+'.</p>',selectedId);
 }
 let earlyUI=null;
 function setup(){
   earlyUI=setupEarlyDischargeUI({getState,commitState,renderApp,notice,selectPerson,
     editCourse:courseId=>edit('course-edit',courseId),addCourse:()=>edit('course-create')});
   el('patient-new').onclick=()=>edit('person-create');
   el('patient-search').oninput=e=>{search=e.target.value;personRows();};
   el('patient-status-filter').onchange=e=>{statusFilter=e.target.value;personRows();};
   el('patient-sort').onchange=e=>{onSortChange(e.target.value);};
   el('patient-list').onclick=e=>{
     const button=e.target.closest('[data-table-action]');
     const row=e.target.closest('tr[data-person-id]');
     const personId=button?.dataset.personId||row?.dataset.personId;
     if(!personId)return;
     const action=button?.dataset.tableAction||'open';
     if(action==='menu'){
       const rect=button.getBoundingClientRect();
       earlyUI?.openMenu({personId,courseId:button.dataset.courseId,x:rect.right,y:rect.bottom});
       return;
     }
     selectPerson(personId);
     if(action==='edit-person')edit('person-edit');
     else if(action==='edit-course')edit('course-edit',button.dataset.courseId);
     else if(action==='add-course')edit('course-create');
     else el('patient-detail').scrollIntoView({block:'start',behavior:'smooth'});
   };
   el('patient-detail').onclick=e=>{
     const btn=e.target.closest('[data-p-action],[data-c-action]');
     if(!btn)return;
     if(btn.dataset.pAction==='edit')edit('person-edit');
     if(btn.dataset.pAction==='archive')archivePerson();
     if(btn.dataset.pAction==='add-course')edit('course-create');
     if(btn.dataset.cAction==='edit')edit('course-edit',btn.dataset.courseId);
     if(btn.dataset.cAction==='discharge')onDischargeRequest(btn.dataset.courseId);
     if(btn.dataset.cAction==='archive')archiveCourse(btn.dataset.courseId);
   };
   render();
 }
 function createNew(){
   onOpenCard();
   edit('person-create');
 }
 function reset(){earlyUI?.close();selectedId=null;search='';statusFilter='all';el('patient-search').value='';el('patient-status-filter').value='all';el('patient-sort').value='order';closeEditor();}
 return {setup,render,selectPerson,createNew,openContextMenu:(request)=>earlyUI?.openMenu(request),reset};
}
