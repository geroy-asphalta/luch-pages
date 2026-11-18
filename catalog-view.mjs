// Compact catalog presentation helpers. No clinical rules or stored data changes.
import {ICD_C_GROUPS} from './clinical-dictionaries.mjs';
import {asDoseText} from './dose-zones.mjs';

const groupNames=new Map(ICD_C_GROUPS.map(g=>[g.code,g.name]));
const shortNames=new Map([
 ['C50','Молочная железа'],
 ['C61','Предстательная железа'],
 ['C67','Мочевой пузырь']
]);

export function catalogGroupName(code){
 return shortNames.get(code)||groupNames.get(code)||'Группа МКБ-10';
}
export function catalogDoseSummary(template,key){
 return (template.zones||[]).map(zone=>zone[key]==null?'—':asDoseText(zone[key])).join(' / ')||'—';
}
export function catalogTemplateMatches(template,query){
 const term=String(query||'').trim().toLocaleLowerCase('ru-RU');
 if(!term)return true;
 const fields=[
  template.group,catalogGroupName(template.group),template.name,template.fractions,
  ...template.zones.flatMap(zone=>[zone.label,zone.rod,zone.sod]),
  template.boostRod,template.boostSod
 ];
 return fields.map(value=>String(value??'')).join(' ').toLocaleLowerCase('ru-RU').includes(term)||
  [catalogDoseSummary(template,'rod'),catalogDoseSummary(template,'sod')]
   .some(value=>value.toLocaleLowerCase('ru-RU').includes(term));
}
export function catalogGroupedTemplates(templates,query=''){
 const grouped=new Map();
 for(const template of templates){
  if(!catalogTemplateMatches(template,query))continue;
  if(!grouped.has(template.group))grouped.set(template.group,[]);
  grouped.get(template.group).push(template);
 }
 // Code order keeps user-created C20/C44 beside other ICD categories,
 // rather than hiding them after the original three built-in groups.
 return [...grouped].sort(([a],[b])=>a.localeCompare(b,'ru'))
  .map(([code,items])=>({code,name:catalogGroupName(code),items}));
}
