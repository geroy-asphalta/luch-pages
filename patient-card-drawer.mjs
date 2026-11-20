// A single patient-card drawer shared by calendar name clicks and "add patient".
// UI-only motion: preserve native modal focus trapping, Escape and focus return.
export function setupPatientCardDrawer({dialog,closeButton,toggleButton,register}){
 if(!dialog||!closeButton||!toggleButton||!register)
  throw new Error('Элементы карточки пациента не найдены.');
 let returnFocus=null,closeTimer=null;
 const isOpen=()=>Boolean(dialog.open);
 const reducedMotion=()=>typeof window!=='undefined'&&typeof window.matchMedia==='function'&&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 function showRegister(expanded){
  register.classList.toggle('hidden',!expanded);
  toggleButton.setAttribute('aria-expanded',String(expanded));
  toggleButton.textContent=expanded?'Скрыть список':'Все пациенты / архив';
 }
 function restoreFocus(){
  const target=returnFocus?.isConnected?returnFocus:
   document.getElementById('calendar-add-patient');
  if(typeof target?.focus==='function')target.focus({preventScroll:true});
  returnFocus=null;
 }
 function clearClosing(){
  if(closeTimer!==null){clearTimeout(closeTimer);closeTimer=null;}
  dialog.classList.remove('motion-closing');
 }
 function finishClose(){
  if(!isOpen()){clearClosing();return;}
  // Close the native modal BEFORE removing the exit class. Otherwise [open]
  // momentarily reactivates the entrance animation and causes a visible snap.
  if(typeof dialog.close==='function')dialog.close();
  else{dialog.removeAttribute('open');restoreFocus();}
  clearClosing();
 }
 function open(){
  if(dialog.classList.contains('motion-closing')){
   clearClosing();
   closeButton.focus({preventScroll:true});
   return;
  }
  if(!isOpen()){
   returnFocus=document.activeElement;
   showRegister(false);
   if(typeof dialog.showModal==='function')dialog.showModal();
   else dialog.setAttribute('open','');
   closeButton.focus({preventScroll:true});
  }
 }
 function close(){
  if(!isOpen()||dialog.classList.contains('motion-closing'))return;
  if(reducedMotion()){finishClose();return;}
  dialog.classList.add('motion-closing');
  // A fallback also completes close if the browser has no CSS animation support.
  closeTimer=setTimeout(finishClose,290);
 }
 closeButton.addEventListener('click',close);
 toggleButton.addEventListener('click',()=>showRegister(
  toggleButton.getAttribute('aria-expanded')!=='true'
 ));
 dialog.addEventListener('animationend',event=>{
  if(event.target===dialog&&event.animationName==='luch-card-exit')finishClose();
 });
 dialog.addEventListener('close',()=>{clearClosing();restoreFocus();});
 // Intercept native Escape close so it follows the same exit transition.
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 // Clicking the dimmed backdrop closes the card, not a patient row.
 dialog.addEventListener('click',event=>{
  if(event.target===dialog)close();
 });
 return {open,close,isOpen,showRegister};
}
