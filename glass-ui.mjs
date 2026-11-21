// LUCH Glass: UI-only micro-interactions. No patient, schedule or sync state.
export const isGlassSuccessNotice=message=>
 /^(?:Список выписок скопирован$|Изменения карточки сохранены$|Пациент добавлен$|Данные пациента сохранены$|Курс сохранён(?:\.|$)|Порядок пациентов сохранён$)/.test(String(message??''));


/* Minimal browser-independent geometry for the quiet calendar hint. */
export function calendarGlassHintPosition({x,y,width,height,viewportWidth,viewportHeight}){
 const gap=10;
 const left=Math.max(gap,Math.min(x+14,viewportWidth-width-gap));
 let top=y+18;
 if(top+height>viewportHeight-gap)top=y-height-12;
 return {left,top:Math.max(gap,Math.min(top,viewportHeight-height-gap))};
}

/* Delegated listeners survive every calendar redraw. The native title is only
   parked while a pointer/focus is on the target, then restored verbatim. */
function setupCalendarGlassHints(doc,win){
 const calendar=doc.getElementById?.('calendar');
 if(!calendar||!doc.body)return;
 const hint=doc.createElement('div');
 hint.className='calendar-glass-hint';
 hint.hidden=true;
 hint.setAttribute('role','tooltip');
 doc.body.appendChild(hint);
 let active=null,message='';
 const getTarget=node=>{
  const target=node?.closest?.('[title],[data-glass-hint]');
  return target&&calendar.contains(target)?target:null;
 };
 function hide(){
  if(active?.dataset?.glassHint===message){
   active.setAttribute('title',message);
   delete active.dataset.glassHint;
  }
  active=null;message='';hint.hidden=true;
 }
 function show(target){
  if(active===target)return;
  hide();
  const content=target?.getAttribute('title');
  if(!content)return;
  active=target;message=content;
  target.removeAttribute('title');
  target.dataset.glassHint=content;
  hint.textContent=content;
  hint.hidden=false;
 }
 function place(x,y){
  if(!active||hint.hidden)return;
  const at=calendarGlassHintPosition({
   x,y,width:hint.offsetWidth,height:hint.offsetHeight,
   viewportWidth:win.innerWidth,viewportHeight:win.innerHeight
  });
  hint.style.left=at.left+'px';
  hint.style.top=at.top+'px';
 }
 calendar.addEventListener('pointerover',event=>{
  if(event.pointerType!=='mouse'&&event.pointerType!=='pen')return;
  const target=getTarget(event.target);
  if(!target){hide();return;}
  show(target);place(event.clientX,event.clientY);
 });
 calendar.addEventListener('pointermove',event=>{
  if(!active)return;
  if(!active.isConnected){hide();return;}
  if(event.pointerType==='mouse'||event.pointerType==='pen')place(event.clientX,event.clientY);
 });
 calendar.addEventListener('pointerout',event=>{
  if(getTarget(event.relatedTarget)===active)return;
  hide();
 });
 calendar.addEventListener('pointerdown',hide);
 calendar.addEventListener('mouseleave',hide);
 calendar.addEventListener('scroll',hide,true);
 calendar.addEventListener('focusin',event=>{
  const target=getTarget(event.target);
  if(!target)return;
  show(target);
  const rect=target.getBoundingClientRect();
  place(rect.left+Math.min(rect.width/2,80),rect.bottom);
 });
 calendar.addEventListener('focusout',event=>{
  if(!active?.contains?.(event.relatedTarget))hide();
 });
 win.addEventListener?.('blur',hide);
 win.addEventListener?.('resize',hide);
 doc.addEventListener?.('visibilitychange',()=>{if(doc.hidden)hide()});
}

export function setupGlassUI({doc=document,win=window}={}){
 const sidebar=doc.querySelector('.sidebar');
 const navButtons=sidebar?[...sidebar.querySelectorAll('.nav')]:[];
 let indicator=null,lastPending=null;
 if(sidebar&&navButtons.length){
  indicator=doc.createElement('div');
  indicator.className='glass-nav-indicator';
  indicator.setAttribute('aria-hidden','true');
  indicator.style.transition='none'; // do not fly in from the top on first paint
  sidebar.appendChild(indicator);
 }
 function syncNavigation(){
  if(!sidebar||!indicator)return;
  const active=navButtons.find(node=>node.classList.contains('active'));
  if(!active)return;
  indicator.style.width=active.offsetWidth+'px';
  indicator.style.height=active.offsetHeight+'px';
  indicator.style.transform='translate3d('+active.offsetLeft+'px,'+active.offsetTop+'px,0)';
  sidebar.classList.add('glass-nav-ready');
 }
 if(indicator){
  syncNavigation();
  if(typeof win.requestAnimationFrame==='function'){
   win.requestAnimationFrame(()=>indicator.style.removeProperty('transition'));
  }else indicator.style.removeProperty('transition');
  win.addEventListener?.('resize',syncNavigation);
 }
 function updateTaskBadge(pending){
  const amount=Number(pending);
  if(!Number.isFinite(amount))return;
  const badge=doc.querySelector('#stats .today-tasks-count');
  if(badge&&lastPending!==null&&lastPending!==amount){
   badge.classList.add('glass-badge-change');
  }
  lastPending=amount;
 }
 setupCalendarGlassHints(doc,win);
 return {syncNavigation,updateTaskBadge};
}
