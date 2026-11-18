// A single patient-card drawer shared by calendar name clicks and "add patient".
// The former full register remains available inside the card for archived people.
// This controller is UI-only: it never writes patient or treatment data.
export function setupPatientCardDrawer({dialog,closeButton,toggleButton,register}){
 if(!dialog||!closeButton||!toggleButton||!register)
  throw new Error('Элементы карточки пациента не найдены.');
 let returnFocus=null;
 const isOpen=()=>Boolean(dialog.open);
 function showRegister(expanded){
  register.classList.toggle('hidden',!expanded);
  toggleButton.setAttribute('aria-expanded',String(expanded));
  toggleButton.textContent=expanded?'Скрыть список':'Все пациенты / архив';
 }
 function open(){
  if(!isOpen()){
   returnFocus=document.activeElement;
   showRegister(false);
   if(typeof dialog.showModal==='function')dialog.showModal();
   else dialog.setAttribute('open','');
   closeButton.focus({preventScroll:true});
  }
 }
 function close(){
  if(!isOpen())return;
  if(typeof dialog.close==='function')dialog.close();
  else{dialog.removeAttribute('open');restoreFocus();}
 }
 function restoreFocus(){
  const target=returnFocus?.isConnected?returnFocus:
   document.getElementById('calendar-add-patient');
  if(typeof target?.focus==='function')target.focus({preventScroll:true});
  returnFocus=null;
 }
 closeButton.addEventListener('click',close);
 toggleButton.addEventListener('click',()=>showRegister(
  toggleButton.getAttribute('aria-expanded')!=='true'
 ));
 dialog.addEventListener('close',restoreFocus);
 // Clicking the dimmed backdrop closes the card, not a patient row.
 dialog.addEventListener('click',event=>{
  if(event.target===dialog)close();
 });
 // The browser handles Escape, focus trapping and nested input forms for <dialog>.
 return {open,close,isOpen,showRegister};
}
