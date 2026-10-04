/* Reine Monatsprüfung und Sperrvergleich. Derselbe Rechenkern wie die Anzeige. */
import {compute, alsCsvZeilen, round2, steuergrundlage} from './kern.js';
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
  const ohneRate=res.bookings.filter(b=>!b.exempt && (b.betragQuelle==='hochgerechnet'||b.betragQuelle==='unvollstaendig')).map(b=>b.code);
  const gastSchaetzung=schaetzungen.filter(c=>!ohneRate.includes(c));
  if(gastSchaetzung.length)fehler.push('Geschätzte Gastbeträge: '+gastSchaetzung.join(', '));
  if(ohneRate.length)fehler.push('Monatsrate fehlt, Betrag hochgerechnet oder unvollständig: '+ohneRate.join(', '));
  if(!buchungen.length)fehler.push('Keine Buchungen vorhanden. Vollständigkeit des Monats gesondert bestätigen.');
  const monate=res.months.filter(m=>m.month===monat);
  const befreiteNaechte=res.bookings.filter(b=>b.exempt).reduce((s,b)=>s+b.parts.filter(p=>p.month===monat).reduce((n,p)=>n+p.nights,0),0);
  if(befreiteNaechte)fehler.push(befreiteNaechte+' befreite Nächte sind nicht in den steuerpflichtigen Nächten enthalten.');
  // Entgelt und Grundlage wie in Monatstabelle und CSV-Export: je Zeile
  // gerundet. Sie gehören ins Formular und damit zum Abschluss — sonst ginge
  // ein Cent Bemessungsgrundlage durch, solange die gerundete Taxe gleich bleibt.
  return {monat,buchungen,einstellungen:festeOptionen(opt),hinweise:[...new Set(fehler)],
    schaetzungen,befreiteNaechte,ortstaxe:round2(monate.reduce((s,m)=>s+m.tax,0)),
    entgelt:round2(monate.reduce((s,m)=>s+round2(m.base),0)),
    grundlage:round2(monate.reduce((s,m)=>s+round2(steuergrundlage(m.base,m.reg)),0)),
    naechte:monate.reduce((s,m)=>s+m.nights,0)};
}
/* Was ein abgeschlossener Monat gemeldet hat: steuerpflichtige und befreite
   Nächte, Ortstaxe, dazu die offenen Posten seiner Buchungen (eine Erstattung
   verschiebt keine Zahl, kann aber eine Korrektur nötig machen). Nur das ist
   gesperrt — nicht jedes Feld der Buchungsdokumente. Kommt mit einem späteren
   Export die zweite Rate eines Langzeitgasts oder der exakte Bruttobetrag
   dazu, ändert sich das Dokument, oft aber nicht die Meldung. */
function wirkung(docs,opt,monat){
  const s=monatsStand(docs,opt,monat);
  return {naechte:s.naechte,ortstaxe:s.ortstaxe,entgelt:s.entgelt,grundlage:s.grundlage,befreiteNaechte:s.befreiteNaechte,
    offen:s.buchungen.filter(d=>Array.isArray(d.offen)&&d.offen.length).map(d=>d.code+':'+kanonisch(d.offen))};
}
const euro=n=>n.toFixed(2).replace('.',',')+' €';
/* Gesperrte Monate, deren Meldung sich durch neu gegenüber alt ändern würde.
   Gerechnet wird beides mit den Einstellungen des Abschlusses — derselbe Code,
   dieselben Optionen, nur der Bestand unterscheidet sich. Gegen die
   gespeicherte Ortstaxe zu vergleichen hieße, jede spätere Korrektur am
   Rechenkern als Buchungsänderung zu melden. */
function abweichung(stand,alt,neu,opt,monat){
  const o=stand.einstellungen||festeOptionen(opt);
  const a=wirkung(alt,o,monat), n=wirkung(neu,o,monat);
  if(kanonisch(a)===kanonisch(n))return null;
  const was=[];
  if(a.naechte!==n.naechte)was.push('Nächte '+a.naechte+' → '+n.naechte);
  if(a.ortstaxe!==n.ortstaxe)was.push('Ortstaxe '+euro(a.ortstaxe)+' → '+euro(n.ortstaxe));
  if(a.entgelt!==n.entgelt)was.push('Entgelt '+euro(a.entgelt)+' → '+euro(n.entgelt));
  else if(a.grundlage!==n.grundlage)was.push('Grundlage '+euro(a.grundlage)+' → '+euro(n.grundlage));
  if(a.befreiteNaechte!==n.befreiteNaechte)was.push('befreite Nächte '+a.befreiteNaechte+' → '+n.befreiteNaechte);
  if(kanonisch(a.offen)!==kanonisch(n.offen))was.push('offene Posten geändert');
  return monat+' ('+was.join(', ')+')';
}
function verschobeneMonate(sperren,alt,neu,opt){
  return Object.entries(sperren||{}).sort()
    .map(([monat,stand])=>({monat,text:abweichung(stand,alt,neu,opt,monat)}))
    .filter(m=>m.text);
}
export function pruefeSperren(sperren,alt,neu,opt){
  const felder=new Map();
  const namen={basis:'USt-Basis',fee:'Gastgebergebühr',gastfee:'Gast-Servicegebühr',uid:'UID',zaehl:'Zählweise',konto:'Abgabenkonto'};
  if(opt)for(const [monat,stand] of Object.entries(sperren||{}).sort()){
    for(const [k,v] of Object.entries(festeOptionen(opt))){
      if(v!==(stand.einstellungen[k]??null))felder.set(k,[...(felder.get(k)||[]),monat]);
    }
  }
  const meldungen=[], monate=verschobeneMonate(sperren,alt,neu,opt);
  if(monate.length)meldungen.push('Buchungsänderungen verschieben abgeschlossene Monate: '+monate.map(m=>m.text).join('; ')+'.');
  for(const [k,monate] of felder)meldungen.push('Die Einstellung „'+namen[k]+'“ gehört zu den Abschlüssen '+monate.join(', ')+'.');
  if(meldungen.length)throw new Error(meldungen.join(' ')+' Zum Ändern diese Monate zuerst mit Begründung wieder öffnen.');
}
/* Für den Import: statt alles abzuweisen, nur die Buchungen zurückhalten, die
   einen abgeschlossenen Monat verschieben. Geprüft wird je Buchung, nicht je
   Monat: vom gespeicherten Stand aus wird eine Änderung nach der anderen
   übernommen, sofern die gesperrten Monate, die sie berührt, danach noch
   dieselbe Meldung ergeben. Je Monat zurückzuhalten nahm eine harmlose zweite
   Rate mit, sobald eine andere Buchung desselben Monats ihn verschob — und
   mit ihr die Nächte des offenen Folgemonats. Weil jeder Schritt auf dem
   bisher übernommenen Stand prüft, besteht das Ergebnis die Sperrprüfung
   auch dort, wo erst zwei Änderungen zusammen die Rundung kippen.
   Zurückgehalten heißt: der gespeicherte Stand bleibt (eine neue Buchung wird
   nicht angelegt, eine gelöschte nicht gelöscht). Einstellungen trennt das
   nicht; die prüft pruefeSperren als Ganzes. */
export function trenneSperren(sperren,alt,neu,opt){
  const vorher=new Map(alt.map(d=>[d.code,d])), import_=new Map(neu.map(d=>[d.code,d]));
  const nach=new Map(vorher), zurueck=[], gesperrt=Object.entries(sperren||{});
  const geaendert=[...new Set([...vorher.keys(),...import_.keys()])].sort()
    .filter(c=>kanonisch(vorher.get(c)||null)!==kanonisch(import_.get(c)||null));
  for(const c of geaendert){
    const a=vorher.get(c), n=import_.get(c);
    const kandidat=new Map(nach); if(n)kandidat.set(c,n);else kandidat.delete(c);
    const betroffen=gesperrt.filter(([m])=>(a&&beruehrt(a,m)) || (n&&beruehrt(n,m)));
    const monate=betroffen.filter(([m,stand])=>abweichung(stand,alt,[...kandidat.values()],opt,m)).map(([m])=>m);
    if(monate.length)zurueck.push({code:c,monate:monate.sort()});
    else{ if(n)nach.set(c,n);else nach.delete(c); }
  }
  // Beschrieben wird je Monat, was die zurückgehaltenen Änderungen zusammen
  // bewirkten — das, was ein Wiederöffnen und erneuter Import ergäbe.
  const monate=[...new Set(zurueck.flatMap(z=>z.monate))].sort()
    .map(m=>abweichung(sperren[m],alt,neu,opt,m)||m);
  return {neu:[...nach.values()],zurueckgehalten:zurueck,monate};
}
