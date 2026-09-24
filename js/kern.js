/* Rechenkern des Ortstaxe-Rechners — bewusst ohne jeden DOM-Zugriff.
   Alles hier ist eine reine Funktion über Daten: dieselben Funktionen rechnen
   die Meldung und laufen im Selbsttest. Wer hier etwas ändert, ändert die
   Zahlen — die Schlüsselzahlen und Stichtage stehen in CLAUDE.md. */

const STICHTAG_5 = Date.UTC(2026,6,1);
const STICHTAG_8 = Date.UTC(2027,6,1);
const EFF = {r32:0.032*0.89, r50:0.05, r80:0.08};
/* Der 11-%-Pauschalabzug nach § 12 Abs. 2 lit. c WTFG, bis 30.06.2026. Er
   steckt oben im effektiven Satz (0.032*0.89) — deshalb ist die Zahl, die
   das Tool als Grundlage führt, für diesen Zeitraum das Entgelt *vor* dem
   Abzug. Hier steht er getrennt, damit beide Zahlen benennbar sind. */
const PAUSCHALE = {r32:0.89, r50:1, r80:1};
/* Die steuerpflichtige Grundlage nach dem Pauschalabzug. Ab Juli 2026 ist
   sie mit dem Entgelt identisch, weil lit. c entfallen ist. */
function steuergrundlage(entgelt, reg){ return entgelt*PAUSCHALE[reg]; }

function regimeOf(ts){ return ts < STICHTAG_5 ? 'r32' : (ts < STICHTAG_8 ? 'r50' : 'r80'); }
function fmt(n){ return n.toLocaleString('de-AT',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function pct(e){ return e===EFF.r32?'3,2 %':(e===EFF.r50?'5 %':'8 %'); }
// Kaufmännisch auf Cent runden. Der Umweg über toFixed ist nötig, weil
// 1.005*100 binär 100.49999999999999 ergibt und Math.round dann abschneidet.
function round2(n){ return Math.round(Number((n*100).toFixed(6)))/100; }
// Frist in Monaten nach § 902 ABGB: fehlt der Anfangstag im Zielmonat, endet sie
// am Monatsletzten. setUTCMonth allein würde den 31.03. auf den 01.07. überrollen.
function plusMonths(ts,n){
  const d=new Date(ts), tag=d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+n);
  const letzter=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(tag,letzter));
  return d.getTime();
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]); }

/* --- CSV schreiben ---
   Gegenstueck zu parseCSV: eine Zelle wird gequotet, sobald sie den Trenner,
   ein Anfuehrungszeichen oder einen Zeilenumbruch enthaelt; enthaltene
   Anfuehrungszeichen werden verdoppelt (RFC 4180). Ohne das zerreisst ein
   Semikolon im Gastnamen die eigene Exportdatei — und genau die ist der
   Speicher fuer die Gastbetraege. */
function csvZelle(v){
  const s = String(v==null?'':v);
  return /[";\r\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function csvZeile(felder){ return felder.map(csvZelle).join(';'); }

/* Freitext für die menschenlesbaren Exporte. Tabellenprogramme werten einen
   Zellinhalt aus, der mit = + - @ oder einem Steuerzeichen beginnt; ein
   Gastname wie „=1+1“ wäre dort eine Formel. Ein vorangestelltes Apostroph
   verhindert das.

   Nur auf Freitext anwenden, niemals auf Zahlen — „-50,00“ beginnt ebenfalls
   mit einem geschützten Zeichen und würde als „'-50,00“ unbrauchbar. Und
   bewusst nicht in der Gastbeträge-Datei: die ist der Round-Trip-Speicher
   und muss unverändert wieder einlesbar sein. */
function csvText(v){
  const s = String(v==null?'':v);
  return /^[=+\-@\t\r]/.test(s) ? "'"+s : s;
}

/* --- CSV --- */
function parseCSV(text){
  text = text.replace(/^\uFEFF/,'');
  // Trenner aus der Kopfzeile bestimmen \u2014 gemischt geht nicht, sonst
  // zerrei\u00DFen Dezimalkommas in Semikolon-CSVs (Excel-Resave) die Zellen
  const nl=text.indexOf('\n'), first=nl<0?text:text.slice(0,nl);
  let sc=0, cc=0, fq=false;
  for(const ch of first){
    if(ch==='"') fq=!fq;
    else if(!fq){ if(ch===';') sc++; else if(ch===',') cc++; }
  }
  const sep = sc>=cc ? ';' : ',';
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else q=false; }
      else cell+=c;
    } else if(c==='"') q=true;
    else if(c===sep){ row.push(cell); cell=''; }
    else if(c==='\n'){ row.push(cell); rows.push(row); row=[]; cell=''; }
    else if(c!=='\r') cell+=c;
  }
  if(cell.length||row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r=>r.some(c=>c.trim()!==''));
}
function findCol(head, names, exakt){
  const norm = s => s.toLowerCase().replace(/[^a-z0-9äöüß#]/g,'');
  const h = head.map(norm);
  for(const n of names){ const i=h.indexOf(norm(n)); if(i>=0) return i; }
  if(exakt) return -1;   // kein Teilstring-Fallback: 'Type' darf nicht 'Inseratstyp' treffen
  for(const n of names){ const i=h.findIndex(x=>x.includes(norm(n))); if(i>=0) return i; }
  return -1;
}
function mkDate(y,mo,d){
  if(y<100) y+=2000;
  const t=Date.UTC(y,mo-1,d), c=new Date(t);
  return (c.getUTCMonth()===mo-1&&c.getUTCDate()===d) ? t : NaN;
}
function parseDate(s, ordnung){
  s=(s||'').trim();
  let m=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})\.?$/);
  if(m) return mkDate(+m[3],+m[2],+m[1]);
  // Uhrzeit darf dranhängen, beliebiger Text dahinter nicht: '2026-08-01xyz'
  // wurde früher als 1. August gelesen, statt die Zeile zu melden.
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if(m) return mkDate(+m[1],+m[2],+m[3]);
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m){
    // Ohne Befund aus der Datei bleibt es beim amerikanischen Format des
    // englischen Airbnb-Exports; ein Wert über 12 vorn ist für sich eindeutig.
    const dmy = ordnung ? ordnung==='dmy' : (+m[1]>12);
    return dmy ? mkDate(+m[3],+m[2],+m[1]) : mkDate(+m[3],+m[1],+m[2]);
  }
  return NaN;
}

/* Schrägstrich-Daten sind je Zelle nicht entscheidbar: 01/08/2026 ist der
   1. August oder der 8. Januar — im falschen Fall wandert die Buchung in einen
   anderen Meldemonat. 01/08–03/08 wurde so zu 59 statt 2 Nächten. Entschieden
   wird deshalb über die ganze Datei:
     1. Ein Wert über 12 an einer Position legt die Reihenfolge für alle fest.
     2. Bleibt es mehrdeutig, entscheidet die Spalte „Anzahl der Nächte“, wenn
        sie zu genau einer Lesart passt.
     3. Sonst: Warnung statt stiller Annahme. */
function datumsOrdnung(rows, ci){
  const spalten=[ci.start,ci.end].filter(x=>x>=0);
  const zelle=(r,c)=>String((rows[r]||[])[c]||'').trim();
  const slashRe=/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;
  let dmy=false, mdy=false, slash=0;
  for(let r=1;r<rows.length;r++) for(const c of spalten){
    const m=zelle(r,c).match(slashRe);
    if(!m) continue;
    slash++;
    if(+m[1]>12) dmy=true;
    if(+m[2]>12) mdy=true;
  }
  if(!slash)     return {ordnung:null, quelle:null, slash:0, widerspruch:false};
  if(dmy&&mdy)   return {ordnung:null, quelle:null, slash:slash, widerspruch:true};
  if(dmy)        return {ordnung:'dmy', quelle:'tag', slash:slash, widerspruch:false};
  if(mdy)        return {ordnung:'mdy', quelle:'tag', slash:slash, widerspruch:false};

  // Ganze Datei mehrdeutig — die Nächtespalte kann es auflösen
  if(ci.nights>=0 && ci.start>=0 && ci.end>=0){
    let tDmy=0, tMdy=0;
    for(let r=1;r<rows.length;r++){
      const cn=parseInt(zelle(r,ci.nights),10);
      if(!(cn>0)) continue;
      for(const o of ['dmy','mdy']){
        const a=parseDate(zelle(r,ci.start),o), b=parseDate(zelle(r,ci.end),o);
        if(isNaN(a)||isNaN(b)) continue;
        if(Math.round((b-a)/86400000)===cn){ if(o==='dmy') tDmy++; else tMdy++; }
      }
    }
    if(tDmy&&!tMdy) return {ordnung:'dmy', quelle:'naechte', slash:slash, widerspruch:false};
    if(tMdy&&!tDmy) return {ordnung:'mdy', quelle:'naechte', slash:slash, widerspruch:false};
  }
  return {ordnung:null, quelle:null, slash:slash, widerspruch:false};
}
/* Geldbetrag streng lesen. Rückgabe {wert,status} mit status
   'leer' | 'ok' | 'mehrdeutig' | 'ungueltig'.
   Der frühere tolerante Parser strich alles Nicht-Numerische weg und machte
   damit aus '100abc200' die Zahl 100200 und aus '1,2,3' die Zahl 1,2 —
   plausibel aussehende, aber grob falsche Beträge. Hier muss der ganze String
   zu einem Zahlenformat passen, sonst ist er ungültig. */
function leseGeld(roh){
  let s=String(roh==null?'':roh).trim();
  if(!s) return {wert:0,status:'leer'};
  let neg=false;
  const kl=s.match(/^\((.*)\)$/);            // Klammern sind ein negatives Vorzeichen
  if(kl){ neg=true; s=kl[1].trim(); }
  s=s.replace(/[€\s   ]/g,''); // Währungszeichen und Zwischenräume
  if(/^[-+]/.test(s)){ if(s.charAt(0)==='-') neg=!neg; s=s.slice(1); }
  if(!s||!/^[\d.,]+$/.test(s)) return {wert:0,status:'ungueltig'};

  const kommas=(s.match(/,/g)||[]).length, punkte=(s.match(/\./g)||[]).length;
  let wert, status='ok';

  if(kommas&&punkte){
    // Beide Zeichen da: das zuletzt stehende ist der Dezimaltrenner
    const de = s.lastIndexOf(',')>s.lastIndexOf('.');
    if(!(de?/^\d{1,3}(?:\.\d{3})+,\d+$/:/^\d{1,3}(?:,\d{3})+\.\d+$/).test(s))
      return {wert:0,status:'ungueltig'};
    wert=parseFloat(de ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,''));
  } else if(!kommas&&!punkte){
    wert=parseFloat(s);
  } else {
    const tr=kommas?',':'.', teile=s.split(tr);
    if(teile.some(x=>!/^\d+$/.test(x))) return {wert:0,status:'ungueltig'};
    if(teile.length>2){
      // Mehrfach derselbe Trenner kann nur Tausendergruppierung sein
      if(teile[0].length>3||teile.slice(1).some(x=>x.length!==3))
        return {wert:0,status:'ungueltig'};
      wert=parseFloat(teile.join(''));
    } else {
      // '1.234' bzw. '1,234': Tausendertrenner oder Dezimaltrenner? Aus dem
      // Wert allein nicht entscheidbar — deshalb gemeldet statt stillschweigend
      // interpretiert. Echte Airbnb-Beträge haben immer zwei Nachkommastellen.
      if(teile[1].length===3&&teile[0].length<=3) status='mehrdeutig';
      wert=parseFloat(teile[0]+'.'+teile[1]);
    }
  }
  if(!isFinite(wert)) return {wert:0,status:'ungueltig'};
  return {wert:neg?-wert:wert, status:status};
}
/* Bequemer Zugriff für Stellen, die nur die Zahl brauchen. */
function parseMoney(s){ const g=leseGeld(s); return g.status==='ungueltig'?0:g.wert; }

/* --- Einnahmen-Export (Transaktionsverlauf) ---
   Seit Airbnb den Reservierungs-Export abgeschafft hat, ist das die einzige
   Quelle. Er listet Zahlungen statt Aufenthalte: Auszahlungszeilen ohne
   Buchung, und Aufenthalte ab einem Monat in Monatsraten, die jeweils eine
   eigene Zeile bekommen. Hier wird er in genau die Tabelle übersetzt, die
   compute() ohnehin liest — eine Zeile je Bestätigungs-Code. Damit gibt es
   keinen zweiten Rechenweg; übersetzt wird nur das Format.

   „Bruttoeinkünfte“ ist Auszahlung plus Airbnb-Gebühr des Gastgebers, also
   exakt das, was compute() sonst aus der Auszahlung hochrechnet. Es wird als
   eigene Spalte weitergereicht und ersetzt dort die Hochrechnung. */
function istEinnahmenExport(head){
  return findCol(head,['Typ','Type'],true)>=0 && (findCol(head,['Bruttoeinkünfte','Gross earnings'])>=0
      || findCol(head,['Ausgezahlt','Paid out'])>=0 || findCol(head,['Referenzcode','Reference code'])>=0);
}

/* Wie viele Monatsraten ein Aufenthalt hat: Airbnb zahlt ab dem Check-in je
   Kalendermonat eine Rate (18.06.–19.07. → zwei: 30 Nächte und 1 Nacht).
   Unter einem Monat ist es eine Zahlung. */
function erwarteteRaten(a,b){
  let k=1;
  while(plusMonths(a,k)<b) k++;
  return k;
}

/* Wie viele Nächte die vorhandenen Raten abdecken. Welche Rate eine Zahlung
   ist, sagt ihr Auszahlungsdatum: Airbnb zahlt kurz nach Beginn des jeweiligen
   Ratenmonats aus. Im Export vom 24.09.2026 rechnen sich 3 von 4 Aufenthalten
   aus jeder einzelnen Rate auf den Cent hoch; einer mit Anreise am 30.01.
   weicht um 4–5 % ab (Monatsende im Februar). null heißt: nicht zuordenbar —
   Datum fehlt, liegt vor der Anreise, oder zwei Zahlungen fallen auf dieselbe
   Rate. */
function gedeckteNaechte(a,b,daten){
  const soll=erwarteteRaten(a,b), belegt=new Set();
  for(const d of daten){
    const t=parseDate(d);
    if(isNaN(t)) return null;
    let i=-1;
    for(let k=0;k<soll;k++) if(plusMonths(a,k)<=t) i=k;
    if(i<0 || belegt.has(i)) return null;
    belegt.add(i);
  }
  let n=0;
  belegt.forEach(i=>{ n+=Math.round((Math.min(plusMonths(a,i+1),b)-plusMonths(a,i))/86400000); });
  return n;
}

const BRUTTO_SPALTE='Bruttoeinkünfte Gastgeber', RATEN_SPALTE='Monatsraten';

/* Eine Rate in der Tabellenzelle: „Datum|Auszahlung|Brutto“, mehrere durch
   Leerzeichen getrennt. Beträge mit Punkt und ohne Tausendertrenner — fmt()
   setzt je nach Umgebung ein schmales Leerzeichen, und das zerlegte die Zelle.
   Je Rate statt nur als Summe: zwei Importe mit je einer anderen Rate
   derselben Buchung lassen sich sonst nicht zusammenführen. */
function rateAlsText(r){
  const z=x=>typeof x==='number'&&isFinite(x) ? String(round2(x)) : '';
  return [r.datum||'?', z(r.betrag), z(r.brutto)].join('|').replace(/\|+$/,'');
}
function rateAusText(t){
  const [datum,betrag,brutto]=String(t).split('|');
  const z=x=>x!==undefined && x!=='' && isFinite(+x) ? +x : null;
  return {datum:datum||'?', betrag:z(betrag), brutto:z(brutto)};
}
/* Gespeicherte Raten lesen — auch die frühe Form, eine bloße Datumsliste. */
function ratenListe(d){
  return Array.isArray(d&&d.raten) ? d.raten.map(r=>typeof r==='string' ? {datum:r,betrag:null,brutto:null}
    : {datum:r.datum||'?', betrag:typeof r.betrag==='number'?r.betrag:null, brutto:typeof r.brutto==='number'?r.brutto:null}) : [];
}

function ausEinnahmenExport(rows){
  const head=rows[0];
  const c={
    datum:  findCol(head,['Datum','Date'],true),
    typ:    findCol(head,['Typ','Type'],true),
    code:   findCol(head,['Bestätigungs-Code','Confirmation code'],true),
    start:  findCol(head,['Startdatum','Start date'],true),
    end:    findCol(head,['Enddatum','End date'],true),
    nights: findCol(head,['Nächte','Nights'],true),
    name:   findCol(head,['Gast','Guest'],true),
    listing:findCol(head,['Inserat','Listing'],true),
    waehrung:findCol(head,['Währung','Currency'],true),
    betrag: findCol(head,['Betrag','Amount'],true),
    gebuehr:findCol(head,['Servicegebühr','Service fee'],true),
    brutto: findCol(head,['Bruttoeinkünfte','Gross earnings'],true),
    steuer: findCol(head,['Von Airbnb abgeführte Steuer','Occupancy taxes','Taxes withheld by Airbnb'],true)
  };
  const fehlt=['typ','code','start','end','betrag'].filter(k=>c[k]<0);
  if(fehlt.length)
    throw new Error('Das sieht nach dem Einnahmen-Export aus, aber es fehlen Spalten ('
      +fehlt.map(k=>({typ:'Typ',code:'Bestätigungs-Code',start:'Startdatum',end:'Enddatum',betrag:'Betrag'})[k]).join(', ')
      +'). Gefundene Kopfzeile: '+head.join(' | '));

  const dOrd=datumsOrdnung(rows,{start:c.start,end:c.end,nights:c.nights});
  const zelle=(row,i)=>i>=0?String(row[i]==null?'':row[i]).trim():'';
  const hinweise=[], gruppen=new Map(), einzeln=[], fremd=[], waehrungen=new Set(), inserate=new Set();
  let zahlungszeilen=0;

  for(let r=1;r<rows.length;r++){
    const row=rows[r];
    if(!row || row.every(x=>!String(x==null?'':x).trim())) continue;
    const typ=zelle(row,c.typ), code=zelle(row,c.code);
    if(/^(payout|auszahlung)$/i.test(typ)) continue;       // Überweisung aufs Konto, keine Buchung
    if(!/^(buchung|reservierung|reservation)$/i.test(typ)){
      // Anpassungen, Stornogebühren, Erstattungen: was sie für das Entgelt
      // bedeuten, steht nicht in der Datei. Nicht raten, sondern nennen.
      const betrag=zelle(row,c.betrag)||zelle(row,c.brutto);
      if(code||betrag) fremd.push((typ||'ohne Typ')+(code?' zu '+code:'')+(betrag?' ('+betrag+')':''));
      continue;
    }
    zahlungszeilen++;
    if(c.waehrung>=0 && zelle(row,c.waehrung)) waehrungen.add(zelle(row,c.waehrung));
    if(c.listing>=0 && zelle(row,c.listing)) inserate.add(zelle(row,c.listing));
    const betrag=leseGeld(zelle(row,c.betrag));
    const brutto=c.brutto>=0 ? leseGeld(zelle(row,c.brutto)) : {wert:0,status:'leer'};
    const steuer=c.steuer>=0 ? leseGeld(zelle(row,c.steuer)) : {wert:0,status:'leer'};
    // Ohne Code lässt sich nichts zusammenfassen — die Zeile geht einzeln
    // durch und bekommt in compute() einen flüchtigen Schlüssel.
    const schluessel=code || ('#'+r);
    let g=gruppen.get(schluessel);
    if(!g){
      g={code, start:zelle(row,c.start), end:zelle(row,c.end), nights:zelle(row,c.nights),
         name:zelle(row,c.name), listing:zelle(row,c.listing),
         betrag:0, brutto:0, steuer:0, raten:[], roh:[], unlesbar:false, ohneBrutto:false};
      gruppen.set(schluessel,g);
      if(!code) einzeln.push(schluessel);
    }else if(g.start!==zelle(row,c.start) || g.end!==zelle(row,c.end)){
      hinweise.push(code+' ('+g.name+') — die Raten nennen unterschiedliche Zeiträume ('
        +g.start+'–'+g.end+' / '+zelle(row,c.start)+'–'+zelle(row,c.end)+'). Gerechnet wird mit dem '
        +'ersten; die Buchung wurde vermutlich geändert und gehört geprüft.');
    }
    // Das Auszahlungsdatum je Rate — daran erkennt compute(), welche Rate
    // vorliegt, wenn eine fehlt.
    const dt=parseDate(zelle(row,c.datum),dOrd.ordnung);
    g.raten.push({datum:isNaN(dt)?'?':isoTag(dt),
                  betrag:betrag.status==='ungueltig'?null:betrag.wert,
                  brutto:brutto.status==='ok'||brutto.status==='mehrdeutig'?brutto.wert:null});
    g.roh.push(zelle(row,c.betrag));
    if(betrag.status==='ungueltig') g.unlesbar=true;
    else if(betrag.status==='mehrdeutig')
      hinweise.push((code||'Zeile '+(r+1))+' — Betrag „'+zelle(row,c.betrag)+'“ ist mehrdeutig, gerechnet wird mit '+fmt(betrag.wert)+' €.');
    g.betrag+=betrag.wert;
    if(brutto.status==='ungueltig' || brutto.status==='leer') g.ohneBrutto=true;
    else g.brutto+=brutto.wert;
    if(steuer.status!=='ungueltig') g.steuer+=steuer.wert;
  }

  const kopf=['Bestätigungs-Code','Status','Name des Gastes','Startdatum','Enddatum',
              'Anzahl der Nächte','Einkünfte',BRUTTO_SPALTE,RATEN_SPALTE];
  const zeilen=[kopf];
  const iso=s=>{ const t=parseDate(s,dOrd.ordnung); return isNaN(t)?s:isoTag(t); };
  gruppen.forEach(g=>{
    // Eine unlesbare Rate macht die Summe wertlos. Der Rohtext geht weiter,
    // damit compute() die Zeile als unlesbar meldet und sie nicht speichert.
    const einkuenfte = g.unlesbar ? g.roh.join(' + ') : fmt(g.betrag);
    zeilen.push([g.code,'Bestätigt',g.name,iso(g.start),iso(g.end),g.nights,einkuenfte,
                 g.ohneBrutto||!(g.brutto>0) ? '' : fmt(g.brutto), g.raten.map(rateAlsText).join(' ')]);
    if(g.steuer>0.005)
      hinweise.push((g.code||'Zeile ohne Code')+' ('+g.name+') — laut Export hat Airbnb '+fmt(g.steuer)
        +' € Steuer abgeführt („Von Airbnb abgeführte Steuer“). Das Werkzeug rechnet die Ortstaxe '
        +'trotzdem voll: ob dieser Betrag Ortstaxe ist, steht nicht in der Datei — vor der Meldung '
        +'in der Airbnb-Abrechnung prüfen, damit nichts doppelt oder gar nicht gezahlt wird.');
  });

  hinweise.unshift('Einnahmen-Export erkannt: '+zahlungszeilen+' Zahlungszeile'+(zahlungszeilen===1?'':'n')
    +' zu '+(zeilen.length-1)+' Buchung'+(zeilen.length===2?'':'en')+' zusammengefasst. Enthalten ist nur, '
    +'was Airbnb bereits ausgezahlt hat — Aufenthalte, die im Exportzeitraum noch nicht '
    +'begonnen haben, fehlen. Für eine Meldung den Export deshalb erst nach Monatsende ziehen.');
  if(fremd.length)
    hinweise.push('Nicht verrechnet: '+fremd.join('; ')+'. Solche Zeilen (Anpassungen, Stornogebühren, '
      +'Erstattungen) verändern das Entgelt möglicherweise — was sie bedeuten, steht nicht in der '
      +'Datei. Bitte in der Airbnb-Abrechnung prüfen.');
  const fremdWaehrung=[...waehrungen].filter(w=>w.toUpperCase()!=='EUR');
  if(fremdWaehrung.length)
    hinweise.push('Die Datei enthält Beträge in '+fremdWaehrung.join(', ')+'. Gerechnet wird, als wäre alles in Euro.');
  if(inserate.size>1)
    hinweise.push('Die Datei enthält '+inserate.size+' Inserate ('+[...inserate].join(' / ')+'). Die Ortstaxe '
      +'wird für alle zusammen gerechnet — für getrennte Meldungen je Wohnung getrennt exportieren.');
  return {zeilen, hinweise};
}

/* --- Berechnung --- */
function compute(csvRows, opt){
  let einnahmenHinweise=[];
  if(csvRows && csvRows[0] && istEinnahmenExport(csvRows[0])){
    const u=ausEinnahmenExport(csvRows);
    csvRows=u.zeilen; einnahmenHinweise=u.hinweise;
  }
  const head=csvRows[0];
  const ci={
    code: findCol(head,['Bestätigungs-Code','Confirmation code','Code']),
    status: findCol(head,['Status']),
    name: findCol(head,['Name des Gastes','Guest name']),
    start: findCol(head,['Startdatum','Start date','Check-in']),
    end: findCol(head,['Enddatum','End date','Checkout']),
    nights: findCol(head,['Anzahl der Nächte','# of nights','Nights']),
    amount: findCol(head,['Einkünfte','Bruttoeinkünfte','Earnings','Gross earnings','Amount']),
    listing: findCol(head,['Inserat','Listing']),
    // Optionale Spalte, selbst gepflegt: der Betrag aus der App unter
    // „Verdienste → Vom Gast bezahlt“. Ist er da, wird exakt gerechnet.
    paid: findCol(head,['Vom Gast bezahlt','Gesamt vom Gast','Gast bezahlt',
                        'Total paid by guest','Guest paid','Paid by guest']),
    // Nur aus dem übersetzten Einnahmen-Export oder dem gespeicherten Bestand.
    // Exakt gesucht: ein Reservierungs-Export mit „Bruttoeinkünfte“ als
    // Betragsspalte darf hier nicht hineinrutschen.
    brutto: findCol(head,[BRUTTO_SPALTE],true),
    raten: findCol(head,[RATEN_SPALTE],true)
  };
  if(ci.start<0||ci.end<0||ci.amount<0)
    throw new Error('Die Spalten Startdatum, Enddatum und Einkünfte wurden nicht gefunden. Gefundene Kopfzeile: '+head.join(' | '));

  // Von der Auszahlung auf das, was der Gast aufwendet: erst die einbehaltene
  // Gastgebergebühr zurückrechnen, dann die Gast-Servicegebühr aufschlagen —
  // beide sind nach MA-6-FAQ 16 Bestandteil des Beherbergungsentgelts.
  // Die Gastgebergebühr ist ein fixer Prozentsatz und lässt sich aus der
  // Auszahlung exakt zurückrechnen. Die Gast-Servicegebühr nicht: Airbnb
  // staffelt sie nach Dauer und Preis — belegt sind 14,0 % netto bei sieben
  // Nächten und 9,8 % bei 42. Aus der Auszahlung ist sie nicht herleitbar,
  // weil sie die Gastgeberseite nie berührt. Steht „Vom Gast bezahlt“ in der
  // CSV, wird sie je Buchung daraus bestimmt; sonst bleibt nur der Pauschalsatz.
  // Ungueltige Gebuehren duerfen nicht bis in die Zahlen durchschlagen: bei
  // wirksamen 100 % ergibt 1/(1-fee/100) Infinity, und die Tabelle zeigte stumm
  // „∞“. Die min/max der Eingabefelder prueft zur Laufzeit niemand nach.
  if(!(opt.fee>=0)||opt.fee>=100)
    throw new Error('Die wirksame Gastgebergebühr muss zwischen 0 und unter 100 % liegen — aktuell '
      +(isFinite(opt.fee)?fmt(opt.fee)+' %':'kein lesbarer Wert')+'. Ohne hinterlegte UID schlägt das '
      +'Tool 20 % Umsatzsteuer auf die Gebühr auf, aus 3,0 % werden also 3,6 % wirksam.');
  if(!(opt.gastfee>=0)||opt.gastfee>=100)
    throw new Error('Die Gast-Servicegebühr muss zwischen 0 und unter 100 % liegen — aktuell '
      +(isFinite(opt.gastfee)?fmt(opt.gastfee)+' %':'kein lesbarer Wert')+'.');
  const hostGross = 1/(1 - (opt.fee/100));
  const guestF    = 1 + (opt.gastfee/100);
  const USTF_SERVICE = 1.20;   // Airbnb verrechnet 20 % österreichische USt auf die Servicegebühr
  const ustF = opt.basis==='ust10' ? 1.10 : 1.00;
  let pauschal=0, fluechtig=0;
  /* Zeilen, die wegen ihres Status nicht in die Meldung gehören. Sie werden
     zurückgegeben, damit ein Abgleich mit einem gespeicherten Bestand die
     Stornierung mitbekommt — „fehlt in der Datei“ und „ausdrücklich storniert“
     sind zwei verschiedene Dinge. */
  const storniert=[];

  const bookings=[], months={}, warn=einnahmenHinweise.slice(), seen=Object.create(null);
  let nurGastgeberZahl=0;
  // Datumsformat einmal für die ganze Datei bestimmen, nicht je Zelle raten
  const dOrd=datumsOrdnung(csvRows,ci);
  if(dOrd.widerspruch)
    warn.push('Die Datumsspalten enthalten Schrägstrich-Daten in beiden Reihenfolgen '
      +'(TT/MM und MM/TT gleichzeitig). Die Zuordnung zu Meldemonaten ist damit nicht '
      +'verlässlich — bitte die CSV mit einheitlichem Datumsformat neu exportieren.');
  else if(dOrd.slash && !dOrd.ordnung)
    warn.push('Die Datumsangaben stehen im Schrägstrich-Format und sind in dieser Datei '
      +'nicht eindeutig: kein Wert liegt über 12. Gelesen wird als MM/TT/JJJJ wie im '
      +'englischen Airbnb-Export. Steht dort TT/MM, wandern Buchungen in falsche '
      +'Meldemonate — zum Prüfen die Spalte „Anzahl der Nächte“ mitexportieren.');

  for(let r=1;r<csvRows.length;r++){
    const row=csvRows[r];
    const status=(ci.status>=0?row[ci.status]:'')||'';
    // Nur ein echter Bestaetigungs-Code identifiziert eine Buchung dauerhaft.
    // Ohne ihn bekommt die Zeile zwar ein Anzeige-Label, aber einen fluechtigen
    // Schluessel — sonst landet ein gemerkter Gastbetrag beim naechsten Import
    // auf der fremden Buchung, die zufaellig in derselben Zeile steht.
    const codeRoh=(ci.code>=0?(row[ci.code]||'').trim():'');
    const code=codeRoh||('Zeile '+(r+1));
    const key=codeRoh||('#zeile'+(r+1));
    const stabil=!!codeRoh;
    if(!stabil) fluechtig++;
    const name=(ci.name>=0?row[ci.name]:'')||'';
    const a=parseDate(row[ci.start],dOrd.ordnung), b=parseDate(row[ci.end],dOrd.ordnung);
    const gPay=leseGeld(row[ci.amount]);       // Auszahlung, wie sie in der CSV steht
    if(gPay.status==='ungueltig')
      warn.push(code+' ('+name+') — Betrag „'+(row[ci.amount]||'')+'“ ist kein lesbarer Geldwert. '
        +'Wird mit 0 gerechnet — die Zeile gehört vor der Meldung geklärt.');
    else if(gPay.status==='mehrdeutig')
      warn.push(code+' ('+name+') — Betrag „'+(row[ci.amount]||'')+'“ ist mehrdeutig: ein Trennzeichen '
        +'mit drei folgenden Ziffern kann Tausender- oder Dezimaltrenner sein. Gerechnet wird mit '
        +fmt(gPay.wert)+' € — bitte gegen den Beleg prüfen.');
    const netPay=gPay.wert;
    const betragStatus=gPay.status;   // 'leer' | 'ok' | 'mehrdeutig' | 'ungueltig'
    // Liegen die Bruttoeinkünfte vor (Einnahmen-Export), sind sie das exakte
    // Entgelt vor Airbnb-Gebühr — die Hochrechnung mit dem eingestellten
    // Prozentsatz entfällt. Eine Gebühr über 10 % heißt: Airbnb-Modell „nur
    // Gastgeber zahlt“ (15,5 % + 20 % USt = 18,6 %). Dann zahlt der Gast keine
    // eigene Servicegebühr, und der Bruttobetrag ist bereits sein Preis.
    const gBrutto = ci.brutto>=0 ? leseGeld(row[ci.brutto]) : null;
    const brutto = gBrutto && gBrutto.status!=='ungueltig' && gBrutto.wert>0 ? gBrutto.wert : 0;
    const nurGastgeber = brutto>0 && (brutto-netPay)/brutto > 0.10;
    const basis = brutto>0 ? brutto : netPay*hostGross;
    // Was im Tool eingetippt wurde, schlägt die CSV-Spalte. Eine geleerte
    // Eingabe ist 0 und fällt damit bewusst auf den Prozentsatz zurück.
    const ov=opt.paid ? opt.paid[key] : undefined;
    const ausDatei = ci.paid>=0 ? row[ci.paid] : '';
    const gPaid=leseGeld(ov!==undefined ? ov : ausDatei);
    // Woher der Gastbetrag kommt. Ohne dieses Feld war der Konfliktzweig in
    // verschmelzeBuchungen unerreichbar: alsBuchungsdokument setzte immer
    // 'datei', und nur die Tests konstruierten 'manuell' von Hand.
    // „manuell“ heißt: ein Mensch hat etwas anderes gesetzt als die Datei sagt.
    // Nur „kam aus der Eingabe“ genügt nicht — merkeGastbetraege schreibt die
    // Dateiwerte selbst nach paidRaw, die wären sonst alle „manuell“.
    const gDateiV = ausDatei ? leseGeld(ausDatei) : null;
    const gastbetragQuelle =
      ov===undefined ? 'datei'
      : (gDateiV && gDateiV.status!=='ungueltig' && Math.abs(gDateiV.wert-gPaid.wert)<=0.005)
        ? 'datei' : 'manuell';
    // Ein gemerkter Wert schlägt die Datei — das ist gewollt, darf aber nicht
    // still geschehen, wenn beide etwas anderes sagen.
    if(ov!==undefined && ausDatei){
      if(gDateiV && gDateiV.status!=='leer' && gDateiV.status!=='ungueltig'
         && Math.abs(gDateiV.wert-gPaid.wert)>0.005)
        warn.push(code+' ('+name+') — die Datei nennt '+fmt(gDateiV.wert)+' € als Gastbetrag, '
          +'im Tool stehen '+fmt(gPaid.wert)+' €. Gerechnet wird mit dem Wert aus dem Tool. '
          +'Zum Übernehmen des Dateiwerts das Feld leeren — dann greift wieder der Wert '
          +'aus der Datei.');
    }
    if(gPaid.status==='ungueltig')
      warn.push(code+' ('+name+') — „Vom Gast bezahlt“ ist kein lesbarer Geldwert. '
        +'Der Wert wird ignoriert, gerechnet wird mit dem Prozentsatz.');
    const paid=gPaid.wert;
    // Der Status des Gastbetrags getrennt vom Status der Auszahlung. Ohne ihn
    // prüfte der Speicherfilter nur die Auszahlung, und eine Fehleingabe wie
    // „abc“ im Gastbetragsfeld schrieb null über einen gültigen gespeicherten
    // Wert — mit der Anzeige „gespeichert“.
    const gastbetragStatus=gPaid.status;   // 'leer' | 'ok' | 'mehrdeutig' | 'ungueltig'
    // Woher der gerechnete Betrag stammt. Ohne dieses Feld sah ein verworfener
    // Gastbetrag in der Tabelle aus wie ein belegter: das Feld war gefüllt,
    // gerechnet wurde aber mit dem Pauschalsatz.
    let amt, betragQuelle;
    if(paid>0 && paid+0.005>=basis){
      amt = basis + (paid-basis)/USTF_SERVICE;   // Gast-Servicegebühr brutto → netto
      betragQuelle = 'beleg';
    }else if(nurGastgeber){
      amt = basis;
      betragQuelle = 'beleg';
    }else{
      if(paid>0) warn.push(code+' ('+name+') — „Vom Gast bezahlt“ ('+fmt(paid)
        +' €) liegt unter dem hochgerechneten Entgelt ('+fmt(basis)
        +' €). Der Wert wird ignoriert, gerechnet wird mit dem Prozentsatz.');
      amt = basis*guestF; pauschal++;
      betragQuelle = 'geschaetzt';
    }

    // Nur Bestätigtes ist eine Nächtigung. Anfragen, ausstehende und abgelaufene
    // Buchungen haben nie stattgefunden und gehören nicht in die Meldung.
    const st=status.trim();
    if(/storn|cancel|abgelehnt|declin|abgelaufen|expired|anfrage|inquir|ausstehend|pending|zeitüberschreitung|timed ?out/i.test(st)){
      warn.push(code+' ('+name+') übersprungen — Status „'+st+'“.');
      // Nicht nur überspringen, sondern festhalten: sonst erfährt ein späterer
      // Abgleich nie, dass diese Buchung storniert wurde, und ein früher
      // gespeicherter bestätigter Stand bliebe steuerpflichtig stehen.
      if(!isNaN(a) && !isNaN(b) && b>a)
        storniert.push({code,key,stabil,name,status:st,a,b,netPay,paid:0,
                        gastbetragQuelle:null,betragStatus});
      continue;
    }
    // Der deutsche Export schreibt je nach Zeitpunkt „Aktueller Gast“, „Früherer
    // Gast“ oder „Gast bewerten – läuft bald ab“ — alles stattgefundene
    // Aufenthalte. Ohne sie hier warnt das Tool auf jeder Zeile und die
    // Warnliste wird wertlos. „bewert“ deckt bewerten wie bewertet ab; was
    // wirklich nicht stattgefunden hat, ist oben schon aussortiert.
    if(st && !/best(ä|ae)tigt|confirmed|vergangen|past|aktueller gast|currently hosting|fr(ü|ue)herer|bewert|review/i.test(st))
      warn.push(code+' ('+name+') — unbekannter Status „'+st+'“, wird als bestätigt gerechnet.');
    if(isNaN(a)||isNaN(b)){ warn.push(code+' übersprungen — Datum nicht lesbar: „'+row[ci.start]+'“ / „'+row[ci.end]+'“.'); continue; }
    const nights=Math.round((b-a)/86400000);
    if(nights<=0){ warn.push(code+' übersprungen — '+nights+' Nächte.'); continue; }
    if(ci.nights>=0){
      const cn=parseInt(row[ci.nights],10);
      if(cn>0&&cn!==nights) warn.push(code+' ('+name+') — CSV nennt '+cn+' Nächte, aus den Daten ergeben sich '+nights+'. Bitte Datumsformat prüfen.');
    }
    // Derselbe Bestätigungs-Code darf nur einmal in die Meldung. Vorher warnte
    // das Tool zwar, rechnete aber beide Zeilen — aus 4,76 € wurden 9,52 €.
    // Bei abweichenden Daten wird der Widerspruch benannt statt still eine
    // der beiden Zeilen zu bevorzugen; gerechnet wird mit der ersten.
    if(seen[code]){
      const v=seen[code];
      if(v.a===a && v.b===b && v.netPay===netPay)
        warn.push(code+' ('+name+') kommt mehrfach mit identischen Daten vor — '
          +'die Zeile wird nur einmal gerechnet.');
      else
        warn.push(code+' ('+name+') kommt mehrfach vor, aber mit abweichenden Daten '
          +'('+csvDatum(v.a)+'–'+csvDatum(v.b)+' / '+fmt(v.netPay)+' € gegen '
          +csvDatum(a)+'–'+csvDatum(b)+' / '+fmt(netPay)+' €). Gerechnet wird die erste '
          +'Zeile — welche stimmt, gehört vor der Meldung geklärt.');
      continue;
    }
    seen[code]={a:a,b:b,netPay:netPay};
    // Monatsraten aus dem Einnahmen-Export: fehlt eine, ist der Betrag nur ein
    // Teil des Entgelts und wird trotzdem über alle Nächte verteilt — jeder
    // Monat des Aufenthalts fiele zu niedrig aus. Das darf nicht still passieren.
    // Die Zelle trägt je Rate ihr Auszahlungsdatum ('?' wenn unbekannt).
    const ratenListe = ci.raten>=0 ? String(row[ci.raten]||'').trim().split(/\s+/).filter(Boolean).map(rateAusText) : [];
    const ratenDaten = ratenListe.map(r=>r.datum);
    const raten = ratenListe.length;
    const ratenSoll = raten ? erwarteteRaten(a,b) : 0;
    if(raten && raten<ratenSoll){
      const fehlt=code+' ('+name+') — nur '+raten+' von '+ratenSoll+' Monatsraten in der Datei. '
        +'Fehlt eine spätere Rate, ist sie noch nicht ausgezahlt; fehlt eine frühere, liegt sie vor '
        +'dem Exportzeitraum. ';
      const gedeckt = gedeckteNaechte(a,b,ratenDaten);
      if(gedeckt>0 && gedeckt<nights){
        // Hochrechnen: die vorhandenen Raten decken `gedeckt` Nächte, der
        // Preis je Nacht gilt für den ganzen Aufenthalt. Gespeichert bleibt
        // der Rohwert — hochgerechnet wird bei jeder Rechnung neu.
        const basisH = basis*nights/gedeckt;
        if(nurGastgeber && paid>0 && paid+0.005>=basis){
          // „Nur Gastgeber zahlt“: was der Gast zahlt, ist das Bruttoentgelt.
          // Mit dem Betrag aus der App ist der Aufenthalt also exakt bekannt.
          amt=paid; betragQuelle='beleg';
          warn.push(fehlt+'Gerechnet wird exakt mit dem eingetragenen Betrag „Vom Gast bezahlt“ ('
            +fmt(paid)+' €) — im Modell „nur Gastgeber zahlt“ ist das das ganze Entgelt.');
        }else{
          if(nurGastgeber) amt=basisH;
          else if(paid>0 && paid+0.005>=basisH) amt=basisH+(paid-basisH)/USTF_SERVICE;
          else amt=basisH*guestF;
          betragQuelle='hochgerechnet';
          warn.push(fehlt+'Hochgerechnet aus '+gedeckt+' von '+nights+' Nächten auf '+fmt(amt)
            +' € — eine Schätzung, die bei gleichbleibendem Nachtpreis meist auf den Cent stimmt. '
            +(nurGastgeber
              ? 'Exakt wird es, wenn du den Betrag „Vom Gast bezahlt“ aus der App einträgst.'
              : 'Genauer wird es mit dem Betrag „Vom Gast bezahlt“ aus der App; exakt mit einem Export, der alle Raten enthält.'));
        }
      }else{
        warn.push(fehlt+'Welche Rate vorliegt, lässt sich nicht bestimmen — der Betrag ist unvollständig, '
          +'die Ortstaxe dieses Aufenthalts in jedem Monat zu niedrig. Für die Meldung einen Export '
          +'ziehen, der alle Raten enthält.');
        betragQuelle='unvollstaendig';
      }
    }else if(raten>ratenSoll)
      warn.push(code+' ('+name+') — '+raten+' Zahlungen, erwartet waren '+ratenSoll
        +'. Alle wurden zusammengezählt; bitte gegen die Airbnb-Abrechnung prüfen.');
    if(nurGastgeber) nurGastgeberZahl++;
    if(!amt) warn.push(code+' ('+name+') hat keinen Betrag — wird mit 0 gerechnet.');
    else if(amt<0) warn.push(code+' ('+name+') hat einen negativen Betrag ('+fmt(amt)+' €) — Gutschrift oder Anpassung? Wird gegengerechnet.');

    // § 11 Abs. 3 WTFG: befreit ist, wer länger als drei Monate ununterbrochen
    // Aufenthalt nimmt — und zwar als Person, also für den gesamten Aufenthalt.
    const limit = plusMonths(a,3);
    const exempt = b > limit;

    const per=amt/nights, segs=[], byKey={};
    let taxTotal=0, baseTotal=0;
    for(let i=0;i<nights;i++){
      const ts=a+i*86400000, d=new Date(ts);
      const reg=regimeOf(ts), e=EFF[reg];
      const base = exempt ? 0 : per/(ustF+e);
      const tax  = exempt ? 0 : base*e;
      baseTotal+=base; taxTotal+=tax;
      const mk=d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');
      const key=mk+'|'+reg;
      if(!byKey[key]) byKey[key]={month:mk,reg:reg,nights:0,base:0,tax:0};
      byKey[key].nights++; byKey[key].base+=base; byKey[key].tax+=tax;
      if(!exempt){
        if(!months[key]) months[key]={month:mk,reg:reg,nights:0,base:0,tax:0};
        months[key].nights++; months[key].base+=base; months[key].tax+=tax;
      }
      segs.push(reg);
    }
    const cls = exempt ? 'lang' : (nights<=30 ? 'kurz' : 'grau');
    bookings.push({code,key,stabil,name,status:st,a,b,nights,amt,paid,betragQuelle,gastbetragQuelle,betragStatus,gastbetragStatus,netPay,brutto,raten,ratenListe,ratenSoll,exempt,cls,base:baseTotal,tax:taxTotal,
                   parts:Object.values(byKey).sort((x,y)=>x.month.localeCompare(y.month)),segs});
  }
  if(fluechtig)
    warn.push(fluechtig+(fluechtig===1?' Zeile hat':' Zeilen haben')+' keinen Bestaetigungs-Code. '
      +'Eingetippte Gastbetraege gelten dort nur fuer diese Sitzung und werden beim naechsten '
      +'Import nicht wieder zugeordnet — sonst koennten sie auf einer fremden Buchung landen. '
      +'Fuer dauerhafte Zuordnung die Spalte „Bestaetigungs-Code“ in die CSV aufnehmen.');
  if(pauschal && opt.gastfee>0)
    warn.push(pauschal+(pauschal===1?' Buchung wurde':' Buchungen wurden')+' mit pauschal '
      +opt.gastfee+' % Gast-Servicegebühr gerechnet — Airbnb staffelt diese Gebühr nach Dauer '
      +'und Preis, der Wert ist also geschätzt. Für eine exakte Meldung den Betrag aus der '
      +'Airbnb-App („Vom Gast bezahlt“) in der Buchungstabelle eintragen.');
  if(nurGastgeberZahl)
    warn.push(nurGastgeberZahl+(nurGastgeberZahl===1?' Buchung läuft':' Buchungen laufen')
      +' im Airbnb-Modell „nur Gastgeber zahlt“ (Gebühr über 10 % der Bruttoeinkünfte). '
      +'Dort zahlt der Gast keine eigene Servicegebühr; gerechnet wird exakt mit den '
      +'Bruttoeinkünften, ohne Aufschlag.');
  return {bookings,storniert,months:Object.values(months).sort((x,y)=>x.month.localeCompare(y.month)||x.reg.localeCompare(y.reg)),warn};
}

/* --- 90-Tage-Zähler (Bauordnung) --- */
function occupancy(bookings, mode, heute){
  // Für die Planung zählt nicht nur, was schon verbraucht ist, sondern auch,
  // was bereits fest vergeben ist. „heute“ ist nur für den Selbsttest da.
  const t0 = heute!==undefined ? heute
    : (()=>{ const n=new Date(); return Date.UTC(n.getFullYear(),n.getMonth(),n.getDate()); })();
  const years={};
  bookings.forEach(b=>{
    if(b.cls==='lang') return;
    const last = b.b + (mode==='days' ? 0 : -86400000);
    for(let ts=b.a; ts<=last; ts+=86400000){
      const y=new Date(ts).getUTCFullYear();
      if(!years[y]) years[y]={kurz:new Set(),grau:new Set(),von:ts};
      if(ts<years[y].von) years[y].von=ts;
      years[y][b.cls==='kurz'?'kurz':'grau'].add(ts);
    }
  });
  return Object.keys(years).sort().map(y=>{
    const kurz=years[y].kurz, grau=years[y].grau;
    const grauOnly=[...grau].filter(d=>!kurz.has(d));
    const kurzV=[...kurz].filter(d=>d<t0).length;
    const grauV=grauOnly.filter(d=>d<t0).length;
    return {year:+y, kurz:kurz.size, grau:grauOnly.length,
            kurzV:kurzV, kurzP:kurz.size-kurzV,
            grauV:grauV, grauP:grauOnly.length-grauV,
            von:years[y].von};
  });
}
/* Summen je Kalenderjahr für die Abgabenerklärung nach § 13 Abs. 2 WTFG.
   Gerundet wird je Meldeperiode, nicht am Jahresende — so wird auch bezahlt,
   und die Erklärung muss zu den zwölf Überweisungen passen. */
function jahressummen(months){
  const proMonat={}, jahre={};
  months.forEach(m=>{
    if(!proMonat[m.month]) proMonat[m.month]={base:0,grundlage:0,tax:0,nights:0};
    proMonat[m.month].base+=m.base;
    // Der 11-%-Pauschalabzug gilt je Satz, nicht je Jahr — deshalb hier
    // aufsummieren und nicht am Ende einmal anwenden.
    proMonat[m.month].grundlage+=steuergrundlage(m.base,m.reg);
    proMonat[m.month].tax+=m.tax;
    proMonat[m.month].nights+=m.nights;
  });
  Object.keys(proMonat).sort().forEach(k=>{
    const j=k.slice(0,4);
    if(!jahre[j]) jahre[j]={jahr:+j, monate:0, nights:0, base:0, grundlage:0, tax:0, von:k};
    const e=jahre[j];
    e.monate++; e.nights+=proMonat[k].nights;
    e.base     +=round2(proMonat[k].base);
    e.grundlage+=round2(proMonat[k].grundlage);
    e.tax      +=round2(proMonat[k].tax);
    if(k<e.von) e.von=k;
  });
  return Object.values(jahre).sort((a,b)=>a.jahr-b.jahr);
}

/* --- Ausgabe --- */
function monthLabel(m){ const [y,mo]=m.split('-'); return mo+'/'+y; }
function bandHTML(segs){
  let html='', prev=null;
  segs.forEach(s=>{ if(prev&&s!==prev) html+='<i class="tick"></i>'; html+='<i class="s'+s.slice(1)+'" style="flex:1"></i>'; prev=s; });
  return '<div class="band" title="'+segs.length+' Nächte">'+html+'</div>';
}

/* Werte aus der Spalte „Vom Gast bezahlt“ ins Gedächtnis übernehmen. Ohne das
   wären sie beim nächsten Upload der rohen Airbnb-CSV weg, obwohl dieselben
   Buchungen drinstehen. Bereits Eingetipptes bleibt unangetastet — auch eine
   bewusst geleerte Eingabe, die als leerer String hinterlegt ist. */
/* Liest nur die Gastbeträge aus einer zuvor exportierten Datei. Rührt die
   Buchungsliste nicht an — die kommt immer aus dem Airbnb-Export, damit die
   Reihenfolge der Uploads nichts kaputt macht. */
function leseGastbetraege(csvRows){
  const head=csvRows[0]||[];
  const ci={ code: findCol(head,['Bestätigungs-Code','Confirmation code','Code']),
             paid: findCol(head,['Vom Gast bezahlt','Gesamt vom Gast','Gast bezahlt',
                        'Total paid by guest','Guest paid','Paid by guest']) };
  if(ci.code<0||ci.paid<0)
    throw new Error('In dieser Datei fehlen die Spalten „Bestätigungs-Code“ und „Vom Gast bezahlt“. '
      +'Gemeint ist die Datei aus dem Knopf „Buchungen + Gastbeträge als CSV“. '
      +'Gefundene Kopfzeile: '+head.join(' | '));
  const map=Object.create(null);
  for(let i=1;i<csvRows.length;i++){
    const code=(csvRows[i][ci.code]||'').trim(), wert=(csvRows[i][ci.paid]||'').trim();
    if(code&&wert) map[code]=wert;
  }
  return map;
}

function merkeGastbetraege(bookings, ziel){
  bookings.forEach(b=>{ if(b.stabil && ziel[b.key]===undefined && b.paid) ziel[b.key]=fmt(b.paid); });
  return ziel;
}

/* --- Exportdateien ---
   Bewusst reine Funktionen ohne DOM: render() haengt sie nur an window, der
   Selbsttest ruft dieselben Funktionen auf. Sonst prueft der Test den
   Serializer, waehrend der echte Export daran vorbeilaufen koennte. */
/* Fußzeile der Monatstabelle. Summiert wird über dieselben gerundeten Werte,
   die in den Zeilen darüber stehen — sonst zeigt die Summe 285,71, während die
   Zeilen 285,72 ergeben. Bewusst außerhalb von render(), damit der Selbsttest
   die echte Fußzeile prüft statt die Formel nachzubauen. */
function monatsSummen(months){
  return months.reduce((s,m)=>({nights:s.nights+m.nights, base:s.base+round2(m.base),
                                tax:s.tax+round2(m.tax)}), {nights:0,base:0,tax:0});
}

/* Überweisungen an die MA 6: je Aufenthaltsmonat ein Betrag, fällig am 15.
   des Folgemonats (§ 13 Abs. 1 WTFG). Gerundet je Meldeperiode wie in der
   Monatstabelle. `faellig` ist ein ISO-Tag, damit sich danach filtern lässt,
   ohne dass die Oberfläche das Datum selbst ableitet. */
function ueberweisungen(months, konto){
  const proMonat={};
  months.forEach(m=>{ proMonat[m.month]=(proMonat[m.month]||0)+m.tax; });
  return Object.keys(proMonat).sort().map(k=>{
    const [y,mo]=k.split('-').map(Number);
    const fy=mo===12?y+1:y, fm=mo===12?1:mo+1;
    return {monat:k, faellig:fy+'-'+String(fm).padStart(2,'0')+'-15',
            betrag:round2(proMonat[k]), vz:(konto||'')+k.slice(5)+k.slice(0,4)};
  });
}

/* Filter nach Fälligkeitsmonat, beide Grenzen einschließlich. `von`/`bis` sind
   'JJJJ-MM' oder leer (offen). Gefiltert wird nach der Fälligkeit, nicht nach
   dem Aufenthalt: „Februar bis September fällig“ heißt Aufenthalte Jänner bis
   August. */
function filtereUeberweisungen(liste, von, bis){
  // `bis` darf auch ein Tag sein ('JJJJ-MM-TT', „bis heute fällig“): dann wird
  // der Fälligkeitstag verglichen, nicht der Monat.
  return liste.filter(u=>{
    const f=u.faellig.slice(0,7);
    return (!von || f>=von) && (!bis || (bis.length===10 ? u.faellig<=bis : f<=bis));
  });
}

function csvDatum(t){ return new Date(t).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}); }

function baueCsvMonate(res, konto){
  // Zwei getrennte Spalten statt einer irreführenden „Bemessungsgrundlage“:
  // bis 30.06.2026 ist das Entgelt nicht die steuerpflichtige Grundlage.
  return 'Meldemonat;Satz;Naechte;Entgelt_ohne_USt_Taxe;Grundlage_nach_Pauschale;Ortstaxe;Verwendungszweck\n'+
    res.months.map(m=>csvZeile([monthLabel(m.month),pct(EFF[m.reg]),m.nights,fmt(m.base),
      fmt(round2(steuergrundlage(m.base,m.reg))),
      fmt(round2(m.tax)),konto+m.month.split('-')[1]+m.month.split('-')[0]])).join('\n');
}

function baueCsvBuchungen(res){
  return 'Code;Gast;Von;Bis;Naechte;Betrag;Meldemonat;Satz;Naechte_Monat;Entgelt_ohne_USt_Taxe;Grundlage_nach_Pauschale;Ortstaxe\n'+
    res.bookings.flatMap(b=>{
      if(b.exempt) return [csvZeile([csvText(b.code),csvText(b.name),csvDatum(b.a),csvDatum(b.b),b.nights,fmt(b.amt),'befreit','','','','','0,00'])];
      return b.parts.map(p=>csvZeile([csvText(b.code),csvText(b.name),csvDatum(b.a),csvDatum(b.b),b.nights,fmt(b.amt),
        monthLabel(p.month),pct(EFF[p.reg]),p.nights,fmt(p.base),
        fmt(round2(steuergrundlage(p.base,p.reg))),fmt(round2(p.tax))]));
    }).join('\n');
}

/* Round-Trip: dieselben Spaltennamen, die der Import erkennt. Diese Datei ist
   der Speicher fuer die Gastbetraege — beim naechsten Mal wird sie statt der
   rohen Airbnb-CSV hochgeladen und die Werte stehen wieder drin. */
function baueCsvGastbetraege(res){
  // Bruttoeinkünfte und Raten gehören in die Sicherung: ohne sie rechnet eine
  // wieder geladene Datei mit dem eingestellten Gebührensatz statt exakt —
  // aus 31,71 € Ortstaxe wurden so 30,89 €.
  return 'Bestätigungs-Code;Name des Gastes;Startdatum;Enddatum;Anzahl der Nächte;Einkünfte;Vom Gast bezahlt;'
    +BRUTTO_SPALTE+';'+RATEN_SPALTE+'\n'+
    // Ohne echten Bestätigungs-Code bleibt die Codespalte leer. Vorher stand
    // dort das Anzeigelabel „Zeile 2“ — beim Wiedereinlesen wurde daraus ein
    // scheinbar echter Code, und zwei verschiedene Dateien bekamen dieselbe
    // Identität. Damit war F06 über den Exportweg wieder offen.
    res.bookings.map(b=>csvZeile([b.stabil?b.code:'',b.name,csvDatum(b.a),csvDatum(b.b),b.nights,
      fmt(b.netPay),b.paid?fmt(b.paid):'',b.brutto>0?fmt(b.brutto):'',
      (b.ratenListe||[]).map(rateAlsText).join(' ')])).join('\n');
}

/* --- Datenmodell für die Synchronisierung ---------------------------------
   Gespeichert wird die Buchung, nicht der Meldemonat: eine Buchung vom
   18.06. bis 19.07. gehört in zwei Meldeperioden, der 90-Tage-Zähler rechnet
   übers Kalenderjahr und die Drei-Monats-Befreiung über den ganzen Aufenthalt.
   Der Monat ist eine abgeleitete Sicht und wird nie gespeichert — sonst gäbe
   es zwei Wahrheiten, die auseinanderlaufen können.

   Pfade:
     users/{uid}/einstellungen/aktuell
     users/{uid}/objekte/{objektId}
     users/{uid}/objekte/{objektId}/buchungen/{code}
     users/{uid}/objekte/{objektId}/schnappschuesse/{zeitpunkt}

   Datumsangaben stehen als ISO-Zeichenkette, nicht als Firestore-Timestamp:
   die ganze Rechnung arbeitet auf UTC-Kalendertagen (siehe mkDate/plusMonths),
   und ein Timestamp würde genau die Zeitzonenfehler zurückholen, die dort
   vermieden werden. */
const SCHEMA_VERSION = 1;

function isoTag(ts){ return new Date(ts).toISOString().slice(0,10); }

/* Aus einer gerechneten Buchung das Dokument, das gespeichert wird. Bewusst
   nur Rohdaten — Nächte, Sätze, Bemessungsgrundlage und Ortstaxe werden aus
   diesen Feldern jederzeit neu gerechnet. */
function alsBuchungsdokument(b, objektId){
  const d={
    code: b.code, objektId: objektId||null, schemaVersion: SCHEMA_VERSION,
    name: b.name||'', status: b.status||'',
    von: isoTag(b.a), bis: isoTag(b.b),
    auszahlung: b.netPay,
    gastbetrag: b.paid>0 ? b.paid : null,
    gastbetragQuelle: b.paid>0 ? (b.gastbetragQuelle||'datei') : null
  };
  // Nur wenn vorhanden: ein zusätzliches null-Feld änderte die kanonische Form
  // jedes älteren Dokuments, und der Sperrvergleich meldete in abgeschlossenen
  // Monaten Änderungen, die es nicht gibt.
  if(b.brutto>0) d.brutto=b.brutto;
  if(b.ratenListe && b.ratenListe.length) d.raten=b.ratenListe.map(r=>{
    const x={datum:r.datum};
    if(r.betrag!=null) x.betrag=r.betrag;
    if(r.brutto!=null) x.brutto=r.brutto;
    return x;
  });
  return d;
}

/* Der Rückweg: gespeicherte Dokumente in genau die Tabelle, die compute()
   ohnehin liest. Damit bleibt der geprüfte Rechenweg unverändert — es gibt
   keinen zweiten Pfad in die Berechnung hinein. */
function alsCsvZeilen(dokumente){
  const kopf=['Bestätigungs-Code','Status','Name des Gastes','Startdatum','Enddatum',
              'Anzahl der Nächte','Einkünfte','Vom Gast bezahlt',BRUTTO_SPALTE,RATEN_SPALTE];
  const zeilen=dokumente.slice().sort((x,y)=>String(x.von).localeCompare(String(y.von))
                                            ||String(x.code).localeCompare(String(y.code)))
    .map(d=>[d.code, d.status||'', d.name||'', d.von, d.bis, '',
             fmt(Number(d.auszahlung)||0),
             d.gastbetrag==null ? '' : fmt(Number(d.gastbetrag)),
             d.brutto>0 ? fmt(Number(d.brutto)) : '', ratenListe(d).map(rateAlsText).join(' ')]);
  return [kopf].concat(zeilen);
}

/* Kennung der importierten Datei — erkennt denselben Export ein zweites Mal,
   ohne den Inhalt zu speichern. FNV-1a, 32 Bit; kein Sicherheitszweck. */
function textHash(text){
  let h=0x811c9dc5;
  const s=String(text==null?'':text);
  for(let i=0;i<s.length;i++){
    h^=s.charCodeAt(i);
    h=(h+((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0;
  }
  return ('0000000'+h.toString(16)).slice(-8);
}

/* Vollständiger Stand vor einer überschreibenden Änderung. Ein Dokument statt
   Revisionen je Monat: der Jahresbestand sind wenige hundert Buchungen, und
   ein einzelnes Dokument lässt sich ohne Zusammensetzen zurückspielen. */
function baueSchnappschuss(dokumente, einstellungen, herkunft){
  return {
    schemaVersion: SCHEMA_VERSION,
    grund: (herkunft&&herkunft.grund)||'import',
    datei: (herkunft&&herkunft.datei)||null,
    hash:  (herkunft&&herkunft.hash)||null,
    anzahl: dokumente.length,
    einstellungen: Object.assign({}, einstellungen),
    buchungen: dokumente
  };
}

/* Zusammenführen beim Import. Zwei Regeln, beide aus konkreten Fehlern:

   1. Ein Export über einen Monat darf nicht den Rest des Jahres löschen.
      Es wird gemischt, nie ersetzt — was nicht in der neuen Datei steht,
      bleibt unberührt. Löschen ist immer eine ausdrückliche Handlung.
   2. Ein von Hand eingetragener Gastbetrag überlebt einen Import, der an
      dieser Stelle nichts mitbringt. Bringt der Import einen abweichenden
      Wert mit, gewinnt er — aber das wird als Konflikt gemeldet, damit es
      nicht still passiert. */
function verschmelzeBuchungen(gespeichert, neu){
  const alt=Object.create(null);
  (gespeichert||[]).forEach(d=>{ if(d&&d.code!=null) alt[d.code]=d; });
  const neueCodes=Object.create(null);
  const schreiben=[], konflikte=[], behalten=[];

  (neu||[]).forEach(n=>{
    neueCodes[n.code]=1;
    const a=alt[n.code];
    if(!a){ schreiben.push(n); return; }
    const d=Object.assign({},a,n);
    // Bruttoeinkünfte und Raten gehören zur Auszahlung. Bringt der Import sie
    // nicht mit, bleiben die gespeicherten nur stehen, solange die Auszahlung
    // dieselbe ist — sonst passten sie nicht mehr zueinander.
    if(n.brutto==null && a.brutto!=null){
      if(a.auszahlung===n.auszahlung){ d.brutto=a.brutto; if(a.raten!=null) d.raten=a.raten; }
      else { delete d.brutto; delete d.raten; }
    }
    // Ein Export, der eine Rate weniger enthält als der gespeicherte Stand
    // (Exportzeitraum beginnt mitten im Aufenthalt), darf den vollständigen
    // Betrag nicht durch einen Teilbetrag ersetzen.
    // Getrennte Monatsexporte bringen je eine andere Rate derselben Buchung:
    // Juni-Export die erste, Juli-Export die zweite. Verglichen wird deshalb,
    // welche Raten vorliegen, nicht wie viele — sonst ersetzte die zweite die
    // erste, und von 1.644,80 € blieben 53,06 €.
    const ra=ratenListe(a), rn=ratenListe(n);
    if(ra.length && rn.length && a.von===n.von && a.bis===n.bis){
      const bekannt=r=>r.datum!=='?' && r.betrag!=null;
      if(ra.concat(rn).every(bekannt)){
        // Nach Auszahlungsdatum vereinigen; bei gleichem Datum gilt der Import.
        const m=new Map();
        ra.forEach(r=>m.set(r.datum,r)); rn.forEach(r=>m.set(r.datum,r));
        const alle=[...m.values()].sort((x,y)=>x.datum.localeCompare(y.datum));
        if(alle.length>rn.length){
          d.raten=alle.map(r=>r.brutto!=null ? {datum:r.datum,betrag:r.betrag,brutto:r.brutto}
                                             : {datum:r.datum,betrag:r.betrag});
          d.auszahlung=round2(alle.reduce((x,r)=>x+r.betrag,0));
          if(alle.every(r=>r.brutto!=null)) d.brutto=round2(alle.reduce((x,r)=>x+r.brutto,0));
          else delete d.brutto;
          behalten.push({code:n.code, raten:rn.length, gespeichert:ra.length, zusammen:alle.length});
        }
      }else if(rn.length<ra.length){
        // Ohne Datum oder Betrag je Rate bleibt nur der Vergleich der Anzahl:
        // weniger Raten ersetzen den gespeicherten Stand nicht.
        d.auszahlung=a.auszahlung; d.raten=a.raten.slice();
        if(a.brutto!=null) d.brutto=a.brutto; else delete d.brutto;
        behalten.push({code:n.code, raten:rn.length, gespeichert:ra.length, zusammen:ra.length});
      }
    }
    if(n.gastbetrag==null && a.gastbetrag!=null){
      // Der Import weiß nichts über den Gastbetrag — Gespeichertes behalten
      d.gastbetrag=a.gastbetrag;
      d.gastbetragQuelle=a.gastbetragQuelle;
    } else if(n.gastbetrag!=null && a.gastbetrag!=null
              && a.gastbetragQuelle==='manuell' && n.gastbetrag!==a.gastbetrag){
      konflikte.push({code:n.code, alt:a.gastbetrag, neu:n.gastbetrag});
    }
    schreiben.push(d);
  });

  return {
    schreiben: schreiben,
    konflikte: konflikte,
    behalten: behalten,
    unberuehrt: (gespeichert||[]).filter(d=>d&&!neueCodes[d.code])
  };
}

/* Öffentliche Fläche des Rechenkerns. Gesammelt am Ende, damit die
   Definitionen oben unverändert lesbar bleiben. */
export {
  STICHTAG_5,
  STICHTAG_8,
  EFF,
  regimeOf,
  fmt,
  pct,
  round2,
  plusMonths,
  esc,
  csvZelle,
  csvZeile,
  parseCSV,
  findCol,
  mkDate,
  parseDate,
  datumsOrdnung,
  leseGeld,
  parseMoney,
  compute,
  occupancy,
  jahressummen,
  monthLabel,
  bandHTML,
  leseGastbetraege,
  merkeGastbetraege,
  monatsSummen,
  ueberweisungen,
  filtereUeberweisungen,
  istEinnahmenExport,
  ausEinnahmenExport,
  erwarteteRaten,
  gedeckteNaechte,
  csvDatum,
  baueCsvMonate,
  baueCsvBuchungen,
  baueCsvGastbetraege,
  SCHEMA_VERSION,
  isoTag,
  alsBuchungsdokument,
  alsCsvZeilen,
  textHash,
  baueSchnappschuss,
  verschmelzeBuchungen,
  PAUSCHALE,
  steuergrundlage,
  csvText
};
