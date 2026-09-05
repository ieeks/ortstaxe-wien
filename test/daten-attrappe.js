/* Attrappe der Firestore-Schicht für test/integration.mjs.

   Ersetzt js/daten.js: hält alles im Speicher und legt den Zustand
   auf window.__db, damit ein Test ihn prüfen kann. Gleiche Signaturen wie
   js/daten.js — die Oberfläche merkt keinen Unterschied. */
import { alsBuchungsdokument, baueSchnappschuss, SCHEMA_VERSION } from './kern.js';
const db = { buchungen:{}, einstellungen:null, objekte:{}, schnappschuesse:{}, schreibvorgaenge:0 };
window.__db = db;
let melder=null;
export async function beobachteAnmeldung(cb){ melder=cb; cb({uid:'u1',name:'Testnutzer',bild:''}); }
export async function anmelden(){ if(melder) melder({uid:'u1',name:'Testnutzer',bild:''}); }
export async function abmelden(){ if(melder) melder(null); }
export async function ladeObjekte(){ return Object.values(db.objekte); }
export async function speichereObjekt(id,d){ db.objekte[id]=Object.assign({id:id},d); }
export async function ladeEinstellungen(){ return db.einstellungen; }
export async function speichereEinstellungen(e){ db.einstellungen=Object.assign({},e); delete db.einstellungen.paid; }
export async function ladeBuchungen(objektId){ return Object.values(db.buchungen[objektId]||{}); }
export async function schreibeBuchungen(objektId,docs){
  db.buchungen[objektId]=db.buchungen[objektId]||{};
  docs.forEach(d=>{ db.buchungen[objektId][d.code]=JSON.parse(JSON.stringify(d)); });
  db.schreibvorgaenge++;
  return docs.length;
}
export async function loescheBuchung(objektId,code){ delete (db.buchungen[objektId]||{})[code]; }
export async function legeSchnappschussAn(objektId,docs,e,h){
  const z=new Date().toISOString().replace(/[:.]/g,'-')+'-'+Math.random().toString(36).slice(2,6);
  db.schnappschuesse[objektId]=db.schnappschuesse[objektId]||{};
  db.schnappschuesse[objektId][z]=baueSchnappschuss(docs,e||{},h||{});
  return z;
}
export async function ladeSchnappschuesse(objektId){
  return Object.keys(db.schnappschuesse[objektId]||{}).sort().reverse()
    .map(z=>Object.assign({zeitpunkt:z},db.schnappschuesse[objektId][z]));
}
export async function ladeSchnappschuss(objektId,z){ return db.schnappschuesse[objektId][z]; }
export { alsBuchungsdokument };
