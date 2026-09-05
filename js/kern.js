/* Rechenkern des Ortstaxe-Rechners — bewusst ohne jeden DOM-Zugriff.
   Alles hier ist eine reine Funktion über Daten: dieselben Funktionen rechnen
   die Meldung und laufen im Selbsttest. Wer hier etwas ändert, ändert die
   Zahlen — die Schlüsselzahlen und Stichtage stehen in CLAUDE.md. */

const STICHTAG_5 = Date.UTC(2026,6,1);
const STICHTAG_8 = Date.UTC(2027,6,1);
const EFF = {r32:0.032*0.89, r50:0.05, r80:0.08};

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

/* --- Berechnung --- */
function compute(csvRows, opt){
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
                        'Total paid by guest','Guest paid','Paid by guest'])
  };
  // Der Einnahmen-Export (Transaktionsverlauf) bringt ebenfalls Start- und
  // Enddatum sowie eine Spalte „Bruttoeinkünfte“ mit und liefe sonst stumm
  // durch — mit falschen Zahlen: Auszahlungszeilen ohne Datum, Langzeit-
  // buchungen auf Monatsraten verteilt, und „Bruttoeinkünfte“ ist Auszahlung
  // plus Netto-Gastgebergebühr, nicht das Entgelt des Gastes.
  if(findCol(head,['Typ','Type'],true)>=0 && (findCol(head,['Bruttoeinkünfte','Gross earnings'])>=0
      || findCol(head,['Ausgezahlt','Paid out'])>=0 || findCol(head,['Referenzcode','Reference code'])>=0))
    throw new Error('Das sieht nach dem Einnahmen-Export aus (Transaktionsverlauf). '
      +'Gebraucht wird der Reservierungs-Export mit einer Zeile je Aufenthalt. '
      +'Der Einnahmen-Export listet Zahlungen statt Aufenthalte, verteilt lange '
      +'Buchungen auf Monatsraten und enthält laufende Aufenthalte nur anteilig.');

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

  const bookings=[], months={}, warn=[], seen=Object.create(null);
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
    const basis=netPay*hostGross;
    // Was im Tool eingetippt wurde, schlägt die CSV-Spalte. Eine geleerte
    // Eingabe ist 0 und fällt damit bewusst auf den Prozentsatz zurück.
    const ov=opt.paid ? opt.paid[key] : undefined;
    const gPaid=leseGeld(ov!==undefined ? ov : (ci.paid>=0 ? row[ci.paid] : ''));
    if(gPaid.status==='ungueltig')
      warn.push(code+' ('+name+') — „Vom Gast bezahlt“ ist kein lesbarer Geldwert. '
        +'Der Wert wird ignoriert, gerechnet wird mit dem Prozentsatz.');
    const paid=gPaid.wert;
    let amt;
    if(paid>0 && paid+0.005>=basis){
      amt = basis + (paid-basis)/USTF_SERVICE;   // Gast-Servicegebühr brutto → netto
    }else{
      if(paid>0) warn.push(code+' ('+name+') — „Vom Gast bezahlt“ ('+fmt(paid)
        +' €) liegt unter dem hochgerechneten Entgelt ('+fmt(basis)
        +' €). Der Wert wird ignoriert, gerechnet wird mit dem Prozentsatz.');
      amt = basis*guestF; pauschal++;
    }

    // Nur Bestätigtes ist eine Nächtigung. Anfragen, ausstehende und abgelaufene
    // Buchungen haben nie stattgefunden und gehören nicht in die Meldung.
    const st=status.trim();
    if(/storn|cancel|abgelehnt|declin|abgelaufen|expired|anfrage|inquir|ausstehend|pending|zeitüberschreitung|timed ?out/i.test(st)){
      warn.push(code+' ('+name+') übersprungen — Status „'+st+'“.'); continue;
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
    if(seen[code]) warn.push(code+' kommt mehrfach vor — bitte prüfen.');
    seen[code]=1;
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
    bookings.push({code,key,stabil,name,a,b,nights,amt,paid,netPay,exempt,cls,base:baseTotal,tax:taxTotal,
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
      +'und Preis, der Wert ist also geschätzt. Für eine exakte Meldung die Spalte '
      +'„Vom Gast bezahlt“ in die CSV aufnehmen.');
  return {bookings,months:Object.values(months).sort((x,y)=>x.month.localeCompare(y.month)||x.reg.localeCompare(y.reg)),warn};
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
    if(!proMonat[m.month]) proMonat[m.month]={base:0,tax:0,nights:0};
    proMonat[m.month].base+=m.base; proMonat[m.month].tax+=m.tax;
    proMonat[m.month].nights+=m.nights;
  });
  Object.keys(proMonat).sort().forEach(k=>{
    const j=k.slice(0,4);
    if(!jahre[j]) jahre[j]={jahr:+j, monate:0, nights:0, base:0, tax:0, von:k};
    const e=jahre[j];
    e.monate++; e.nights+=proMonat[k].nights;
    e.base+=round2(proMonat[k].base);
    e.tax +=round2(proMonat[k].tax);
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

function csvDatum(t){ return new Date(t).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}); }

function baueCsvMonate(res, konto){
  return 'Meldemonat;Satz;Naechte;Bemessungsgrundlage;Ortstaxe;Verwendungszweck\n'+
    res.months.map(m=>csvZeile([monthLabel(m.month),pct(EFF[m.reg]),m.nights,fmt(m.base),
      fmt(round2(m.tax)),konto+m.month.split('-')[1]+m.month.split('-')[0]])).join('\n');
}

function baueCsvBuchungen(res){
  return 'Code;Gast;Von;Bis;Naechte;Betrag;Meldemonat;Satz;Naechte_Monat;Bemessungsgrundlage;Ortstaxe\n'+
    res.bookings.flatMap(b=>{
      if(b.exempt) return [csvZeile([b.code,b.name,csvDatum(b.a),csvDatum(b.b),b.nights,fmt(b.amt),'befreit','','','','0,00'])];
      return b.parts.map(p=>csvZeile([b.code,b.name,csvDatum(b.a),csvDatum(b.b),b.nights,fmt(b.amt),
        monthLabel(p.month),pct(EFF[p.reg]),p.nights,fmt(p.base),fmt(round2(p.tax))]));
    }).join('\n');
}

/* Round-Trip: dieselben Spaltennamen, die der Import erkennt. Diese Datei ist
   der Speicher fuer die Gastbetraege — beim naechsten Mal wird sie statt der
   rohen Airbnb-CSV hochgeladen und die Werte stehen wieder drin. */
function baueCsvGastbetraege(res){
  return 'Bestätigungs-Code;Name des Gastes;Startdatum;Enddatum;Anzahl der Nächte;Einkünfte;Vom Gast bezahlt\n'+
    res.bookings.map(b=>csvZeile([b.code,b.name,csvDatum(b.a),csvDatum(b.b),b.nights,
      fmt(b.netPay),b.paid?fmt(b.paid):''])).join('\n');
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
  csvDatum,
  baueCsvMonate,
  baueCsvBuchungen,
  baueCsvGastbetraege
};
