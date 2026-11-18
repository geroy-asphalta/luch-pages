// Shared, persistent order for people. Course dates and clinical records are never changed.
const validOrder=value=>Number.isSafeInteger(value)&&value>=0;
const rank=(person,index)=>validOrder(person.displayOrder)?person.displayOrder:index;

export function orderedPersonIds(state){
 return (state.people||[]).map((person,index)=>({id:person.id,index,order:rank(person,index)}))
  .sort((a,b)=>a.order-b.order||a.index-b.index).map(x=>x.id);
}

// Called on a cloned state during migration: existing array order is the historical fallback.
export function ensurePatientOrder(state){
 const positions=new Map(orderedPersonIds(state).map((id,index)=>[id,index]));
 for(const person of state.people||[])person.displayOrder=positions.get(person.id);
 return state;
}

const statusText=status=>({
 active:'На лечении',planned:'Ожидает начала',completed:'Завершён',archived:'В архиве'
})[status]||status||'';
const nameCompare=(a,b)=>String(a??'').localeCompare(String(b??''),'ru');
export function comparePatientEntries(a,b,sort='order',positions=new Map()){
 const byOrder=(positions.get(a.personId??a.id)??Number.MAX_SAFE_INTEGER)-
               (positions.get(b.personId??b.id)??Number.MAX_SAFE_INTEGER);
 if(sort==='order')
  return byOrder||String(a.start||'').localeCompare(String(b.start||''))||
   nameCompare(a.courseName,b.courseName)||nameCompare(a.courseId??a.id,b.courseId??b.id);
 if(sort==='start-new')
  return String(b.start||'').localeCompare(String(a.start||''))||nameCompare(a.name,b.name)||byOrder;
 if(sort==='diagnosis')
  return nameCompare(a.diagnosis,b.diagnosis)||nameCompare(a.name,b.name)||byOrder;
 if(sort==='machine')
  return nameCompare(a.machine,b.machine)||nameCompare(a.name,b.name)||byOrder;
 if(sort==='status')
  return nameCompare(statusText(a.status),statusText(b.status))||nameCompare(a.name,b.name)||byOrder;
 return nameCompare(a.name,b.name)||nameCompare(a.courseName,b.courseName)||
  nameCompare(a.id,b.id)||byOrder;
}

export function reorderPatientDraft(state,sourceId,targetId,placement='before'){
 if(!['before','after'].includes(placement))return {error:'Недопустимая позиция пациента.'};
 const next=JSON.parse(JSON.stringify(state));
 ensurePatientOrder(next);
 const ids=orderedPersonIds(next);
 if(!ids.includes(sourceId)||!ids.includes(targetId))
  return {error:'Пациент для перемещения не найден.'};
 if(sourceId===targetId)return {state,changed:false};
 const reordered=ids.filter(id=>id!==sourceId);
 const index=reordered.indexOf(targetId)+(placement==='after'?1:0);
 reordered.splice(index,0,sourceId);
 if(reordered.every((id,i)=>id===ids[i]))return {state,changed:false};
 const positions=new Map(reordered.map((id,i)=>[id,i]));
 for(const person of next.people)person.displayOrder=positions.get(person.id);
 (next.audit??=[]).push({date:new Date().toISOString(),kind:'patient-reorder',
   patientId:sourceId,detail:'Изменён общий порядок пациентов'});
 return {state:next,changed:true};
}
