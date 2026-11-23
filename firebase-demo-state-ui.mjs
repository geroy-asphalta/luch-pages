// Opt-in cloud synchronization for synthetic demo data. No Firebase keys/passwords
// are compiled into the site. Auth credentials are handled solely by Firebase SDK.
import {parseFirebaseWebConfig} from './sync-lab-core.mjs';
import {DEMO_COLLECTION,CONFIG_STORE,LOCAL_BACKUP_PREFIX,META_PREFIX,
 CONFLICT_BACKUP_PREFIX,createConflictBackup,assertConflictRecoverySnapshot,
 encodeDemoState,decodeDemoState,parseCloudDemoDocument,readAck,
 determineCloudAction,assertCloudVersion,makeCloudWrite} from './firebase-demo-state-core.mjs?v=2';

const $=id=>document.getElementById(id);
const info=msg=>{$('cloud-status').textContent=msg;};
const text=error=>String(error?.message||error||'Неизвестная ошибка');
const escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fileBackup(payload,prefix='luch-demo-local'){
 const blob=new Blob([payload],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=prefix+'-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.json';
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}

export function createFirebaseDemoSync({getState,replaceState,canApplyRemote}){
 let app=null,auth=null,db=null,api=null,unsub=null,authUnsub=null,ref=null;
 let remote=null,remoteReady=false,ack=null,writeBusy=false,initBusy=false,paused=false;
 let signedUser=null,projectId='',mode='disconnected',lastFailure='';
 // Only held in memory; a reload requires saving and checking both versions again.
 let preparedRecovery=null;
 const metaKey=()=>META_PREFIX+projectId+'-'+signedUser.uid;
 const localPayload=()=>encodeDemoState(getState());
 const canApply=()=>canApplyRemote();
 function badge(value){
  const button=$('cloud-open'),label=button.querySelector('.topbar-cloud-label');
  if(label)label.textContent=value; // keep mobile cloud icon and hide only its label
  else button.textContent='☁ '+value;
  $('cloud-open').setAttribute('aria-label','Синхронизация: '+value);
  $('cloud-open').dataset.cloudStatus=mode;
 }
 function status(message,kind=mode){
  mode=kind;info(message);
  badge(({synced:'Синхронизировано',upload:'Сохранение…',download:'Обновление…',
   conflict:'Конфликт',unsent:'Не отправлено',busy:'Подключение…',
   'choose-upload':'Нужна настройка','choose-remote':'Нужна настройка',
   disconnected:'Синхронизация'})[kind]||'Синхронизация');
  $('cloud-mode').textContent=signedUser?'Тестовый пользователь: '+signedUser.email+' · '+projectId:'Не подключено';
  const connected=Boolean(signedUser&&remoteReady);
  $('cloud-first-upload').hidden=!(connected&&mode==='choose-upload');
  $('cloud-accept').hidden=!(connected&&['choose-remote','conflict','download'].includes(mode)&&remote);
  $('cloud-retry').hidden=!(connected&&['unsent','conflict','upload'].includes(mode));
  $('cloud-retry').disabled=mode==='conflict'||writeBusy;
  $('cloud-export').disabled=false;
  $('cloud-signout').disabled=!signedUser||writeBusy;
  const conflictReady=connected&&mode==='conflict'&&Boolean(remote)&&!writeBusy;
  if(preparedRecovery){
   try{
    if(!conflictReady)throw new Error('Восстановление больше не активно.');
    assertConflictRecoverySnapshot(localPayload(),remote,preparedRecovery);
   }catch{discardRecovery();}
  }
  $('cloud-conflict-tools').hidden=!conflictReady;
  $('cloud-conflict-download').disabled=!conflictReady;
  $('cloud-conflict-confirm-row').hidden=!conflictReady||!preparedRecovery;
  $('cloud-promote-local').disabled=!conflictReady||!preparedRecovery||
   !$('cloud-conflict-confirm').checked||!$('cloud-synthetic').checked;
 }
 function discardRecovery(){
  preparedRecovery=null;
  $('cloud-conflict-confirm').checked=false;
 }
 function saveAck(record){
  localStorage.setItem(metaKey(),JSON.stringify(record));
  ack=record;
 }
 function backupLocal(){
  const payload=localPayload();
  const key=LOCAL_BACKUP_PREFIX+Date.now()+'-'+Math.random().toString(36).slice(2,6);
  // A failed backup must stop the replacement instead of silently losing data.
  localStorage.setItem(key,payload);
  return key;
 }
 function stopListener(){
  if(unsub)unsub();unsub=null;ref=null;remote=null;remoteReady=false;
  signedUser=null;ack=null;paused=false;writeBusy=false;
  discardRecovery();
 }
 function refresh(){
  if(!signedUser||!remoteReady||initBusy)return;
  let payload,action;
  try{payload=localPayload();action=determineCloudAction(payload,ack,remote);}
  catch(e){status('Синхронизация остановлена: '+text(e),'conflict');return;}
  if(writeBusy){
   status('Изменения отправляются в облако…','upload');return;
  }
  if(action==='acknowledge'){
   try{saveAck(remote)}catch(e){status('Ошибка локального подтверждения версии: '+text(e),'conflict');return;}
   action='synced';
  }
  if(action==='download'){
   if(canApply()){
    applyCloud(false);return;
   }
   status('На другом устройстве есть новая версия. Закрой редактирование, чтобы получить её.','download');
   return;
  }
  if(action==='synced'){
   paused=false;status('Все изменения подтверждены сервером Firestore. Версия '+remote.version+'.','synced');
  }else if(action==='upload'){
   if(paused)status('Изменения сохранены локально, но ещё не отправлены. Проверь интернет и нажми «Повторить».','unsent');
   else{status('Новые локальные изменения ожидают отправки.','upload');void writeChanges();}
  }else if(action==='conflict'){
   paused=true;status('КОНФЛИКТ: на другом устройстве есть изменения. Локальные данные сохранены. Скачай копию и выбери облачную версию после сверки.','conflict');
  }else if(action==='choose-upload'){
   status('Облачная база пуста. Отправь текущую тестовую таблицу только после подтверждения.','choose-upload');
  }else{
   status('Облачная база существует. Сначала сохрани локальную копию и явно прими облачные данные.','choose-remote');
  }
 }
 function applyCloud(manual){
  if(!remote)return;
  if(!canApply()){status('Закрой карточки и окна редактирования, прежде чем принимать облачную версию.','download');return;}
  const before=localPayload();
  try{
   // Preserve the previous local timeline BEFORE EVERY cloud replacement.
   // A remote update may contain an older date from another device; the
   // previous state must remain recoverable even on automatic downloads.
   const parsed=decodeDemoState(remote.payload);
   if(before!==remote.payload){
    backupLocal();
    if(manual)fileBackup(before);
   }
   replaceState(parsed,remote.payload);
   saveAck(remote);
   paused=false;
   status('Получена серверная версия '+remote.version+'. Данные синхронизированы.','synced');
  }catch(e){status('Облачная версия не применена: '+text(e),'conflict');}
 }
 async function writeChanges(){
  if(writeBusy||paused||!signedUser||!remoteReady||!ack||!ref)return;
  let payload;
  try{
   payload=localPayload();
   if(determineCloudAction(payload,ack,remote)!=='upload')return;
  }catch(e){status(text(e),'conflict');return;}
  const expected=ack;
  writeBusy=true;status('Отправляем изменения в Firestore…','upload');
  try{
   await api.fs.runTransaction(db,async transaction=>{
    const snap=await transaction.get(ref);
    const server=parseCloudDemoDocument(snap.exists()?snap.data():null);
    assertCloudVersion(server,expected);
    transaction.set(ref,{...makeCloudWrite(payload,expected.version),
     updatedAt:api.fs.serverTimestamp()});
   },{maxAttempts:3});
   const updated={version:expected.version+1,payload};
   // A different device may have already published another revision.
   if(!remote||remote.version<=updated.version)remote=updated;
   saveAck(updated);paused=false;lastFailure='';
  }catch(e){
   lastFailure=text(e);paused=true;
   try{
    const doc=await api.fs.getDocFromServer(ref);
    remote=parseCloudDemoDocument(doc.exists()?doc.data():null);
   }catch{}
   status('Запись не подтверждена сервером: '+lastFailure+'. Локальная копия сохранена.','unsent');
  }finally{
   writeBusy=false;refresh();
  }
 }
 async function firstUpload(){
  if(!signedUser||!remoteReady||remote||ack)return;
  if(!$('cloud-synthetic').checked){
   status('Отметь подтверждение: в этой базе только вымышленные/обезличенные данные.','choose-upload');return;
  }
  if(!confirm('Опубликовать текущую ДЕМОНСТРАЦИОННУЮ базу в тестовом Firebase? Не вводи реальные данные пациентов.'))return;
  let payload;
  try{payload=localPayload();backupLocal()}catch(e){status(text(e),'conflict');return;}
  writeBusy=true;status('Создаём первую облачную версию…','upload');
  try{
   await api.fs.runTransaction(db,async transaction=>{
    const doc=await transaction.get(ref);
    if(doc.exists())throw new Error('Облачная база уже появилась. Ничего не перезаписано.');
    transaction.set(ref,{...makeCloudWrite(payload,0),updatedAt:api.fs.serverTimestamp()});
   });
   remote={version:1,payload};saveAck(remote);paused=false;
  }catch(e){
   paused=true;lastFailure=text(e);
   try{const snap=await api.fs.getDocFromServer(ref);remote=parseCloudDemoDocument(snap.exists()?snap.data():null)}catch{}
   status('Первое сохранение не удалось: '+lastFailure,'unsent');
  }finally{writeBusy=false;refresh();}
 }

 /* Manual "this device wins" flow. The prior cloud state and the complete local
    state are saved to a single JSON bundle before confirmation. A transaction
    then checks the exact server revision represented in that bundle. */
 function downloadConflictPair(){
  if(mode!=='conflict'||!signedUser||!remoteReady||!remote||writeBusy)return;
  try{
   const payload=localPayload(),cloud={version:remote.version,payload:remote.payload};
   const bundle=createConflictBackup(payload,cloud);
   const serialized=JSON.stringify(bundle,null,2);
   // If browser storage is full, do not offer an unsafe overwrite.
   localStorage.setItem(CONFLICT_BACKUP_PREFIX+Date.now()+'-'+
    Math.random().toString(36).slice(2,6),serialized);
   fileBackup(serialized,'luch-demo-both-versions');
   preparedRecovery={localPayload:payload,cloud};
   $('cloud-conflict-confirm').checked=false;
   status('Запрошено скачивание обеих версий в одном JSON-файле. Проверь файл в «Загрузках», затем подтверди сохранение и выбор этого компьютера.','conflict');
  }catch(e){
   discardRecovery();
   status('Не удалось подготовить обе резервные копии: '+text(e)+'. Перезапись запрещена.','conflict');
  }
 }
 async function promoteLocalAfterConflict(){
  if(mode!=='conflict'||!signedUser||!remoteReady||!remote||writeBusy||!ref||
   !preparedRecovery)return;
  if(!$('cloud-synthetic').checked||!$('cloud-conflict-confirm').checked){
   status('Подтверди учебные данные и проверь скачанный файл с обеими версиями.','conflict');return;
  }
  if(!canApply()){
   status('Закрой редактирование пациента и несохранённые формы перед публикацией версии.','conflict');return;
  }
  const prepared=preparedRecovery,identity=signedUser.uid,cloudRef=ref;
  try{
   assertConflictRecoverySnapshot(localPayload(),remote,prepared);
   if(!confirm('Сделать данные ЭТОГО устройства основными для всего тестового аккаунта? Облачный список будет целиком заменён. Другая версия сохранена в JSON-копии. Продолжить?'))return;
   assertConflictRecoverySnapshot(localPayload(),remote,prepared);
  }catch(e){discardRecovery();status(text(e),'conflict');return;}
  writeBusy=true;status('Проверяем сервер и отправляем выбранную локальную версию…','upload');
  let succeeded=false;
  try{
   if(!signedUser||signedUser.uid!==identity)throw new Error('Учётная запись изменилась.');
   const current=await api.fs.getDocFromServer(cloudRef);
   const currentCloud=parseCloudDemoDocument(current.exists()?current.data():null);
   assertConflictRecoverySnapshot(localPayload(),currentCloud,prepared);
   if(!canApply())throw new Error('Во время подготовки началось редактирование пациента.');
   await api.fs.runTransaction(db,async transaction=>{
    const snap=await transaction.get(cloudRef);
    const server=parseCloudDemoDocument(snap.exists()?snap.data():null);
    assertConflictRecoverySnapshot(localPayload(),server,prepared);
    if(!canApply())throw new Error('Открыто редактирование пациента. Запись отменена.');
    transaction.set(cloudRef,{
     ...makeCloudWrite(prepared.localPayload,prepared.cloud.version),
     updatedAt:api.fs.serverTimestamp()
    });
   },{maxAttempts:3});
   const updated={version:prepared.cloud.version+1,payload:prepared.localPayload};
   if(!remote||remote.version<=updated.version)remote=updated;
   saveAck(updated);
   paused=false;lastFailure='';succeeded=true;
  }catch(e){
   paused=true;lastFailure=text(e);
   try{
    const snap=await api.fs.getDocFromServer(cloudRef);
    if(ref===cloudRef)remote=parseCloudDemoDocument(snap.exists()?snap.data():null);
   }catch{}
  }finally{
   writeBusy=false;discardRecovery();
   if(succeeded)refresh();
   else status('Облачная запись НЕ заменена или её подтверждение не получено: '+
    lastFailure+'. Локальная таблица сохранена. Повтори сверку и скачивание обеих версий.','conflict');
  }
 }
 function listen(user){
  if(unsub)unsub();
  discardRecovery();
  signedUser=user;projectId=app.options.projectId;
  try{ack=readAck(JSON.parse(localStorage.getItem(metaKey())||'null'))}catch{ack=null}
  remoteReady=false;remote=null;paused=false;
  ref=api.fs.doc(db,DEMO_COLLECTION,user.uid);
  status('Вход выполнен. Ждём подтверждённую серверную версию…','busy');
  unsub=api.fs.onSnapshot(ref,snapshot=>{
   // Do not trust stale cache or optimistic local Firestore writes as a server ack.
   if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites){
    status('Ожидаем доступ к серверу. Изменения остаются локально.','unsent');return;
   }
   try{remote=parseCloudDemoDocument(snapshot.exists()?snapshot.data():null);remoteReady=true;refresh();}
   catch(e){remoteReady=false;status('Ошибка чтения облачных данных: '+text(e),'conflict');}
  },error=>{remoteReady=false;status('Firestore недоступен: '+text(error),'unsent');});
 }
 async function initialize(config){
  if(auth){
   if(projectId!==config.projectId)throw new Error('Для другого Firebase-проекта выйди и обнови страницу.');
   return;
  }
  const [appSDK,authSDK,fireSDK]=await Promise.all([
   import('https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js'),
   import('https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js'),
   import('https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js')
  ]);
  app=appSDK.initializeApp(config,'luch-demo-state-sync');
  auth=authSDK.getAuth(app);db=fireSDK.getFirestore(app);
  api={auth:authSDK,fs:fireSDK};projectId=config.projectId;
  authUnsub=authSDK.onAuthStateChanged(auth,user=>{
   if(!user){
    stopListener();
    status('Войди под одним тестовым аккаунтом на всех устройствах.','disconnected');return;
   }
   if(!signedUser||signedUser.uid!==user.uid)listen(user);
  },error=>status('Ошибка входа: '+text(error),'disconnected'));
 }
 async function signIn(){
  if(initBusy)return;
  initBusy=true;status('Подключаем Firebase…','busy');
  try{
   const config=parseFirebaseWebConfig($('cloud-config').value);
   const email=$('cloud-email').value.trim(),password=$('cloud-password').value;
   if(!email||!password)throw new Error('Введи e-mail и пароль тестового аккаунта.');
   await initialize(config);
   await api.auth.setPersistence(auth,api.auth.browserLocalPersistence);
   await api.auth.signInWithEmailAndPassword(auth,email,password);
   localStorage.setItem(CONFIG_STORE,JSON.stringify(config)); // public app config, never password
   $('cloud-password').value='';
  }catch(e){status('Не удалось подключиться: '+text(e),'disconnected');}
  finally{initBusy=false;if(signedUser)refresh();}
 }
 function setup(){
  try{
   const conf=JSON.parse(localStorage.getItem(CONFIG_STORE)||'null');
   if(conf){
    $('cloud-config').value=JSON.stringify(conf,null,2);
    void initialize(parseFirebaseWebConfig(JSON.stringify(conf))).catch(e=>status('Firebase недоступен: '+text(e),'disconnected'));
   }
  }catch{}
  $('cloud-open').onclick=()=>{
   const dlg=$('cloud-dialog');
   if(typeof dlg.showModal==='function'){if(!dlg.open)dlg.showModal();}
   else dlg.setAttribute('open','');
  };
  $('cloud-close').onclick=()=>{$('cloud-dialog').close()};
  $('cloud-login').onclick=signIn;
  $('cloud-signout').onclick=async()=>{
   if(!auth)return;
   if(['upload','unsent','conflict'].includes(mode)&&!confirm('Есть несинхронизированные изменения. Они останутся только в этом браузере. Выйти?'))return;
   try{await api.auth.signOut(auth);$('cloud-password').value='';}
   catch(e){status('Выход не выполнен: '+text(e),'unsent');}
  };
  $('cloud-first-upload').onclick=()=>void firstUpload();
  $('cloud-accept').onclick=()=>{
   if(!remote)return;
   if(!confirm('Заменить текущий локальный список облачной версией? Сначала будет создана локальная резервная копия. Неотправленные изменения потребуется сверить вручную.'))return;
   applyCloud(true);
  };
  $('cloud-retry').onclick=()=>{paused=false;refresh()};
  $('cloud-conflict-download').onclick=downloadConflictPair;
  const updatePromoteEnabled=()=>{
   $('cloud-promote-local').disabled=!(mode==='conflict'&&preparedRecovery&&!writeBusy&&
    $('cloud-conflict-confirm').checked&&$('cloud-synthetic').checked);
  };
  $('cloud-conflict-confirm').onchange=updatePromoteEnabled;
  $('cloud-synthetic').addEventListener('change',updatePromoteEnabled);
  $('cloud-promote-local').onclick=()=>void promoteLocalAfterConflict();
  $('cloud-export').onclick=()=>{try{fileBackup(localPayload());info('Локальная JSON-копия сохранена в загрузки.')}catch(e){info(text(e))}};
  window.addEventListener('online',()=>{if(mode==='unsent'&&ack){paused=false;refresh();}});
  // A pending remote revision is safe to adopt after patient editing has closed.
  document.addEventListener('close',()=>{if(mode==='download')queueMicrotask(refresh)},true);
  status('Синхронизация выключена. Локальная таблица не передаётся в сеть.','disconnected');
 }
 return {setup,
  localChanged(){if(signedUser&&remoteReady&&!writeBusy){paused=false;refresh();}
   else if(signedUser&&writeBusy)status('Локальные изменения ожидают следующей отправки…','upload');},
  canReset(){return !signedUser||confirm('Сбросить демонстрационные данные ДЛЯ ВСЕХ подключённых устройств? После подтверждения сброс будет отправлен в Firestore.');},
  checkRemote(){if(mode==='download'&&canApply())refresh();},
  isConnected(){return Boolean(signedUser&&remoteReady)}};
}
