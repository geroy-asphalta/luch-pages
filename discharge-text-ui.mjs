// Weekly read-only list of everyone whose LAST PLANNED fraction falls in
// the chosen Monday–Sunday week; independent of actual discharge confirmation.
import {addDays,weekBounds} from './planner.mjs';
import {localToday} from './course-progress.mjs';
import {dischargeTextReport,nextDischargeWeekStart} from './discharge-text-report.mjs';
import {createDialogZoomMotion} from './dialog-zoom-motion.mjs?v=1';
const el=id=>document.getElementById(id);
const shortDate=date=>date.slice(8,10)+'.'+date.slice(5,7);

export function setupDischargeTextReportUI({
 getState,notice,getToday=localToday,
 clipboard=typeof navigator!=='undefined'?navigator.clipboard:null,
 doc=typeof document!=='undefined'?document:null
}){
 const dialog=el('discharge-text-dialog');
 const zoom=createDialogZoomMotion({dialog,button:el('discharge-text-open')});
 const dateInput=el('discharge-text-date');
 const weekLabel=el('discharge-text-week-label');
 const output=el('discharge-text-output');
 const summary=el('discharge-text-summary');
 const copyButton=el('discharge-text-copy');
 let selectedWeek='',generated='';
 function render(){
  const result=dischargeTextReport(getState(),{weekStart:selectedWeek});
  generated=result.text||'';
  output.value=generated;
  copyButton.disabled=!generated;
  if(result.error){
   summary.textContent=result.error;
   weekLabel.textContent='Выбери неделю';
   return;
  }
  selectedWeek=result.weekStart;
  dateInput.value=selectedWeek;
  weekLabel.textContent=shortDate(result.weekStart)+' – '+shortDate(result.weekEnd)+'.'+
   result.weekEnd.slice(0,4);
  summary.textContent=result.dates?
   'Дат: '+result.dates+' · Пациентов: '+result.people+' · Плановые последние фракции':
   'На выбранной неделе нет пациентов с запланированной последней фракцией.';
 }
 function setWeek(date){
  const week=weekBounds(date);
  if(!week){notice('Выбери корректную дату недели.');dateInput.value=selectedWeek;return;}
  selectedWeek=week.start;
  render();
 }
 function showDialog(){zoom.open();}
 function open(){
  const next=nextDischargeWeekStart(getToday());
  if(!next){notice('Не удалось определить следующую неделю.');return;}
  selectedWeek=next;
  render();
  showDialog();
 }
 function close(){zoom.close();}
 function selectAll(){output.focus();output.select();}
 async function copy(){
  if(!generated){notice('Нет текста для копирования.');return;}
  try{
   if(clipboard?.writeText){
    await clipboard.writeText(generated);
    notice('Список выписок скопирован');
    return;
   }
  }catch{ /* Local/offline browsers can restrict Clipboard API. */ }
  // The toolbar/weekly-task action can copy without opening this dialog.
  // If browser clipboard permissions block it, show the same report so the
  // user can select its text manually, even from a historical Thursday.
  showDialog();
  selectAll();
  let copied=false;
  try{copied=Boolean(doc?.execCommand?.('copy'));}catch{}
  notice(copied?'Список выписок скопирован':'Текст выделен — нажми Ctrl+C или ⌘+C');
 }
 async function copyNextWeek(fromDate=getToday()){
  const next=nextDischargeWeekStart(fromDate);
  if(!next){notice('Не удалось определить следующую неделю.');return false;}
  selectedWeek=next;
  render();
  if(!generated){
   notice('На следующей неделе нет запланированных выписок.');
   return false;
  }
  await copy();
  return true;
 }
 el('discharge-text-open').addEventListener('click',open);
 el('discharge-text-close').addEventListener('click',close);
 el('discharge-text-prev').addEventListener('click',()=>setWeek(addDays(selectedWeek,-7)));
 el('discharge-text-next').addEventListener('click',()=>setWeek(addDays(selectedWeek,7)));
 el('discharge-text-default').addEventListener('click',()=>setWeek(nextDischargeWeekStart(getToday())));
 dateInput.addEventListener('change',()=>setWeek(dateInput.value));
 copyButton.addEventListener('click',copy);
 // Native Escape/backdrop closing is handled by the same reversible zoom.
 return {open,render,close,copyNextWeek};
}
