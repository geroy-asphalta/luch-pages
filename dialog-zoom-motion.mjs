// UI-only shared geometry for a native <dialog> expanding from a toolbar button.
// No changes to the dialog content, report data or the modal focus trap.
export function zoomFromButtonGeometry(buttonRect,dialogRect){
 if(!buttonRect||!dialogRect)return null;
 const values=[buttonRect.left,buttonRect.top,buttonRect.width,buttonRect.height,
               dialogRect.left,dialogRect.top,dialogRect.width,dialogRect.height];
 if(values.some(value=>!Number.isFinite(value))||values.slice(2,4).some(v=>v<=0)||
    dialogRect.width<=0||dialogRect.height<=0)return null;
 const x=buttonRect.left-dialogRect.left,y=buttonRect.top-dialogRect.top;
 const sx=Math.max(.04,Math.min(1,buttonRect.width/dialogRect.width));
 const sy=Math.max(.04,Math.min(1,buttonRect.height/dialogRect.height));
 return {transform:'translate3d('+x+'px,'+y+'px,0) scale('+sx+','+sy+')',
  transformOrigin:'top left'};
}

export function createDialogZoomMotion({dialog,button,win=typeof window!=='undefined'?window:null}={}){
 if(!dialog)throw new Error('Dialog is required for zoom motion');
 let phase='idle',generation=0,animation=null,timer=null;
 const motionOK=()=>{
  if(typeof dialog.animate!=='function'||!button?.getBoundingClientRect||
     !dialog.getBoundingClientRect)return false;
  try{return !win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;}
  catch{return false;}
 };
 const clearTimer=()=>{
  if(timer!==null){(win?.clearTimeout||clearTimeout)(timer);timer=null;}
 };
 function interrupt(){
  ++generation;
  clearTimer();
  if(animation){try{animation.cancel();}catch{}animation=null;}
  dialog.classList?.remove('luch-zoom-opening','luch-zoom-closing');
  phase='idle';
 }
 const focusTrigger=()=>{
  if(button?.isConnected===false)return;
  try{button?.focus?.({preventScroll:true});}catch{button?.focus?.();}
 };
 function nativeClose(){
  if(dialog.open&&typeof dialog.close==='function')dialog.close();
  else dialog.removeAttribute?.('open');
  interrupt();
  focusTrigger();
 }
 function frames(geometry,reverse){
  const compact={...geometry,opacity:.7,borderRadius:'12px'};
  const full={transform:'translate3d(0,0,0) scale(1,1)',transformOrigin:'top left',
   opacity:1,borderRadius:'18px'};
  return reverse?[full,compact]:[compact,full];
 }
 function animateTo(keyframes,duration,finished){
  let current;
  try{current=dialog.animate(keyframes,{duration,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});}
  catch{return false;}
  if(!current)return false;
  animation=current;
  const ticket=++generation;
  const done=()=>{
   if(ticket!==generation)return;
   clearTimer();animation=null;finished();
  };
  // Animation completion and a timer fallback cover Safari, cancelled WAAPI
  // animations and unusual embedded browsers.
  if(current.finished&&typeof current.finished.then==='function')
   current.finished.then(done,()=>{});
  timer=(win?.setTimeout||setTimeout)(done,duration+100);
  return true;
 }
 function open(){
  if(dialog.open){
   if(phase==='closing')interrupt(); // reopening cancels a pending shrink
   return;
  }
  interrupt();
  const wantsMotion=motionOK();
  if(wantsMotion)dialog.classList?.add('luch-zoom-opening');
  if(typeof dialog.showModal==='function')dialog.showModal();
  else dialog.setAttribute('open','');
  if(!wantsMotion)return;
  const geometry=zoomFromButtonGeometry(button.getBoundingClientRect(),dialog.getBoundingClientRect());
  if(!geometry){dialog.classList?.remove('luch-zoom-opening');return;}
  phase='opening';
  if(!animateTo(frames(geometry,false),410,()=>{
   dialog.classList?.remove('luch-zoom-opening');
   phase='idle';
  })){
   dialog.classList?.remove('luch-zoom-opening');
   phase='idle';
  }
 }
 function close(){
  if(!dialog.open||phase==='closing')return;
  interrupt();
  if(!motionOK()){nativeClose();return;}
  const geometry=zoomFromButtonGeometry(button.getBoundingClientRect(),dialog.getBoundingClientRect());
  if(!geometry){nativeClose();return;}
  phase='closing';dialog.classList?.add('luch-zoom-closing');
  if(!animateTo(frames(geometry,true),330,nativeClose))nativeClose();
 }
 dialog.addEventListener?.('cancel',event=>{event.preventDefault();close();});
 // Only an actual click OUTSIDE the bounding box is a backdrop click.
 dialog.addEventListener?.('click',event=>{
  if(event.target!==dialog||!dialog.getBoundingClientRect)return;
  const rect=dialog.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||
     event.clientY<rect.top||event.clientY>rect.bottom)close();
 });
 dialog.addEventListener?.('close',()=>{interrupt();focusTrigger();});
 return {open,close,get phase(){return phase;}};
}
