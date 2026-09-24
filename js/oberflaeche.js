import {monatsStand, beruehrt} from './abschluss.js';
import {belegpaket} from './belegpaket.js';
/* Oberfläche: alles, was das DOM anfasst. Rechnet nichts selbst — die Zahlen
   kommen ausschließlich aus js/kern.js. */

import {
  EFF,
  fmt,
  pct,
  round2,
  esc,
  parseCSV,
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
  regimeOf,
  leseGeld,
  preisPlanung,
  planungsVorgabe,
  offenVereinigt,
  baueCsvMonate,
  baueCsvBuchungen,
  baueCsvGastbetraege,
  PAUSCHALE,
  steuergrundlage,
  alsCsvZeilen,
  alsBuchungsdokument,
  verschmelzeBuchungen,
  textHash
} from './kern.js';

/* Was in der Buchungstabelle eingetippt wurde, Code → Rohtext. Bewusst nur im
   Arbeitsspeicher: kein localStorage, kein sessionStorage. Dauerhaft wird es
   über „Buchungsdetail als CSV“ — diese Datei lässt sich wieder einlesen. */
const paidRaw = Object.create(null);

function renderQuota(bookings, mode){
  const data=occupancy(bookings,mode), el=document.getElementById('quota');
  if(!data.length){ el.innerHTML='<div class="dim">Keine kurzfristigen Vermietungen in den Daten.</div>'; return; }
  const unit = mode==='days' ? 'Tage' : 'Nächte';
  el.innerHTML = data.map(d=>{
    const rest=90-d.kurz, worst=90-d.kurz-d.grau;
    const w=x=>Math.min(100,Math.max(0,x/90*100));
    const over=d.kurz>90;
    return '<div style="margin-bottom:18px">'
      +'<div class="quota-head"><div class="quota-big" style="'+(over?'color:var(--flag)':'')+'">'
        +(over?('+'+(d.kurz-90)):rest)+'<small>'+(over?unit+' über dem Limit':unit+' offen von 90 · '+d.year)+'</small></div>'
      +'<div class="mono" style="font-size:12px;color:var(--ink-2)">'
        +'verbraucht '+d.kurzV+' · fest gebucht '+d.kurzP+' · zusammen '+d.kurz+' / 90'
        +(d.grau?'<br>Graubereich: verbraucht '+d.grauV+' · fest gebucht '+d.grauP:'')+'</div></div>'
      +'<div class="meter">'
        +'<i class="'+(over?'over':'used')+'" style="width:'+w(Math.min(d.kurz,90))+'%"></i>'
        +(d.grau?'<i class="grey" style="width:'+w(Math.min(d.grau,Math.max(0,90-d.kurz)))+'%"></i>':'')
      +'</div>'
      +'<div class="quota-legend"><span><b style="background:var(--r50)"></b>Aufenthalte bis 30 '+unit+'</span>'
        +(d.grau?'<span><b style="background:var(--r80);opacity:.55"></b>31 '+unit+' bis 3 Monate — Einzelfall</span>':'')
        +'<span>Worst Case offen: '+worst+'</span></div>'
      // Der Zähler kann nur zählen, was in der Datei steht. Beginnt das Jahr
      // erst später, fehlen womöglich frühere Aufenthalte — und dann ist jede
      // Zahl hier zu günstig.
      +'<div class="flag satz" style="margin-top:8px">Gezählt ist nur, was in dieser Datei steht'
        +(d.von>Date.UTC(d.year,0,1)
          ? ' — und sie kennt '+d.year+' erst ab '
            +new Date(d.von).toLocaleDateString('de-AT',{timeZone:'UTC'})+'.'
          : '.')
        +' Ob der Export das ganze Kalenderjahr abdeckt, lässt sich aus den Buchungen nicht '
        +'ableiten; im Zweifel ist die Zahl hier zu günstig.</div>'
    +'</div>';
  }).join('')
  + '<div class="note" style="margin-top:0">Gezählt werden nur bestätigte Buchungen aus dieser CSV. Baurechtlich zählt bereits das <em>Anbieten</em> der Wohnung — leerstehende, aber inserierte Tage sind hier nicht erfasst. Aufenthalte über 3 Monate gelten nicht als Kurzzeitvermietung und bleiben außen vor.</div>';
}

function fallback(text, done){
  const ta=document.createElement('textarea');
  ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); done(); }catch(e){ prompt('Verwendungszweck kopieren:', text); }
  document.body.removeChild(ta);
}

/* Überweisungen an die MA 6, gefiltert nach Fälligkeit. Der Filter ist reine
   Ansicht: er hält nur Sitzungszustand, ändert keine Rechnung und wird nicht
   gespeichert. Die Liste kommt fertig aus kern.js — hier wird nur gezeigt. */
let letzteUeberweisungen=[];
/* Preisplanung: Sitzungszustand wie der Fälligkeitsfilter. Ein Feld, das
   jemand angefasst hat, überschreibt die Vorbelegung aus den Daten nicht mehr —
   sonst setzte jede neue Rechnung die Eingabe zurück. */
const planAngefasst=new Set();
let planVorgabe=null;
const faelligFilter={von:'', bis:''};
const tagDE=iso=>iso.slice(8,10)+'.'+iso.slice(5,7)+'.'+iso.slice(0,4);

function zeichneUeberweisungen(liste){
  letzteUeberweisungen=liste;
  // Auswahl aus den vorhandenen Fälligkeiten. Eine Grenze, die es in den neuen
  // Daten nicht mehr gibt, fällt weg, statt unsichtbar weiterzufiltern.
  const monate=[...new Set(liste.map(u=>u.faellig.slice(0,7)))];
  // „Bis heute fällig“ setzt die Obergrenze auf einen Tag, nicht auf einen
  // Monat. Sie bleibt auch stehen, wenn noch gar nichts fällig ist — dann ist
  // die Liste eben leer, statt still alle künftigen Zahlungen zu zeigen.
  const tagGrenze=k=>k==='bis' && faelligFilter.bis.length===10;
  ['von','bis'].forEach(k=>{
    if(faelligFilter[k] && !tagGrenze(k) && !monate.includes(faelligFilter[k])) faelligFilter[k]='';
    const sel=document.getElementById(k==='von'?'faelligVon':'faelligBis');
    sel.innerHTML='<option value="">'+(k==='von'?'frühester':'spätester')+'</option>'
      +(tagGrenze(k) ? '<option value="'+faelligFilter.bis+'" selected>heute ('+tagDE(faelligFilter.bis)+')</option>' : '')
      +monate.map(m=>'<option value="'+m+'"'+(m===faelligFilter[k]?' selected':'')+'>'
        +tagDE(m+'-15')+'</option>').join('');
  });
  const gezeigt=filtereUeberweisungen(liste, faelligFilter.von, faelligFilter.bis);
  const pt=document.getElementById('pays');
  let p='<tr><th>Aufenthaltsmonat</th><th>Fällig</th><th class="num">Betrag</th><th style="text-align:right">Verwendungszweck</th></tr>';
  gezeigt.forEach(u=>{
    p+='<tr><td class="mono">'+monthLabel(u.monat)+'</td><td class="mono dim">'+tagDE(u.faellig)+'</td>'
      +'<td class="num"><strong>'+fmt(u.betrag)+'</strong></td>'
      +'<td><div class="vz"><code>'+esc(u.vz)+'</code><button class="copy" data-vz="'+esc(u.vz)+'">Kopieren</button></div></td></tr>';
  });
  if(!gezeigt.length) p+='<tr><td colspan="4" class="dim">Keine Überweisung in diesem Fälligkeitszeitraum.</td></tr>';
  p+='<tr class="tot"><td colspan="2">Summe</td><td class="num">'+fmt(round2(gezeigt.reduce((s,u)=>s+u.betrag,0)))+'</td><td></td></tr>';
  pt.innerHTML=p;
  pt.querySelectorAll('.copy').forEach(btn=>{
    btn.onclick=()=>{
      const t=btn.dataset.vz;
      const done=()=>{ btn.textContent='Kopiert'; btn.classList.add('done'); setTimeout(()=>{btn.textContent='Kopieren';btn.classList.remove('done');},1600); };
      if(navigator.clipboard&&window.isSecureContext) navigator.clipboard.writeText(t).then(done,()=>fallback(t,done));
      else fallback(t,done);
    };
  });
  // Steht auch im Ausdruck, wo die Auswahlfelder ausgeblendet sind — sonst
  // sähe eine gefilterte Summe dort aus wie die Summe aller Überweisungen.
  const info=document.getElementById('paysFilterInfo');
  const gefiltert=faelligFilter.von||faelligFilter.bis;
  info.classList.toggle('hide', !gefiltert);
  info.textContent = gefiltert
    ? 'Gefiltert nach Fälligkeit '
      +(faelligFilter.von?'ab '+tagDE(faelligFilter.von+'-15'):'')
      +(faelligFilter.von&&faelligFilter.bis?' ':'')
      +(faelligFilter.bis?'bis '+tagDE(faelligFilter.bis.length===10?faelligFilter.bis:faelligFilter.bis+'-15'):'')
      +': '+gezeigt.length+' von '+liste.length+' Überweisungen. Die Summe gilt nur für diese.'
    : '';
}

function setzeFaelligFilter(von, bis){
  faelligFilter.von=von; faelligFilter.bis=bis;
  // Vertauschte Grenzen ergäben still eine leere Liste; getauscht ist gemeint.
  // Nur zwischen zwei Monaten: „ab Oktober, bis heute“ ist leer, nicht vertauscht.
  if(von && bis && bis.length===7 && von>bis){ faelligFilter.von=bis; faelligFilter.bis=von; }
  zeichneUeberweisungen(letzteUeberweisungen);
}
document.getElementById('faelligVon').onchange=e=>setzeFaelligFilter(e.target.value, faelligFilter.bis);
document.getElementById('faelligBis').onchange=e=>setzeFaelligFilter(faelligFilter.von, e.target.value);
document.getElementById('faelligAlle').onclick=()=>setzeFaelligFilter('','');
document.getElementById('faelligHeute').onclick=()=>{
  // „Bis heute fällig“: alles, dessen Fälligkeitstag nicht in der Zukunft
  // liegt. Heute als Kalendertag in Wien, nicht in UTC. Ist noch nichts
  // fällig, bleibt die Liste leer — früher kehrte der Handler dann ohne
  // Änderung zurück, und die Tabelle zeigte weiter alle künftigen Zahlungen.
  setzeFaelligFilter(faelligFilter.von, new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Vienna'}));
};

function render(res, opt){
  document.getElementById('feeEff').textContent = opt.fee ? 'wirksam '+opt.fee.toFixed(2).replace('.',',')+' %' : 'kein Aufschlag';
  renderQuota(res.bookings, opt.zaehl);
  document.getElementById('printMeta').textContent =
    'Erstellt '+new Date().toLocaleDateString('de-AT')+' · Basis: '
    +(opt.basis==='ust10'?'Beträge inkl. 10 % USt und Ortstaxe':'Beträge ohne USt, inkl. Ortstaxe')
    +(opt.fee?' · Gastgebergebühr '+opt.fee.toFixed(2).replace('.',',')+' % hochgerechnet (UID '+(opt.uid==='ja'?'ja':'nein')+')':'')
    +(opt.gastfee?' · Gast-Servicegebühr '+opt.gastfee.toFixed(2).replace('.',',')+' % aufgeschlagen':' · ohne Gast-Servicegebühr')
    +' · '+res.bookings.length+' Buchungen';
  const mt=document.getElementById('months');
  // Bis 30.06.2026 steckt der 11-%-Pauschalabzug im effektiven Satz. Die Zahl
  // in dieser Spalte ist deshalb für diesen Zeitraum das Entgelt *vor* dem
  // Abzug — sie „Bemessungsgrundlage“ zu nennen, vermischte beides. Wo sich
  // die beiden unterscheiden, steht die steuerpflichtige Grundlage darunter.
  let h='<tr><th>Meldemonat</th><th>Satz</th><th class="num">Nächte</th>'
    +'<th class="num">Entgelt ohne USt/Taxe</th><th class="num">Ortstaxe</th></tr>';
  res.months.forEach(m=>{
    // Überwiesen wird pro Monat dieser gerundete Betrag; die Fußzeile summiert
    // in monatsSummen() über genau dieselben Werte.
    const tr=round2(m.tax);
    h+='<tr><td class="mono">'+monthLabel(m.month)+'</td>'
      +'<td><span class="rate '+m.reg+'">'+pct(EFF[m.reg])+'</span></td>'
      +'<td class="num">'+m.nights+'</td>'
      +'<td class="num">'+fmt(m.base)
        +(PAUSCHALE[m.reg]===1 ? ''
          : '<div class="dim mono" style="font-size:11px">− 11 % Pauschale → '
            +fmt(round2(steuergrundlage(m.base,m.reg)))+'</div>')+'</td>'
      +'<td class="num"><strong>'+fmt(tr)+'</strong></td></tr>';
  });
  const sum=monatsSummen(res.months);
  h+='<tr class="tot"><td>Summe</td><td></td><td class="num">'+sum.nights+'</td><td class="num">'+fmt(sum.base)+'</td><td class="num">'+fmt(round2(sum.tax))+'</td></tr>';
  mt.innerHTML=h;

  zeichneUeberweisungen(ueberweisungen(res.months, opt.konto));
  planVorgabe=planungsVorgabe(res.bookings);
  fuellePlanung(); zeichnePlanung();

  const jahre=jahressummen(res.months);
  let y='<tr><th>Kalenderjahr</th><th class="num">Meldemonate</th><th class="num">Nächte</th>'
    +'<th class="num">Entgelt ohne USt/Taxe</th><th class="num">Grundlage</th>'
    +'<th class="num">Ortstaxe</th><th>Erklärung fällig</th></tr>';
  jahre.forEach(j=>{
    y+='<tr><td class="mono">'+j.jahr+'</td><td class="num">'+j.monate+'</td>'
      +'<td class="num">'+j.nights+'</td><td class="num">'+fmt(j.base)+'</td>'
      +'<td class="num">'+fmt(j.grundlage)+'</td>'
      +'<td class="num"><strong>'+fmt(j.tax)+'</strong></td>'
      +'<td class="mono" style="font-size:12px">15.02.'+(j.jahr+1)+'</td></tr>';
  });
  document.getElementById('years').innerHTML=y;
  // Die Erklärung gilt für das ganze Jahr. Deckt die Datei es nicht ab, ist
  // jede Summe hier zu niedrig — und zwar ohne dass man es sieht.
  const luecken=jahre.filter(j=>j.von!==j.jahr+'-01');
  // Ob eine Datei ein Kalenderjahr vollständig abdeckt, steht nicht in ihr
  // drin: ein Export kann legitim erst im Februar beginnen, und ein Export mit
  // einer einzigen Januarbuchung sieht aus wie ein vollständiger. Der Hinweis
  // steht deshalb immer — vorher fehlte er genau im ersten Fall und erschien
  // fälschlich im zweiten.
  document.getElementById('jahrNote').innerHTML =
    'Die Erklärung ist bis 15. Februar des Folgejahres elektronisch einzubringen und umfasst '
    +'die gesamte im Kalenderjahr entstandene Abgabenschuld. Gerundet wird je Meldeperiode, '
    +'damit die Jahressumme zu den einzelnen Überweisungen passt.'
    +'<br><br><strong>Summe der geladenen Buchungen; Vollständigkeit ungeprüft.</strong> '
    +'Aus den Buchungen allein lässt sich nicht ableiten, welchen Zeitraum der Export '
    +'abdeckt. Vor der Erklärung gegen den Airbnb-Export über das ganze Kalenderjahr '
    +'prüfen — auch auf bestätigte Aufenthalte, die noch bevorstehen.'
    +(luecken.length ? ' Auffällig: '
      +luecken.map(j=>j.jahr+' beginnt in dieser Datei erst mit '+monthLabel(j.von)).join(', ')
      +'.' : '');

  const rt=document.getElementById('rows');
  // Fokus und Cursor merken: getippt wird in diese Tabelle, und sie wird bei
  // jedem Tastendruck neu aufgebaut.
  const act=document.activeElement;
  const hadFocus=act&&act.classList&&act.classList.contains('paid-in') ? act.dataset.key : null;
  const caret=hadFocus ? act.selectionStart : 0;

  let g='<tr><th>Code</th><th>Gast</th><th>Zeitraum</th><th class="num">Nächte</th><th class="col-band">Verlauf</th><th class="num">Betrag</th>'
    +'<th class="num col-paid">Vom Gast bezahlt</th><th>Aufteilung</th><th class="num">Ortstaxe</th></tr>';
  res.bookings.forEach(b=>{
    const d=t=>new Date(t).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'UTC'});
    const parts=b.exempt
      ? '<span class="flag">über 3 Monate — befreit</span>'
      : b.parts.map(p=>'<div class="mono part" style="font-size:12px">'+monthLabel(p.month)+' · '+p.nights+' N · <span class="rate '+p.reg+'">'+pct(EFF[p.reg])+'</span> · '+fmt(round2(p.tax))+'</div>').join('');
    // Beim Tippen den Rohtext stehen lassen, sonst wird „36“ sofort zu „36,00“.
    const val = paidRaw[b.key]!==undefined ? paidRaw[b.key] : (b.paid ? fmt(b.paid) : '');
    g+='<tr><td class="mono" style="font-size:12px">'+esc(b.code)+'</td><td>'+esc(b.name)+'</td>'
      +'<td class="mono" style="font-size:12px;white-space:nowrap">'+d(b.a)+' – '+d(b.b)+'</td>'
      +'<td class="num">'+b.nights+'</td>'
      +'<td class="col-band">'+bandHTML(b.segs)+(b.parts.length>1&&!b.exempt?'<div class="flag ok">'+b.parts.length+' Meldeperioden</div>':'')
        +(b.betragQuelle==='unvollstaendig'?'<div class="flag">'+b.raten+' von '+b.ratenSoll+' Raten — Betrag unvollständig</div>'
          :b.betragQuelle==='hochgerechnet'?'<div class="flag">'+b.raten+' von '+b.ratenSoll+' Raten — hochgerechnet</div>'
          :b.raten && b.raten<b.ratenSoll?'<div class="flag ok">'+b.raten+' von '+b.ratenSoll+' Raten — exakt über Gastbetrag</div>':'')+'</td>'
      +'<td class="num">'+fmt(b.amt)+'</td>'
      +'<td class="num col-paid"><input class="paid-in mono'+(b.betragQuelle==='beleg'?' belegt':'')+'" inputmode="decimal" '
        +'data-key="'+esc(b.key)+'" value="'+esc(val)+'" placeholder="'
        +(b.betragQuelle==='beleg'?'exakt':b.betragQuelle==='unvollstaendig'?'Rate fehlt':b.betragQuelle==='hochgerechnet'?'hochgerechnet':'geschätzt')+'" '
        +(sperren || offlineAnzeige() || geschlosseneBuchung(b.code)?'disabled ':'')
        +'aria-label="Vom Gast bezahlt, '+esc(b.code)+'"></td>'
      +'<td>'+parts+'</td>'
      +'<td class="num"><strong>'+fmt(round2(b.tax))+'</strong></td></tr>';
  });
  rt.innerHTML=g;
  rt.querySelectorAll('.paid-in').forEach(el=>{
    el.oninput=()=>{
      // Während ein Vorgang läuft — Laden, Wiederherstellen, Import — gehört
      // das Feld nicht zu dem, was gerade gilt: der Wert würde weder
      // gespeichert noch überleben. Also gar nicht erst übernehmen, statt ihn
      // anzuzeigen und still zu verwerfen. Das Feld ist dabei auch im DOM
      // gesperrt; hier steht die Sperre für alles, was das Ereignis anders
      // auslöst.
      if(sperren || offlineAnzeige() || geschlosseneBuchung(el.dataset.key)){ el.value=el.defaultValue; return; }
      // Ein geleertes Feld hebt die Überschreibung auf, statt als ausdrückliche
      // Null zu gelten. Vorher blieb '' liegen, behielt Vorrang vor der Datei
      // und die Rechnung fiel auf die Schätzung zurück — die Warnung riet
      // trotzdem zum Leeren.
      if(el.value.trim()==='') delete paidRaw[el.dataset.key];
      else paidRaw[el.dataset.key]=el.value;
      ungespeichert=true; run(); speichereEingabe();
    };
  });
  if(hadFocus){
    const el=rt.querySelector('.paid-in[data-key="'+(window.CSS&&CSS.escape?CSS.escape(hadFocus):hadFocus)+'"]');
    if(el){ el.focus(); try{ el.setSelectionRange(caret,caret); }catch(e){} }
  }

  const w=document.getElementById('warnings');
  const liste=xs=>'<div class="card" style="padding:14px 18px"><ul style="margin:0;padding-left:18px;font-size:13.5px;color:var(--ink-2)">'+xs.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>';
  const eigene=new Set(res.warn);
  const ausDatei=dateiHinweise ? dateiHinweise.liste.filter(x=>!eigene.has(x)) : [];
  w.innerHTML = (res.warn.length ? '<h2>Hinweise</h2>'+liste(res.warn) : '')
    + (ausDatei.length ? '<h2>Zur importierten Datei „'+esc(dateiHinweise.datei)+'“</h2>'+liste(ausDatei) : '');
  document.getElementById('out').classList.remove('hide');
  markiereSpeicherstand();

  window.__csvMonths=baueCsvMonate(res,opt.konto);
  window.__csvRows=baueCsvBuchungen(res);
  window.__csvPaid=baueCsvGastbetraege(res);
  exportierteSchluessel=new Set(res.bookings.map(b=>b.key));
}

/* --- Steuerung --- */
let lastText=null;
/* Hinweise aus der zuletzt importierten Datei. Nach dem Import rechnet die
   Anzeige aus dem gespeicherten Bestand — was nur die Datei wusste (Einnahmen-
   Export erkannt, fehlende Monatsraten, von Airbnb abgeführte Steuer, nicht
   verrechnete Anpassungen), verschwände sonst im Moment des Speicherns. */
let dateiHinweise=null;
/* Buchungsdokumente aus Firestore, sobald angemeldet und ein Objekt gewählt
   ist. null heißt: es wird wie bisher aus der CSV gerechnet. */
let wolkeBestand=null;
/* Schlüssel der zuletzt exportierten Buchungen — damit „gespeichert“ nur dann
   gilt, wenn auch wirklich alles Eingetippte in der Datei steht (F03). */
let exportierteSchluessel=new Set();
/* Getipptes lebt nur in dieser Sitzung. Wer die Seite verlässt, ohne zu
   exportieren, verliert es — deshalb ein sichtbarer Marker und die Rückfrage
   des Browsers. */
let ungespeichert=false;
function markiereSpeicherstand(){
  document.getElementById('dlPaid').classList.toggle('offen', ungespeichert);
}
window.addEventListener('beforeunload', e=>{
  if(!ungespeichert) return;
  e.preventDefault(); e.returnValue='';
});
/* Woraus gerechnet wird. Liegt ein Bestand aus der Datenbank vor, hat er
   Vorrang; sonst die zuletzt geladene CSV. In beiden Fällen geht es durch
   dieselbe Tabelle in compute() — es gibt keinen zweiten Rechenweg. */
/* Die Optionen aus den Feldern. Als eigene Funktion, damit der Import in die
   Datenbank mit genau denselben Werten rechnet wie die Anzeige. */
function optionen(){
  return {basis:document.getElementById('basis').value,
          fee:((parseFloat(document.getElementById('fee').value)||0)
               * (document.getElementById('uid').value==='ja' ? 1 : 1.2)),
          gastfee:(parseFloat(document.getElementById('gastfee').value)||0),
          uid:document.getElementById('uid').value,
          zaehl:document.getElementById('zaehl').value,
          konto:(document.getElementById('konto').value||'').replace(/\s/g,''),
          // Rohtext durchreichen: compute() prueft ihn selbst und kann so
          // einen unlesbaren Eintrag melden statt ihn still als 0 zu lesen.
          // Abzug statt Verweis: ein festgehaltener Auftrag muss mit den
          // Werten rechnen, die beim Festhalten galten — sonst sieht er noch
          // die Tastendrücke, die nach ihm kamen.
          paid:Object.assign(Object.create(null), paidRaw)};
}

function aktuelleZeilen(){
  if(wolkeBestand) return alsCsvZeilen(wolkeBestand);
  return lastText ? parseCSV(lastText) : null;
}
function run(){
  if(!lastText && !wolkeBestand) return;
  const err=document.getElementById('error');
  try{
    err.classList.add('hide');
    const opt=optionen();
    const res=compute(aktuelleZeilen(),opt);
    // Nur im CSV-Betrieb merken. Liegt der Bestand aus der Datenbank vor, ist
    // er bereits der Speicher — die Werte zusätzlich in paidRaw zu halten
    // ließe sie jede später geladene Datei verdecken: eine korrigierte CSV
    // mit 150 € kam dann nie durch, weil die gemerkten 120 € Vorrang hatten.
    if(!wolkeBestand) merkeGastbetraege(res.bookings, paidRaw);
    render(res,opt);
    zeichneMonatsarbeit(res);
  }catch(e){
    err.textContent=e.message; err.classList.remove('hide');
    document.getElementById('out').classList.add('hide');
  }
}
function load(f){
  // Sobald Daten da sind, gehört der Bildschirm den Zahlen. Aufklappbar
  // bleibt der Ablauf trotzdem — nichts wird unwiederbringlich weggeklickt.
  document.getElementById('ablauf').open=false;
  // Eingaben bleiben stehen — aber nur die, die an einem echten Bestätigungs-Code
  // hängen. Der gehört dauerhaft zu genau einer Buchung. Werte aus Zeilen ohne
  // Code sind mit „#“ geschlüsselt und werden hier verworfen: sie würden sonst
  // auf der Buchung landen, die in der neuen Datei zufällig dieselbe Zeile hat.
  for(const k in paidRaw) if(k.charAt(0)==='#') delete paidRaw[k];
  const r=new FileReader();
  r.onload=()=>{
    const vorher={lastText,wolkeBestand,paid:{...paidRaw},ungespeichert};
    lastText=r.result;
    dateiHinweise=null;         // gehören zur vorigen Datei
    wolkeBestand=null;          // die frische Datei ist jetzt die Quelle
    neuerBestand();             // wartende Aufträge gehören zum alten Bestand
    // Solange der Import läuft, zeigt die Tabelle eine Datei, die noch
    // nirgends steht. Eine Eingabe darin erzeugte keinen Auftrag — es gibt
    // noch keinen Wolken-Bestand — und wurde am Ende mit paidRaw weggeräumt:
    // der Dateiwert war gespeichert, die manuelle Änderung darüber verloren,
    // und die Anzeige meldete „gespeichert“. Anders als bei einem verfrühten
    // Erfolgsstatus holt hier kein späterer Auftrag den Wert nach. Vor dem
    // ersten Rendern sperren, danach in beiden Ausgängen freigeben.
    const laeuftImport = !!(daten && konto && objektId);
    if(laeuftImport) sperreAn();
    run();
    if(laeuftImport){
      const version=bestandVersion,ziel=objektId;
      speichereImport(f.name,r.result).then(erg=>{
        if(erg?.fehler && version===bestandVersion && ziel===objektId){
          lastText=vorher.lastText;wolkeBestand=vorher.wolkeBestand;
          for(const k in paidRaw)delete paidRaw[k];Object.assign(paidRaw,vorher.paid);
          ungespeichert=vorher.ungespeichert;
          if(lastText||wolkeBestand)run();else leereAnzeige();
          stand('Import nicht gespeichert: '+erg.fehler,true);
        }
      }).finally(sperreAus);
    }
  };
  r.readAsText(f,'utf-8');
}

const drop=document.getElementById('drop'), file=document.getElementById('file');
drop.onclick=()=>file.click();
drop.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();file.click();} };
file.onchange=e=>{ if(e.target.files[0]) load(e.target.files[0]); };
['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('hot');}));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('hot');}));
drop.addEventListener('drop',e=>{ const f=e.dataTransfer.files[0]; if(f) load(f); });
const laufUndSichern=()=>{ run(); speichereEingabe(); };
document.getElementById('basis').onchange=laufUndSichern;
document.getElementById('zaehl').onchange=laufUndSichern;
document.getElementById('uid').onchange=laufUndSichern;
document.getElementById('konto').oninput=run;

(function(){
  const inp=document.getElementById('konto'), btn=document.getElementById('kontoLock');
  let saved=inp.value;
  function lock(){
    if(!/^\d{6,12}$/.test(inp.value.replace(/\s/g,''))){ inp.value=saved; run(); }
    else saved=inp.value.replace(/\s/g,'');
    inp.value=saved; inp.readOnly=true; btn.textContent='Ändern'; btn.setAttribute('aria-pressed','false'); run();
  }
  btn.onclick=()=>{
    if(inp.readOnly){ inp.readOnly=false; btn.textContent='Sperren'; btn.setAttribute('aria-pressed','true'); inp.focus(); inp.select(); }
    else lock();
  };
  inp.onblur=()=>{ if(!inp.readOnly) lock(); };
  inp.onkeydown=e=>{ if(e.key==='Enter'){e.preventDefault();lock();} if(e.key==='Escape'){inp.value=saved;lock();} };
})();
document.getElementById('fee').oninput=laufUndSichern;
document.getElementById('gastfee').oninput=laufUndSichern;

function toPDF(onlyMonths){
  document.body.classList.toggle('print-months',!!onlyMonths);
  window.print();
}
window.onafterprint=()=>document.body.classList.remove('print-months');
document.getElementById('pdfAll').onclick=()=>toPDF(false);
document.getElementById('pdfMonths').onclick=()=>toPDF(true);

function download(name,data){
  const blob=new Blob(['\uFEFF'+data],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}
document.getElementById('dlMonths').onclick=()=>download('ortstaxe-monate.csv',window.__csvMonths||'');
document.getElementById('dlRows').onclick=()=>download('ortstaxe-buchungen.csv',window.__csvRows||'');
document.getElementById('dlPaid').onclick=()=>{
  download('ortstaxe-gastbetraege.csv',window.__csvPaid||'');
  // Der Export enthält nur die gerade angezeigten Buchungen. Wer einen Betrag
  // eintippt und danach eine CSV lädt, in der diese Buchung fehlt, hätte den
  // Marker sonst gelöscht bekommen, obwohl der Wert nirgends gespeichert ist.
  const fehlend=Object.keys(paidRaw).filter(k=>paidRaw[k]!=='' && !exportierteSchluessel.has(k));
  if(fehlend.length){
    const info=document.getElementById('paidInfo');
    // Die Codes nennen, sonst ist der Hinweis eine Sackgasse: ohne sie weiß
    // niemand, welche CSV geladen werden muss, um den Wert zu sichern.
    info.textContent='Achtung: '+fehlend.length+' eingetippte'
      +(fehlend.length===1?'r Gastbetrag gehört':' Gastbeträge gehören')
      +' zu Buchungen, die gerade nicht angezeigt werden, und '
      +(fehlend.length===1?'ist':'sind')+' deshalb nicht in dieser Datei: '
      +fehlend.slice(0,10).join(', ')+(fehlend.length>10?' …':'')
      +'. Eine CSV mit diesen Buchungen laden und noch einmal exportieren.';
    info.classList.remove('hide');
    return;                       // ungespeichert bleibt stehen
  }
  ungespeichert=false; markiereSpeicherstand();
};

/* Gastbeträge aus einer früheren Sitzung nachladen */
const paidFile=document.getElementById('paidFile');
document.getElementById('ldPaid').onclick=()=>paidFile.click();
paidFile.onchange=e=>{ if(e.target.files[0]) ladeGastbetraege(e.target.files[0]); e.target.value=''; };
function ladeGastbetraege(f){
  const info=document.getElementById('paidInfo'), err=document.getElementById('error');
  const r=new FileReader();
  r.onload=()=>{
    try{
      err.classList.add('hide');
      const map=leseGastbetraege(parseCSV(r.result));
      const codes=Object.keys(map);
      codes.forEach(c=>{ paidRaw[c]=map[c]; });
      // Nachgeladene Werte sind so viel wert wie getippte und gehören denselben
      // Weg: Marker setzen und in die Datenbank schreiben.
      ungespeichert=true;
      run();
      speichereEingabe();
      const treffer=[...document.querySelectorAll('.paid-in')].filter(x=>map[x.dataset.key]!==undefined).length;
      // Gezählt wird, was die Rechnung wirklich benutzt — ein gefülltes, aber
      // verworfenes Feld ist kein Beleg.
      const geschaetzt=[...document.querySelectorAll('.paid-in')].filter(x=>!x.classList.contains('belegt')).length;
      info.textContent=codes.length+' Gastbeträge gelesen · '+treffer+' den angezeigten Buchungen zugeordnet'
        +(geschaetzt?' · '+geschaetzt+' Buchung'+(geschaetzt===1?'':'en')+' noch geschätzt'
                    :' · alle Buchungen beleggestützt');
      info.classList.remove('hide');
    }catch(ex){
      err.textContent=ex.message; err.classList.remove('hide'); info.classList.add('hide');
    }
  };
  r.readAsText(f,'utf-8');
}

/* --- Synchronisierung ----------------------------------------------------
   Streng additiv: ohne Anmeldung, ohne Netz oder bei einem SDK-Fehler
   verhält sich das Werkzeug exakt wie vorher — CSV laden, rechnen, fertig.
   Nichts hier darf den Rechenweg beeinflussen. */

let daten=null, konto=null, objektId=null, objekte=[];
let abschluesse={};
/* Alle Schreibvorgänge laufen durch eine Kette. `clearTimeout` stoppt nur einen
   wartenden Timer — hat sein Rückruf den Datenbankaufruf schon begonnen, läuft
   der weiter und schrieb bisher nach einer Wiederherstellung den alten Stand
   zurück. Verkettet wartet die Wiederherstellung auf laufende Schreibvorgänge
   und ersetzt danach; die Reihenfolge ist damit festgelegt. */
let schreibKette = Promise.resolve();
function inReihe(fn){
  const naechste = schreibKette.then(fn, fn);
  schreibKette = naechste.catch(()=>{});
  return naechste;
}
/* Die Kette legt nur die Reihenfolge fest. Woran ein Auftrag hängt — an
   welchem Objekt, an welchem Bestand, an welchem Bearbeitungsstand — muss
   getrennt festgehalten werden. Die vier Befunde der fünften Nachprüfung sind
   Varianten desselben Lochs: ein treu ausgeführter Auftrag, der längst zu
   etwas anderem gehört.

   Bestandsversion: steigt, sobald der Bestand als Ganzes ausgetauscht wird —
   Objektwechsel, Laden, Import, Wiederherstellung, neue Datei. Ein Auftrag,
   der aus einem älteren Bestand gerechnet wurde, wird verworfen statt
   ausgeführt. */
let bestandVersion=0;
function neuerBestand(){ return ++bestandVersion; }

/* Bearbeitungsstand: steigt bei jeder Eingabe. Ein Schreibabschluss darf nur
   den Stand bestätigen, den er wirklich geschrieben hat. Sonst meldete der
   Abschluss eines älteren Auftrags „gespeichert“ für eine Eingabe, die noch
   aussteht, und löschte ihren Rohwert gleich mit. */
let eingabeStand=0;

/* Solange ein Vorgang den sichtbaren Bestand austauscht — Laden oder
   Wiederherstellen —, gehören Anzeige und Eingaben noch zum alten Stand.
   Gezählt, weil sich Vorgänge verschachteln: die Wiederherstellung lädt am
   Ende selbst. Die Felder werden dabei wirklich gesperrt; sie nur zu
   ignorieren ließe den Tastendruck stillschweigend im nächsten Auftrag
   landen. */
let sperren=0;
function sperreAn(){ sperren++; zeigeSperre(); }
function sperreAus(){ if(sperren>0) sperren--; zeigeSperre(); }
function zeigeSperre(){
  document.body.classList.toggle('gesperrt', sperren>0);
  zeigeMonatsKnopfsperre();
  document.querySelectorAll('.paid-in').forEach(el=>{ el.disabled = sperren>0 || offlineAnzeige() || geschlosseneBuchung(el.dataset.key); });
}
const $=id=>document.getElementById(id);

function stand(text, offen){
  const el=$('wolkeStand');
  el.textContent=text||'';
  el.classList.toggle('offen', !!offen);
}

function zeichneLeiste(){
  const an=!!konto;
  $('anmelden').classList.toggle('hide', an);
  $('abmelden').classList.toggle('hide', !an);
  $('wer').classList.toggle('hide', !an);
  $('objektWahl').classList.toggle('hide', !an);
  $('objektNeu').classList.toggle('hide', !an);
  if(!an){ $('standWahl').classList.add('hide'); $('standZurueck').classList.add('hide'); }
  $('wer').textContent = an ? konto.name : '';
}

function fuelleObjekte(){
  const sel=$('objekt');
  sel.innerHTML=objekte.map(o=>'<option value="'+esc(o.id)+'"'
    +(o.id===objektId?' selected':'')+'>'+esc(o.name||o.id)+'</option>').join('');
}

/* Der gespeicherte Bestand wird zur Rechengrundlage. Ist nichts gespeichert,
   bleibt es beim CSV-Weg — wolkeBestand null heißt genau das. */
/* Alles anzeigebare leeren und ausblenden. */
function leereAnzeige(){
  ['months','pays','rows','years'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.innerHTML='';
  });
  ['quota','warnings','printMeta'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.innerHTML='';
  });
  document.getElementById('out').classList.add('hide');
  // Die Vorbelegung gehörte zu den weggeräumten Daten; Eingaben bleiben.
  planVorgabe=null; fuellePlanung(); zeichnePlanung();
}

/* Jede Ladeanfrage bekommt eine Nummer. Antwortet eine ältere Anfrage später
   als eine neuere — oder gehört sie zu einem inzwischen gewechselten Objekt —
   wird sie verworfen. Ohne das zeigte der Wähler B, während der Bestand aus A
   stammte; die nächste Eingabe hätte A unter B gespeichert. */
let ladeNr=0;
async function ladeBestand(){
  const meine=++ladeNr, ziel=objektId;
  sperreAn();
  stand('lädt …');
  let docs;
  // finally, damit die Sperre auch bei einem Fehler genau einmal fällt —
  // gezählt wird, ein vergessenes Herunterzählen sperrte die Felder dauerhaft.
  try{
    const [d,a]=await Promise.all([daten.ladeBuchungen(ziel),daten.ladeAbschluesse(ziel)]);
    docs=d; if(meine===ladeNr && ziel===objektId) abschluesse=a;
  }
  finally{ sperreAus(); }
  if(meine!==ladeNr || ziel!==objektId) return;      // überholt oder veraltet
  neuerBestand();
  wolkeBestand = docs.length ? docs : null;
  // Ohne Bestand und ohne geladene Datei gibt es nichts anzuzeigen — sonst
  // bliebe die Tabelle des vorherigen Objekts stehen. Verbergen genügt nicht:
  // die Zeilen blieben im DOM und wären zurück, sobald etwas #out wieder
  // einblendet, ohne neu zu rendern.
  if(!wolkeBestand && !lastText) leereAnzeige();
  else run();
  stand(offlineAnzeige() ? 'Offline-Ansicht aus dem lokalen Cache · möglicherweise veraltet · nur Lesen. Zum Bearbeiten online erneut laden.' : docs.length ? docs.length+' Buchungen aus der Datenbank' : 'noch nichts gespeichert',offlineAnzeige());
  fuelleStaende();
}

async function nachAnmeldung(){
  try{
    stand('lädt …');
    objekte = await daten.ladeObjekte();
    if(!objekte.length){
      const id='objekt-'+Date.now().toString(36);
      await daten.speichereObjekt(id,{name:'Wohnung', konto:$('konto').value});
      objekte=[{id:id, name:'Wohnung'}];
    }
    objektId = objekte[0].id;
    fuelleObjekte();
    const e = await daten.ladeEinstellungen();
    if(e) uebernimmEinstellungen(e);
    await ladeBestand();
  }catch(ex){ stand('Fehler: '+ex.message, true); }
}

/* Gespeicherte Einstellungen zurück in die Felder. Bewusst ohne konto: das
   hängt am Objekt, nicht am Konto der angemeldeten Person. */
function uebernimmEinstellungen(e){
  if(e.basis)   $('basis').value=e.basis;
  if(e.uid)     $('uid').value=e.uid;
  if(e.zaehl)   $('zaehl').value=e.zaehl;
  if(typeof e.gastfee==='number') $('gastfee').value=e.gastfee;
  // fee ist der wirksame Wert inklusive USt-Aufschlag; zurück auf den
  // eingetippten Grundsatz rechnen, sonst wächst er bei jedem Laden.
  if(typeof e.fee==='number')
    $('fee').value = +(e.fee / (e.uid==='ja' ? 1 : 1.2)).toFixed(2);
}

/* Nach einem CSV-Import: Schnappschuss, zusammenführen, schreiben. Der
   Schnappschuss kommt zuerst — sonst schützt er nicht vor genau dem Import,
   der ihn nötig macht. */
function speichereImport(dateiname, text){
  // Ziel, Optionen und Bestandsversion JETZT festhalten, nicht erst wenn die
  // Kette den Auftrag freigibt. Las importieren() sie beim Ausführen, war ein
  // inzwischen erfolgter Objektwechsel unsichtbar: die Prüfungen dort
  // verglichen objektId mit sich selbst und konnten gar nicht auslösen — der
  // wartende Import landete unter dem neuen Objekt.
  const ziel=objektId, opt=optionen(), version=bestandVersion;
  return inReihe(()=>importieren(ziel, opt, version, dateiname, text));
}
async function importieren(ziel, opt, version, dateiname, text){
  // Überholt heißt: anderes Objekt oder anderer Bestand als beim Einreihen.
  const ueberholt=()=>ziel!==objektId || version!==bestandVersion;
  if(ueberholt()) return stand('Objekt gewechselt — nichts gespeichert.', true);
  try{
    stand('speichert …');
    const res=compute(parseCSV(text),opt);

    // Stornierte Zeilen gehören mitgespeichert: sonst erfährt der Bestand nie,
    // dass eine früher bestätigte Buchung storniert wurde, und sie bliebe
    // steuerpflichtig stehen. Beim Lesen filtert compute() sie am Status.
    const alle=res.bookings.concat(res.storniert);
    const ohneCode=alle.filter(b=>!b.stabil).length;
    const kaputt=alle.filter(b=>b.stabil && (b.betragStatus==='ungueltig'
                                          || b.gastbetragStatus==='ungueltig'));
    // Ein unlesbarer Betrag darf einen bereits gespeicherten, richtigen Wert
    // nicht mit 0 überschreiben. Solche Zeilen werden zurückgestellt.
    const neu=alle.filter(b=>b.stabil && b.betragStatus!=='ungueltig'
                                      && b.gastbetragStatus!=='ungueltig')
                  .map(b=>alsBuchungsdokument(b, ziel));

    const gespeichert=await daten.ladeBuchungen(ziel);
    if(ueberholt()) return stand('Objekt gewechselt — nichts gespeichert.', true);
    // Offene Posten (Erstattung, Anpassung) zu Buchungen, die nicht in dieser
    // Datei stehen, aber gespeichert sind: an die gespeicherte Buchung hängen.
    // Sonst gäbe es den Hinweis nur in dieser Sitzung, und der Monatsabschluss
    // kennte die ursprüngliche Buchung allein.
    const neueCodes=new Set(neu.map(d=>d.code)), ohneZiel=[];
    (res.offeneOhneBuchung||[]).forEach(x=>{
      if(neueCodes.has(x.code)) return;
      const a=gespeichert.find(d=>d.code===x.code);
      if(a) neu.push(Object.assign({},a,{offen:offenVereinigt(a.offen,x.offen)}));
      else ohneZiel.push(x.code);
    });
    if(gespeichert.length){
      // Der Schnappschuss gehört mit den Einstellungen gesichert, unter denen
      // dieser Bestand entstanden ist — nicht mit den gerade eingestellten.
      // Sonst ist die frühere Rechnung nicht reproduzierbar.
      const alteOpt = await daten.ladeEinstellungen();
      await daten.legeSchnappschussAn(ziel, gespeichert, alteOpt||opt,
        {grund:'import', datei:dateiname, hash:textHash(text)});
    }
    const vm=verschmelzeBuchungen(gespeichert, neu);
    if(ueberholt()) return stand('Objekt gewechselt — nichts gespeichert.', true);
    await daten.schreibeBuchungen(ziel, vm.schreiben, {grund:'import',datei:dateiname,einstellungen:opt});
    if(ueberholt()) return;                  // Anzeige gehört jetzt einem anderen Stand
    // Ab hier ist die Datenbank die Quelle; paidRaw hat seinen Zweck erfüllt.
    // Bliebe es stehen, verdeckte es beim nächsten Import die neuen Dateiwerte.
    for(const k in paidRaw) delete paidRaw[k];
    // Der Bestand ist ausgetauscht: ein noch wartender Eingabe-Auftrag rechnete
    // aus dem Stand von vor dem Import und schriebe die Dateiwerte wieder weg.
    neuerBestand();
    wolkeBestand = vm.unberuehrt.concat(vm.schreiben);
    ungespeichert=false;
    dateiHinweise={datei:dateiname, liste:res.warn.concat(vm.behalten.map(k=>k.code
      +' — die Datei enthält '+k.raten+' Monatsrate'+(k.raten===1?'':'n')+', gespeichert waren '
      +k.gespeichert+'. Zusammengeführt zu '+k.zusammen+' Rate'+(k.zusammen===1?'':'n')
      +' — eine Rate, die nur im gespeicherten Stand steht, geht nicht verloren.'))};
    run();

    const info=$('paidInfo'), teile=[];
    teile.push(vm.schreiben.length+' Buchung'+(vm.schreiben.length===1?'':'en')+' gespeichert');
    const stornos=res.storniert.filter(b=>b.stabil).length;
    if(stornos) teile.push(stornos+' als storniert vermerkt');
    if(vm.unberuehrt.length) teile.push(vm.unberuehrt.length+' aus früheren Importen unberührt');
    if(ohneCode) teile.push(ohneCode+' ohne Bestätigungs-Code nicht gespeichert');
    if(ohneZiel.length)
      teile.push('Achtung: offene Posten zu '+ohneZiel.join(', ')+' — diese Buchung'
        +(ohneZiel.length===1?' ist':'en sind')+' weder in der Datei noch gespeichert, der Posten konnte nicht zugeordnet werden');
    if(kaputt.length)
      teile.push('Achtung: '+kaputt.length+' Zeile'+(kaputt.length===1?'':'n')
        +' mit unlesbarem Betrag zurückgestellt ('+kaputt.map(b=>b.code).slice(0,5).join(', ')
        +') — der gespeicherte Stand bleibt unangetastet');
    if(vm.konflikte.length)
      teile.push('Achtung: '+vm.konflikte.length+' von Hand gesetzte Gastbeträge wurden von der '
        +'Datei überschrieben ('+vm.konflikte.map(k=>k.code+': '+fmt(k.alt)+' → '+fmt(k.neu)).join(', ')+')');
    info.textContent=teile.join(' · ');
    info.classList.remove('hide');
    stand('gespeichert '+new Date().toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'}));
    fuelleStaende();
  }catch(ex){
    stand('Nicht gespeichert: '+ex.message, true);
    return {fehler:ex.message};
  }
}

/* Eingetippte Gastbeträge in die Datenbank schreiben. Vorher landeten sie nur
   in paidRaw und waren beim Schließen weg — obwohl die Wolke „gespeichert“
   anzeigte. Entprellt, weil bei jedem Tastendruck gefeuert wird. */
let tippUhr=null;
function speichereEingabe(){
  // Die Sperre hier ist die zweite Barriere, nicht die erste: den Weg über das
  // Gastbetragsfeld hält schon der Eingabe-Handler auf, und einen dennoch
  // eingereihten Auftrag verwirft die Bestandsversion beim Ausführen. Sie
  // bleibt trotzdem stehen — der Fehlerfall ist stiller Datenverlust, und die
  // anderen Wege hierher (Optionsfelder, nachgeladene Gastbeträge) sind im DOM
  // nicht gesperrt. Der Mutationslauf zeigt sie als ungeprüft: kein Ablauf
  // hängt allein an ihr.
  if(!(daten && konto && objektId) || !wolkeBestand || sperren || offlineAnzeige()) return;
  stand('nicht gespeichert', true);
  clearTimeout(tippUhr);
  // Ziel UND Daten jetzt festhalten, nicht erst wenn der Timer abläuft. Sonst
  // wird nach einem Objektwechsel der Bestand von Wohnung A unter Wohnung B
  // geschrieben: die Daten stammen noch aus A, die Ziel-ID schon aus B.
  // Dazu die Bestandsversion und der eigene Bearbeitungsstand: der eine sagt,
  // aus welchem Bestand gerechnet wurde, der andere, welche Eingabe dieser
  // Auftrag bestätigen darf.
  const ziel=objektId, opt=optionen(), version=bestandVersion;
  const meinStand=++eingabeStand, vorher=wolkeBestand;
  let alle, docs, offen;
  try{
    alle=compute(aktuelleZeilen(),opt).bookings;
    // Eine unlesbare Eingabe darf den gespeicherten Wert nicht löschen. Vorher
    // prüfte der Filter nur den Status der Auszahlung, und „abc“ im
    // Gastbetragsfeld schrieb null über gültige 150 € — mit der Meldung
    // „gespeichert“. Solche Zeilen bleiben ungeschrieben und werden genannt.
    offen=alle.filter(b=>b.stabil && (b.betragStatus==='ungueltig'
                                      || b.gastbetragStatus==='ungueltig'));
    docs=alle.filter(b=>b.stabil && b.betragStatus!=='ungueltig'
                                 && b.gastbetragStatus!=='ungueltig')
             .map(b=>alsBuchungsdokument(b, ziel));
  }catch(ex){ return stand('Nicht gespeichert: '+ex.message, true); }
  tippUhr=setTimeout(()=>inReihe(async()=>{
    // Anderes Objekt oder anderer Bestand als beim Auslösen — verwerfen.
    if(ziel!==objektId || version!==bestandVersion) return;
    try{
      await daten.schreibeBuchungen(ziel, docs, {grund:'manuell',einstellungen:opt});
      if(ziel!==objektId || version!==bestandVersion) return;
      // Nur die geschriebenen Dokumente in den Bestand übernehmen, den Rest
      // stehen lassen. Vorher ersetzte docs den ganzen Bestand — eine wegen
      // unlesbarer Eingabe zurückgestellte Zeile fiel damit lokal weg, und die
      // nächste Rechnung kannte sie nicht mehr: die Korrektur ging ins Leere
      // und wurde trotzdem als „gespeichert“ gemeldet.
      const nach=Object.create(null);
      docs.forEach(d=>{ nach[d.code]=d; });
      const basis=wolkeBestand||vorher;
      wolkeBestand=basis.map(d=>nach[d.code]||d);
      if(offen.length){
        stand(offen.length+' Eingabe'+(offen.length===1?'':'n')+' unlesbar — nicht gespeichert', true);
      }else if(meinStand!==eingabeStand){
        // Seit dem Auslösen wurde weitergetippt. Dieser Auftrag hat den
        // neueren Stand nicht geschrieben und darf ihn weder bestätigen noch
        // seinen Rohwert löschen — sonst steht „gespeichert“ über einer
        // Änderung, die beim Schließen verloren ginge.
        stand('gespeichert — neuere Eingabe noch offen', true);
      }else{
        // Nach dem Speichern ist die Datenbank die Quelle. Bliebe die
        // Überschreibung in paidRaw stehen, verdrängte sie beim nächsten Import
        // einen korrigierten Dateiwert, noch bevor er gespeichert wird.
        for(const k in paidRaw) delete paidRaw[k];
        // Der Punkt auf „Buchungen + Gastbeträge als CSV“ und die Warnung beim
        // Schließen bedeuten „steht nur im Arbeitsspeicher“. Sobald die
        // Datenbank den Wert hat, stimmt das nicht mehr.
        ungespeichert=false; markiereSpeicherstand();
        stand('gespeichert '+new Date().toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'}));
      }
      fuelleStaende();
    }catch(ex){ stand('Nicht gespeichert: '+ex.message, true); }
  }), 1200);
}

$('anmelden').onclick=async()=>{
  try{ stand('meldet an …'); await daten.anmelden(); }
  catch(ex){ stand(ex.message, true); }
};
$('abmelden').onclick=async()=>{
  try{ await daten.abmelden(); wolkeBestand=null; dateiHinweise=null; objektId=null; objekte=[]; stand(''); }
  catch(ex){ stand(ex.message, true); }
};
$('objekt').onchange=async()=>{
  clearTimeout(tippUhr);                   // ausstehende Speicherung gehört zum alten Objekt
  neuerBestand();                          // und ein schon gestarteter Auftrag auch
  // Alles Objektgebundene sofort räumen — vor dem ersten await. Bliebe der
  // Bestand stehen, wäre die Tabelle des alten Objekts weiter bearbeitbar,
  // während objektId schon auf das neue zeigt; das Autospeichern schriebe
  // dann A unter B.
  lastText=null; wolkeBestand=null; abschluesse={}; dateiHinweise=null;
  for(const k in paidRaw) delete paidRaw[k];
  leereAnzeige();
  objektId=$('objekt').value;
  const ziel=objektId;
  try{await ladeBestand();}
  catch(e){if(ziel===objektId)stand('Laden fehlgeschlagen: '+e.message,true);}
};

/* Frühere Stände anbieten. Ein Schnappschuss, den man nicht zurückspielen
   kann, ist kein Schutz — er lag bisher nur in der Datenbank herum. */
async function fuelleStaende(){
  try{
    const liste=await daten.ladeSchnappschuesse(objektId);
    $('stand').innerHTML='<option value="">— früherer Stand —</option>'
      +liste.map(x=>{
        const d=new Date(x.zeitpunkt.slice(0,19).replace(/-(\d\d)-(\d\d)-(\d\d)$/,':$1:$2.$3')
                          .replace(/-/g,(m,i)=>i<8?'-':m));
        const zeit=isNaN(d)?x.zeitpunkt.slice(0,16):d.toLocaleString('de-AT');
        return '<option value="'+esc(x.zeitpunkt)+'">'+esc(zeit)+' · '
          +(x.anzahl||0)+' Buchungen'+(x.datei?' · vor '+esc(x.datei):'')+'</option>';
      }).join('');
    const da=liste.length>0;
    $('standWahl').classList.toggle('hide',!da);
    $('standZurueck').classList.toggle('hide',!da);
  }catch(ex){ /* ohne Stände bleibt die Auswahl verborgen */ }
}

$('standZurueck').onclick=async()=>{
  const z=$('stand').value;
  if(!z) return stand('Zuerst einen Stand auswählen.', true);
  const ziel=objektId;
  if(!confirm('Diesen Stand zurückspielen? Der aktuelle Bestand wird vorher gesichert.')) return;
  // Ein ausstehendes Autospeichern gehört zum verworfenen Stand. Liefe es nach
  // der Wiederherstellung ab, schriebe es die alten Daten wieder hinein und
  // machte sie damit rückgängig.
  clearTimeout(tippUhr); tippUhr=null;
  dateiHinweise=null;                      // die Datei ist nicht mehr der Stand
  // Und für die Dauer des Vorgangs keine neuen zulassen. Abwarten allein
  // genügte nicht: die Tabelle blieb bearbeitbar, während die
  // Wiederherstellung lief, und ein Tastendruck erzeugte aus dem alten
  // Bestand einen Auftrag, der sich brav dahinter einreihte — und sie damit
  // rückgängig machte. Vor dem ersten await sperren, sonst bleibt genau
  // dazwischen ein Fenster offen.
  sperreAn();
  try{
  // Ein bereits gestarteter Schreibauftrag lässt sich nicht mehr abbrechen —
  // er wird abgewartet. Sonst schriebe er nach der Wiederherstellung den alten
  // Stand zurück und machte sie rückgängig.
  await inReihe(async()=>{
  try{
    stand('spielt zurück …');
    const jetzt=await daten.ladeBuchungen(ziel);
    if(ziel!==objektId) return stand('Objekt gewechselt — nichts zurückgespielt.', true);
    if(jetzt.length)
      await daten.legeSchnappschussAn(ziel, jetzt, await daten.ladeEinstellungen()||optionen(),
        {grund:'wiederherstellung', datei:null, hash:null});
    const alt=await daten.ladeSchnappschuss(ziel, z);
    const zurueck=alt.buchungen||[];
    // Zurückspielen heißt Bestandsabgleich, nicht Überschreiben: Buchungen, die
    // erst nach dem Schnappschuss dazukamen, müssen weg. Löschen und Schreiben
    // laufen als ein Vorgang — sonst bleibt bei einem Schreibfehler ein
    // Mischbestand zurück, aus dem schon gelöscht, aber noch nichts
    // wiederhergestellt wurde.
    const behalten=Object.create(null);
    zurueck.forEach(d=>{ behalten[d.code]=1; });
    const zuviel=jetzt.filter(d=>!behalten[d.code]).map(d=>d.code);
    // Buchungen und Einstellungen in einem Vorgang: sonst stehen nach einem
    // Fehler die zurückgespielten Buchungen neben den alten Einstellungen.
    await daten.ersetzeBuchungen(ziel, zurueck, zuviel, alt.einstellungen||null);
    // Der Bestand ist ein anderer: alles, was aus dem verworfenen Stand
    // gerechnet wurde, ist ab hier ungültig.
    neuerBestand();
    if(alt.einstellungen) uebernimmEinstellungen(alt.einstellungen);
    if(ziel!==objektId) return;
    // Getipptes aus der Sitzung würde den zurückgespielten Stand sofort wieder
    // überlagern — es gehört zum verworfenen Stand, nicht zum alten.
    for(const k in paidRaw) delete paidRaw[k];
    await ladeBestand();
    await fuelleStaende();
    $('paidInfo').textContent='Stand vom '+z.slice(0,16)+' zurückgespielt · '
      +zurueck.length+' Buchung'+(zurueck.length===1?'':'en')
      +(zuviel.length?' · '+zuviel.length+' später hinzugekommene entfernt ('
        +zuviel.slice(0,5).join(', ')+')':'')
      +' · der vorherige Bestand wurde gesichert';
    $('paidInfo').classList.remove('hide');
  }catch(ex){ stand('Nicht zurückgespielt: '+ex.message, true); }
  });
  } finally { sperreAus(); }
};
$('objektNeu').onclick=async()=>{
  const name=prompt('Name des neuen Objekts:');
  if(!name) return;
  try{
    const id='objekt-'+Date.now().toString(36);
    await daten.speichereObjekt(id,{name:name, konto:$('konto').value});
    objekte.push({id:id, name:name}); objektId=id;
    fuelleObjekte(); await ladeBestand();
  }catch(ex){ stand(ex.message, true); }
};

/* Beim Start einmal versuchen. Klappt es nicht, bleibt die Leiste verborgen
   und das Werkzeug ist genau das, was es vorher war. */
(async function(){
  try{
    daten = await import('./daten.js');
    await daten.beobachteAnmeldung(p=>{
      konto=p; zeichneLeiste();
      if(p) nachAnmeldung(); else { wolkeBestand=null; dateiHinweise=null; abschluesse={}; $('monatsarbeit').classList.add('hide'); run(); }
    });
    $('wolke').classList.remove('hide');
  }catch(e){ /* still: ohne Datenbank rechnet das Werkzeug vollständig */ }
})();

/* Monatsarbeit: Entscheidungen beziehen sich auf den gespeicherten Objektstand. */
function offlineAnzeige(){return !!(konto && objektId && daten?.istOfflineStand?.(objektId));}
function geschlosseneBuchung(code){
  const d=(wolkeBestand||[]).find(b=>b.code===code);
  return d && Object.keys(abschluesse).some(m=>beruehrt(d,m));
}
function zeichneMonatsarbeit(res){
  const box=$('monatsarbeit');
  if(!konto || !objektId){box.classList.add('hide');return;}
  box.classList.remove('hide');
  const auswahl=$('abschlussMonat'),alt=auswahl.value;
  const monate=[...new Set([...res.months.map(m=>m.month),...Object.keys(abschluesse),
    ...(wolkeBestand||[]).flatMap(d=>{const a=[];let m=d.von.slice(0,7);for(let i=0;i<120 && m<=d.bis.slice(0,7);i++){
      if(beruehrt(d,m))a.push(m);m=new Date(Date.UTC(+m.slice(0,4),+m.slice(5,7),1)).toISOString().slice(0,7);
    }return a;})])].sort();
  auswahl.innerHTML=monate.map(m=>'<option value="'+m+'">'+m+(abschluesse[m]?' · abgeschlossen':' · offen')+'</option>').join('');
  if(monate.includes(alt))auswahl.value=alt;
  const codes=(wolkeBestand||[]).map(d=>d.code).sort(),v=$('verlaufCode').value;
  $('verlaufCodes').innerHTML=codes.map(c=>'<option value="'+esc(c)+'"></option>').join('');
  $('verlaufCode').value=v||codes[0]||'';
  zeigeMonatspruefung();
}
function zeigeMonatsKnopfsperre(){
  const monat=$('abschlussMonat').value,geschlossen=!!abschluesse[monat];
  const gesperrt=sperren>0 || offlineAnzeige() || !monat || !konto || !objektId;
  $('monatSchliessen').disabled=gesperrt||geschlossen;
  $('monatOeffnen').disabled=gesperrt||!geschlossen;
  $('belegpaket').disabled=gesperrt||!geschlossen;
}
function zeigeMonatspruefung(){
  const monat=$('abschlussMonat').value,geschlossen=abschluesse[monat];
  $('abschlussVoll').checked=false;$('abschlussPruefung').checked=false;$('abschlussHinweise').checked=false;
  zeigeMonatsKnopfsperre();
  if(!monat){$('abschlussStatus').textContent='Keine Monate verfügbar.';$('abschlussVergleich').textContent='';$('abschlussWarnungen').textContent='';return;}
  const stand=geschlossen||monatsStand(wolkeBestand||[],optionen(),monat);
  $('abschlussStatus').textContent=(geschlossen?'Abgeschlossen am '+geschlossen.abgeschlossen+' · eingefrorener Stand':'Offen · gespeicherter Bestand')+
    ' · '+stand.naechte+(stand.naechte===1?' steuerpflichtige Nacht · ':' steuerpflichtige Nächte · ')+fmt(stand.ortstaxe)+' € Ortstaxe';
  $('abschlussVergleich').textContent=geschlossen && wolkeBestand && monatsStand(wolkeBestand,optionen(),monat).ortstaxe!==geschlossen.ortstaxe ? 'Die aktuelle Berechnung weicht vom Abschluss ab. Für den abgeschlossenen Stand gilt das Belegpaket.' : '';
  $('abschlussWarnungen').textContent=stand.hinweise.length?stand.hinweise.join(' | '):'Keine rechnerischen Hinweise. Vollständigkeit und Belege bitte selbst prüfen.';
  $('abschlussChecks').classList.toggle('hide',!!geschlossen);

}
async function monatsAktion(fn){
  if(sperren || offlineAnzeige() || !konto || !objektId)return;
  const ziel=objektId;
  if(ungespeichert){$('abschlussStatus').textContent='Zuerst offene Eingaben speichern oder neu laden.';return;}
  sperreAn();
  try{await inReihe(async()=>{
    if(ziel!==objektId)throw new Error('Objekt gewechselt.');
    if(ungespeichert)throw new Error('Zuerst offene Eingaben speichern oder neu laden.');
    await fn(ziel);
    if(ziel===objektId){abschluesse=await daten.ladeAbschluesse(ziel);run();}
  });}catch(e){$('abschlussStatus').textContent=e.message;}finally{sperreAus();}
}
$('abschlussMonat').onchange=zeigeMonatspruefung;
$('monatSchliessen').onclick=()=>{
  const monat=$('abschlussMonat').value, opt=optionen();
  const pruefung=monatsStand(wolkeBestand||[],opt,monat);
  const bestaetigung={vollstaendig:$('abschlussVoll').checked,geprueft:$('abschlussPruefung').checked,hinweise:$('abschlussHinweise').checked};
  return monatsAktion(ziel=>daten.schliesseMonat(ziel,monat,opt,bestaetigung,pruefung));
};
$('monatOeffnen').onclick=()=>{
  const monat=$('abschlussMonat').value;
  const grund=prompt('Warum wird '+monat+' wieder geöffnet?');
  if(grund===null)return;
  return monatsAktion(ziel=>daten.oeffneMonat(ziel,monat,grund));
};
$('belegpaket').onclick=()=>{
  const monat=$('abschlussMonat').value;
  return monatsAktion(async ziel=>{
    const stand=await daten.ladeAbschluss(ziel,monat);
    if(!stand)throw new Error('Für ein Belegpaket den Monat zuerst abschließen.');
    const name=objekte.find(o=>o.id===ziel)?.name||ziel;
    const blob=belegpaket(stand,name),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='ortstaxe-'+monat+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  });
};
function beschreibeAenderung(e){
  const namen={name:'Gast',status:'Status',von:'Anreise',bis:'Abreise',auszahlung:'Auszahlung',gastbetrag:'Gastbetrag',gastbetragQuelle:'Herkunft des Gastbetrags',brutto:'Bruttoeinkünfte',raten:'Monatsraten',offen:'Offene Posten'};
  // Raten und offene Posten sind Listen von Objekten — String() machte daraus
  // „[object Object]“.
  const wert=(k,v)=>v==null?'nicht vorhanden':(k==='auszahlung'||k==='gastbetrag')?fmt(v)+' €'
    :typeof v==='object'?JSON.stringify(v):String(v);
  return (e.vorher?'':'Neu angelegt\n')+(e.nachher?'':'Gelöscht\n')+Object.entries(namen)
    .filter(([k])=>e.vorher?.[k]!==e.nachher?.[k])
    .map(([k,n])=>n+': '+wert(k,e.vorher?.[k])+' → '+wert(k,e.nachher?.[k])).join('\n');
}
$('verlaufLaden').onclick=async()=>{
  const ziel=objektId,code=$('verlaufCode').value;if(!ziel||!code)return;
  $('verlaufInhalt').textContent='Lädt …';
  try{const liste=await daten.ladeVerlauf(ziel,code);if(ziel!==objektId)return;
    $('verlaufInhalt').textContent=liste.length?liste.map(e=>e.zeit+' · '+e.grund+(e.datei?' · '+e.datei:'')+'\n'+beschreibeAenderung(e)).join('\n\n'):
      'Noch keine protokollierten Änderungen. Der Verlauf beginnt mit Einführung dieser Funktion.';
  }catch(e){$('verlaufInhalt').textContent=e.message;}
};

/* --- Selbsttest --- Aufruf: index.html?selftest --------------------------
   Die Prüfungen liegen in selftest.js und werden nur bei Bedarf nachgeladen.
   Sie laufen gegen dieselben Funktionen aus js/kern.js, die auch die Meldung
   rechnen. Umgekehrt gilt das nicht — das Tool läuft ohne die Datei vollständig.
   Als ES-Modul braucht der Aufruf einen lokalen Server: Browser blockieren
   Modul-Importe über file://. */
if(location.search.indexOf('selftest')>=0)
  import('../selftest.js').catch(e=>{ document.body.innerHTML=
    '<p style="font:14px/1.6 system-ui;padding:24px">selftest.js wurde nicht geladen — '
    +'die Datei gehört neben index.html, und die Seite muss über einen Server laufen '
    +'(etwa <code>python3 -m http.server</code>), nicht über file://.<br><br>'
    +'<small>'+String(e&&e.message||e)+'</small></p>'; });

/* --- Preisplanung ---------------------------------------------------------
   Die Rechnung kommt aus kern.js (preisPlanung); hier nur Felder, Vorbelegung
   und Anzeige. Gespeichert wird nichts. */
const PLAN_FELDER=['planPreis','planNaechte','planReinigung','planKostenAufenthalt','planKostenNacht',
                   'planHeuteSatz','planHeuteGeb','planVergleichSatz','planVergleichGeb',
                   'planVergleichKostenAufenthalt','planVergleichKostenNacht'];
const prozentText=x=>String(Math.round(x*10)/10).replace('.',',');

function planStandard(){
  // Ohne Buchungen im neuen Modell: 15,5 % Gebühr, mit 20 % USt, wenn keine
  // UID hinterlegt ist — dieselbe Einstellung wie oben im Werkzeug.
  const geb = planVorgabe ? planVorgabe.gebuehr : ($('uid').value==='ja' ? 15.5 : 18.6);
  const heute = regimeOf(Date.UTC(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()));
  return {
    planPreis: planVorgabe ? fmt(planVorgabe.preis) : '100,00',
    planNaechte: String(planVorgabe ? planVorgabe.naechte : 4),
    planReinigung:'0,00', planKostenAufenthalt:'0,00', planKostenNacht:'0,00',
    planHeuteSatz: heute, planHeuteGeb: prozentText(geb),
    planVergleichSatz: 'r80', planVergleichGeb: prozentText(geb),
    // Die Vergleichskosten folgen den heutigen, solange niemand sie ändert.
    planVergleichKostenAufenthalt: $('planKostenAufenthalt').value || '0,00',
    planVergleichKostenNacht: $('planKostenNacht').value || '0,00'
  };
}
function fuellePlanung(){
  // Zweimal: die Vergleichskosten lesen die heutigen, die dabei erst gesetzt werden.
  for(let i=0;i<2;i++){
    const std=planStandard();
    PLAN_FELDER.forEach(id=>{ if(!planAngefasst.has(id)) $(id).value=std[id]; });
  }
}
function zeichnePlanung(){
  const erg=$('planErgebnis'), tab=$('planTabelle'), hin=$('planHinweis');
  const basis=$('basis').value;
  const zahl=(id,name)=>{
    const g=leseGeld($(id).value);
    if(g.status==='ungueltig' || g.status==='leer') throw new Error(name+': „'+$(id).value+'“ ist keine lesbare Zahl.');
    return g.wert;
  };
  let r, p, heute, vergleich;
  try{
    const n=$('planNaechte').value.trim();
    if(!/^\d+$/.test(n)) throw new Error('Nächte: „'+n+'“ ist keine ganze Zahl.');
    p={preis:zahl('planPreis','Nachtpreis'), naechte:+n, reinigung:zahl('planReinigung','Reinigungsgebühr'),
       kostenAufenthalt:zahl('planKostenAufenthalt','Kosten je Aufenthalt'),
       kostenNacht:zahl('planKostenNacht','Kosten je Nacht'), basis};
    heute={reg:$('planHeuteSatz').value, gebuehr:zahl('planHeuteGeb','Airbnb-Gebühr heute')};
    vergleich={reg:$('planVergleichSatz').value, gebuehr:zahl('planVergleichGeb','Airbnb-Gebühr im Vergleich'),
               kostenAufenthalt:zahl('planVergleichKostenAufenthalt','Kosten je Aufenthalt im Vergleich'),
               kostenNacht:zahl('planVergleichKostenNacht','Kosten je Nacht im Vergleich')};
    r=preisPlanung(p,heute,vergleich);
  }catch(e){
    erg.classList.add('fehler'); erg.textContent=e.message; tab.innerHTML=''; return;
  }
  erg.classList.remove('fehler');
  const eur=x=>fmt(round2(x))+' €', vorz=x=>(x>=0?'+':'−')+fmt(round2(Math.abs(x)));
  const gleich=Math.abs(r.differenz)<0.005;
  const kostenGleich=Math.abs(r.heute.kosten-r.vergleich.kosten)<0.005;
  erg.innerHTML = 'Nötiger Nachtpreis: <strong>'+eur(r.preisNoetig)+'</strong>'
    +(gleich ? ' — unverändert.'
      : ' statt '+eur(p.preis)+' ('+vorz(r.differenz)+' €'+(r.prozent!=null?' · '+vorz(r.prozent)+' %':'')+')')
    +'<div class="dim" style="font-size:13px;margin-top:6px">Damit bleiben dir wie heute '+eur(r.heute.bleibt)
    +' je Aufenthalt ('+eur(r.heute.bleibt/p.naechte)+' je Nacht). Ohne Preisanpassung wären es '
    +eur(r.ohneAnpassung.bleibt)+' — '+eur(r.heute.bleibt-r.ohneAnpassung.bleibt)+' weniger je Aufenthalt.'
    +(kostenGleich && r.heute.kosten>0 ? ' Deine Kosten ändern den nötigen Preis nicht, solange sie im Vergleich gleich bleiben — sie zeigen, was wirklich übrig bleibt.' : '')
    +'</div>'
    +(r.heute.bleibt<0 ? '<div class="flag" style="margin-top:6px">Schon heute bleibt nichts übrig — die Kosten übersteigen, was nach Ortstaxe und Gebühr ankommt.</div>' : '')
    +(r.preisNoetig<0 ? '<div class="flag" style="margin-top:6px">Der nötige Preis ist negativ: die Reinigungsgebühr allein deckt den Überschuss. Die Rechnung ist hier nicht sinnvoll.</div>' : '');
  const kopf=sz=>pct(EFF[sz.reg])+' · '+prozentText(sz.gebuehr)+' %';
  const zeile=(name,k,fett)=>'<tr'+(fett?' class="tot"':'')+'><td>'+name+'</td>'
    +[r.heute,r.ohneAnpassung,r.vergleich].map(x=>'<td class="num">'+(k==='kosten'||k==='ortstaxe'||k==='ust'||k==='airbnb'?'− ':'')+eur(x[k])+'</td>').join('')+'</tr>';
  tab.innerHTML='<tr><th>je Aufenthalt ('+p.naechte+' Nächte)</th><th class="num">Heute<br><span class="dim">'+kopf(heute)
    +'</span></th><th class="num">Vergleich, alter Preis<br><span class="dim">'+kopf(vergleich)
    +'</span></th><th class="num">Vergleich, nötiger Preis<br><span class="dim">'+kopf(vergleich)+'</span></th></tr>'
    +zeile('Gast zahlt','gast')+zeile('Ortstaxe','ortstaxe')
    +(basis==='ust10' ? zeile('Umsatzsteuer 10 %','ust') : '')
    +zeile('Airbnb-Gebühr','airbnb')+zeile('Deine Kosten','kosten')+zeile('Dir bleibt','bleibt',true);
  hin.textContent=(planVorgabe
      ? 'Vorbelegt aus '+planVorgabe.anzahl+' Buchung'+(planVorgabe.anzahl===1?'':'en')+' im Modell „nur Gastgeber zahlt“: '
        +'Bruttoeinkünfte je Nacht (Reinigung anteilig enthalten — wer sie getrennt einträgt, zieht sie vom Nachtpreis ab), '
        +'übliche Aufenthaltsdauer und tatsächlich einbehaltene Gebühr. '
      : 'Standardwerte — mit einer geladenen Datei werden Preis, Dauer und Gebühr aus den Buchungen im neuen Modell vorbelegt. ')
    +'Umsatzsteuer laut Einstellung „Betragsbasis“: '+(basis==='ust10'?'10 %':'keine')+'. '
    +'Nicht enthalten: Einkommensteuer. Die Airbnb-Gebühr ist ein fester Prozentsatz — ändert Airbnb ihn, gilt die Rechnung nicht mehr.';
}
PLAN_FELDER.forEach(id=>{
  const el=$(id);
  const neu=()=>{ planAngefasst.add(id); fuellePlanung(); zeichnePlanung(); };
  el.addEventListener('input', neu); el.addEventListener('change', neu);
});
// Betragsbasis und UID gehören zu den Einstellungen oben — die bestehenden
// Handler bleiben, dieser rechnet die Planung nur nach.
$('basis').addEventListener('change', ()=>{ fuellePlanung(); zeichnePlanung(); });
$('uid').addEventListener('change', ()=>{ fuellePlanung(); zeichnePlanung(); });
$('planZuruecksetzen').onclick=()=>{ planAngefasst.clear(); fuellePlanung(); zeichnePlanung(); };
fuellePlanung(); zeichnePlanung();
