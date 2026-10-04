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
  const ohneRate=res.bookings.filter(b=>!b.exempt && (b.betragQuelle==='hochgerechnet'||b.betragQuelle==='unvollstaendig')).map(b=>b.code);
  const gastSchaetzung=schaetzungen.filter(c=>!ohneRate.includes(c));
  if(gastSchaetzung.length)fehler.push('Geschätzte Gastbeträge: '+gastSchaetzung.join(', '));
  if(ohneRate.length)fehler.push('Monatsrate fehlt, Betrag hochgerechnet oder unvollständig: '+ohneRate.join(', '));
  if(!buchungen.length)fehler.push('Keine Buchungen vorhanden. Vollständigkeit des Monats gesondert bestätigen.');
  const monate=res.months.filter(m=>m.month===monat);
  const befreiteNaechte=res.bookings.filter(b=>b.exempt).reduce((s,b)=>s+b.parts.filter(p=>p.month===monat).reduce((n,p)=>n+p.nights,0),0);
  if(befreiteNaechte)fehler.push(befreiteNaechte+' befreite Nächte sind nicht in den steuerpflichtigen Nächten enthalten.');
  return {monat,buchungen,einstellungen:festeOptionen(opt),hinweise:[...new Set(fehler)],
    schaetzungen,befreiteNaechte,ortstaxe:round2(monate.reduce((s,m)=>s+m.tax,0)),
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
  return {naechte:s.naechte,ortstaxe:s.ortstaxe,befreiteNaechte:s.befreiteNaechte,
    offen:s.buchungen.filter(d=>Array.isArray(d.offen)&&d.offen.length).map(d=>d.code+':'+kanonisch(d.offen))};
}
const euro=n=>n.toFixed(2).replace('.',',')+' €';
/* Gesperrte Monate, deren Meldung sich durch neu gegenüber alt ändern würde.
   Gerechnet wird beides mit den Einstellungen des Abschlusses — derselbe Code,
   dieselben Optionen, nur der Bestand unterscheidet sich. Gegen die
   gespeicherte Ortstaxe zu vergleichen hieße, jede spätere Korrektur am
   Rechenkern als Buchungsänderung zu melden. */
function verschobeneMonate(sperren,alt,neu,opt){
  const aus=[];
  for(const [monat,stand] of Object.entries(sperren||{}).sort()){
    const o=stand.einstellungen||festeOptionen(opt);
    const a=wirkung(alt,o,monat), n=wirkung(neu,o,monat);
    if(kanonisch(a)===kanonisch(n))continue;
    const was=[];
    if(a.naechte!==n.naechte)was.push('Nächte '+a.naechte+' → '+n.naechte);
    if(a.ortstaxe!==n.ortstaxe)was.push('Ortstaxe '+euro(a.ortstaxe)+' → '+euro(n.ortstaxe));
    if(a.befreiteNaechte!==n.befreiteNaechte)was.push('befreite Nächte '+a.befreiteNaechte+' → '+n.befreiteNaechte);
    if(kanonisch(a.offen)!==kanonisch(n.offen))was.push('offene Posten geändert');
    aus.push({monat,text:monat+' ('+was.join(', ')+')'});
  }
  return aus;
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
   einen abgeschlossenen Monat verschieben. Zurückgehalten heißt: der
   gespeicherte Stand bleibt (eine neue Buchung wird nicht angelegt, eine
   gelöschte nicht gelöscht). Wiederholt, bis kein gesperrter Monat mehr
   abweicht — eine Buchung über zwei gesperrte Monate kann beim Zurückhalten
   den zweiten berühren. Endet spätestens, wenn jede geänderte Buchung in einem
   abweichenden Monat zurückgehalten ist: dann ist dessen Bestand wieder der
   alte. Einstellungen trennt das nicht; die prüft pruefeSperren als Ganzes. */
export function trenneSperren(sperren,alt,neu,opt){
  const vorher=new Map(alt.map(d=>[d.code,d])), import_=new Map(neu.map(d=>[d.code,d]));
  const nach=new Map(import_), zurueck=new Map(), verschoben=new Map();
  const geaendert=[...new Set([...vorher.keys(),...import_.keys()])]
    .filter(c=>kanonisch(vorher.get(c)||null)!==kanonisch(import_.get(c)||null));
  for(;;){
    const monate=verschobeneMonate(sperren,alt,[...nach.values()],opt);
    if(!monate.length)break;
    let weiter=false;
    for(const {monat,text} of monate){
      if(!verschoben.has(monat))verschoben.set(monat,text);
      for(const c of geaendert){
        const a=vorher.get(c), n=import_.get(c);
        if(!(a&&beruehrt(a,monat)) && !(n&&beruehrt(n,monat)))continue;
        zurueck.set(c,new Set([...(zurueck.get(c)||[]),monat]));
        if(kanonisch(nach.get(c)||null)===kanonisch(a||null))continue;
        if(a)nach.set(c,a);else nach.delete(c);
        weiter=true;
      }
    }
    if(!weiter)throw new Error('Sperrprüfung ohne Ergebnis. Nichts gespeichert; bitte das Dev-Team kontaktieren.');
  }
  return {neu:[...nach.values()],
    zurueckgehalten:[...zurueck].map(([code,m])=>({code,monate:[...m].sort()})).sort((x,y)=>x.code.localeCompare(y.code)),
    monate:[...verschoben.keys()].sort().map(m=>verschoben.get(m))};
}
