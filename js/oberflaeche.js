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

  const pt=document.getElementById('pays');
  const perMonth={};
  res.months.forEach(m=>{ perMonth[m.month]=(perMonth[m.month]||0)+m.tax; });
  const keys=Object.keys(perMonth).sort();
  let p='<tr><th>Aufenthaltsmonat</th><th>Fällig</th><th class="num">Betrag</th><th style="text-align:right">Verwendungszweck</th></tr>';
  keys.forEach(k=>{
    const [y,mo]=k.split('-');
    const due=new Date(Date.UTC(+y,+mo,15)).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'});
    const vz=opt.konto+mo+y;
    p+='<tr><td class="mono">'+monthLabel(k)+'</td><td class="mono dim">'+due+'</td>'
      +'<td class="num"><strong>'+fmt(round2(perMonth[k]))+'</strong></td>'
      +'<td><div class="vz"><code>'+esc(vz)+'</code><button class="copy" data-vz="'+esc(vz)+'">Kopieren</button></div></td></tr>';
  });
  p+='<tr class="tot"><td colspan="2">Summe</td><td class="num">'+fmt(round2(keys.reduce((s,k)=>s+round2(perMonth[k]),0)))+'</td><td></td></tr>';
  pt.innerHTML=p;
  pt.querySelectorAll('.copy').forEach(btn=>{
    btn.onclick=()=>{
      const t=btn.dataset.vz;
      const done=()=>{ btn.textContent='Kopiert'; btn.classList.add('done'); setTimeout(()=>{btn.textContent='Kopieren';btn.classList.remove('done');},1600); };
      if(navigator.clipboard&&window.isSecureContext) navigator.clipboard.writeText(t).then(done,()=>fallback(t,done));
      else fallback(t,done);
    };
  });

  const jahre=jahressummen(res.months);
  let y='<tr><th>Kalenderjahr</th><th class="num">Meldemonate</th><th class="num">Nächte</th>'
    +'<th class="num">Bemessungsgrundlage</th><th class="num">Ortstaxe</th><th>Erklärung fällig</th></tr>';
  jahre.forEach(j=>{
    y+='<tr><td class="mono">'+j.jahr+'</td><td class="num">'+j.monate+'</td>'
      +'<td class="num">'+j.nights+'</td><td class="num">'+fmt(j.base)+'</td>'
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
      +'<td class="col-band">'+bandHTML(b.segs)+(b.parts.length>1&&!b.exempt?'<div class="flag ok">'+b.parts.length+' Meldeperioden</div>':'')+'</td>'
      +'<td class="num">'+fmt(b.amt)+'</td>'
      +'<td class="num col-paid"><input class="paid-in mono'+(b.betragQuelle==='beleg'?' belegt':'')+'" inputmode="decimal" '
        +'data-key="'+esc(b.key)+'" value="'+esc(val)+'" placeholder="geschätzt" '
        +'aria-label="Vom Gast bezahlt, '+esc(b.code)+'"></td>'
      +'<td>'+parts+'</td>'
      +'<td class="num"><strong>'+fmt(round2(b.tax))+'</strong></td></tr>';
  });
  rt.innerHTML=g;
  rt.querySelectorAll('.paid-in').forEach(el=>{
    el.oninput=()=>{ paidRaw[el.dataset.key]=el.value; ungespeichert=true; run(); };
  });
  if(hadFocus){
    const el=rt.querySelector('.paid-in[data-key="'+(window.CSS&&CSS.escape?CSS.escape(hadFocus):hadFocus)+'"]');
    if(el){ el.focus(); try{ el.setSelectionRange(caret,caret); }catch(e){} }
  }

  const w=document.getElementById('warnings');
  w.innerHTML = res.warn.length
    ? '<h2>Hinweise</h2><div class="card" style="padding:14px 18px"><ul style="margin:0;padding-left:18px;font-size:13.5px;color:var(--ink-2)">'+res.warn.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>'
    : '';
  document.getElementById('out').classList.remove('hide');
  markiereSpeicherstand();

  window.__csvMonths=baueCsvMonate(res,opt.konto);
  window.__csvRows=baueCsvBuchungen(res);
  window.__csvPaid=baueCsvGastbetraege(res);
  exportierteSchluessel=new Set(res.bookings.map(b=>b.key));
}

/* --- Steuerung --- */
let lastText=null;
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
          paid:paidRaw};
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
    merkeGastbetraege(res.bookings, paidRaw);
    render(res,opt);
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
    lastText=r.result;
    wolkeBestand=null;          // die frische Datei ist jetzt die Quelle
    run();
    if(daten && konto && objektId) speichereImport(f.name, r.result);
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
document.getElementById('basis').onchange=run;
document.getElementById('zaehl').onchange=run;
document.getElementById('uid').onchange=run;
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
document.getElementById('fee').oninput=run;
document.getElementById('gastfee').oninput=run;

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
      run();
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
  $('wer').textContent = an ? konto.name : '';
}

function fuelleObjekte(){
  const sel=$('objekt');
  sel.innerHTML=objekte.map(o=>'<option value="'+esc(o.id)+'"'
    +(o.id===objektId?' selected':'')+'>'+esc(o.name||o.id)+'</option>').join('');
}

/* Der gespeicherte Bestand wird zur Rechengrundlage. Ist nichts gespeichert,
   bleibt es beim CSV-Weg — wolkeBestand null heißt genau das. */
async function ladeBestand(){
  stand('lädt …');
  const docs=await daten.ladeBuchungen(objektId);
  wolkeBestand = docs.length ? docs : null;
  run();
  stand(docs.length ? docs.length+' Buchungen aus der Datenbank' : 'noch nichts gespeichert');
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
async function speichereImport(dateiname, text){
  try{
    stand('speichert …');
    const opt=optionen();
    const res=compute(parseCSV(text),opt);
    const neu=res.bookings.filter(b=>b.stabil).map(b=>alsBuchungsdokument(b,objektId));
    const uebersprungen=res.bookings.length-neu.length;
    const gespeichert=await daten.ladeBuchungen(objektId);
    if(gespeichert.length)
      await daten.legeSchnappschussAn(objektId, gespeichert, opt,
        {grund:'import', datei:dateiname, hash:textHash(text)});
    const vm=verschmelzeBuchungen(gespeichert, neu);
    await daten.schreibeBuchungen(objektId, vm.schreiben);
    await daten.speichereEinstellungen(opt);
    wolkeBestand = vm.unberuehrt.concat(vm.schreiben);
    run();

    const info=$('paidInfo'), teile=[];
    teile.push(vm.schreiben.length+' Buchung'+(vm.schreiben.length===1?'':'en')+' gespeichert');
    if(vm.unberuehrt.length) teile.push(vm.unberuehrt.length+' aus früheren Importen unberührt');
    if(uebersprungen) teile.push(uebersprungen+' ohne Bestätigungs-Code nicht gespeichert');
    if(vm.konflikte.length)
      teile.push('Achtung: '+vm.konflikte.length+' von Hand gesetzte Gastbeträge wurden von der '
        +'Datei überschrieben ('+vm.konflikte.map(k=>k.code+': '+fmt(k.alt)+' → '+fmt(k.neu)).join(', ')+')');
    info.textContent=teile.join(' · ');
    info.classList.remove('hide');
    stand('gespeichert '+new Date().toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'}));
  }catch(ex){
    stand('Nicht gespeichert: '+ex.message, true);
  }
}

$('anmelden').onclick=async()=>{
  try{ stand('meldet an …'); await daten.anmelden(); }
  catch(ex){ stand(ex.message, true); }
};
$('abmelden').onclick=async()=>{
  try{ await daten.abmelden(); wolkeBestand=null; objektId=null; objekte=[]; stand(''); }
  catch(ex){ stand(ex.message, true); }
};
$('objekt').onchange=async()=>{ objektId=$('objekt').value; await ladeBestand(); };
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
      if(p) nachAnmeldung(); else { wolkeBestand=null; run(); }
    });
    $('wolke').classList.remove('hide');
  }catch(e){ /* still: ohne Datenbank rechnet das Werkzeug vollständig */ }
})();

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
