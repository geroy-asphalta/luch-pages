// Administrative observation of scheduled HLT infusions. Past dates are
// "assumed" for the running count, NOT verified treatment delivery.
// Explicit user decisions are stored separately from the chemotherapy plan.
const isInfusion=event=>event?.type==='chemo'&&event?.source==='hlt';
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 !Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const copy=value=>JSON.parse(JSON.stringify(value));

export function chemoAdministrationState(event,today){
 if(!isInfusion(event))return 'untracked';
 if(event.status==='cancelled')return 'cancelled';
 if(event.status==='administered'||event.status==='given')return 'confirmed';
 if(event.status!=='planned')return 'untracked';
 if(event.administrationOutcome==='not-given')return 'not-given';
 if(event.administrationOutcome==='given')return 'confirmed';
 return validDay(today)&&validDay(event.date)&&event.date<today?'assumed':'planned';
}

export function chemoAdministrationSummary(state,courseId,today){
 const course=(state.patients||[]).find(item=>item.id===courseId);
 const events=(state.events||[]).filter(event=>event.patientId===courseId&&isInfusion(event));
 const summary={total:Number(course?.chemo?.count)||events.length,scheduled:events.length,
  counted:0,completed:0,assumed:0,confirmed:0,notGiven:0,cancelled:0,upcoming:0};
 for(const event of events){
  const kind=chemoAdministrationState(event,today);
  if(kind==='assumed'){summary.assumed++;summary.counted++;}
  if(kind==='confirmed'){summary.confirmed++;summary.counted++;}
  if(kind==='not-given')summary.notGiven++;
  if(kind==='cancelled')summary.cancelled++;
  if(kind==='planned')summary.upcoming++;
 }
 // Calendar-completed and explicitly confirmed administrations are both
 // counted as completed for scheduling, never as verified clinical records.
 summary.completed=summary.assumed+summary.confirmed;
 return summary;
}

// After the scheduled day starts, the doctor can explicitly record that an
// infusion was not delivered or confirm actual delivery. Neither changes the
// course plan, later dates, laboratory referrals, or any radiotherapy session.
export function chemoAdministrationDraft(state,{eventId,decision}={},today){
 const event=(state.events||[]).find(item=>item.id===eventId&&isInfusion(item));
 if(!event)return {state,changed:false,error:'Введение ХТ не найдено.'};
 if(event.status!=='planned')
  return {state,changed:false,error:'Фактическую отметку можно менять только у запланированной ХТ.'};
 if(!['not-given','given','reset'].includes(decision))
  return {state,changed:false,error:'Неизвестное действие с отметкой ХТ.'};
 if(!validDay(today)||!validDay(event.date))
  return {state,changed:false,error:'Не определена корректная дата ХТ.'};
 if(decision!=='reset'&&event.date>today)
  return {state,changed:false,error:'Будущую капельницу нельзя заранее отмечать как проведённую или пропущенную. Используй отмену плана.'};
 if(decision==='reset'&&!['not-given','given'].includes(event.administrationOutcome))
  return {state,changed:false,error:'У введения нет ручной отметки для отмены.'};
 if(decision!=='reset'&&event.administrationOutcome===decision)
  return {state,changed:false,error:'Эта отметка ХТ уже установлена.'};
 const draft=copy(state);
 const updated=draft.events.find(item=>item.id===eventId);
 if(decision==='reset'){
  delete updated.administrationOutcome;
  delete updated.administrationMarkedAt;
 }else{
  updated.administrationOutcome=decision;
  updated.administrationMarkedAt=new Date().toISOString();
 }
 const descriptions={'not-given':'ХТ не проводилась','given':'ХТ проведена — подтверждено вручную',
  reset:'Снята ручная отметка о проведении ХТ'};
 (draft.audit??=[]).push({date:new Date().toISOString(),kind:'chemo-administration-'+decision,
  patientId:event.patientId,day:event.date,
  detail:'ХТ №'+(Number(event.chemoIndex)+1)+' · '+descriptions[decision]});
 return {state:draft,changed:true,outcome:chemoAdministrationState(updated,today)};
}
