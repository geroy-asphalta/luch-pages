// Screenshot supplied by the operator as a fictional 17-person test roster.
// Only display names, ONE mobile contact per row, and row order are used.
// Never import DOB, diagnosis, hospital number or treatment assignments from the image.
// A one-time browser-local migration preserves prior courses, events and later edits.
import {orderedPersonIds} from './patient-order.mjs';

export const PHOTO_ROSTER_VERSION='fictional-roster-2026-11-17-v1';
export const PHOTO_ROSTER_ROWS=Object.freeze([
  {name:'Роганов Сергей Владимирович',phone:'+7 (911) 734-38-58',legacyId:'P-012'},
  {name:'Коровашков Александр Леонидович',phone:'+7 (906) 257-47-65'},
  {name:'Сафронов Вячеслав Лаврентьевич',phone:'+7 (906) 242-20-62',legacyId:'P-011'},
  {name:'Константинов Алексей Николаевич',phone:'+7 (911) 724-75-62'},
  {name:'Царев Сергей Николаевич',phone:'+7 (921) 649-30-17'},
  {name:'Лазарев Дмитрий Владимирович',phone:'+7 (904) 648-12-18'},
  {name:'Сайфетдинов Аняс Андержанович',phone:'+7 (921) 373-81-23'},
  {name:'Рогозинский Владислав Чеславович',phone:'+7 (921) 861-22-40',legacyId:'P-009'},
  {name:'Павлов Евгений Валентинович',phone:'+7 (965) 041-83-32'},
  {name:'Булычев Иван Петрович',phone:'+7 (960) 242-36-35',legacyId:'P-008'},
  {name:'Данилов Юрий Леонидович',phone:'+7 (921) 097-15-97',legacyId:'P-007'},
  {name:'Виноградов Виктор Васильевич',phone:'+7 (921) 336-26-68',legacyId:'P-006'},
  {name:'Прохоров Владимир Николаевич',phone:'+7 (960) 255-69-62',legacyId:'P-005'},
  {name:'Макасеев Вячеслав Павлович',phone:'+7 (911) 187-97-12',legacyId:'P-004'},
  {name:'Сандалов Александр Александрович',phone:'+7 (921) 869-22-19',legacyId:'P-002'},
  {name:'Клюбин Владимир Владимирович',phone:'+7 (950) 047-82-63',legacyId:'P-001'},
  {name:'Петров Виктор Викторович',phone:'+7 (965) 080-28-89'}
].map(row=>Object.freeze(row)));

const clone=value=>JSON.parse(JSON.stringify(value));
const surname=name=>String(name||'').trim().split(/\s+/)[0].toLocaleLowerCase('ru-RU').replaceAll('ё','е');
const phoneValid=value=>/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(value);
const idNumber=id=>Number(/^P-(\d+)$/.exec(id)?.[1]||0);

export function installPhotoDemoRoster(previous){
  if(previous?.photoRosterVersion===PHOTO_ROSTER_VERSION)return previous;
  if(!previous||!Array.isArray(previous.people)||!Array.isArray(previous.patients))
    return previous;

  const next=clone(previous);
  const oldOrder=orderedPersonIds(previous);
  const used=new Set();
  const screenshotOrder=[];
  const conflicts=[];
  let newId=Math.max(0,...next.people.map(p=>idNumber(p.id)))+1;
  let created=0,updated=0;

  for(const row of PHOTO_ROSTER_ROWS){
    if(!phoneValid(row.phone))throw new Error('Неверный формат тестового телефона в новом списке.');
    const matching=next.people.filter(p=>!used.has(p.id)&&surname(p.name)===surname(row.name));
    const person=matching.find(p=>p.id===row.legacyId)||
      (matching.length===1?matching[0]:null);

    if(!person&&matching.length>1){
      // Do not guess which of several same-surname people the screenshot means.
      conflicts.push(row.name);
      continue;
    }

    let target=person;
    if(!target){
      let id;
      do{id='P-'+String(newId++).padStart(3,'0');}
      while(next.people.some(p=>p.id===id));
      target={id,name:row.name,phone:row.phone,eln:'',notes:'',
        archived:false,createdAt:new Date().toISOString(),displayOrder:next.people.length};
      next.people.push(target);
      created++;
    }else{
      target.name=row.name;
      target.phone=row.phone;
      for(const course of next.patients.filter(c=>c.personId===target.id))
        course.name=row.name;
      updated++;
    }
    used.add(target.id);
    screenshotOrder.push(target.id);
  }

  // Preserve all old people absent from the image, without deleting their courses.
  const afterPhoto=[...screenshotOrder,...oldOrder.filter(id=>!used.has(id))];
  const orderById=new Map(afterPhoto.map((id,index)=>[id,index]));
  for(const person of next.people)person.displayOrder=orderById.get(person.id);

  next.photoRosterVersion=PHOTO_ROSTER_VERSION;
  if(conflicts.length)next.photoRosterConflicts=conflicts;
  (next.audit??=[]).push({
    date:new Date().toISOString(),kind:'patient-photo-roster',
    detail:'Учебный список: обновлено '+updated+', создано '+created+
      ', неоднозначных совпадений '+conflicts.length+'. Курсы и события сохранены.'
  });
  return next;
}
