// Opt-in synchronization of SYNTHETIC demo state only.
// Cloud writes use optimistic concurrency; every conflicting update is rejected.
export const DEMO_COLLECTION='luch_demo_states';
export const MAX_DEMO_BYTES=600000;
export const CONFIG_STORE='luch-demo-firebase-config-v1';
export const LOCAL_BACKUP_PREFIX='luch-demo-cloud-backup-';
export const META_PREFIX='luch-demo-cloud-ack-';

const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function validateDemoState(state){
 if(!object(state)||!Array.isArray(state.people)||!Array.isArray(state.patients)||
  !Array.isArray(state.events)||!Array.isArray(state.audit))
  throw new Error('Облачная запись не похожа на базу ЛУЧ. Данные не заменены.');
 if(state.people.length>10000||state.patients.length>20000||state.audit.length>30000)
  throw new Error('Демонстрационная база превышает поддерживаемый размер.');
 const ids=new Set();
 for(const person of state.people){
  if(!object(person)||typeof person.id!=='string'||!person.id||ids.has(person.id))
   throw new Error('Ошибка идентификаторов карточек пациентов.');
  ids.add(person.id);
 }
 const courses=new Set();
 for(const course of state.patients){
  if(!object(course)||typeof course.id!=='string'||!course.id||
   typeof course.personId!=='string'||courses.has(course.id))
   throw new Error('Ошибка идентификаторов курсов.');
  courses.add(course.id);
 }
 return state;
}
export function encodeDemoState(state){
 const json=JSON.stringify(validateDemoState(state));
 if(typeof json!=='string'||new TextEncoder().encode(json).length>MAX_DEMO_BYTES)
  throw new Error('База слишком велика для безопасной синхронизации одним документом.');
 return json;
}
export function decodeDemoState(payload){
 if(typeof payload!=='string'||new TextEncoder().encode(payload).length>MAX_DEMO_BYTES)
  throw new Error('Недопустимый размер облачной базы.');
 let parsed;
 try{parsed=JSON.parse(payload)}catch{throw new Error('Облачная база содержит повреждённый JSON.')}
 return validateDemoState(parsed);
}
export function parseCloudDemoDocument(data){
 if(data===null||data===undefined)return null;
 if(!object(data)||!Number.isSafeInteger(data.version)||data.version<1||
  typeof data.payload!=='string')
  throw new Error('Облачная версия имеет неверный формат.');
 decodeDemoState(data.payload);
 return {version:data.version,payload:data.payload};
}
export function readAck(value){
 if(!object(value)||!Number.isSafeInteger(value.version)||value.version<1||
  typeof value.payload!=='string')return null;
 try{decodeDemoState(value.payload)}catch{return null}
 return {version:value.version,payload:value.payload};
}
export function determineCloudAction(localPayload,ack,remote){
 // Only explicit choices are allowed on first connection. An unrecognized
 // local state must never silently replace an existing cloud state.
 decodeDemoState(localPayload);
 if(!ack)return remote?'choose-remote':'choose-upload';
 if(!remote)return 'conflict';
 if(remote.version===ack.version&&remote.payload===ack.payload)
  return localPayload===ack.payload?'synced':'upload';
 if(remote.version>=ack.version&&localPayload===remote.payload)return 'acknowledge';
 if(remote.version>ack.version&&localPayload===ack.payload)return 'download';
 return 'conflict';
}
export function assertCloudVersion(remote,ack){
 if(!ack||!remote||remote.version!==ack.version||remote.payload!==ack.payload)
  throw new Error('КОНФЛИКТ: данные изменились на другом устройстве. Запись остановлена.');
}
export function makeCloudWrite(payload,expectedVersion){
 decodeDemoState(payload);
 if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)
  throw new Error('Некорректная версия облачной записи.');
 return {version:expectedVersion+1,payload};
}
