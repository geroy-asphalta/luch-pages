// Display and parse *user-entered* administrative dose fields in the synthetic LUCH demo.
// These are NOT a prescribed radiation plan. Slash-separated values represent separate targets.
export const asDoseText=value=>value==null?'':Number(value).toLocaleString('ru-RU',{maximumFractionDigits:3});
export const courseIsBreast=(diagnosis)=>String(diagnosis||'').toUpperCase().slice(0,3)==='C50';
export const courseIsProstLn=ctv=>String(ctv||'').trim()==='Prost + LN';

export function doseZoneLabels(diagnosis,ctv,boost=false,templateZones=null){
 if(Array.isArray(templateZones)&&templateZones.length){
   const labels=templateZones.map(z=>String(z.label));
   if(courseIsBreast(diagnosis)&&boost)labels.push('Интегрированный буст');
   return labels;
 }
 if(courseIsProstLn(ctv)&&String(diagnosis||'').toUpperCase().slice(0,3)==='C61')
   return ['Лимфоузлы','Простата и семенные пузырьки'];
 if(courseIsBreast(diagnosis)&&boost)
   return ['Основная зона','Интегрированный буст'];
 return ['Зона облучения'];
}
export function parseDoseInput(raw,label,max,expectedCount=1){
 const text=String(raw??'').trim();
 if(!text)return {values:[]};
 const pieces=text.split('/').map(x=>x.trim());
 if(pieces.length!==expectedCount)return {error:label+': для этого CTV необходимо '+expectedCount+' значение(я) в порядке зон, через «/».'};
 const values=[];
 for(const part of pieces){
   if(!/^\d+(?:[.,]\d+)?$/.test(part))return {error:label+': укажи только числа, разделяя зоны знаком «/».'};
   const n=Number(part.replace(',','.'));
   if(!Number.isFinite(n)||n<=0||n>max)return {error:label+': каждая доза должна быть больше нуля и не более '+max+' Гр.'};
   values.push(n);
 }
 return {values};
}
export function fieldText(course,key){
 if(Array.isArray(course.doseZones)&&course.doseZones.length>1){
  const values=course.doseZones.map(z=>asDoseText(z[key]));
  return values.every(v=>v==='')?'':values.join(' / ');
 }
 return asDoseText(key==='rod'?course.dose:course.sod);
}
export function zoneSummary(course){
 if(!Array.isArray(course.doseZones)||course.doseZones.length<2)return [];
 return course.doseZones.map(z=>({label:z.label,rod:z.rod,sod:z.sod}));
}
export function cumulativeSessionLabel(course,n){
 if(course.displayDose&&Array.isArray(course.doseZones)&&course.doseZones.length>1){
   const values=course.doseZones.map(z=>z.rod);
   if(values.every(v=>typeof v==='number'&&v>0))return values.map(v=>asDoseText(Math.round(v*n*1000)/1000)).join('/');
 }
 if(course.displayDose&&typeof course.dose==='number'&&course.dose>0)
   return asDoseText(Math.round(course.dose*n*1000)/1000);
 return String(n);
}
