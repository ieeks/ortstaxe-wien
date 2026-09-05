/* Firestore-Anbindung: Anmeldung, Lesen, Schreiben, Schnappschüsse.

   Diese Datei ist die einzige Stelle, die mit Firebase spricht. Sie rechnet
   nichts — das Umformen zwischen Dokument und Rechenmodell steht in kern.js
   und ist dort geprüft. Hier bleibt nur Ein- und Ausgabe.

   Das Werkzeug muss ohne diese Schicht vollständig funktionieren: wer die
   CSV lädt und rechnet, soll das auch ohne Anmeldung und ohne Netz können.
   Deshalb wird das SDK erst bei Bedarf geladen, und jeder Fehler kommt als
   verständlicher deutscher Text zurück, statt die Oberfläche mitzureißen. */

import { firebaseConfig, FIREBASE_SDK } from './firebase-config.js';
import { alsBuchungsdokument, baueSchnappschuss, SCHEMA_VERSION } from './kern.js';

const CDN = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK + '/';

let teile = null;          // geladenes SDK
let app = null, db = null, auth = null;

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
  // Regel „kein Browserspeicher“ in CLAUDE.md. Ohne ihn ist das Werkzeug
  // unterwegs unbrauchbar, und genau dafür ist die Synchronisierung da.
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

export async function speichereEinstellungen(e){
  await start();
  const {f} = teile;
  await f.setDoc(f.doc(db,'users',uid(),'einstellungen','aktuell'),
                 Object.assign({schemaVersion:SCHEMA_VERSION}, e), {merge:true});
}

/* --- Buchungen --- */

export async function ladeBuchungen(objektId){
  await start();
  const {f} = teile;
  const s = await f.getDocs(f.collection(db,'users',uid(),'objekte',objektId,'buchungen'));
  return s.docs.map(d => d.data());
}

/* Schreibt in Stapeln. Firestore nimmt höchstens 500 Schreibvorgänge je
   Stapel; bei einem Jahresbestand ist das meist einer. */
export async function schreibeBuchungen(objektId, dokumente){
  await start();
  const {f} = teile;
  const basis = f.collection(db,'users',uid(),'objekte',objektId,'buchungen');
  for(let i=0; i<dokumente.length; i+=400){
    const stapel = f.writeBatch(db);
    dokumente.slice(i,i+400).forEach(d => stapel.set(f.doc(basis, String(d.code)), d, {merge:true}));
    await stapel.commit();
  }
  return dokumente.length;
}

/* Löschen und Schreiben in einem Stapel. Firestore wendet einen writeBatch
   ganz oder gar nicht an — ohne das hinterlässt eine fehlgeschlagene
   Wiederherstellung einen Mischbestand: das Löschen war schon durch, das
   Zurückschreiben nicht. Über 400 Vorgänge wird gestapelt statt atomar; das
   ist erst bei Beständen jenseits eines Jahres relevant und wird gemeldet. */
export async function ersetzeBuchungen(objektId, dokumente, zuLoeschen){
  await start();
  const {f} = teile;
  const basis = f.collection(db,'users',uid(),'objekte',objektId,'buchungen');
  const gesamt = dokumente.length + zuLoeschen.length;
  if(gesamt<=400){
    const stapel = f.writeBatch(db);
    zuLoeschen.forEach(c => stapel.delete(f.doc(basis, String(c))));
    dokumente.forEach(d => stapel.set(f.doc(basis, String(d.code)), d));
    await stapel.commit();
    return {atomar:true, anzahl:gesamt};
  }
  for(const c of zuLoeschen) await f.deleteDoc(f.doc(basis, String(c)));
  await schreibeBuchungen(objektId, dokumente);
  return {atomar:false, anzahl:gesamt};
}

export async function loescheBuchung(objektId, code){
  await start();
  const {f} = teile;
  await f.deleteDoc(f.doc(db,'users',uid(),'objekte',objektId,'buchungen',String(code)));
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
