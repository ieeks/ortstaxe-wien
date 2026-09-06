import {monatsStand, pruefeSperren, festeOptionen, kanonisch} from './abschluss.js';
/* Firestore-Anbindung: Anmeldung, Lesen, Schreiben, Schnappschüsse.

   Diese Datei ist die einzige Stelle, die mit Firebase spricht. Sie koordiniert
   Ein-/Ausgabe und prüft Abschlüsse mit den reinen Funktionen aus abschluss.js.
   Deren Rechnung verwendet ausschließlich kern.js. Diese Prüfung läuft im
   Browser auf versionsgebundenen Serverdaten, nicht auf dem Firebase-Server.

   Das Werkzeug muss ohne diese Schicht vollständig funktionieren: wer die
   CSV lädt und rechnet, soll das auch ohne Anmeldung und ohne Netz können.
   Deshalb wird das SDK erst bei Bedarf geladen, und jeder Fehler kommt als
   verständlicher deutscher Text zurück, statt die Oberfläche mitzureißen. */

import { firebaseConfig, FIREBASE_SDK } from './firebase-config.js';
import { alsBuchungsdokument, baueSchnappschuss, SCHEMA_VERSION } from './kern.js';

const CDN = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK + '/';

let teile = null;          // geladenes SDK
let app = null, db = null, auth = null;
// Nur Sitzungsspeicher, nach Benutzer und Objekt getrennt, immer mit Revision.
const arbeitsCache=new Map();
const cacheKey=o=>uid()+'/'+o;

/* Das SDK wird einmal geladen und danach wiederverwendet. Schlägt der Import
   fehl, ist fast immer die gepinnte Version in firebase-config.js schuld —
   die Meldung sagt das, statt einen Netzwerkfehler durchzureichen. */
async function sdk(){
  if(teile) return teile;
  try{
    const [a,f,u] = await Promise.all([
      import(/* @vite-ignore */ CDN+'firebase-app.js'),
      import(/* @vite-ignore */ CDN+'firebase-firestore.js'),
      import(/* @vite-ignore */ CDN+'firebase-auth.js')
    ]);
    teile = {a,f,u};
  }catch(e){
    throw new Error('Das Firebase-SDK ließ sich nicht laden (Version '+FIREBASE_SDK+'). '
      +'Entweder besteht keine Internetverbindung, oder die in js/firebase-config.js '
      +'gepinnte Version gibt es nicht. Das Rechnen aus der CSV funktioniert '
      +'unabhängig davon weiter.');
  }
  return teile;
}

async function start(){
  if(db) return;
  const {a,f,u} = await sdk();
  app  = a.getApps().length ? a.getApp() : a.initializeApp(firebaseConfig);
  // Offline-Cache über IndexedDB: das ist die eine bewusste Ausnahme von der
  // Regel „kein Browserspeicher“ in CLAUDE.md. Vorhandene SDK-Lesedaten können
  // im Cache bleiben. Geschützte Writes benötigen aber eine Online-Transaktion;
  // ein Offline-Write dürfte eine zwischenzeitlich gesetzte Monatssperre umgehen.
  db   = f.initializeFirestore(app, {localCache: f.persistentLocalCache({})});
  auth = u.getAuth(app);
}

/* --- Anmeldung --- */

export async function beobachteAnmeldung(rueckruf){
  await start();
  const {u} = teile;
  return u.onAuthStateChanged(auth, p => rueckruf(p ? {uid:p.uid, name:p.displayName||p.email||'', bild:p.photoURL||''} : null));
}

export async function anmelden(){
  await start();
  const {u} = teile;
  try{
    await u.signInWithPopup(auth, new u.GoogleAuthProvider());
  }catch(e){
    if(e && e.code === 'auth/popup-closed-by-user') return;
    if(e && e.code === 'auth/unauthorized-domain')
      throw new Error('Diese Adresse ist im Firebase-Projekt nicht freigegeben. '
        +'In der Console unter Authentication → Settings → Authorized domains eintragen.');
    throw new Error('Die Anmeldung ist fehlgeschlagen: '+(e&&e.message||e));
  }
}

export async function abmelden(){ await start(); await teile.u.signOut(auth); }

function uid(){
  if(!auth || !auth.currentUser) throw new Error('Nicht angemeldet.');
  return auth.currentUser.uid;
}

/* --- Objekte --- */

export async function ladeObjekte(){
  await start();
  const {f} = teile;
  const s = await f.getDocs(f.collection(db,'users',uid(),'objekte'));
  return s.docs.map(d => Object.assign({id:d.id}, d.data()));
}

export async function speichereObjekt(objektId, daten){
  await start();
  const {f} = teile;
  await f.setDoc(f.doc(db,'users',uid(),'objekte',objektId),
                 Object.assign({schemaVersion:SCHEMA_VERSION}, daten), {merge:true});
}

/* --- Einstellungen --- */

export async function ladeEinstellungen(){
  await start();
  const {f} = teile;
  const d = await f.getDoc(f.doc(db,'users',uid(),'einstellungen','aktuell'));
  return d.exists() ? d.data() : null;
}

/* --- Buchungen --- */

export async function ladeBuchungen(objektId){
  return structuredClone((await leseArbeitsstand(objektId,true)).docs);
}

/* Buchungen, Verlauf und Sperrversion werden gemeinsam geschrieben. */
export async function schreibeBuchungen(objektId, dokumente, kontext={}){
  return aendereBestand(objektId,dokumente,[],kontext);
}
export async function ersetzeBuchungen(objektId,dokumente,zuLoeschen,einstellungen){
  await aendereBestand(objektId,dokumente,zuLoeschen,{grund:'wiederherstellung',einstellungen});
  return {atomar:true};
}
export async function loescheBuchung(objektId,code){
  return aendereBestand(objektId,[],[code],{grund:'loeschen'});
}
function pfad(f,o,...rest){return f.doc(db,'users',uid(),'objekte',o,...rest);}
async function leseArbeitsstand(o,neuLaden=false){
  await start(); const {f}=teile, benutzer=uid();
  const key=cacheKey(o);
  if(!neuLaden && arbeitsCache.has(key))return {...structuredClone(arbeitsCache.get(key)),ref:pfad(f,o,'verwaltung','aktuell')};
  const ref=pfad(f,o,'verwaltung','aktuell');
  const v=await f.getDocFromServer(ref);
  const docs=await f.getDocsFromServer(f.collection(db,'users',uid(),'objekte',o,'buchungen'));
  if(uid()!==benutzer)throw new Error('Anmeldung geändert. Bitte erneut laden.');
  const danach=await f.getDocFromServer(ref);
  const meta=v.exists()?v.data():{revision:0,sperren:{}};
  if((danach.exists()?danach.data().revision:0)!==meta.revision)throw new Error('Bestand während des Ladens geändert. Bitte erneut laden.');
  const stand={benutzer,meta,docs:docs.docs.map(d=>d.data())};
  arbeitsCache.set(key,structuredClone(stand));
  return {...stand,ref};
}
function groesse(d){
  if(new TextEncoder().encode(JSON.stringify(d)).length>700000)
    throw new Error('Dieser Stand ist zu groß. Es wurde nichts gespeichert.');
}
function teileProtokoll(aenderungen,rahmen){
  const teile=[];let gruppe=[];
  const pack=g=>({...rahmen,codes:g.map(a=>a.code),aenderungen:g});
  for(const a of aenderungen){
    const kandidat=pack([...gruppe,a]);
    if(new TextEncoder().encode(JSON.stringify(kandidat)).length>600000){
      if(gruppe.length)teile.push(pack(gruppe));
      gruppe=[a];groesse(pack(gruppe));
    }else gruppe.push(a);
  }
  if(gruppe.length)teile.push(pack(gruppe));return teile;
}
async function aendereBestand(o,docs,entfernen,kontext){
  const stand=await leseArbeitsstand(o), {f}=teile, benutzer=stand.benutzer;
  const vorher=new Map(stand.docs.map(d=>[d.code,d]));
  const nach=new Map(vorher); entfernen.forEach(c=>nach.delete(c)); docs.forEach(d=>nach.set(d.code,d));
  const codes=[...new Set([...entfernen,...docs.map(d=>d.code)])];
  const geaendert=codes.filter(c=>kanonisch(vorher.get(c)||null)!==kanonisch(nach.get(c)||null));
  if(geaendert.length>400)throw new Error(kontext.grund==='wiederherstellung'
    ? 'Dieser Schnappschuss erfordert '+geaendert.length+' Änderungen und kann nicht automatisch zurückgespielt werden (Grenze: 400). Aktueller Bestand und Sicherung bleiben erhalten. Bitte das Dev-Team um eine kontrollierte Migration dieses Schnappschusses bitten.'
    : 'Mehr als 400 Änderungen auf einmal. Bitte kleinere Dateien verwenden; nichts gespeichert.');
  const zeit=new Date().toISOString(), ereignis=crypto.randomUUID();
  const protokolle=teileProtokoll(geaendert.map(code=>({code,vorher:vorher.get(code)||null,nachher:nach.get(code)||null})),
    {zeit,benutzer,grund:kontext.grund||'manuell',datei:kontext.datei||null});
  if(geaendert.length+protokolle.length+2>500)throw new Error('Änderungen und Protokoll benötigen zu viele Schreibvorgänge. Nichts gespeichert; bitte das Dev-Team kontaktieren.');
  let neueMeta;
  try{await f.runTransaction(db,async tx=>{
    const aktuell=await tx.get(stand.ref), meta=aktuell.exists()?aktuell.data():{revision:0,sperren:{}};
    if(meta.revision!==stand.meta.revision)throw new Error('Bestand wurde andernorts geändert. Neu laden und erneut versuchen.');
    if(uid()!==benutzer)throw new Error('Anmeldung geändert. Bitte erneut laden.');
    pruefeSperren(meta.sperren,stand.docs,[...nach.values()],kontext.einstellungen);
    for(const code of geaendert){
      const ref=pfad(f,o,'buchungen',code);
      if(nach.has(code))tx.set(ref,nach.get(code));else tx.delete(ref);
    }
    protokolle.forEach((eintrag,i)=>tx.set(pfad(f,o,'verlauf',ereignis+'-'+i),eintrag));
    if(kontext.einstellungen)tx.set(f.doc(db,'users',benutzer,'einstellungen','aktuell'),
      {...festeOptionen(kontext.einstellungen),schemaVersion:SCHEMA_VERSION},{merge:true});
    neueMeta={...meta,revision:meta.revision+1};
    tx.set(stand.ref,neueMeta);
  });}catch(e){arbeitsCache.delete(benutzer+'/'+o);throw e;}
  arbeitsCache.set(benutzer+'/'+o,structuredClone({benutzer,meta:neueMeta,docs:[...nach.values()]}));
  return docs.length;
}
export async function ladeAbschluesse(o){
  await start();const d=await teile.f.getDocFromServer(pfad(teile.f,o,'verwaltung','aktuell'));
  return d.exists()?d.data().sperren||{}:{};
}
export async function ladeAbschluss(o,monat){
  const sperren=await ladeAbschluesse(o),s=sperren[monat];
  if(!s)return null;
  if(s.buchungen)return s; // ältere Entwürfe mit eingebettetem Beleg
  const d=await teile.f.getDocFromServer(pfad(teile.f,o,'abschlusshistorie',s.referenz));
  if(!d.exists())throw new Error('Abschlussbeleg fehlt. Bitte das Dev-Team kontaktieren.');
  return d.data().stand;
}
export async function schliesseMonat(o,monat,opt,bestaetigung,erwartet){
  if(!bestaetigung.vollstaendig || !bestaetigung.geprueft)throw new Error('Vollständigkeit und Prüfung bestätigen.');
  const arbeitsstand=await leseArbeitsstand(o),{f}=teile;
  const stand=monatsStand(arbeitsstand.docs,opt,monat);
  if(kanonisch(stand)!==kanonisch(erwartet))throw new Error('Prüfstand geändert. Bitte neu prüfen.');
  if(stand.hinweise.length && !bestaetigung.hinweise)throw new Error('Hinweise zuerst prüfen und bestätigen.');
  stand.abgeschlossen=new Date().toISOString();stand.benutzer=uid();stand.bestaetigung=bestaetigung;
  const referenz=crypto.randomUUID(),protokoll=pfad(f,o,'abschlusshistorie',referenz);
  const {buchungen,schaetzungen,...zusammenfassung}=stand;
  groesse({aktion:'abschluss',monat,stand});
  await f.runTransaction(db,async tx=>{
    const d=await tx.get(arbeitsstand.ref),m=d.exists()?d.data():{revision:0,sperren:{}};
    if(uid()!==arbeitsstand.benutzer)throw new Error('Anmeldung geändert. Bitte erneut laden.');
    if(m.revision!==arbeitsstand.meta.revision)throw new Error('Bestand geändert. Neu prüfen.');
    if(m.sperren[monat])throw new Error('Monat ist bereits abgeschlossen.');
    const neu={...m,revision:m.revision+1,sperren:{...m.sperren,[monat]:{...zusammenfassung,referenz}}};groesse(neu);
    tx.set(arbeitsstand.ref,neu);tx.set(protokoll,{aktion:'abschluss',monat,stand});
  });arbeitsCache.delete(arbeitsstand.benutzer+'/'+o);return stand;
}
export async function oeffneMonat(o,monat,grund){
  if(!grund || grund.trim().length<5)throw new Error('Bitte einen nachvollziehbaren Grund angeben (mindestens 5 Zeichen).');
  await start();const {f}=teile,benutzer=uid(),ref=pfad(f,o,'verwaltung','aktuell');
  const protokoll=pfad(f,o,'abschlusshistorie',crypto.randomUUID());
  await f.runTransaction(db,async tx=>{
    const d=await tx.get(ref),m=d.exists()?d.data():null;
    if(uid()!==benutzer)throw new Error('Anmeldung geändert. Bitte erneut laden.');
    if(!m?.sperren[monat])throw new Error('Monat ist nicht abgeschlossen.');
    const sperren={...m.sperren};delete sperren[monat];
    tx.set(ref,{...m,revision:m.revision+1,sperren});
    tx.set(protokoll,{aktion:'wiedereroeffnung',monat,grund:grund.trim(),zeit:new Date().toISOString(),stand:m.sperren[monat],benutzer:uid()});
  });arbeitsCache.delete(benutzer+'/'+o);
}
export async function ladeVerlauf(o,code){
  await start();const {f}=teile;
  const s=await f.getDocs(f.query(f.collection(db,'users',uid(),'objekte',o,'verlauf'),f.where('codes','array-contains',code)));
  return s.docs.map(d=>d.data()).map(e=>({...e,...e.aenderungen.find(a=>a.code===code)})).sort((a,b)=>b.zeit.localeCompare(a.zeit));
}

/* --- Schnappschüsse --- */

/* Vor jedem überschreibenden Import. Ein Dokument mit dem vollständigen Stand,
   nicht Revisionen je Monat: der Jahresbestand sind wenige hundert Buchungen,
   und ein einzelnes Dokument spielt sich ohne Zusammensetzen zurück. */
export async function legeSchnappschussAn(objektId, dokumente, einstellungen, herkunft){
  await start();
  const {f} = teile;
  const zeitpunkt = new Date().toISOString().replace(/[:.]/g,'-');
  const inhalt = baueSchnappschuss(dokumente, einstellungen||{}, herkunft||{});
  inhalt.angelegt = f.serverTimestamp();
  await f.setDoc(f.doc(db,'users',uid(),'objekte',objektId,'schnappschuesse',zeitpunkt), inhalt);
  return zeitpunkt;
}

export async function ladeSchnappschuesse(objektId){
  await start();
  const {f} = teile;
  const s = await f.getDocs(f.query(
    f.collection(db,'users',uid(),'objekte',objektId,'schnappschuesse'),
    f.orderBy('__name__','desc'), f.limit(20)));
  return s.docs.map(d => ({zeitpunkt:d.id, anzahl:d.data().anzahl, grund:d.data().grund,
                           datei:d.data().datei, hash:d.data().hash}));
}

export async function ladeSchnappschuss(objektId, zeitpunkt){
  await start();
  const {f} = teile;
  const d = await f.getDoc(f.doc(db,'users',uid(),'objekte',objektId,'schnappschuesse',zeitpunkt));
  if(!d.exists()) throw new Error('Dieser Stand wurde nicht gefunden.');
  return d.data();
}

export { alsBuchungsdokument };
