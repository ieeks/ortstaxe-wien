import {monatsStand,pruefeSperren,kanonisch} from './abschluss.js';
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
/* Schreibverzögerung einspeisbar: window.__schreibVerzug = 800 lässt einen
   begonnenen Schreibvorgang erst später abschließen. */
export async function schreibeBuchungen(objektId,docs,kontext={}){
  if(window.__schreibVerzug) await new Promise(r=>setTimeout(r,window.__schreibVerzug));
  const alt=Object.values(db.buchungen[objektId]||{}), neu={...(db.buchungen[objektId]||{})};docs.forEach(d=>neu[d.code]=d);
  pruefeSperren(db.abschluesse?.[objektId],alt,Object.values(neu),kontext.einstellungen);
  db.verlauf=db.verlauf||[];
  for(const d of docs){const a=(db.buchungen[objektId]||{})[d.code]||null;if(kanonisch(a)!==kanonisch(d))db.verlauf.push({objektId,code:d.code,zeit:new Date().toISOString(),grund:kontext.grund||'manuell',vorher:a,nachher:d,datei:kontext.datei||null});}
  if(kontext.einstellungen)await speichereEinstellungen(kontext.einstellungen);
  db.buchungen[objektId]=db.buchungen[objektId]||{};
  docs.forEach(d=>{ db.buchungen[objektId][d.code]=JSON.parse(JSON.stringify(d)); });
  db.schreibvorgaenge++;
  return docs.length;
}
/* Wie im echten daten.js: ganz oder gar nicht. Mit __fehlerBeimSchreiben
   lässt sich ein Schreibfehler gezielt einspeisen. */
export async function ersetzeBuchungen(objektId,docs,zuLoeschen,einstellungen){
  if(window.__fehlerBeimSchreiben) throw new Error('simulierter Schreibfehler');
  pruefeSperren(db.abschluesse?.[objektId],Object.values(db.buchungen[objektId]||{}),docs,einstellungen);
  db.buchungen[objektId]=db.buchungen[objektId]||{};
  zuLoeschen.forEach(c=>{ delete db.buchungen[objektId][c]; });
  docs.forEach(d=>{ db.buchungen[objektId][d.code]=JSON.parse(JSON.stringify(d)); });
  if(einstellungen){ db.einstellungen=Object.assign({},einstellungen); delete db.einstellungen.paid; }
  db.schreibvorgaenge++;
  return {atomar:true, anzahl:docs.length+zuLoeschen.length+(einstellungen?1:0)};
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
/* Auch das Lesen eines Schnappschusses ist verzögerbar: ohne ein Zeitfenster
   im Restore-Ablauf lässt sich nicht prüfen, was eine Eingabe *während* der
   Wiederherstellung anrichtet. */
export async function ladeSchnappschuss(objektId,z){
  if(window.__standVerzug) await new Promise(r=>setTimeout(r,window.__standVerzug));
  return db.schnappschuesse[objektId][z];
}
export { alsBuchungsdokument };

export async function ladeAbschluesse(o){return db.abschluesse?.[o]||{};}
export async function schliesseMonat(o,m,opt,b,erwartet){
  if(!b.vollstaendig||!b.geprueft)throw new Error('Vollständigkeit und Prüfung bestätigen.');
  const s=monatsStand(Object.values(db.buchungen[o]||{}),opt,m);
  if(kanonisch(s)!==kanonisch(erwartet))throw new Error('Prüfstand geändert.');
  if(s.hinweise.length&&!b.hinweise)throw new Error('Hinweise zuerst prüfen und bestätigen.');
  s.abgeschlossen=new Date().toISOString();s.benutzer='u1';s.bestaetigung=b;
  db.abschluesse=db.abschluesse||{};db.abschluesse[o]=db.abschluesse[o]||{};db.abschluesse[o][m]=s;
  return s;
}
export async function oeffneMonat(o,m,grund){if(!grund||grund.trim().length<5)throw new Error('Bitte Grund angeben.');delete db.abschluesse[o][m];}
export async function ladeVerlauf(o,c){return (db.verlauf||[]).filter(e=>e.objektId===o&&e.code===c);}
