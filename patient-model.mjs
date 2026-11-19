// All data in this module belongs to the synthetic, local-only demonstration.
import {MACHINES,schedule,addDays} from './planner.mjs';
import {ICD_C_LOOKUP} from './clinical-dictionaries.mjs';
import {ctvConflict,schemeByName} from './ctv-logic.mjs';
import {emptyCatalog} from './ctv-catalog.mjs';
import {parseDoseInput,doseZoneLabels,courseIsBreast} from './dose-zones.mjs';
import {applyHltPlanDraft,migrateHltBloodDates} from './chemo-schedule.mjs';
import {ensurePatientOrder} from './patient-order.mjs';

const copy=s=>JSON.parse(JSON.stringify(s));
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
export const COURSE_STATUSES={active:'На лечении',planned:'Ожидает начала',completed:'Завершён',early_completed:'Досрочно завершён',archived:'В архиве'};
export const TREATMENT_TYPES=['ЛТ','ХЛТ'];
const id=prefix=>prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const log=(state,kind,detail)=>{(state.audit??=[]).push({date:new Date().toISOString(),kind,day:detail.day||'',...detail});};
const limited=(v,max)=>String(v??'').trim().slice(0,max);
const nonempty=(v,max)=>{const s=limited(v,max);return s.length>=2?s:null;};

// Russian phone entry mask matching the original demo spreadsheet: +7 (999) 123-45-67.
// Preserve empty fields and accept +7, 8-prefixed or ten-digit local input.
export function phoneDigitsRU(value){
 const source=String(value??'').trim();
 let digits=source.replace(/\D/g,'');
 if(source.startsWith('+7') || (digits.length===11&&/^[78]/.test(digits)))digits=digits.slice(1);
 else if(source.startsWith('8')&&digits.length<11)digits=digits.slice(1);
 return digits;
}
export function formatPhoneRU(value){
 const digits=phoneDigitsRU(value).slice(0,10);
 if(!digits)return '';
 let text='+7 ('+digits.slice(0,3);
 if(digits.length>=3)text+=')';
 if(digits.length>3)text+=' '+digits.slice(3,6);
 if(digits.length>6)text+='-'+digits.slice(6,8);
 if(digits.length>8)text+='-'+digits.slice(8,10);
 return text;
}
export const ELN_VALUES=['Да','Нет'];

export function ensurePatientModel(state){
 const s=copy(state);
 s.people??=[];
 s.ctvCatalog??=emptyCatalog();
 s.calendarDays??=[];
 // Use Russia's approved federal production calendar as the default for old demo records.
 s.productionRegion??='RU';
 const seen=new Set(s.people.map(p=>p.id));
 for(const p of s.patients){
   p.personId??=p.id;
   p.courseName??='Курс 1';
   // Legacy synthetic examples P-004/P-010 were marked as combined therapy in the source demo.
   p.treatmentType??=(['P-004','P-010'].includes(p.id)?'ХЛТ':'ЛТ');
   p.tt??=['P-006','P-009'].includes(p.id);
   p.ttDate??=(p.tt?'2026-11-12':'');
   p.notes??='';
   // Legacy prototype displayed ordinal fractions rather than an actual per-fraction dose.
   if(p.displayDose===false&&p.dose===1)p.dose=null;
   if(!seen.has(p.personId)){
     s.people.push({id:p.personId,name:p.name||p.personId,eln:'',phone:'',notes:'',archived:false});
     seen.add(p.personId);
   }
 }
 for(const person of s.people){
   person.archived??=false;
   person.notes??='';person.phone??='';person.eln??='';
   if(person.phone&&phoneDigitsRU(person.phone).length===10)person.phone=formatPhoneRU(person.phone);
   for(const p of s.patients.filter(c=>c.personId===person.id))p.name=person.name;
 }
 ensurePatientOrder(s);
 migrateHltBloodDates(s);
 s.version=4;
 return s;
}
export const coursesFor=(s,personId)=>s.patients.filter(p=>p.personId===personId);
export const personFor=(s,course)=>s.people.find(p=>p.id===course.personId);

function personInput(data){
 const name=nonempty(data.name,100);
 if(!name)return {error:'Укажи имя вымышленного пациента (от двух символов).'};
 const eln=limited(data.eln,40),rawPhone=limited(data.phone,64);
 if(eln&&!ELN_VALUES.includes(eln))return {error:'Для ЭЛН выбери «Да» или «Нет».'};
 const digits=phoneDigitsRU(rawPhone);
 if(rawPhone&&digits.length!==10)return {error:'Телефон должен содержать 10 цифр после +7. Можно оставить поле пустым.'};
 return {person:{name,eln,phone:formatPhoneRU(rawPhone),notes:limited(data.notes,500)}};
}
export function createPersonDraft(state,data){
 const input=personInput(data);if(input.error)return input;
 const s=copy(state),ids=s.people.map(p=>Number(/^P-(\d+)$/.exec(p.id)?.[1]||0));
 let n=Math.max(0,...ids)+1,personId='P-'+String(n).padStart(3,'0');
 while(s.people.some(p=>p.id===personId)){n++;personId='P-'+String(n).padStart(3,'0');}
 // Insert each newly created patient at the top of the shared manual order.
 // Normalize sparse/legacy ranks first so existing relative positions stay intact.
 ensurePatientOrder(s);
 for(const existing of s.people)existing.displayOrder+=1;
 const person={id:personId,...input.person,archived:false,createdAt:new Date().toISOString(),displayOrder:0};
 s.people.push(person);log(s,'person-create',{patientId:personId,detail:'Создана демонстрационная карточка'});
 return {state:s,entry:person};
}
export function updatePersonDraft(state,personId,data){
 const input=personInput(data);if(input.error)return input;
 const s=copy(state),person=s.people.find(p=>p.id===personId);
 if(!person)return {error:'Пациент не найден.'};
 const oldName=person.name;Object.assign(person,input.person);
 for(const course of s.patients.filter(c=>c.personId===personId))course.name=person.name;
 log(s,'person-update',{patientId:personId,detail:'Изменены данные карточки'+(oldName!==person.name?' и имя':'')});
 return {state:s,entry:person};
}
export function setPersonArchivedDraft(state,personId,archived){
 const s=copy(state),person=s.people.find(p=>p.id===personId);
 if(!person)return {error:'Пациент не найден.'};
 person.archived=Boolean(archived);
 log(s,archived?'person-archive':'person-restore',{patientId:personId,detail:archived?'Карточка перемещена в архив':'Карточка восстановлена'});
 return {state:s,entry:person};
}
function parseCourse(data,state){
 const courseName=nonempty(data.courseName,80);
 const diagnosis=limited(data.diagnosis,40);
 const ctv=limited(data.ctv,100);
 const machine=data.machine;
 const start=data.start||'';
 const total=Number(data.total);
 const boost=Boolean(data.boost);
 const template=schemeByName(ctv,state);
 const zones=doseZoneLabels(diagnosis,ctv,boost,template?.group===diagnosis.slice(0,3)?template?.zones:null);
 const parsedRod=parseDoseInput(data.dose,'РОД',30,zones.length);
 const parsedSod=parseDoseInput(data.sod,'СОД',500,zones.length);
 const doseZones=zones.length>1?zones.map((label,i)=>({label,rod:parsedRod.values?.[i]??null,sod:parsedSod.values?.[i]??null})):[];
 const dose=zones.length===1?parsedRod.values?.[0]??null:null;
 const sod=zones.length===1?parsedSod.values?.[0]??null:null;
 const status=data.status||'active';
 const treatmentType=data.treatmentType||'ЛТ';
 const tt=Boolean(data.tt);
 const ttDate=tt?limited(data.ttDate,10):'';
 if(!courseName)return {error:'Укажи название курса (от двух символов).'};
 if(diagnosis&&!ICD_C_LOOKUP.has(diagnosis))return {error:'Выбери диагноз из списка МКБ-10, категория C.'};
 if(ctvConflict(diagnosis,ctv,state))return {error:'Выбранный CTV относится к другой группе МКБ-10. Выбери подходящий шаблон либо введи корректный CTV вручную.'};
 if(boost&&!courseIsBreast(diagnosis))return {error:'Интегрированный буст доступен только для C50 (молочная железа).'};
 if(parsedRod.error)return {error:parsedRod.error};
 if(parsedSod.error)return {error:parsedSod.error};
 if(!MACHINES.includes(machine))return {error:'Выбери аппарат из списка.'};
 if(start&&!validDate(start))return {error:'Неверная дата начала курса.'};
 if(!Number.isInteger(total)||total<1||total>100)return {error:'Количество фракций должно быть от 1 до 100.'};
 if(!Object.hasOwn(COURSE_STATUSES,status))return {error:'Недопустимый статус курса.'};
 if(status==='early_completed')return {error:'Досрочное завершение оформляется через отдельную команду «Выписать досрочно».'};
 if(!TREATMENT_TYPES.includes(treatmentType))return {error:'Выбери ЛТ или ХЛТ.'};
 if(ttDate&&!validDate(ttDate))return {error:'Неверная дата таргетной терапии.'};
 return {course:{courseName,diagnosis,ctv,machine,start,total,dose,sod,boost,doseZones,
  displayDose:Boolean(data.displayDose)&&(dose!==null||doseZones.length>1&&doseZones.every(z=>z.rod!==null)),
  status,treatmentType,tt,ttDate,notes:limited(data.notes,500)}};
}
export function createCourseDraft(state,personId,data){
 const parsed=parseCourse(data,state);if(parsed.error)return parsed;
 const s=copy(state),person=s.people.find(p=>p.id===personId);
 if(!person||person.archived)return {error:'Сначала выбери активную карточку пациента.'};
 const course={id:id('C-'),personId,name:person.name,...parsed.course};
 s.patients.push(course);
 const chemo=applyHltPlanDraft(s,course,null,data);
 if(chemo.error)return {error:chemo.error};
 log(s,'course-create',{patientId:course.id,detail:person.id+' · '+course.courseName,day:course.start});
 return {state:s,entry:course,chemoWarnings:chemo.warnings};
}
export function updateCourseDraft(state,courseId,data){
 const parsed=parseCourse(data,state);if(parsed.error)return parsed;
 const s=copy(state),course=s.patients.find(p=>p.id===courseId);
 if(!course)return {error:'Курс не найден.'};
 if(course.status==='early_completed'||(course.status==='archived'&&course.previousStatus==='early_completed'))
   return {error:'Досрочно завершённый курс защищён от изменений. Для возобновления потребуется отдельная операция с проверкой истории.'};
 const previousCourse=copy(course);
 if((s.transfers||[]).some(t=>t.patientId===courseId)&&parsed.course.machine!==course.machine)return {error:'У курса уже есть переводы между аппаратами. Меняй оборудование через раздел «Переводы пациентов».'};
 const scheduledBeforeMaintenance=(s.maintenance||[]).some(m=>(m.finalBeforeService||[]).includes(courseId));
 if(scheduledBeforeMaintenance){
   const protectedFields=['machine','start','total','diagnosis','ctv','status'];
   if(protectedFields.some(f=>parsed.course[f]!==course[f]))
     return {error:'У курса есть исключение «последняя фракция до ТО». Сначала сними его в разделе ТО, затем меняй даты, аппарат или число фракций.'};
 }
 const confirmed=(s.breakdowns||[]).filter(b=>(b.completed||[]).includes(courseId));
 if(confirmed.length){
   const protectedFields=['machine','start','total','dose','sod','boost','displayDose','diagnosis','ctv'];
   if(protectedFields.some(f=>(parsed.course[f]??(f==='boost'?false:null))!==(course[f]??(f==='boost'?false:null)))||
      JSON.stringify(parsed.course.doseZones||[])!==JSON.stringify(course.doseZones||[]))
     return {error:'Нельзя менять лечебные параметры курса с уже отмеченными проведёнными сеансами. Нужно отдельное исправление истории.'};
 }
 if(parsed.course.start!==course.start){
   const hasEvents=s.events.some(e=>e.patientId===courseId&&e.source!=='hlt'&&e.status!=='cancelled'&&e.date<parsed.course.start);
   if(hasEvents)return {error:'Новая дата начала позже уже записанных событий. Сначала проверь историю курса.'};
 }
 // TT is legacy metadata. Removing it from the editor must not erase existing records.
 if(data.tt===undefined){parsed.course.tt=course.tt||false;parsed.course.ttDate=course.ttDate||'';}
 Object.assign(course,parsed.course);
 // An explicitly reopened course must not retain a prior discharge confirmation.
 if(previousCourse.dischargeReview?.decision==='yes'&&['active','planned'].includes(course.status))
   course.dischargeReview=null;
 const chemo=applyHltPlanDraft(s,course,previousCourse,data);
 if(chemo.error)return {error:chemo.error};
 log(s,'course-update',{patientId:course.id,detail:'Параметры '+course.courseName,day:course.start});
 return {state:s,entry:course,chemoWarnings:chemo.warnings};
}
export function setCourseArchivedDraft(state,courseId,archived){
 const s=copy(state),course=s.patients.find(c=>c.id===courseId);
 if(!course)return {error:'Курс не найден.'};
 if(archived){
   if(course.status==='archived')return {error:'Курс уже в архиве.'};
   course.previousStatus=course.status;
   course.status='archived';
 }else{
   if(course.status!=='archived')return {error:'Курс не в архиве.'};
   course.status=course.previousStatus||'active';
 }
 log(s,archived?'course-archive':'course-restore',{patientId:course.id,detail:course.courseName,day:course.start});
 return {state:s,entry:course};
}
export function previewCourse(before,after,courseId){
 const original=before.patients.find(p=>p.id===courseId);
 const updated=after.patients.find(p=>p.id===courseId);
 if(!updated)return {old:[],next:[]};
 const starts=[original?.start,updated.start].filter(Boolean).sort();
 if(!starts.length)return {old:[],next:[],oldStart:null,nextStart:null,oldEnd:null,nextEnd:null,moved:0};
 const until=addDays(starts[0],200);
 const days=(p,s)=>p&&p.start?[...schedule(p,s,until)].filter(([,event])=>event.kind==='session').map(([date])=>date):[];
 const old=days(original,before),next=days(updated,after);
 return {old,next,oldStart:old[0]||null,nextStart:next[0]||null,oldEnd:old.at(-1)||null,nextEnd:next.at(-1)||null,
  moved:old.filter((d,i)=>next[i]!==d).length+(next.length>old.length?next.length-old.length:0)};
}
