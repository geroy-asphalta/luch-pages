// CTV lookup reads builtin schemes plus user's browser-local catalog overlays.
// This is an administrative demo, not a clinical prescription engine.
import {asDoseText,courseIsBreast} from './dose-zones.mjs';
import {catalogTemplates,catalogTemplateByName} from './ctv-catalog.mjs';

export const ctvGroupFor=diagnosis=>String(diagnosis||'').toUpperCase().slice(0,3);
export const schemesForDiagnosis=(diagnosis,state=null)=>catalogTemplates(state).filter(x=>x.group===ctvGroupFor(diagnosis));
export const schemeByName=(name,state=null)=>catalogTemplateByName(state,name);
export function ctvConflict(diagnosis,ctv,state=null){
 const chosen=schemeByName(ctv,state),code=ctvGroupFor(diagnosis);
 return Boolean(chosen&&code&&chosen.group!==code);
}
export function ctvSuggestion(diagnosis,ctv,{boost=false,state=null}={}){
 const scheme=schemeByName(ctv,state);
 if(!scheme||scheme.group!==ctvGroupFor(diagnosis))return null;
 const fractions=Number(scheme.fractions)||null;
 let zones=scheme.zones.map(z=>({label:z.label,rod:z.rod??null,sod:z.sod??null}));
 if(courseIsBreast(diagnosis)&&boost)zones.push({label:'Интегрированный буст',rod:scheme.boostRod??null,sod:scheme.boostSod??null});
 const doseKnown=zones.every(x=>x.rod!==null&&x.sod!==null);
 const discrepancies=zones.filter(x=>x.rod!==null&&x.sod!==null&&Math.abs(Math.round(x.rod*fractions*1000)/1000-x.sod)>0.005)
  .map(x=>x.label+': расчёт '+(Math.round(x.rod*fractions*1000)/1000)+' Гр, в шаблоне '+x.sod+' Гр');
 const rod=zones.length===1?zones[0].rod:null;
 const sod=zones.length===1?zones[0].sod:null;
 const userModified=Boolean(state?.ctvCatalog?.overrides?.[scheme.id]||(state?.ctvCatalog?.custom||[]).some(x=>x.id===scheme.id));
 return {group:scheme.group,id:scheme.id,name:scheme.name,fractions,rod,sod,zones,boost:Boolean(boost&&scheme.group==='C50'),
  rodText:zones.map(z=>asDoseText(z.rod)).join(' / '),
  sodText:zones.map(z=>asDoseText(z.sod)).join(' / '),
  doseKnown,discrepancies,source:userModified?'Локальный справочник CTV':'ЛУЧ / Справочник CTV',
  sodMethod:doseKnown?(userModified?'Значения зон из локального справочника CTV':'РОД × число фракций'):null};
}
