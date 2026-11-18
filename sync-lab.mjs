import {PILOT_COLLECTION,parseFirebaseWebConfig,normalizePilotNote,parsePilotDocument,nextPilotDocument,assertNoConflict} from './sync-lab-core.mjs';

const $=id=>document.getElementById(id);
const status=message=>{$('status').textContent=message;};
let auth=null,firestore=null,api=null,unsub=null,ref=null;
let remote={version:0,text:''},ready=false,busy=false;

function refresh(){
 const connected=Boolean(auth?.currentUser);
 $('sign-in').disabled=busy||connected;
 $('sign-out').disabled=busy||!connected;
 $('pilot-text').disabled=!connected||!ready||busy;
 $('save-note').disabled=!connected||!ready||busy;
 $('reload-note').disabled=!connected||!ready||busy;
 $('remote-version').textContent=ready?String(remote.version):'—';
}

function resetSession(){
 if(unsub)unsub();
 unsub=null;ref=null;remote={version:0,text:''};ready=false;
 $('pilot-text').value='';$('password').value='';refresh();
}

$('network-check').onclick=async()=>{
 $('network-check').disabled=true;
 const servers=[
  ['Firebase SDK','https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js'],
  ['Firestore','https://firestore.googleapis.com/'],
  ['Авторизация','https://identitytoolkit.googleapis.com/']
 ];
 const results=await Promise.all(servers.map(async([name,url])=>{
  try{
   // A no-cors response may be opaque or an HTTP error: we check only
   // that the browser can reach the host without a network/CSP failure.
   await fetch(url,{mode:'no-cors',cache:'no-store',signal:AbortSignal.timeout(10000)});
   return name+': сеть доступна';
  }catch{return name+': нет ответа из сети';}
 }));
 status(results.join('\n')+'\nДля входа в проект нужна дополнительная проверка.');
 $('network-check').disabled=false;
};

$('sign-in').onclick=async()=>{
 busy=true;refresh();
 try{
  const config=parseFirebaseWebConfig($('firebase-config').value);
  const email=$('email').value.trim(),password=$('password').value;
  if(!email||!password)throw new Error('Введи e-mail и пароль тестового аккаунта.');
  if(auth&&auth.app.options.projectId!==config.projectId)throw new Error('Для смены проекта Firebase обнови страницу.');
  if(!auth){
  const [appSDK,authSDK,fsSDK]=await Promise.all([
   import('https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js'),
   import('https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js'),
   import('https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js')
  ]);
  const app=appSDK.initializeApp(config,'luch-sync-lab');
  auth=authSDK.getAuth(app);
  await authSDK.setPersistence(auth,authSDK.inMemoryPersistence);
  firestore=fsSDK.getFirestore(app);
  api={authSDK,fsSDK};
  }
  const credential=await api.authSDK.signInWithEmailAndPassword(auth,email,password);
  $('password').value='';
  ref=fsSDK.doc(firestore,PILOT_COLLECTION,credential.user.uid);
  unsub=fsSDK.onSnapshot(ref,snapshot=>{
   if(snapshot.metadata.fromCache){
    status('Пока видна кэшированная версия. Для безопасного сохранения нужен ответ сервера.');
    return;
   }
   try{
    const next=parsePilotDocument(snapshot.exists()?snapshot.data():null);
    const edited=ready&&$('pilot-text').value!==remote.text;
    remote=next;ready=true;
    if(!edited){
     $('pilot-text').value=remote.text;
     status('Облачная запись получена. Версия '+remote.version+'.');
    }else{
     status('Есть новая версия ('+remote.version+') с другого устройства. Сначала проверь изменения, затем при необходимости прими облачную версию.');
    }
    refresh();
   }catch(error){ready=false;status(error.message);refresh();}
  },error=>{ready=false;status('Ошибка Firestore: '+error.message);refresh();});
  status('Вход выполнен. Получаем запись с сервера...');
 }catch(error){
  status('Не удалось подключиться: '+error.message);
 }finally{busy=false;refresh();}
};

$('sign-out').onclick=async()=>{
 busy=true;refresh();
 try{
  if(auth&&api)await api.authSDK.signOut(auth);
  resetSession();
  status('Выход выполнен. Данные основного ЛУЧ не затронуты.');
 }catch(error){status('Ошибка выхода: '+error.message);}
 finally{busy=false;refresh();}
};

$('save-note').onclick=async()=>{
 if(!ready||!ref||!auth?.currentUser||busy)return;
 const expected=remote.version;
 let draft;
 try{draft=nextPilotDocument($('pilot-text').value,expected);}
 catch(error){status(error.message);return;}
 busy=true;refresh();
 try{
  await api.fsSDK.runTransaction(firestore,async transaction=>{
   const current=await transaction.get(ref);
   const seen=parsePilotDocument(current.exists()?current.data():null);
   assertNoConflict(seen.version,expected);
   transaction.set(ref,{...draft,updatedAt:api.fsSDK.serverTimestamp()});
  },{maxAttempts:3});
  status('Заметка сохранена в Firestore. На другом устройстве она обновится автоматически.');
 }catch(error){
  status('Не удалось сохранить: '+error.message+'\nНажми «Принять облачную версию» после проверки.');
 }finally{busy=false;refresh();}
};

$('reload-note').onclick=()=>{
 if(!ready||busy)return;
 $('pilot-text').value=remote.text;
 status('Принята облачная версия '+remote.version+'.');
 refresh();
};
refresh();
