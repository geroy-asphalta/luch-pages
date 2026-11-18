// Isolated, synthetic-data-only synchronization pilot.
// This module is deliberately independent of app.mjs and patient state.
export const PILOT_COLLECTION='luch_sync_probe';
export const MAX_NOTE_LENGTH=200;

export function parseFirebaseWebConfig(text){
  let raw;
  try{raw=JSON.parse(String(text));}catch{throw new Error('Вставь конфигурацию Firebase в формате JSON.');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Неверная конфигурация Firebase.');
  const fields=['apiKey','authDomain','projectId','appId'];
  for(const field of fields){
    if(typeof raw[field]!=='string'||!raw[field].trim()||raw[field].length>500)
      throw new Error('В конфигурации отсутствует поле '+field+'.');
  }
  if(!/^[a-z][a-z0-9-]{3,60}$/.test(raw.projectId))throw new Error('Некорректный projectId.');
  // Only public Firebase web-app config fields. Never accept service-account secrets.
  return Object.fromEntries(fields.map(field=>[field,raw[field].trim()]));
}

export function normalizePilotNote(value){
  const note=String(value??'').trim();
  if(note.length>MAX_NOTE_LENGTH)throw new Error('Не более 200 символов.');
  return note;
}

export function parsePilotDocument(payload){
  if(payload===null||payload===undefined)return {version:0,text:''};
  if(typeof payload!=='object'||Array.isArray(payload)
    ||!Number.isSafeInteger(payload.version)||payload.version<1
    ||typeof payload.text!=='string'||payload.text.length>MAX_NOTE_LENGTH)
    throw new Error('Облачная тестовая запись имеет неожиданный формат.');
  return {version:payload.version,text:payload.text};
}

export function nextPilotDocument(text,expectedVersion){
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)
    throw new Error('Некорректная версия записи.');
  return {version:expectedVersion+1,text:normalizePilotNote(text)};
}

export function assertNoConflict(remoteVersion,expectedVersion){
  if(remoteVersion!==expectedVersion)
    throw new Error('КОНФЛИКТ: запись уже изменена на другом устройстве. Проверь новую версию и повтори изменение.');
}
