// Context menu and one-step administrative early-discharge form.
// Works alongside row dragging; no drop target or destructive delete action.
import {earlyDischargeCourseDraft} from './patient-early-discharge.mjs';
import {localToday} from './course-progress.mjs';

export function setupEarlyDischargeUI({
  getState,commitState,renderApp,notice,selectPerson,editCourse,addCourse
}){
  const list=document.getElementById('patient-list');
  const menu=document.getElementById('patient-context-menu');
  const dialog=document.getElementById('patient-early-dialog');
  // Old non-browser test doubles do not contain the newly added controls.
  if(!list?.addEventListener||!menu?.addEventListener||!dialog?.querySelector)
    return {openMenu(){},close(){}};
  const form=dialog.querySelector('form');
  const info=document.getElementById('patient-early-info');
  let menuTarget=null,courseId=null;

  function closeMenu(){
    menu.classList.add('hidden');
    menuTarget=null;
  }
  function closeDialog(){
    if(dialog.open&&typeof dialog.close==='function')dialog.close();
    else dialog.removeAttribute('open');
    courseId=null;
  }
  function openMenu({personId,courseId:requestedCourseId='',x,y}){
    const s=getState(),person=s.people?.find(p=>p.id===personId);
    const course=s.patients?.find(c=>c.id===requestedCourseId&&c.personId===personId);
    if(!person){closeMenu();return;}
    menuTarget={personId,courseId:course?.id||''};
    const active=course&&['active','planned'].includes(course.status)&&!person.archived;
    menu.innerHTML='<button type="button" role="menuitem" data-early-action="open">Открыть карточку</button>'+
      (course&&course.status!=='early_completed'?'<button type="button" role="menuitem" data-early-action="edit">Редактировать курс</button>':'')+
      (!course&&!person.archived?'<button type="button" role="menuitem" data-early-action="add-course">Добавить курс</button>':'')+
      (active?'<div class="patient-context-divider"></div><button type="button" role="menuitem" class="patient-context-danger" data-early-action="discharge">Выписать досрочно…</button>':'');
    menu.classList.remove('hidden');
    const left=Math.max(8,Math.min(x,window.innerWidth-menu.offsetWidth-8));
    const top=Math.max(8,Math.min(y,window.innerHeight-menu.offsetHeight-8));
    menu.style.left=left+'px';menu.style.top=top+'px';
    menu.querySelector('button')?.focus({preventScroll:true});
  }

  function openDischarge(targetId){
    const s=getState(),course=s.patients?.find(c=>c.id===targetId);
    if(!course||!['active','planned'].includes(course.status)){
      notice('Досрочная выписка доступна только для незавершённого курса.');return;
    }
    if(!course.start){
      notice('Сначала укажи дату начала курса.');return;
    }
    if(course.start>localToday()){
      notice('Курс ещё не начался. Для отмены запланированного курса используй архивирование.');return;
    }
    const person=s.people?.find(p=>p.id===course.personId);
    if(person?.archived){notice('Карточка пациента находится в архиве.');return;}
    courseId=targetId;
    const today=localToday();
    form.reset();
    form.elements.date.value=today<course.start?course.start:today;
    form.elements.date.min=course.start;
    form.elements.date.max=today;
    info.innerHTML='<p><b>'+escapeText(person?.name||course.name)+'</b> · '+escapeText(course.courseName||'Курс')+'</p>'+
      '<p>Запланировано фракций: <b>'+Number(course.total||0)+'</b>. После выписки будущие сеансы этого курса будут скрыты.</p>'+
      (course.treatmentType==='ХЛТ'?'<p class="safety-note">У курса есть план ХТ/анализов. Связанные записи сохранятся для отдельной проверки.</p>':'');
    if(typeof dialog.showModal==='function')dialog.showModal();
    else dialog.setAttribute('open','');
    form.elements.date.focus();
  }

  function escapeText(value){
    return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  list.addEventListener('contextmenu',event=>{
    const row=event.target.closest('tr[data-person-id]');
    if(!row||!list.contains(row))return;
    event.preventDefault();
    openMenu({personId:row.dataset.personId,courseId:row.dataset.courseId,
      x:event.clientX,y:event.clientY});
  });
  menu.addEventListener('click',event=>{
    const button=event.target.closest('[data-early-action]');
    if(!button||!menuTarget)return;
    const target=menuTarget,action=button.dataset.earlyAction;
    closeMenu();
    if(action==='discharge')openDischarge(target.courseId);
    else{
      selectPerson(target.personId);
      if(action==='edit')editCourse(target.courseId);
      if(action==='add-course')addCourse();
    }
  });
  document.addEventListener('pointerdown',event=>{
    if(!menu.classList.contains('hidden')&&!menu.contains(event.target))
      closeMenu();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')closeMenu();
  });
  window.addEventListener('resize',closeMenu);
  list.addEventListener('scroll',closeMenu,{passive:true});
  dialog.addEventListener('close',()=>{courseId=null;});
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(!courseId)return;
    const data=Object.fromEntries(new FormData(form));
    const result=earlyDischargeCourseDraft(getState(),courseId,data);
    if(result.error){notice(result.error);return;}
    const personId=result.entry.personId;
    closeDialog();
    commitState(result.state);
    selectPerson(personId);
    renderApp();
    notice('Курс досрочно завершён; предыдущие записи сохранены');
  });
  dialog.querySelector('[data-early-cancel]').addEventListener('click',closeDialog);
  dialog.querySelector('[data-early-close]').addEventListener('click',closeDialog);
  return {openMenu,close(){closeMenu();closeDialog();}};
}
