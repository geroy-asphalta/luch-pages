// View and copy a read-only, month-grouped discharge list.
import {dischargeTextReport} from './discharge-text-report.mjs';
const el=id=>document.getElementById(id);

export function setupDischargeTextReportUI({
 getState,getMonth,notice,clipboard=typeof navigator!=='undefined'?navigator.clipboard:null,
 doc=typeof document!=='undefined'?document:null
}){
 const dialog=el('discharge-text-dialog');
 const dateInput=el('discharge-text-month');
 const modeInput=el('discharge-text-mode');
 const output=el('discharge-text-output');
 const summary=el('discharge-text-summary');
 const copyButton=el('discharge-text-copy');
 const selectButton=el('discharge-text-select');
 let generated='';
 function render(){
  const result=dischargeTextReport(getState(),{month:dateInput.value,mode:modeInput.value});
  generated=result.text||'';
  output.value=generated;
  copyButton.disabled=!generated;
  selectButton.disabled=!generated;
  if(result.error){
   summary.textContent=result.error;
   return;
  }
  if(result.dates===0){
   summary.textContent=modeInput.value==='confirmed'?
    'В этом месяце нет подтверждённых выписок. Можно переключиться на плановые даты.':
    'Для выбранного месяца нет пациентов с запланированным последним сеансом.';
  }else{
   summary.textContent='Дат: '+result.dates+' · Пациентов: '+result.people+
    (modeInput.value==='planned'?' · Только план, не подтверждение выписки':' · Подтверждённые выписки');
  }
 }
 function open(){
  const currentMonth=String(getMonth()||'');
  dateInput.value=/^\d{4}-(0[1-9]|1[0-2])$/.test(currentMonth)?
   currentMonth:new Date().toISOString().slice(0,7);
  modeInput.value='confirmed';
  render();
  if(typeof dialog.showModal==='function')dialog.showModal();
  else dialog.setAttribute('open','');
 }
 function close(){
  if(dialog.open&&typeof dialog.close==='function')dialog.close();
  else dialog.removeAttribute('open');
 }
 function selectAll(){
  output.focus();
  output.select();
 }
 async function copy(){
  if(!generated){notice('Нет текста для копирования.');return;}
  try{
   if(clipboard?.writeText){
    await clipboard.writeText(generated);
    notice('Список выписок скопирован');
    return;
   }
  }catch{ /* Clipboard API may be restricted in local/offline browsers. */ }
  selectAll();
  let copied=false;
  try{copied=Boolean(doc?.execCommand?.('copy'));}catch{}
  notice(copied?'Список выписок скопирован':'Текст выделен — нажми Ctrl+C или ⌘+C');
 }
 el('discharge-text-open').addEventListener('click',open);
 el('discharge-text-close').addEventListener('click',close);
 el('discharge-text-done').addEventListener('click',close);
 dateInput.addEventListener('change',render);
 modeInput.addEventListener('change',render);
 selectButton.addEventListener('click',selectAll);
 copyButton.addEventListener('click',copy);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 return {open,render,close};
}
