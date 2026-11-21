// Progressive enhancement of the existing calendar machine <select>.
// Keeps #filter as the source of truth; schedules, mobile filtering and state
// synchronization continue using the original 'change' event and value.
export function machineFilterChoices(select){
 return [...(select?.options||[])].map(option=>({value:option.value,label:option.textContent}));
}
export function machineFilterMoveIndex(index,key,length){
 if(!length)return -1;
 if(key==='Home')return 0;
 if(key==='End')return length-1;
 if(key==='ArrowDown')return (index+1+length)%length;
 if(key==='ArrowUp')return (index-1+length)%length;
 return index;
}
export function setupMachineFilterGlass(select){
 if(!select?.parentNode||!select.ownerDocument)return null;
 const doc=select.ownerDocument,view=doc.defaultView;
 if(!view)return null;
 const choices=machineFilterChoices(select);
 if(!choices.length)return null;
 const root=doc.createElement('span');
 root.className='machine-filter-glass';
 select.parentNode.insertBefore(root,select);
 root.appendChild(select);
 const trigger=doc.createElement('button');
 trigger.type='button';trigger.className='machine-filter-trigger';
 trigger.setAttribute('aria-haspopup','listbox');
 trigger.setAttribute('aria-expanded','false');
 trigger.setAttribute('aria-label','Фильтр по установке');
 trigger.setAttribute('aria-controls','machine-filter-glass-list');
 const label=doc.createElement('span');
 label.className='machine-filter-label';
 const chevron=doc.createElement('span');
 chevron.className='machine-filter-chevron';chevron.setAttribute('aria-hidden','true');
 chevron.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
 trigger.append(label,chevron);
 root.appendChild(trigger);
 // The toolbar is inside an overflow:hidden workspace, so float the menu
 // on the document surface rather than clipping it inside the table wrapper.
 const menu=doc.createElement('div');
 menu.id='machine-filter-glass-list';
 menu.className='machine-filter-menu';
 menu.setAttribute('role','listbox');
 menu.setAttribute('aria-label','Установки');
 menu.hidden=true;
 doc.body.appendChild(menu);
 const buttons=choices.map((entry,index)=>{
  const item=doc.createElement('button');
  item.type='button';item.className='machine-filter-option';
  item.setAttribute('role','option');
  item.setAttribute('tabindex','-1');
  item.setAttribute('aria-selected','false');
  item.dataset.value=entry.value;
  item.style.setProperty('--machine-filter-index',String(Math.min(index,7)));
  const name=doc.createElement('span');
  name.className='machine-filter-option-name';name.textContent=entry.label;
  const mark=doc.createElement('span');
  mark.className='machine-filter-check';mark.setAttribute('aria-hidden','true');
  mark.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>';
  item.append(name,mark);menu.appendChild(item);
  item.addEventListener('click',()=>choose(index));
  return item;
 });
 let open=false,hideTicket=0;
 const reduced=()=>view.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
 const selectedIndex=()=>Math.max(0,choices.findIndex(item=>item.value===select.value));
 function sync(){
  const index=selectedIndex();
  label.textContent=choices[index].label;
  buttons.forEach((item,i)=>{
   item.dataset.selected=String(index===i);
   item.setAttribute('aria-selected',String(index===i));
  });
  if(open)position();
 }
 function position(){
  if(!open)return;
  const rect=trigger.getBoundingClientRect(),margin=8,gap=7;
  const spaceBelow=view.innerHeight-rect.bottom-gap-margin;
  const spaceAbove=rect.top-gap-margin;
  const expected=Math.min(320,buttons.length*44+16);
  const above=spaceBelow<expected&&spaceAbove>spaceBelow;
  const available=Math.max(70,Math.min(320,(above?spaceAbove:spaceBelow)));
  menu.style.maxHeight=Math.round(available)+'px';
  menu.style.minWidth=Math.ceil(rect.width)+'px';
  const width=menu.offsetWidth||rect.width;
  menu.style.left=Math.round(Math.max(margin,Math.min(rect.left,view.innerWidth-width-margin)))+'px';
  const top=above?rect.top-gap-menu.offsetHeight:rect.bottom+gap;
  menu.style.top=Math.round(Math.max(margin,top))+'px';
  menu.dataset.side=above?'top':'bottom';
 }
 function show({focus=false,move=0}={}){
  if(open)return;
  ++hideTicket;open=true;
  menu.hidden=false;menu.dataset.state='opening';
  root.dataset.open='true';
  trigger.setAttribute('aria-expanded','true');
  sync();
  position();
  // Trigger layout so the following state change animates from the collapsed pose.
  void menu.offsetHeight;
  menu.dataset.state='open';
  if(focus)buttons[(selectedIndex()+move+buttons.length)%buttons.length].focus();
 }
 function close({restoreFocus=false,immediate=false}={}){
  if(!open&&menu.hidden)return;
  open=false;root.dataset.open='false';
  trigger.setAttribute('aria-expanded','false');
  menu.dataset.state='closed';
  if(restoreFocus)trigger.focus();
  const ticket=++hideTicket;
  if(immediate||reduced()){menu.hidden=true;return;}
  // Short fallback handles browsers that don't dispatch a transitionend.
  view.setTimeout(()=>{if(ticket===hideTicket&&!open)menu.hidden=true;},230);
 }
 function choose(index){
  const choice=choices[index];
  if(!choice)return;
  const changed=select.value!==choice.value;
  select.value=choice.value;
  sync();
  close({restoreFocus:true});
  if(changed)select.dispatchEvent(new view.Event('change',{bubbles:true}));
 }
 trigger.addEventListener('click',()=>open?close():show());
 trigger.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'||event.key==='ArrowUp'||event.key==='Home'||event.key==='End'){
   event.preventDefault();
   if(!open)show();
   const at=machineFilterMoveIndex(selectedIndex(),event.key,buttons.length);
   buttons[at]?.focus();
  }
  if(event.key==='Escape'&&open){event.preventDefault();close();}
 });
 menu.addEventListener('keydown',event=>{
  const index=buttons.indexOf(doc.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();
   buttons[machineFilterMoveIndex(index<0?selectedIndex():index,event.key,buttons.length)]?.focus();
  }else if(event.key==='Escape'){
   event.preventDefault();close({restoreFocus:true});
  }else if(event.key==='Tab'){
   close({immediate:true});
  }
 });
 menu.addEventListener('transitionend',event=>{
  if(event.target===menu&&event.propertyName==='opacity'&&!open)menu.hidden=true;
 });
 function onPointer(event){
  if(open&&!root.contains(event.target)&&!menu.contains(event.target))close();
 }
 function onFocus(event){
  if(open&&!root.contains(event.target)&&!menu.contains(event.target))close();
 }
 function onGlobalKey(event){
  if(event.key==='Escape'&&open){event.preventDefault();close({restoreFocus:true});}
 }
 doc.addEventListener('pointerdown',onPointer);
 doc.addEventListener('focusin',onFocus);
 doc.addEventListener('keydown',onGlobalKey);
 doc.addEventListener('scroll',position,true);
 view.addEventListener('resize',position);
 select.addEventListener('change',sync);
 sync();
 select.setAttribute('aria-hidden','true');
 select.tabIndex=-1;
 root.classList.add('is-enhanced');
 return {
  sync,close,
  destroy(){
   close({immediate:true});
   select.removeEventListener('change',sync);
   doc.removeEventListener('pointerdown',onPointer);
   doc.removeEventListener('focusin',onFocus);
   doc.removeEventListener('keydown',onGlobalKey);
   doc.removeEventListener('scroll',position,true);
   view.removeEventListener('resize',position);
   menu.remove();trigger.remove();
   root.parentNode?.insertBefore(select,root);root.remove();
   select.removeAttribute('aria-hidden');select.removeAttribute('tabindex');
  }
 };
}
