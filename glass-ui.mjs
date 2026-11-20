// LUCH Glass: UI-only micro-interactions. No patient, schedule or sync state.
export const isGlassSuccessNotice=message=>
 /^(?:Список выписок скопирован$|Изменения карточки сохранены$|Пациент добавлен$|Данные пациента сохранены$|Курс сохранён(?:\.|$)|Порядок пациентов сохранён$)/.test(String(message??''));

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
 return {syncNavigation,updateTaskBadge};
}
