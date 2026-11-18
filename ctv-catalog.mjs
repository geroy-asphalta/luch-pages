// User-editable CTV catalog stored inside the synthetic LUCH browser state.
// Built-in reference schemes remain immutable. User edits/creations are local overlays.
import {CTV_SCHEMES,ICD_C_GROUP_LOOKUP} from './clinical-dictionaries.mjs';

const copy=v=>JSON.parse(JSON.stringify(v));
const rnd=n=>Math.round((n+Number.EPSILON)*1000)/1000;
const number=(v,max)=>{if(v===null||v===undefined||String(v).trim()==='')return null;
 const str=String(v).trim().replace(',','.');
 if(!/^\d+(?:\.\d+)?$/.test(str))return NaN;
 const n=Number(str);return Number.isFinite(n)&&n>0&&n<=max?n:NaN;
};
const safe=(v,max)=>String(v??'').trim().slice(0,max);
export function emptyCatalog(){return {overrides:{},custom:[],hidden:[],aliases:{}};}
const ensureCatalog=s=>{
 s.ctvCatalog??=emptyCatalog();
 s.ctvCatalog.overrides??={};s.ctvCatalog.custom??=[];s.ctvCatalog.hidden??=[];s.ctvCatalog.aliases??={};
 return s.ctvCatalog;
};
export function baseTemplates(){
 return CTV_SCHEMES.map((s,i)=>{
  const zones=Array.isArray(s.zones)&&s.zones.length?s.zones.map(z=>({label:z.label,rod:z.rod??null,sod:z.rod==null?null:rnd(z.rod*s.fractions)})):
   [{label:s.group==='C50'?'Основная зона':'Зона облучения',rod:s.dose??null,sod:s.dose==null?null:rnd(s.dose*s.fractions)}];
  return {id:'base-'+i,group:s.group,name:s.name,fractions:Number(s.fractions),zones,
   boostRod:s.group==='C50'?3.2:null,boostSod:s.group==='C50'?48:null,builtin:true};
 });
}
export function catalogTemplates(state=null,{includeHidden=false}={}){
 const cfg=state?.ctvCatalog||emptyCatalog();
 const all=baseTemplates().map(t=>cfg.overrides?.[t.id]?{...copy(cfg.overrides[t.id]),builtin:true}:t)
  .concat((cfg.custom||[]).map(t=>({...copy(t),builtin:false})));
 return includeHidden?all:all.filter(x=>!(cfg.hidden||[]).includes(x.id));
}
export function catalogTemplateById(state,id){
 return catalogTemplates(state,{includeHidden:true}).find(x=>x.id===id)||null;
}
export function catalogTemplateByName(state,name){
 const text=safe(name,100);if(!text)return null;
 const all=catalogTemplates(state,{includeHidden:true});
 const active=catalogTemplates(state).find(x=>x.name===text);
 if(active)return active;
 const other=all.find(x=>x.name===text);if(other)return other;
 const alias=state?.ctvCatalog?.aliases?.[text];
 if(alias)return all.find(x=>x.id===alias)||null;
 return baseTemplates().find(x=>x.name===text)||null;
}
function parseTemplate(input,id,builtin){
 const group=safe(input.group,3).toUpperCase().replace(/^С/,'C');
 const name=safe(input.name,100),fractions=Number(input.fractions);
 if(!ICD_C_GROUP_LOOKUP.has(group))return {error:'Выбери существующую основную группу МКБ-10 категории C.'};
 if(name.length<2)return {error:'Название CTV должно содержать хотя бы два символа.'};
 if(!Number.isInteger(fractions)||fractions<1||fractions>100)return {error:'Укажи от 1 до 100 фракций.'};
 if(!Array.isArray(input.zones)||input.zones.length<1||input.zones.length>4)return {error:'У схемы должна быть от одной до четырёх зон.'};
 const zones=[];
 for(let i=0;i<input.zones.length;i++){
  const z=input.zones[i],label=safe(z.label,80);
  if(label.length<2)return {error:'У каждой зоны должно быть название (минимум два символа).'};
  const rod=number(z.rod,30),sod=number(z.sod,500);
  if(Number.isNaN(rod)||Number.isNaN(sod))return {error:'Дозы должны быть положительными числами: РОД до 30 Гр, СОД до 500 Гр. Поле можно оставить пустым.'};
  zones.push({label,rod,sod});
 }
 const boostRod=group==='C50'?number(input.boostRod,30):null;
 const boostSod=group==='C50'?number(input.boostSod,500):null;
 if(Number.isNaN(boostRod)||Number.isNaN(boostSod))return {error:'Параметры буста должны быть положительными числами в допустимых пределах.'};
 if(group==='C50'&&zones.length>=4)return {error:'Для C50 оставь не более трёх основных зон, чтобы можно было добавить буст.'};
 return {entry:{id,group,name,fractions,zones,boostRod,boostSod,builtin}};
}
export function saveCatalogTemplateDraft(state,input,editingId=null){
 const s=copy(state),cfg=ensureCatalog(s);
 const existing=editingId?catalogTemplateById(s,editingId):null;
 if(editingId&&!existing)return {error:'Шаблон не найден. Обнови справочник.'};
 const id=existing?.id||'custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
 const parsed=parseTemplate(input,id,Boolean(existing?.builtin));
 if(parsed.error)return parsed;
 const current=catalogTemplates(s,{includeHidden:true});
 if(current.some(t=>t.name.toLocaleLowerCase('ru-RU')===parsed.entry.name.toLocaleLowerCase('ru-RU')&&t.id!==id))
   return {error:'CTV с таким названием уже существует. Укажи уникальное имя.'};
 if(!existing&&s.ctvCatalog.aliases?.[parsed.entry.name])
   return {error:'Название ранее использовалось другой схемой. Выбери новое имя, чтобы сохранить историю.'};
 const previous=existing?.name;
 if(existing?.builtin)cfg.overrides[id]=parsed.entry;
 else if(existing){
  const index=cfg.custom.findIndex(x=>x.id===id);
  if(index<0)return {error:'Пользовательский CTV не найден.'};
  cfg.custom[index]=parsed.entry;
 }else cfg.custom.push(parsed.entry);
 if(previous&&previous!==parsed.entry.name)cfg.aliases[previous]=id;
 (s.audit??=[]).push({date:new Date().toISOString(),kind:existing?'ctv-update':'ctv-create',detail:parsed.entry.group+' · '+parsed.entry.name,patientId:'Справочник CTV'});
 return {state:s,entry:parsed.entry,previous:existing||null};
}
export function setCatalogTemplateHiddenDraft(state,id,hidden){
 const s=copy(state),cfg=ensureCatalog(s);
 const t=catalogTemplateById(s,id);if(!t)return {error:'CTV не найден.'};
 cfg.hidden=cfg.hidden.filter(x=>x!==id);
 if(hidden)cfg.hidden.push(id);
 (s.audit??=[]).push({date:new Date().toISOString(),kind:hidden?'ctv-hide':'ctv-show',detail:t.group+' · '+t.name,patientId:'Справочник CTV'});
 return {state:s,entry:t};
}
export function resetBuiltinTemplateDraft(state,id){
 const s=copy(state),cfg=ensureCatalog(s);
 if(!baseTemplates().some(t=>t.id===id))return {error:'Исходная схема не найдена.'};
 const before=catalogTemplateById(s,id);
 delete cfg.overrides[id];
 cfg.hidden=cfg.hidden.filter(x=>x!==id);
 for(const [name,alias] of Object.entries(cfg.aliases))if(alias===id)delete cfg.aliases[name];
 (s.audit??=[]).push({date:new Date().toISOString(),kind:'ctv-reset',detail:before?.name||id,patientId:'Справочник CTV'});
 return {state:s,entry:catalogTemplateById(s,id)};
}
export function templateDoseDiscrepancies(entry){
 if(!entry||!Array.isArray(entry.zones))return [];
 const pairs=[...entry.zones];
 if(entry.group==='C50'&&entry.boostRod!==null&&entry.boostSod!==null)pairs.push({label:'Интегрированный буст',rod:entry.boostRod,sod:entry.boostSod});
 return pairs.filter(z=>z.rod!=null&&z.sod!=null&&Math.abs(rnd(z.rod*entry.fractions)-z.sod)>0.005)
  .map(z=>z.label+': РОД × фракции = '+rnd(z.rod*entry.fractions)+' Гр, указано СОД '+z.sod+' Гр');
}
