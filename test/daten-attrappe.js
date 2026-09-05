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
/* Verzögerung je Objekt einstellbar: window.__ladeVerzug = {o1: 400} lässt die
   Antwort für o1 später eintreffen als eine danach gestellte Anfrage. */
export async function ladeBuchungen(objektId){
  const v=(window.__ladeVerzug||{})[objektId]||0;
  if(v) await new Promise(r=>setTimeout(r,v));
  return Object.values(db.buchungen[objektId]||{});
}
export async function schreibeBuchungen(objektId,docs){
  db.buchungen[objektId]=db.buchungen[objektId]||{};
  docs.forEach(d=>{ db.buchungen[objektId][d.code]=JSON.parse(JSON.stringify(d)); });
  db.schreibvorgaenge++;
  return docs.length;
}
/* Wie im echten daten.js: ganz oder gar nicht. Mit __fehlerBeimSchreiben
   lässt sich ein Schreibfehler gezielt einspeisen. */
export async function ersetzeBuchungen(objektId,docs,zuLoeschen){
  if(window.__fehlerBeimSchreiben) throw new Error('simulierter Schreibfehler');
  db.buchungen[objektId]=db.buchungen[objektId]||{};
  zuLoeschen.forEach(c=>{ delete db.buchungen[objektId][c]; });
  docs.forEach(d=>{ db.buchungen[objektId][d.code]=JSON.parse(JSON.stringify(d)); });
  db.schreibvorgaenge++;
  return {atomar:true, anzahl:docs.length+zuLoeschen.length};
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
