// Confirm one or more administrative HLT date changes before committing.
// The move preview lists every infusion from the chosen one onward.
import {chemoEventAt,chemoChangeDraft} from './chemo-change.mjs?v=2';
const el=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));

export function setupChemoChangeUI({getState,commitState,renderApp,notice}){
 const dialog=el('chemo-change-dialog'),form=el('chemo-change-form');
 const date=el('chemo-change-date'),reason=el('chemo-change-reason');
 const check=el('chemo-change-check'),confirm=el('chemo-change-confirm');
 const detail=el('chemo-change-info'),preview=el('chemo-change-preview');
 let target=null,kind=null;
 const close=()=>{
  if(dialog.open&&typeof dialog.close==='function')dialog.close();
  else dialog.removeAttribute('open');
  target=null;kind=null;
 };
 function draft(){
  return target&&chemoChangeDraft(getState(),{
   eventId:target.id,kind,targetDate:date.value,
   reason:reason.value.trim()
  });
 }
 function update(){
  if(!target)return;
  const result=draft();
  if(result?.error){
   preview.innerHTML='<p class="chemo-change-error" role="alert">'+esc(result.error)+'</p>';
  }else if(result){
   const list=result.kind==='move'?
    '<p class="chemo-change-subtitle">Расчётные даты идут через 7 дней; если дата нерабочая, введение переносится на ближайший следующий рабочий день:</p>'+
    '<div class="chemo-change-table-wrap"><table class="chemo-change-table"><thead><tr>'+
    '<th>ХТ</th><th>Было</th><th>По схеме (+7)</th><th>Станет</th><th>Кровь (было → станет)</th></tr></thead><tbody>'+
    result.changes.map(item=>'<tr><td>№'+(item.index+1)+(item.status==='cancelled'?' · отменено':'')+'</td>'+
     '<td>'+esc(item.oldDate)+'</td><td>'+esc(item.nominalDate)+'</td><td><b>'+esc(item.newDate)+'</b></td>'+
     '<td>'+esc(item.labBefore||'—')+' → '+esc(item.labAfter||'—')+'</td></tr>').join('')+'</tbody></table></div>':
    '<p class="chemo-change-subtitle">Изменение относится только к ХТ №'+
    (result.changes[0].index+1)+' ('+esc(result.previousDate)+').</p>';
   preview.innerHTML=list+(result.labDescription?
    '<p class="chemo-change-note">'+esc(result.labDescription)+'</p>':'')+
    (result.warnings?.length?'<div class="chemo-change-warnings">'+
     result.warnings.map(note=>'<p>'+esc(note)+'</p>').join('')+'</div>':'');
  }
  confirm.disabled=Boolean(result?.error)||!check.checked;
 }
 function open(cell,requestedKind){
  const state=getState(),item=chemoEventAt(state,cell?.patientId,cell?.date);
  const operation={'chemo-move':'move','chemo-cancel':'cancel','chemo-restore':'restore'}[requestedKind];
  if(!item||!operation){notice('В выбранной ячейке нет доступной капельницы.');return;}
  if((operation==='restore')!==(item.status==='cancelled')){
   notice('Статус капельницы изменился. Обнови календарь.');return;
  }
  const course=(state.patients||[]).find(p=>p.id===item.patientId);
  const person=(state.people||[]).find(p=>p.id===course?.personId);
  if(!course||course.treatmentType!=='ХЛТ'||!['active','planned'].includes(course.status)||
   person?.archived){notice('Изменение доступно только для активного курса ХЛТ.');return;}
  target={id:item.id};kind=operation;form.reset();
  date.value=item.date;
  const moving=operation==='move';
  el('chemo-change-title').textContent=moving?'Перенести капельницы серии':
   operation==='cancel'?'Отменить капельницу':'Восстановить капельницу';
  el('chemo-change-date-row').classList.toggle('hidden',!moving);
  date.required=moving;
  detail.innerHTML='<b>'+esc(person?.name||course.name)+'</b> · ХТ №'+(Number(item.chemoIndex)+1)+
   ' · '+esc(item.date)+(item.originalDate&&item.originalDate!==item.date?' (ранее '+esc(item.originalDate)+')':'')+
   '<p>'+(moving?'Предыдущие введения остаются неизменными. Следующие расчётные даты идут с шагом 7 дней, а нерабочие переносятся вперёд без сдвига остальных.':
    'Изменение касается одной капельницы. Остальные даты остаются без изменений.')+'</p>';
  update();
  if(typeof dialog.showModal==='function')dialog.showModal();
  else dialog.setAttribute('open','');
  (moving?date:reason).focus();
 }
 form.addEventListener('input',update);
 form.addEventListener('change',update);
 form.addEventListener('submit',event=>{
  event.preventDefault();
  if(!target||!check.checked)return;
  const result=chemoChangeDraft(getState(),{
   eventId:target.id,kind,targetDate:date.value,reason:reason.value.trim()
  });
  if(result.error){update();return;}
  close();
  commitState(result.state);
  renderApp();
  notice(result.kind==='move'?'Перенесены введения ХТ: '+result.changes.length:
   result.kind==='cancel'?'Капельница отменена':'Капельница восстановлена');
 });
 el('chemo-change-close').onclick=close;
 el('chemo-change-back').onclick=close;
 // Browser Escape is also closed synchronously, avoiding a late 'close'
 // event that could clear a newer dialog selection (cf. grouped discharge).
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 return {open,close};
}
