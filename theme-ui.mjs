// Presentation-only theme preferences; intentionally separate from patient data.
export const THEME_STORAGE_KEY='luch-theme-preference';
export const THEME_CHOICES=['light','dark','system'];
export const normalizeThemePreference=value=>THEME_CHOICES.includes(value)?value:'light';
export const effectiveTheme=(preference,systemDark=false)=>
 normalizeThemePreference(preference)==='system'?(systemDark?'dark':'light'):normalizeThemePreference(preference);

export function setupThemeUI({root=document.documentElement,button=document.getElementById('theme-toggle'),
 menu=document.getElementById('theme-menu'),doc=document,storage=window.localStorage,
 media=window.matchMedia('(prefers-color-scheme: dark)')}={}){
 if(!button||!menu)return null;
 let preference='light';
 try{preference=normalizeThemePreference(storage?.getItem(THEME_STORAGE_KEY));}catch{}
 const options=[...menu.querySelectorAll('[data-theme-preference]')];
 const labels={light:'Светлая',dark:'Тёмная',system:'Системная'};
 function apply(){
  const resolved=effectiveTheme(preference,Boolean(media?.matches));
  root.dataset.theme=resolved;
  root.style.colorScheme=resolved;
  button.dataset.currentTheme=resolved;
  button.setAttribute('aria-label','Тема оформления: '+labels[preference]+'. Выбрать оформление');
  button.setAttribute('title','Тема: '+labels[preference]);
  for(const option of options)option.setAttribute('aria-pressed',String(option.dataset.themePreference===preference));
  const meta=doc.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',resolved==='dark'?'#111a23':'#172b38');
 }
 function openMenu(){
  menu.hidden=false;
  button.setAttribute('aria-expanded','true');
 }
 function closeMenu({focus=false}={}){
  menu.hidden=true;
  button.setAttribute('aria-expanded','false');
  if(focus)button.focus({preventScroll:true});
 }
 function choose(value){
  preference=normalizeThemePreference(value);
  try{storage?.setItem(THEME_STORAGE_KEY,preference);}catch{}
  apply();closeMenu({focus:true});
 }
 button.addEventListener('click',()=>menu.hidden?openMenu():closeMenu());
 menu.addEventListener('click',event=>{
  const option=event.target.closest('[data-theme-preference]');
  if(option&&menu.contains(option))choose(option.dataset.themePreference);
 });
 doc.addEventListener('pointerdown',event=>{
  if(!menu.hidden&&!menu.contains(event.target)&&!button.contains(event.target))closeMenu();
 });
 doc.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!menu.hidden){event.preventDefault();closeMenu({focus:true});}
 });
 if(media){
  const changed=()=>{if(preference==='system')apply();};
  if(typeof media.addEventListener==='function')media.addEventListener('change',changed);
  else if(typeof media.addListener==='function')media.addListener(changed);
 }
 apply();
 return {getPreference:()=>preference,choose,apply,openMenu,closeMenu};
}
