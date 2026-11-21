// LUCH Glass Sidebar. Presentation-only: does not change patient, course or
// navigation state. The user's local preference is kept on this device only.
export const SIDEBAR_STORAGE_KEY='luch-sidebar-expanded';

export function readSidebarExpanded(storage){
 try{return storage?.getItem(SIDEBAR_STORAGE_KEY)==='true';}
 catch{return false;}
}

export function setupSidebarGlass({doc=document,win=window,storage=null,onLayoutChange=()=>{}}={}){
 const sidebar=doc.querySelector('.sidebar');
 const links=sidebar?[...sidebar.querySelectorAll('.nav')]:[];
 if(!sidebar||!links.length)return null;

 // Read names from the existing navigation, never keep a second list of pages.
 for(const link of links){
  const name=link.querySelector('b')?.textContent?.trim()||link.dataset.view||'Раздел';
  link.dataset.sidebarTooltip=name;
  link.setAttribute('aria-label',name);
 }
 const toggle=doc.createElement('button');
 toggle.type='button';
 toggle.id='sidebar-glass-toggle';
 toggle.className='sidebar-glass-toggle';
 toggle.setAttribute('aria-controls','luch-sidebar');
 toggle.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7"/></svg>';
 sidebar.id='luch-sidebar';
 sidebar.appendChild(toggle);

 let preference=null;
 try{preference=storage??win.localStorage;}catch{}
 let expanded=readSidebarExpanded(preference);
 function setExpanded(next,{persist=true}={}){
  expanded=Boolean(next);
  sidebar.dataset.expanded=String(expanded);
  toggle.setAttribute('aria-expanded',String(expanded));
  toggle.setAttribute('aria-label',expanded?'Свернуть боковое меню':'Развернуть боковое меню');
  toggle.title=expanded?'Свернуть меню':'Развернуть меню';
  if(persist){
   try{preference?.setItem(SIDEBAR_STORAGE_KEY,String(expanded));}catch{}
  }
  onLayoutChange();
 }
 // Apply the sizing class before measuring the active navigation pill.
 // The initial render is not animated; later clicks get the smooth transition.
 sidebar.classList.add('sidebar-glass-ready');
 setExpanded(expanded,{persist:false});
 const onClick=()=>setExpanded(!expanded);
 const onTransitionEnd=event=>{
  if(event.target===sidebar&&event.propertyName==='width')onLayoutChange();
 };
 toggle.addEventListener('click',onClick);
 sidebar.addEventListener('transitionend',onTransitionEnd);
 if(typeof win.requestAnimationFrame==='function'){
  win.requestAnimationFrame(()=>sidebar.classList.add('sidebar-glass-motion'));
 }else sidebar.classList.add('sidebar-glass-motion');
 return {
  get expanded(){return expanded;},
  toggle:onClick,
  setExpanded,
  destroy(){
   toggle.removeEventListener('click',onClick);
   sidebar.removeEventListener('transitionend',onTransitionEnd);
   toggle.remove();
   sidebar.classList.remove('sidebar-glass-ready','sidebar-glass-motion');
   sidebar.removeAttribute('data-expanded');
   links.forEach(link=>{
    link.removeAttribute('data-sidebar-tooltip');
    link.removeAttribute('aria-label');
   });
  }
 };
}
