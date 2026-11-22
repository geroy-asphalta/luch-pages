import {LOCAL_BACKUP_PREFIX,META_PREFIX} from './firebase-demo-state-core.mjs';
import {collectMissingCourseStartCandidates,restoreMissingCourseStartsDraft} from './course-start-recovery.mjs';

const $=id=>document.getElementById(id);
const escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText=date=>new Date(date+'T12:00:00').toLocaleDateString('ru-RU');
const validState=value=>value&&typeof value==='object'&&Array.isArray(value.people)&&
 Array.isArray(value.patients)&&Array.isArray(value.audit);
const unpack=value=>{
 const parsed=typeof value==='string'?JSON.parse(value):value;
 if(validState(parsed))return parsed;
 if(typeof parsed?.payload==='string'){
  const state=JSON.parse(parsed.payload);
  if(validState(state))return state;
 }
 return null;
};
export function readCourseStartLocalSnapshots(storage){
 const snapshots=[];
 try{
  for(let index=0;index<storage.length;index++){
   const key=storage.key(index);
   if(!key||(!key.startsWith(LOCAL_BACKUP_PREFIX)&&!key.startsWith(META_PREFIX)&&
    !key.startsWith('luch-demo-course-recovery-backup-')))continue;
   try{
    const value=storage.getItem(key);
    if(!value||value.length>1500000)continue;
    const state=unpack(value);
    if(state)snapshots.push({label:key.startsWith(LOCAL_BACKUP_PREFIX)?
     'Локальная резервная копия':'Подтверждённая облачная версия',state});
   }catch{} // A damaged historic backup never blocks other copies.
  }
 }catch{}
 return snapshots;
}
export function setupCourseStartRecovery({getState,commitState,renderApp,notice,storage=localStorage}){
 const host=$('cloud-recovery-preview'),toggle=$('cloud-recover-dates'),
  picker=$('cloud-recovery-file');
 if(!host||!toggle||!picker)return {hasDraft:()=>false};
 let extra=null,offers=[],active=false;
 const sources=()=>[...readCourseStartLocalSnapshots(storage),...(extra?[extra]:[])];
 function close(){
  active=false;host.hidden=true;host.innerHTML='';
 }
 function preview(){
  offers=collectMissingCourseStartCandidates(getState(),sources());
  active=true;host.hidden=false;
  if(!offers.length){
   host.innerHTML='<p>Курсов из импортированного списка с пустой датой начала сейчас нет. Изменения не требуются.</p>';
   return;
  }
  const found=offers.filter(o=>o.options.length).length;
  const rows=offers.map(item=>{
   const options=item.options.map(entry=>'<option value="'+escapeText(entry.date)+'"'+
    (item.options.length===1?' selected':'')+'>'+
    dateText(entry.date)+' · '+escapeText(entry.sources.join(', '))+'</option>').join('');
   const choices=item.options.length?'<select data-recover-course="'+escapeText(item.courseId)+'" aria-label="Дата начала ЛТ — '+escapeText(item.name)+'">'+
    '<option value=""'+(item.options.length>1?' selected':'')+'>Не восстанавливать</option>'+options+'</select>':
    '<span class="muted">В истории дата не найдена</span>';
   return '<div class="course-recovery-row"><strong>'+escapeText(item.name)+
    '</strong><small>Фракций: '+escapeText(item.total)+'</small>'+choices+'</div>';
  }).join('');
  host.innerHTML='<div class="course-recovery-head"><strong>Даты из сохранённой истории</strong>'+
   '<button type="button" id="course-recovery-close" aria-label="Закрыть поиск дат">×</button></div>'+
   '<p class="muted">Найдено дат: '+found+' из '+offers.length+
   ' курсов. Проверь даты. Сеансы будут рассчитаны заново по действующему рабочему календарю; проведение лечения не подтверждается.</p>'+
   '<div class="course-recovery-rows">'+rows+'</div>'+
   '<div class="discharge-actions"><button type="button" id="course-recovery-confirm" class="primary" '+(!found?'disabled':'')+'>Восстановить выбранные даты</button></div>'+
   (!found?'<p class="muted">Попробуй выбрать ранее скачанную JSON-копию через поле ниже. Не вводи даты наугад.</p>':'');
  host.querySelector('#course-recovery-close').onclick=close;
  host.querySelector('#course-recovery-confirm')?.addEventListener('click',()=>{
   const choices=[...host.querySelectorAll('select[data-recover-course]')]
    .filter(select=>select.value).map(select=>({courseId:select.dataset.recoverCourse,date:select.value}));
   if(!choices.length){notice('Выбери подтверждённые даты для восстановления.');return;}
   const draft=restoreMissingCourseStartsDraft(getState(),choices,offers,{today:
    [new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,'0'),String(new Date().getDate()).padStart(2,'0')].join('-')});
   if(draft.error){notice(draft.error);return;}
   const detail=draft.restored.map(x=>x.name+': '+dateText(x.start)+
    ' — '+x.count+' плановых фракций').join('\n');
   if(!confirm('Восстановить даты начала ЛТ из ранее сохранённых записей?\n\n'+detail+
    '\n\nЭто восстановление расписания, а НЕ подтверждение фактически проведённых сеансов.'))return;
   // Before touching state or Firebase, preserve the current version locally.
   try{
    storage.setItem('luch-demo-course-recovery-backup-'+Date.now(),JSON.stringify(getState()));
   }catch(error){notice('Резервная копия не сохранилась. Изменения отменены: '+String(error));return;}
   close();commitState(draft.state);renderApp();
   notice('Восстановлены даты ЛТ: '+draft.restored.length+' курс(ов).');
  });
 }
 toggle.addEventListener('click',()=>{
  if(active){close();return;}
  preview();
 });
 picker.addEventListener('change',async event=>{
  const file=event.target.files?.[0];
  if(!file)return;
  if(file.size>1500000){notice('JSON-копия слишком большая для безопасной проверки.');return;}
  try{
   const state=unpack(await file.text());
   if(!state)throw new Error('Нет списка курсов и истории ЛУЧ.');
   extra={label:'Выбранный файл: '+file.name.slice(0,80),state};
   preview();
  }catch(error){notice('Не удалось прочитать резервную копию: '+String(error));}
 });
 return {hasDraft:()=>active};
}
