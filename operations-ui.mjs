import {MACHINES,pretty,schedule,machineAt,breakdownDraft,breakdownUpdate,breakdownRemove,transferDraft,transferRemove,previewChanges} from './planner.mjs';

const el=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createOperationalUI({getState,commitState,render,notice}){
 let breakPending=null,transferPending=null;
 const resetBreak=()=>{breakPending=null;el('break-preview').classList.add('hidden');};
 const resetTransfer=()=>{transferPending=null;el('transfer-preview').classList.add('hidden');};

 function candidateRefresh(){
   const s=getState(),machine=el('break-machine').value,date=el('break-date').value;
   const chosen=new Set([...el('break-completed').querySelectorAll('input:checked')].map(x=>x.value));
   const available=s.patients.filter(p=>['active','planned'].includes(p.status)&&!s.people?.find(person=>person.id===p.personId)?.archived&&machineAt(p,s,date)===machine&&schedule(p,s,date).get(date)?.kind==='session');
   el('break-completed').innerHTML=available.length?available.map(p=>
     '<label class="candidate"><input type="checkbox" value="'+esc(p.id)+'" '+(chosen.has(p.id)?'checked':'')+'><span>'+esc(p.name)+' <small>'+esc(p.id)+'</small></span></label>'
   ).join(''):'<div class="muted">На выбранную дату плановых сеансов на этом аппарате нет.</div>';
 }

 function summary(before,after,date){
   const rows=previewChanges(before,after,date);
   const body=rows.map(r=>
     '<tr><td>'+esc(r.name)+'</td><td>'+esc(r.oldMachine)+' → '+esc(r.newMachine)+'</td><td>'+(r.oldNext?pretty(r.oldNext):'—')+'</td><td>'+(r.newNext?pretty(r.newNext):'Ожидает восстановления / перевода')+'</td><td>'+(r.delivered?'✓ Проведён':'—')+'</td></tr>'
   ).join('');
   return '<p><b>Затронуто пациентов: '+rows.length+'</b>. Сравнение плановых дат на 120 дней; дозы не изменяются.</p>'+
    (rows.length?'<div class="scroll"><table class="data-table"><thead><tr><th>Пациент</th><th>Аппарат</th><th>След. сеанс: был</th><th>След. сеанс: стал</th><th>В день поломки</th></tr></thead><tbody>'+body+'</tbody></table></div>':'<p class="muted">Плановые даты для активных пациентов не изменились.</p>')+
    (rows.some(r=>!r.newNext)?'<p class="safety-note">Для некоторых пациентов продолжение невозможно запланировать до восстановления аппарата или отдельно согласованного перевода.</p>':'');
 }
 const buttons=kind=>'<div class="preview-actions"><button type="button" class="primary" id="'+kind+'-confirm">Подтвердить</button><button type="button" id="'+kind+'-cancel">Отмена</button></div>';

 function renderBreakdowns(){
   const entries=getState().breakdowns||[];
   el('break-list').innerHTML=entries.length?entries.slice().sort((a,b)=>b.start.localeCompare(a.start)).map(b=>
     '<div class="list-item"><span><b>'+esc(b.machine)+'</b> · '+pretty(b.start)+' → '+(b.resume?pretty(b.resume):'дата восстановления неизвестна')+'<small> · Отмечено проведённых: '+b.completed.length+'</small></span><div class="list-actions"><input type="date" aria-label="Первый день работы после поломки" value="'+(b.resume||'')+'"><button type="button" data-break-update="'+esc(b.id)+'">Изменить дату</button><button type="button" data-break-remove="'+esc(b.id)+'">Отменить поломку</button></div></div>'
   ).join(''):'<div class="muted">Поломок пока нет.</div>';
   el('break-list').querySelectorAll('[data-break-update]').forEach(button=>button.onclick=()=>{
     const before=getState(),resume=button.closest('.list-item').querySelector('input[type="date"]').value||null;
     const result=breakdownUpdate(before,button.dataset.breakUpdate,resume);
     if(result.error){notice(result.error);return;}
     breakPending=result;
     el('break-preview').innerHTML='<h3>Предварительный просмотр восстановления</h3><p>'+esc(result.entry.machine)+' · начало '+pretty(result.entry.start)+' · '+(resume?'возобновление '+pretty(resume):'дата восстановления снова неизвестна')+'. Сохранено отметок о проведении: '+result.entry.completed.length+'.</p>'+summary(before,result.state,result.entry.start)+buttons('break');
     el('break-preview').classList.remove('hidden');
     el('break-confirm').onclick=()=>{if(!breakPending)return;commitState(breakPending.state);resetBreak();render();candidateRefresh();notice('Дата восстановления изменена');};
     el('break-cancel').onclick=resetBreak;
   });
   el('break-list').querySelectorAll('[data-break-remove]').forEach(button=>button.onclick=()=>{
     if(!confirm('Отменить поломку? Календарь будет пересчитан, а отметки о проведённых сеансах в этот день, привязанные к поломке, будут удалены.'))return;
     const r=breakdownRemove(getState(),button.dataset.breakRemove);
     if(r.error){notice(r.error);return;}
     commitState(r.state);resetBreak();render();candidateRefresh();notice('Поломка отменена');
   });
   candidateRefresh();
 }

 function renderTransfers(){
   const s=getState(),entries=s.transfers||[];
   refreshPatientOptions();
   el('transfer-list').innerHTML=entries.length?entries.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(t=>{
     const p=s.patients.find(x=>x.id===t.patientId);
     return '<div class="list-item"><span><b>'+esc(p?.name||t.patientId)+'</b> · '+esc(t.from)+' → '+esc(t.to)+' · '+pretty(t.date)+'</span><button type="button" data-transfer-remove="'+esc(t.id)+'">Отменить перевод</button></div>';
   }).join(''):'<div class="muted">Переводов пока нет.</div>';
   el('transfer-list').querySelectorAll('button').forEach(button=>button.onclick=()=>{
     if(!confirm('Отменить перевод пациента? Плановые даты будут пересчитаны.'))return;
     const r=transferRemove(getState(),button.dataset.transferRemove);
     if(r.error){notice(r.error);return;}
     commitState(r.state);resetTransfer();render();notice('Перевод отменён');
   });
   const p=s.patients.find(x=>x.id===el('transfer-patient').value);
   el('transfer-current').textContent=p?'Аппарат на выбранную дату: '+machineAt(p,s,el('transfer-date').value):'';
 }

 function refreshPatientOptions(){
   const select=el('transfer-patient'),previous=select.value;
   const options=getState().patients.filter(p=>['active','planned'].includes(p.status)&&!getState().people?.find(person=>person.id===p.personId)?.archived);
   select.innerHTML=options.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' · '+esc(p.courseName||p.id)+' · '+esc(p.machine)+'</option>').join('');
   if(options.some(p=>p.id===previous))select.value=previous;
   else if(options.some(p=>p.id==='P-005'))select.value='P-005';
 }
 function setup(){
   for(const machine of MACHINES){
     for(const id of ['break-machine','transfer-machine']){
       const option=document.createElement('option');option.value=machine;option.textContent=machine;el(id).append(option);
     }
   }
   el('break-machine').value='TrueBeam 2';
   el('transfer-machine').value='TrueBeam 1';
   refreshPatientOptions();
   el('break-resolved').onchange=()=>{
     el('resume-wrap').classList.toggle('hidden',!el('break-resolved').checked);resetBreak();
   };
   el('break-form').onchange=e=>{
     if(e.target.id==='break-machine'||e.target.id==='break-date')candidateRefresh();
     resetBreak();
   };
   el('transfer-form').onchange=()=>{resetTransfer();renderTransfers();};
   el('break-form').onsubmit=e=>{
     e.preventDefault();
     const completed=[...el('break-completed').querySelectorAll('input:checked')].map(x=>x.value);
     const args={machine:el('break-machine').value,start:el('break-date').value,resume:el('break-resolved').checked?el('break-resume').value:null,completed};
     const before=getState(),result=breakdownDraft(before,args);
     if(result.error){notice(result.error);return;}
     breakPending=result;
     el('break-preview').innerHTML='<h3>Предварительный просмотр поломки</h3><p><b>'+esc(args.machine)+'</b> · '+pretty(args.start)+'. '+(args.resume?'Возобновление: '+pretty(args.resume):'Дата восстановления неизвестна')+'. Проведено до поломки: '+completed.length+'.</p>'+summary(before,result.state,args.start)+buttons('break');
     el('break-preview').classList.remove('hidden');
     el('break-confirm').onclick=()=>{
       if(!breakPending)return;
       commitState(breakPending.state);resetBreak();render();candidateRefresh();notice('Поломка подтверждена, календарь пересчитан');
     };
     el('break-cancel').onclick=resetBreak;
   };
   el('transfer-form').onsubmit=e=>{
     e.preventDefault();
     const args={patientId:el('transfer-patient').value,to:el('transfer-machine').value,date:el('transfer-date').value};
     const before=getState(),result=transferDraft(before,args);
     if(result.error){notice(result.error);return;}
     transferPending=result;
     const p=before.patients.find(x=>x.id===args.patientId);
     el('transfer-preview').innerHTML='<h3>Предварительный просмотр перевода</h3><p><b>'+esc(p.name)+'</b>: '+esc(result.entry.from)+' → '+esc(args.to)+' с '+pretty(args.date)+'. Ранее проведённые / запланированные даты до перевода сохраняются.</p>'+summary(before,result.state,args.date)+'<p class="safety-note">Это только расчёт календаря. Перенос лечения на новую установку требует отдельного клинического согласования плана и контроля качества.</p>'+buttons('transfer');
     el('transfer-preview').classList.remove('hidden');
     el('transfer-confirm').onclick=()=>{
       if(!transferPending)return;
       commitState(transferPending.state);resetTransfer();render();notice('Перевод сохранён, график пересчитан');
     };
     el('transfer-cancel').onclick=resetTransfer;
   };
   candidateRefresh();
 }
 function reset(){resetBreak();resetTransfer();candidateRefresh();}
 return {setup,reset,renderBreakdowns,renderTransfers};
}
