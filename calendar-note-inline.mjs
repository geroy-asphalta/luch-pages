// Spreadsheet-like editor inside the calendar's note cell, never the patient card.
// The patient note is shared across courses; course-specific notes remain read-only here.
import {updatePersonNotesDraft} from './patient-model.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const editableRow=(calendar,personId)=>[...calendar.querySelectorAll('tr[data-person-id]')]
 .find(row=>row.dataset.personId===personId)?.querySelector('td.calendar-notes')||null;

export function setupCalendarInlineNotes({
 calendar,getState,commitState,renderApp,notice,
 confirmDiscard=()=>window.confirm('Отменить несохранённое примечание?'),onClosed=()=>{}
}){
 let active=null;
 const isEditing=()=>Boolean(active);
 function beforeRender(){
  if(active?.cell){
   active.text=active.cell.querySelector('textarea[name="patientNotes"]')?.value??active.text;
   active.focused=active.cell.contains(document.activeElement);
   active.selectionStart=active.cell.querySelector('textarea[name="patientNotes"]')?.selectionStart??0;
  }
 }
 function draw(){
  if(!active)return;
  const td=editableRow(calendar,active.personId);
  if(!td){
   active=null;
   notice('Строка пациента скрыта. Несохранённое примечание закрыто.');
   return;
  }
  active.cell=td;
  active.originalMarkup=td.innerHTML;
  const currentWidth=Number.parseInt(calendar.style.getPropertyValue('--notes-column-width'),10)||105;
  calendar.style.setProperty('--notes-column-width',Math.max(currentWidth,255)+'px');
  const courseId=td.closest('tr[data-course-id]')?.dataset.courseId;
  const course=(getState().patients||[]).find(c=>c.id===courseId);
  const courseNote=String(course?.notes||'').trim();
  td.classList.add('calendar-note-editing');
  td.innerHTML='<form class="calendar-note-inline-form" data-calendar-note-form>'+
   '<label class="calendar-note-edit-label">Примечание пациента'+
   '<textarea name="patientNotes" rows="3" maxlength="500" spellcheck="true" placeholder="Добавить примечание…">'+esc(active.text)+'</textarea></label>'+
   (courseNote?'<small class="calendar-note-course-hint" title="'+esc(courseNote)+'">К курсу (только просмотр): '+esc(courseNote)+'</small>':'')+
   '<div class="calendar-note-form-actions">'+
   '<button type="submit" class="calendar-note-save">Сохранить</button>'+
   '<button type="button" data-calendar-note-cancel>Отмена</button></div>'+
   '<small class="calendar-note-shortcut">⌘/Ctrl + Enter — сохранить · Esc — отменить</small></form>';
  const input=td.querySelector('textarea[name="patientNotes"]');
  if(active.focused!==false){
   input?.focus({preventScroll:true});
   try{input?.setSelectionRange(active.selectionStart,active.selectionStart)}catch{}
  }
 }
 function open(button){
  const td=button.closest('td.calendar-notes');
  const personId=td?.closest('tr[data-person-id]')?.dataset.personId;
  const person=(getState().people||[]).find(item=>item.id===personId);
  if(!td||!person)return;
  if(active){
   beforeRender();
   if(active.personId===personId)return;
   if(active.text!==active.expectedNotes&&!confirmDiscard())return;
   active.cell?.classList.remove('calendar-note-editing');
   if(active.cell)active.cell.innerHTML=active.originalMarkup;
  }
  active={personId,text:String(person.notes??''),expectedNotes:String(person.notes??''),
   focused:true,selectionStart:String(person.notes??'').length,cell:null};
  draw();
 }
 function cancel(){
  if(!active)return;
  active=null;
  renderApp();
  queueMicrotask(onClosed);
 }
 function save(){
  if(!active)return;
  beforeRender();
  const outcome=updatePersonNotesDraft(getState(),active.personId,active.text,{
   expectedNotes:active.expectedNotes
  });
  if(outcome.error){notice(outcome.error);return;}
  active=null;
  if(outcome.changed)commitState(outcome.state);
  renderApp();
  queueMicrotask(onClosed);
  notice(outcome.changed?'Примечание сохранено':'Примечание без изменений');
 }
 calendar.addEventListener('click',event=>{
  const openButton=event.target.closest('[data-calendar-note-open]');
  if(openButton&&calendar.contains(openButton)){event.preventDefault();open(openButton);return;}
  const cancelButton=event.target.closest('[data-calendar-note-cancel]');
  if(cancelButton&&calendar.contains(cancelButton)){event.preventDefault();cancel();}
 });
 calendar.addEventListener('submit',event=>{
  if(!event.target.matches('[data-calendar-note-form]'))return;
  event.preventDefault();save();
 });
 calendar.addEventListener('keydown',event=>{
  if(!active||!event.target.closest('[data-calendar-note-form]'))return;
  if(event.key==='Escape'){
   event.preventDefault();event.stopPropagation();cancel();
  }else if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){
   event.preventDefault();save();
  }
 });
 return {beforeRender,afterRender:draw,isEditing,abort:()=>{active=null;}};
}
