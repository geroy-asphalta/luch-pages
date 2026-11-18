import {cumulativeSessionLabel} from './dose-zones.mjs';
import {isWorkingDay} from './work-calendar.mjs';
export const MACHINES=['Halcyon-kV','Halcyon-MV','TrueBeam 1','TrueBeam 2','Gulmay'];
export const iso=d=>d.toISOString().slice(0,10);
export const day=d=>new Date(d+'T00:00:00Z');
export function addDays(d,n){const v=day(d);v.setUTCDate(v.getUTCDate()+n);return iso(v)}
export function monthShift(m,n){const [y,k]=m.split('-').map(Number);return iso(new Date(Date.UTC(y,k-1+n,1))).slice(0,7)}
export function datesForMonth(month){const a=month+'-01',off=(day(a).getUTCDay()+6)%7;return Array.from({length:42},(_,i)=>addDays(a,i-off))}
export const isWeekend=d=>[0,6].includes(day(d).getUTCDay());
export const pretty=d=>d.slice(8,10)+'.'+d.slice(5,7);
export function seed(){
 const raw=[
 ['P-001','Пациент А','C67','','Halcyon-kV',20,1,false,'2026-10-20'],
 ['P-002','Пациент Б','C61','Prost bed','Halcyon-kV',20,2.75,true,'2026-10-19'],
 ['P-003','Пациент В','C61','Prost + LN','TrueBeam 2',28,1,false,'2026-10-05'],
 ['P-004','Пациент Г','C67','','TrueBeam 1',20,1,false,'2026-11-03'],
 ['P-005','Пациент Д','C67.2','Blad 2.75 Gy','Halcyon-kV',20,2.75,true,'2026-11-02'],
 ['P-006','Пациент Е','C50.4','МЖ Л','TrueBeam 2',15,1,false,'2026-11-09'],
 ['P-007','Пациент Ж','C50.9','МЖ П LN','TrueBeam 1',15,1,false,'2026-11-11'],
 ['P-008','Пациент З','C50.2','Рубец П','Halcyon-kV',15,1,false,'2026-10-26'],
 ['P-009','Пациент И','C50.1','Рубец Л LN','TrueBeam 2',15,1,false,'2026-11-16'],
 ['P-010','Пациент К','C67.2','Blad 2Gy','TrueBeam 2',33,1,false,'2026-10-19']
 ];
 const patients=raw.map(([id,name,diagnosis,ctv,machine,total,dose,displayDose,start])=>({id,name,diagnosis,ctv,machine,total,dose,displayDose,start,status:'active'}));
 patients.push({id:'P-011',name:'Пациент Л',diagnosis:'C61',ctv:'Prost 3Gy',machine:'TrueBeam 1',total:20,dose:1,displayDose:false,start:'2026-10-05',status:'completed'});
 patients.push({id:'P-012',name:'Пациент М',diagnosis:'C50.1',ctv:'МЖ П',machine:'Halcyon-kV',total:15,dose:1,displayDose:false,start:'2026-10-19',status:'completed'});
 const events=[];let i=0;
 const add=(patientId,date,type,status)=>events.push({id:'e'+(++i),patientId,date,type,status});
 [['P-001','2026-10-29'],['P-002','2026-11-05'],['P-003','2026-10-28'],['P-003','2026-10-29'],['P-008','2026-10-28'],['P-008','2026-10-29'],['P-007','2026-11-30'],['P-004','2026-11-30']].forEach(([p,d])=>add(p,d,'skip','active'));
 [['P-004','2026-11-02','todo'],['P-004','2026-11-09','issued'],['P-004','2026-11-16','todo'],['P-006','2026-11-11','todo'],['P-009','2026-11-11','todo'],['P-007','2026-11-18','issued'],['P-003','2026-10-30','todo'],['P-003','2026-11-03','todo']].forEach(([p,d,s])=>add(p,d,'lab',s));
 return {version:2,productionRegion:'RU',patients,events,calendarDays:[],breakdowns:[],transfers:[],maintenance:[{id:'m1',date:'2026-10-27',machine:'Halcyon-kV'},{id:'m2',date:'2026-11-12',machine:'Halcyon-MV'},{id:'m3',date:'2026-11-25',machine:'Halcyon-kV'}],audit:[]};
}

export function machineAt(patient,state,date){
 const changes=(state.transfers||[]).filter(t=>t.patientId===patient.id&&t.date<=date).sort((a,b)=>a.date.localeCompare(b.date));
 return changes.at(-1)?.to||patient.machine;
}
export function breakdownAt(state,machine,date){
 return (state.breakdowns||[]).find(b=>b.machine===machine&&b.start<=date&&(!b.resume||date<b.resume))||null;
}
export function schedule(patient,state,until){
 const out=new Map();
 if(!['active','planned'].includes(patient.status)||!patient.start||patient.start>until)return out;
 const skips=new Set(state.events.filter(x=>x.patientId===patient.id&&x.status==='active'&&x.type==='skip').map(x=>x.date));
 let n=0,d=patient.start,limit=0;
 while(d<=until&&n<patient.total&&limit++<900){
   const machine=machineAt(patient,state,d);
   const outage=breakdownAt(state,machine,d);
   const completed=outage?.start===d&&(outage.completed||[]).includes(patient.id);
   const maintenance=(state.maintenance||[]).find(x=>x.machine===machine&&x.date===d);
   const service=Boolean(maintenance);
   const morningFinal=Boolean(maintenance?.finalBeforeService?.includes(patient.id))&&n===patient.total-1&&
      isWorkingDay(state,d)&&!skips.has(d)&&!outage;
   if(outage&&!completed)out.set(d,{kind:'breakdown',label:'⚠',machine});
   else if(completed&&isWorkingDay(state,d)){
     n++;const val=cumulativeSessionLabel(patient,n);
     out.set(d,{kind:'session',label:val,n,final:n===patient.total,delivered:true,machine});
   } else if(skips.has(d))out.set(d,{kind:'skip',label:'Х',machine});
   else if(morningFinal){
     n++;out.set(d,{kind:'session',label:cumulativeSessionLabel(patient,n),n,final:true,
       beforeMaintenance:true,machine});
   } else if(service)out.set(d,{kind:'maintenance',label:'⚙',machine});
   else if(isWorkingDay(state,d)){
     n++;const val=cumulativeSessionLabel(patient,n);
     out.set(d,{kind:'session',label:val,n,final:n===patient.total,machine});
   }
   d=addDays(d,1);
 }
 return out;
}
const clone=s=>JSON.parse(JSON.stringify(s));
const validDate=d=>typeof d==='string'&&/^\d{4}-\d\d-\d\d$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const audit=(state,kind,detail)=>{(state.audit??=[]).push({date:new Date().toISOString(),kind,...detail});};
export function breakdownDraft(state,{machine,start,resume=null,completed=[]}){
 if(!MACHINES.includes(machine)||!validDate(start)||resume!==null&&(!validDate(resume)||resume<=start))return {error:'Проверь аппарат и даты. День восстановления должен быть позже дня поломки.'};
 if((state.breakdowns||[]).some(b=>b.machine===machine&&start<(b.resume||'9999-12-31')&&b.start<(resume||'9999-12-31')))return {error:'У этого аппарата уже есть поломка на выбранный период.'};
 const possible=state.patients.filter(p=>['active','planned'].includes(p.status)&&!state.people?.find(person=>person.id===p.personId)?.archived&&machineAt(p,state,start)===machine&&schedule(p,state,start).get(start)?.kind==='session').map(p=>p.id);
 const chosen=[...new Set(completed)];
 if(chosen.some(id=>!possible.includes(id)))return {error:'Можно отметить только сеансы, запланированные на этот день.'};
 const next=clone(state),b={id:'b'+Date.now()+'-'+Math.random().toString(36).slice(2,7),machine,start,resume,completed:chosen};
 (next.breakdowns??=[]).push(b);
 audit(next,'breakdown',{day:start,machine,detail:'Регистрация поломки'});
 return {state:next,entry:b};
}

export function breakdownUpdate(state,id,resume){
 const source=(state.breakdowns||[]).find(x=>x.id===id);
 if(!source)return {error:'Поломка не найдена'};
 if(resume!==null&&(!validDate(resume)||resume<=source.start))return {error:'Дата восстановления должна быть позже даты поломки.'};
 if((state.breakdowns||[]).some(b=>b.id!==id&&b.machine===source.machine&&source.start<(b.resume||'9999-12-31')&&b.start<(resume||'9999-12-31')))return {error:'Новое время простоя пересекается с другой поломкой этого аппарата.'};
 const next=clone(state),item=next.breakdowns.find(b=>b.id===id);
 item.resume=resume;
 audit(next,'breakdown-update',{day:item.start,machine:item.machine,detail:resume?'Дата восстановления '+resume:'Восстановление пока неизвестно'});
 return {state:next,entry:item};
}
export function breakdownRemove(state,id){
 const next=clone(state),item=(next.breakdowns||[]).find(x=>x.id===id);
 if(!item)return {error:'Поломка не найдена'};
 next.breakdowns=next.breakdowns.filter(x=>x.id!==id);
 audit(next,'breakdown-remove',{day:item.start,machine:item.machine,detail:'Отмена поломки'});
 return {state:next};
}
export function transferDraft(state,{patientId,to,date}){
 const patient=state.patients.find(p=>p.id===patientId&&['active','planned'].includes(p.status)&&!state.people?.find(person=>person.id===p.personId)?.archived);
 if(!patient||!patient.start||!MACHINES.includes(to)||!validDate(date)||date<patient.start)return {error:'Проверь пациента, аппарат и дату. Для перевода необходимо сначала указать начало курса ЛТ.'};
 const from=machineAt(patient,state,date);
 if(from===to)return {error:'На эту дату уже назначен выбранный аппарат.'};
 if((state.transfers||[]).some(t=>t.patientId===patientId&&t.date===date))return {error:'На эту дату уже зарегистрирован перевод.'};
 const next=clone(state);
 const transfer={id:'t'+Date.now()+'-'+Math.random().toString(36).slice(2,7),patientId,from,to,date};
 (next.transfers??=[]).push(transfer);
 if((next.breakdowns||[]).some(b=>(b.completed||[]).includes(patientId)&&machineAt(patient,next,b.start)!==b.machine))return {error:'Нельзя менять аппарат уже отмеченного проведённого сеанса. Выбери дату позднее.'};
 audit(next,'transfer',{day:date,patientId,detail:from+' → '+to});
 return {state:next,entry:transfer};
}
export function transferRemove(state,id){
 const next=clone(state),t=(next.transfers||[]).find(x=>x.id===id);
 if(!t)return {error:'Перевод не найден'};
 next.transfers=next.transfers.filter(x=>x.id!==id);
 const patient=next.patients.find(p=>p.id===t.patientId);
 if((next.breakdowns||[]).some(b=>(b.completed||[]).includes(t.patientId)&&machineAt(patient,next,b.start)!==b.machine))return {error:'Нельзя отменить перевод: это изменит аппарат проведённого сеанса.'};
 audit(next,'transfer-remove',{day:t.date,patientId:t.patientId,detail:'Отмена '+t.from+' → '+t.to});
 return {state:next};
}
export function previewChanges(before,after,fromDate){
 const until=addDays(fromDate,120);
 return before.patients.filter(p=>['active','planned'].includes(p.status)&&!before.people?.find(person=>person.id===p.personId)?.archived).map(p=>{
  const old=schedule(p,before,until),updated=schedule(p,after,until);
  const days=m=>[...m].filter(([d,c])=>d>=fromDate&&c.kind==='session').map(([d])=>d);
  const oldDays=days(old),newDays=days(updated);
  const oldMachine=machineAt(p,before,fromDate),newMachine=machineAt(p,after,fromDate);
  const delivered=updated.get(fromDate)?.delivered||false;
  const changed=oldDays.join('|')!==newDays.join('|')||oldMachine!==newMachine||delivered;
  return {id:p.id,name:p.name,oldNext:oldDays[0]||null,newNext:newDays[0]||null,oldCount:oldDays.length,newCount:newDays.length,oldMachine,newMachine,delivered,changed};
 }).filter(x=>x.changed);
}

export const labAt=(state,id,date)=>state.events.find(e=>e.patientId===id&&e.date===date&&e.type==='lab'&&e.status!=='cancelled')?.status||null;
export function weekBounds(date){
 if(!validDate(date))return null;
 const shift=(day(date).getUTCDay()+6)%7;
 const start=addDays(date,-shift);
 return {start,end:addDays(start,6)};
}
// Administrative bulk marking for an explicitly selected week only. No clinical decisions.
export function issueWeekDraft(state,date){
 const week=weekBounds(date);
 if(!week)return {error:'Сначала выбери дату недели в календаре.'};
 const next=clone(state),entries=[];
 const eligible=new Set(next.patients.filter(p=>['active','planned'].includes(p.status)&&!next.people?.find(x=>x.id===p.personId)?.archived).map(p=>p.id));
 for(const e of next.events){
   if(e.type!=='lab'||e.status!=='todo'||e.date<week.start||e.date>week.end||!eligible.has(e.patientId))continue;
   const p=next.patients.find(p=>p.id===e.patientId);
   entries.push({patientId:e.patientId,patientName:p?.name||e.patientId,courseName:p?.courseName||'Курс',date:e.date});
   e.issueRestore='todo';
   e.status='issued';
   (next.audit??=[]).push({date:new Date().toISOString(),patientId:e.patientId,day:e.date,kind:'issue-week',old:'todo',newStatus:'issued',detail:'Массовая выдача за '+week.start+' — '+week.end});
 }
 return {state:next,...week,changed:entries.length,entries};
}
export function action(state,selected,kind){
 const next=clone(state);let changed=0,skipped=0,assigned=0,cancelled=0,issued=0,issueUndone=0;
 const unique=new Set();
 for(const {patientId,date} of selected){
   const k=patientId+'|'+date;if(unique.has(k))continue;unique.add(k);
   const p=next.patients.find(x=>x.id===patientId&&['active','planned'].includes(x.status)&&!next.people?.find(person=>person.id===x.personId)?.archived);
   if(!p){skipped++;continue}
   const type=['lab','lab-assign','lab-remove','issue'].includes(kind)?'lab':'skip';
   const existing=next.events.find(e=>e.patientId===patientId&&e.date===date&&e.type===type);
   const old=existing?.status||'none';let newStatus=null;
   if(['lab','lab-assign'].includes(kind)&&(!existing||old==='cancelled'))newStatus='todo';
   else if(['lab','lab-remove'].includes(kind)&&old==='todo')newStatus='cancelled';
   // A selected cell toggles a referral between issued and the status it had beforehand.
   if(kind==='issue'&&old==='issued')newStatus=existing?.issueRestore||'todo'; // Legacy entries were preassigned.
   else if(kind==='issue'&&['none','cancelled','todo'].includes(old))newStatus='issued';
   if(kind==='skip'&&old==='active')newStatus='cancelled';
   else if(kind==='skip'&&(!existing||old==='cancelled')){
     const planned=schedule(p,next,date).get(date);
     if(planned?.kind==='session'&&!planned.delivered)newStatus='active';
   }
   if(kind==='unskip'&&old==='active')newStatus='cancelled';
   if(!newStatus){skipped++;continue}
   if(['lab','lab-assign'].includes(kind)&&newStatus==='todo')assigned++;
   if(['lab','lab-remove'].includes(kind)&&newStatus==='cancelled')cancelled++;
   if(kind==='issue'){
     if(newStatus==='issued')issued++;
     else issueUndone++;
   }
   if(existing){
     if(kind==='issue'&&newStatus==='issued')existing.issueRestore=old==='todo'?'todo':'cancelled';
     existing.status=newStatus;
   }else{
     const event={id:'e'+Date.now()+'-'+changed,patientId,date,type,status:newStatus};
     if(kind==='issue')event.issueRestore='cancelled';
     next.events.push(event);
   }
   next.audit.push({date:new Date().toISOString(),patientId,day:date,kind:kind==='issue'&&newStatus!=='issued'?'issue-undo':kind,old,newStatus});
   changed++;
 }
 return {state:next,changed,skipped,assigned,cancelled,issued,issueUndone};
}
// A one-patient exception to a maintenance day. The final fraction may be
// PLANNED before engineers take over the machine, never marked as delivered.
export function maintenanceFinalCandidates(state,maintenanceId){
 const m=(state.maintenance||[]).find(x=>x.id===maintenanceId);
 if(!m||!isWorkingDay(state,m.date)||breakdownAt(state,m.machine,m.date))return [];
 const previous=addDays(m.date,-1);
 return state.patients.filter(p=>{
   if(!['active','planned'].includes(p.status)||!p.start||p.start>m.date||p.total<1)return false;
   if(state.people?.find(x=>x.id===p.personId)?.archived)return false;
   if(machineAt(p,state,m.date)!==m.machine)return false;
   if((state.events||[]).some(e=>e.patientId===p.id&&e.date===m.date&&e.type==='skip'&&e.status==='active'))return false;
   const prior=[...schedule(p,state,previous)].filter(([,x])=>x.kind==='session').length;
   return prior===p.total-1;
 });
}
export function maintenanceFinalDraft(state,maintenanceId,patientId,allow){
 const m=(state.maintenance||[]).find(x=>x.id===maintenanceId);
 if(!m)return {error:'Запись ТО не найдена.'};
 const current=(m.finalBeforeService||[]).includes(patientId);
 if(current===Boolean(allow))return {error:'Для этой фракции отметка уже '+(allow?'установлена.':'снята.')};
 const patient=state.patients.find(p=>p.id===patientId);
 if(!patient)return {error:'Курс не найден.'};
 if(allow&&!maintenanceFinalCandidates(state,maintenanceId).some(p=>p.id===patientId))
   return {error:'В день ТО можно запланировать только последнюю фракцию подходящего курса, на работающем аппарате до начала обслуживания. Проверь рабочий календарь и поломки.'};
 const next=clone(state),entry=next.maintenance.find(x=>x.id===maintenanceId);
 entry.finalBeforeService??=[];
 if(allow)entry.finalBeforeService.push(patientId);
 else entry.finalBeforeService=entry.finalBeforeService.filter(x=>x!==patientId);
 const plan=schedule(next.patients.find(p=>p.id===patientId),next,m.date).get(m.date);
 if(allow&&(!plan||plan.kind!=='session'||!plan.final||!plan.beforeMaintenance))
   return {error:'Не удалось запланировать последнюю фракцию до ТО. Изменения не сохранены.'};
 audit(next,allow?'maintenance-final':'maintenance-final-remove',{
   patientId,day:m.date,machine:m.machine,
   detail:(allow?'Запланирована':'Снята')+' последняя фракция до ТО (НЕ отметка фактического проведения)'});
 return {state:next,entry,patient,allow};
}
export function maintenanceAdd(state,date,machine){
 if(!date||!MACHINES.includes(machine)||state.maintenance.some(m=>m.date===date&&m.machine===machine))return {state,changed:false};
 const next=clone(state);next.maintenance.push({id:'m'+Date.now(),date,machine});return {state:next,changed:true};
}
export function maintenanceRemove(state,id){const next=clone(state);next.maintenance=next.maintenance.filter(x=>x.id!==id);return next}
