/* Reine Monatsprüfung und Sperrvergleich. Derselbe Rechenkern wie die Anzeige. */
import {compute, alsCsvZeilen, round2} from './kern.js';
export function festeOptionen(o={}){
  return Object.fromEntries(['basis','fee','gastfee','uid','zaehl','konto'].map(k=>[k,o[k]??null]));
}
export function beruehrt(d,monat){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(monat)) throw new Error('Ungültiger Monat.');
  const von=monat+'-01', bis=new Date(Date.UTC(+monat.slice(0,4),+monat.slice(5,7),1)).toISOString().slice(0,10);
  return d.von<bis && d.bis>von;
}
export function kanonisch(x){
  if(Array.isArray(x)) return '['+x.map(kanonisch).join(',')+']';
  if(x && typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+kanonisch(x[k])).join(',')+'}';
  return JSON.stringify(x);
}
export function monatsStand(docs,opt,monat){
  const buchungen=docs.filter(d=>beruehrt(d,monat)).sort((a,b)=>a.code.localeCompare(b.code));
  const res=compute(alsCsvZeilen(buchungen),{...opt,paid:{}});
  const fehler=res.warn.slice();
  const schaetzungen=res.bookings.filter(b=>!b.exempt && b.betragQuelle!=='beleg').map(b=>b.code);
  if(schaetzungen.length)fehler.push('Geschätzte Gastbeträge: '+schaetzungen.join(', '));
  if(!buchungen.length)fehler.push('Keine Buchungen vorhanden. Vollständigkeit des Monats gesondert bestätigen.');
  const monate=res.months.filter(m=>m.month===monat);
  const befreiteNaechte=res.bookings.filter(b=>b.exempt).reduce((s,b)=>s+b.parts.filter(p=>p.month===monat).reduce((n,p)=>n+p.nights,0),0);
  if(befreiteNaechte)fehler.push(befreiteNaechte+' befreite Nächte sind nicht in den steuerpflichtigen Nächten enthalten.');
  return {monat,buchungen,einstellungen:festeOptionen(opt),hinweise:[...new Set(fehler)],
    schaetzungen,befreiteNaechte,ortstaxe:round2(monate.reduce((s,m)=>s+m.tax,0)),
    naechte:monate.reduce((s,m)=>s+m.nights,0)};
}
export function pruefeSperren(sperren,alt,neu,opt){
  const buchungsMonate=[],felder=new Map();
  const namen={basis:'USt-Basis',fee:'Gastgebergebühr',gastfee:'Gast-Servicegebühr',uid:'UID',zaehl:'Zählweise',konto:'Abgabenkonto'};
  for(const [monat,stand] of Object.entries(sperren||{}).sort()){
    const a=alt.filter(d=>beruehrt(d,monat)).sort((x,y)=>x.code.localeCompare(y.code));
    const n=neu.filter(d=>beruehrt(d,monat)).sort((x,y)=>x.code.localeCompare(y.code));
    if(kanonisch(a)!==kanonisch(n))buchungsMonate.push(monat);
    if(opt)for(const [k,v] of Object.entries(festeOptionen(opt))){
      if(v!==(stand.einstellungen[k]??null))felder.set(k,[...(felder.get(k)||[]),monat]);
    }
  }
  const meldungen=[];
  if(buchungsMonate.length)meldungen.push('Buchungsänderungen betreffen abgeschlossene Monate: '+buchungsMonate.join(', ')+'.');
  for(const [k,monate] of felder)meldungen.push('Die Einstellung „'+namen[k]+'“ gehört zu den Abschlüssen '+monate.join(', ')+'.');
  if(meldungen.length)throw new Error(meldungen.join(' ')+' Zum Ändern diese Monate zuerst mit Begründung wieder öffnen.');
}
