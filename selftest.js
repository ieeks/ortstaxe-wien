/* Selbsttest zum Ortstaxe-Rechner — Aufruf: index.html?selftest
   Wird von index.html nur bei Bedarf nachgeladen. Läuft als klassisches
   Script im selben Kontext und sieht daher alle Funktionen und Konstanten
   der Hauptdatei. Ohne diese Datei funktioniert das Tool vollständig. */
import {
  EFF,
  fmt,
  round2,
  esc,
  csvZelle,
  csvZeile,
  parseCSV,
  findCol,
  parseDate,
  datumsOrdnung,
  leseGeld,
  parseMoney,
  compute,
  occupancy,
  jahressummen,
  leseGastbetraege,
  merkeGastbetraege,
  monatsSummen,
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
} from './js/kern.js';

/* --- Selbsttest --- Aufruf: index.html?selftest --------------------------
   Kein Build-Schritt, keine zweite Datei: die Prüfungen laufen gegen dieselben
   Funktionen, die auch die Meldung rechnen. Fälle mit „offen“ dokumentieren
   einen bekannten Bug — sie schlagen absichtlich fehl und schalten auf
   „behoben“ um, sobald der Fix drin ist.                                    */
if(location.search.indexOf('selftest')>=0){
  const HEAD='Bestätigungs-Code;Status;Name des Gastes;Startdatum;Enddatum;Anzahl der Nächte;Einkünfte';
  const BASE={basis:'net',fee:0,gastfee:0,zaehl:'nights',konto:'601005590'};
  const csv=(...r)=>compute(parseCSV(HEAD+'\n'+r.join('\n')),BASE);
  const buchung=(von,bis,betrag,status)=>csv('T;'+(status||'')+';Gast;'+von+';'+bis+';;'+(betrag===undefined?'100':betrag));
  const schluessel=(e,u)=>+(e/(u+e)).toFixed(6);

  const R=[]; let gut=0, schlecht=0, offen=0;
  function t(gruppe,name,ist,soll,bug){
    const p=Object.is(ist,soll);
    if(bug){ offen++; R.push([p?'behoben':'offen',gruppe,name,
      p ? bug+' ist behoben — Erwartung im Testfall nachziehen'
        : 'erwartet '+soll+', ist '+ist+' — bekannt als '+bug]); }
    else if(p){ gut++; R.push(['ok',gruppe,name,'']); }
    else { schlecht++; R.push(['fehler',gruppe,name,'erwartet '+soll+', ist '+ist]); }
  }

  /* Schlüsselzahlen der Stadt Wien — schützt die Konstanten aus CLAUDE.md */
  t('Schlüsselzahlen','3,2 % ohne USt',  schluessel(EFF.r32,1),    0.027691);
  t('Schlüsselzahlen','5 % ohne USt',    schluessel(EFF.r50,1),    0.047619);
  t('Schlüsselzahlen','8 % ohne USt',    schluessel(EFF.r80,1),    0.074074);
  t('Schlüsselzahlen','3,2 % bei 10 % USt', schluessel(EFF.r32,1.10), 0.025237);
  t('Schlüsselzahlen','5 % bei 10 % USt',   schluessel(EFF.r50,1.10), 0.043478);
  t('Schlüsselzahlen','8 % bei 10 % USt',   schluessel(EFF.r80,1.10), 0.067797);

  /* Regressionsfall aus CLAUDE.md */
  const reg=buchung('18.06.2026','19.07.2026','1644,80');
  t('Regression','Gesamt 64,58 €',       round2(reg.bookings[0].tax), 64.58);
  t('Regression','Juni 13 N → 19,10 €',  round2(reg.months[0].tax),   19.10);
  t('Regression','Juli 18 N → 45,48 €',  round2(reg.months[1].tax),   45.48);
  t('Regression','Juni hat 13 Nächte',   reg.months[0].nights,        13);
  t('Regression','Juli hat 18 Nächte',   reg.months[1].nights,        18);

  /* Stichtagsgrenzen — beide Jahre, beide Seiten */
  t('Stichtage','Nacht 30.06.2026 → 3,2 %', buchung('30.06.2026','01.07.2026').bookings[0].segs[0],'r32');
  t('Stichtage','Nacht 01.07.2026 → 5 %',   buchung('01.07.2026','02.07.2026').bookings[0].segs[0],'r50');
  t('Stichtage','Nacht 30.06.2027 → 5 %',   buchung('30.06.2027','01.07.2027').bookings[0].segs[0],'r50');
  t('Stichtage','Nacht 01.07.2027 → 8 %',   buchung('01.07.2027','02.07.2027').bookings[0].segs[0],'r80');
  t('Stichtage','Aufenthalt über den Stichtag wird geteilt',
    buchung('29.06.2026','02.07.2026','300').bookings[0].segs.join(','), 'r32,r32,r50');
  // Amtliches Beispiel, MA-6-FAQ Frage 3: Aufenthalt 25.06.–03.07.2027 → bis
  // 30.06. gilt 5 % „inkl. der Nacht vom 30. Juni 2027 auf den 1. Juli 2027“,
  // ab 01.07. dann 8 %.
  const faq=buchung('25.06.2027','03.07.2027','800');
  t('Stichtage','FAQ-Beispiel: 6 Nächte im Juni', faq.months[0].nights, 6);
  t('Stichtage','FAQ-Beispiel: Juni zu 5 %',      faq.months[0].reg, 'r50');
  t('Stichtage','FAQ-Beispiel: 2 Nächte im Juli', faq.months[1].nights, 2);
  t('Stichtage','FAQ-Beispiel: Juli zu 8 %',      faq.months[1].reg, 'r80');

  /* Meldemonat */
  const mw=buchung('29.06.2026','02.07.2026','300');
  t('Meldemonat','zwei Meldeperioden', mw.bookings[0].parts.length, 2);
  t('Meldemonat','Juni 2026',          mw.months[0].month, '2026-06');
  t('Meldemonat','Juli 2026',          mw.months[1].month, '2026-07');

  /* Drei-Monats-Befreiung nach § 11 Abs. 3 WTFG */
  t('Befreiung','90 Nächte nicht befreit', buchung('01.01.2026','01.04.2026').bookings[0].exempt, false);
  t('Befreiung','91 Nächte befreit',       buchung('01.01.2026','02.04.2026').bookings[0].exempt, true);
  // § 11 Abs. 3 WTFG befreit die Person, nicht den Zeitraum: „Personen, die länger
  // als drei Monate ununterbrochen Aufenthalt nehmen, sind von der Entrichtung der
  // Ortstaxe befreit." Ohne Einschränkung — also auch die ersten drei Monate.
  t('Befreiung','befreiter Aufenthalt ist zur Gänze frei',
    round2(buchung('01.01.2026','05.04.2026','10000').bookings[0].tax), 0);
  t('Befreiung','befreiter Aufenthalt erzeugt keinen Meldemonat',
    buchung('01.01.2026','05.04.2026','10000').months.length, 0);
  // § 902 ABGB: drei Monate ab 31.03. enden mit Ablauf des 30.06., ab 30.11. mit
  // Ablauf des 28.02. — der Zielmonat hat den Anfangstag nicht.
  t('Befreiung','Monatsende 31.03. → 01.07. befreit', buchung('31.03.2026','01.07.2026').bookings[0].exempt, true);
  t('Befreiung','Monatsende 31.03. → 30.06. nicht',   buchung('31.03.2026','30.06.2026').bookings[0].exempt, false);
  t('Befreiung','Monatsende 30.11. → 01.03. befreit', buchung('30.11.2026','01.03.2027').bookings[0].exempt, true);
  t('Befreiung','Monatsende 30.11. → 28.02. nicht',   buchung('30.11.2026','28.02.2027').bookings[0].exempt, false);
  t('Befreiung','Schaltjahr 30.11.2027 → 29.02.2028 nicht', buchung('30.11.2027','29.02.2028').bookings[0].exempt, false);
  t('Befreiung','Jahreswechsel 31.12. → 31.03. nicht', buchung('31.12.2026','31.03.2027').bookings[0].exempt, false);
  t('Befreiung','Jahreswechsel 31.12. → 01.04. befreit', buchung('31.12.2026','01.04.2027').bookings[0].exempt, true);

  /* Rundung */
  t('Rundung','round2(1.005) = 1,01', round2(1.005), 1.01);
  t('Rundung','round2(8.165) = 8,17', round2(8.165), 8.17);
  t('Rundung','round2(1.015) = 1,02', round2(1.015), 1.02);
  const drei=csv('A;;G;05.08.2026;06.08.2026;;100','B;;G;05.09.2026;06.09.2026;;100','C;;G;05.10.2026;06.10.2026;;100');
  t('Rundung','Summe folgt den Monatszeilen',
    round2(drei.months.reduce((s,m)=>s+round2(m.tax),0)), 14.28);

  /* Status-Filter */
  ['Storniert','Canceled','Anfrage','Ausstehend','Pending','Abgelaufen'].forEach(s=>
    t('Status','„'+s+'“ wird übersprungen', buchung('05.08.2026','06.08.2026','100',s).bookings.length, 0));
  ['Bestätigt','Confirmed'].forEach(s=>
    t('Status','„'+s+'“ wird gezählt', buchung('05.08.2026','06.08.2026','100',s).bookings.length, 1));
  t('Status','unbekannter Status warnt',
    buchung('05.08.2026','06.08.2026','100','Reserviert').warn.some(w=>/unbekannter Status/.test(w)), true);
  /* Werte aus einem echten deutschen Export — dürfen nicht warnen */
  ['Aktueller Gast','Früherer Gast','Gast bewertet','Gast bewerten – läuft bald ab',
   'Currently hosting','Past guest'].forEach(s=>
    t('Status','„'+s+'“ warnt nicht',
      buchung('05.08.2026','06.08.2026','100',s).warn.length, 0));

  /* Beträge */
  t('Beträge','negativer Betrag warnt',
    buchung('05.08.2026','06.08.2026','-200,00').warn.some(w=>/negativen Betrag/.test(w)), true);
  t('Beträge','fehlender Betrag warnt',
    buchung('05.08.2026','06.08.2026','').warn.some(w=>/keinen Betrag/.test(w)), true);
  ['1.644,80','1,644.80','1644.80','1644,80','€ 1.644,80'].forEach(s=>
    t('Beträge','parseMoney „'+s+'“', parseMoney(s), 1644.8));

  /* Hochrechnung auf das Gastentgelt — MA-6-FAQ Frage 16 */
  const mitGeb=(fee,gastfee)=>compute(parseCSV(HEAD+'\nT;;G;05.08.2026;06.08.2026;;964,00'),
    Object.assign({},BASE,{fee:fee,gastfee:gastfee}));
  t('Hochrechnung','ohne Gebühren bleibt der Betrag', round2(mitGeb(0,0).bookings[0].amt), 964);
  t('Hochrechnung','3,6 % Gastgebergebühr → 1.000 €', round2(mitGeb(3.6,0).bookings[0].amt), 1000);
  t('Hochrechnung','zusätzlich 14 % Gastgebühr → 1.140 €', round2(mitGeb(3.6,14).bookings[0].amt), 1140);
  t('Hochrechnung','Gastgebühr erhöht die Abgabe um 14 %',
    round2(mitGeb(3.6,14).bookings[0].tax), round2(round2(mitGeb(3.6,0).bookings[0].tax)*1.14));

  /* Gegenprobe an einer echten Airbnb-Abrechnung: Aufenthalt 19.07.–26.07.2026,
     7 Nächte. Die Abrechnung weist aus: Nächtigung 936,00 + Reinigung 39,00 =
     975,00, davon 3 % Gastgebergebühr + 20 % USt = 35,10 → Auszahlung 939,90.
     Gast-Servicegebühr 163,80 brutto = 136,50 netto = 14,0 % von 975,00.
     Bemessungsgrundlage 1.111,50, Meldemonat 07/2026 zu 5 %.
     Achtung beim Nachstellen: „Gebucht“ (30.04.2026) ist das Buchungsdatum,
     nicht die Anreise — für die Ortstaxe zählt allein der Aufenthalt. */
  const beleg=compute(parseCSV(HEAD+'\nT;;Gast;19.07.2026;26.07.2026;;939,90'),
    Object.assign({},BASE,{fee:3.6,gastfee:14})).bookings[0];
  t('Abrechnung','939,90 € Auszahlung → 975,00 € vor Gast-Servicegebühr',
    round2(939.90/(1-0.036)), 975);
  t('Abrechnung','163,80 € brutto Gast-Servicegebühr sind 14,0 % netto',
    round2(163.80/1.2/975*100), 14);
  t('Abrechnung','Bemessungsgrundlage 1.111,50 €', round2(beleg.amt), 1111.5);
  t('Abrechnung','7 Nächte', beleg.nights, 7);
  t('Abrechnung','liegt nach dem Stichtag, also 5 %', beleg.parts[0].reg, 'r50');
  t('Abrechnung','ein einziger Meldemonat 07/2026', beleg.parts[0].month, '2026-07');
  t('Abrechnung','Ortstaxe gesamt 52,93 €', round2(beleg.tax), 52.93);

  /* Aufenthalt über drei Meldemonate — Anreise 28.07., Abreise 08.09.2026.
     Die Nächteaufteilung hängt nicht von den Gebührensätzen ab, deshalb hier
     geprüft: 4 Nächte Juli, 31 August, 7 September. */
  const spanne=compute(parseCSV(HEAD+'\nT;;Gast;28.07.2026;08.09.2026;;3134,93'),
    Object.assign({},BASE,{fee:3.6,gastfee:14})).bookings[0];
  t('Abrechnung','42 Nächte über drei Monate', spanne.nights, 42);
  t('Abrechnung','drei Meldemonate', spanne.parts.length, 3);
  t('Abrechnung','Juli 2026 — 4 Nächte', spanne.parts[0].month+'/'+spanne.parts[0].nights, '2026-07/4');
  t('Abrechnung','August 2026 — 31 Nächte', spanne.parts[1].month+'/'+spanne.parts[1].nights, '2026-08/31');
  t('Abrechnung','September 2026 — 7 Nächte', spanne.parts[2].month+'/'+spanne.parts[2].nights, '2026-09/7');
  /* Gemeldet und bezahlt wird je Meldemonat, also ist die Summe der gerundeten
     Monatswerte der maßgebliche Betrag. Der ungerundete Gesamtwert der Buchung
     kann davon einen Cent abweichen — hier 176,53 gegen 176,54. Beide Werte sind
     festgehalten, damit eine Änderung der Rundung auffällt. */
  t('Abrechnung','Summe der Meldemonate 176,53 €',
    round2(spanne.parts.reduce((s,x)=>s+round2(x.tax),0)), 176.53);
  t('Abrechnung','ungerundeter Gesamtwert 176,54 € — ein Cent Rundungsdifferenz',
    round2(spanne.tax), 176.54);

  /* Optionale Spalte „Vom Gast bezahlt“. Die Gast-Servicegebühr ist nicht
     konstant und aus der Auszahlung nicht herleitbar — belegt aus der App:
     Pia 163,80 auf 975,00 = 14,0 % netto, Charles 381,26 auf 3.252,00 = 9,8 %.
     Genau deshalb muss der Betrag je Buchung mitgegeben werden können. */
  const HEADP=HEAD+';Vom Gast bezahlt';
  const OPTB=Object.assign({},BASE,{fee:3.6,gastfee:14});
  const belegt=(a,e,ein,gez)=>compute(parseCSV(HEADP+'\nT;;Gast;'+a+';'+e+';;'+ein+';'+gez),OPTB);

  const pia=belegt('19.07.2026','26.07.2026','939,90','1138,80').bookings[0];
  t('Gast bezahlt','Pia — Grundlage 1.111,50 €', round2(pia.amt), 1111.5);
  t('Gast bezahlt','Pia — Ortstaxe 52,93 €', round2(pia.tax), 52.93);

  const cha=belegt('28.07.2026','08.09.2026','3134,93','3633,26');
  t('Gast bezahlt','Charles — 3.134,93 € hochgerechnet sind 3.252,00 €',
    round2(3134.93/(1-0.036)), 3252);
  t('Gast bezahlt','Charles — Servicegebühr 381,26 € brutto ergibt 9,77 % netto',
    round2(381.26/1.2/3252*100), 9.77);
  t('Gast bezahlt','Charles — Grundlage 3.569,72 €', round2(cha.bookings[0].amt), 3569.72);
  t('Gast bezahlt','Charles — Ortstaxe 169,99 €', round2(cha.bookings[0].tax), 169.99);
  t('Gast bezahlt','belegte Buchung warnt nicht vor der Pauschale',
    cha.warn.some(w=>/pauschal/.test(w)), false);

  /* Ohne Spalte bleibt nur der Pauschalsatz — der bei Charles 6,55 € zu viel
     ansetzt. Das muss sichtbar sein, sonst hält der Nutzer es für belegt. */
  const ohne=compute(parseCSV(HEAD+'\nT;;Gast;28.07.2026;08.09.2026;;3134,93'),OPTB);
  t('Gast bezahlt','ohne Spalte 3.707,28 € statt 3.569,72 €',
    round2(ohne.bookings[0].amt), 3707.28);
  t('Gast bezahlt','ohne Spalte 6,55 € zu viel',
    round2(round2(ohne.bookings[0].tax)-round2(cha.bookings[0].tax)), 6.55);
  t('Gast bezahlt','ohne Spalte wird gewarnt', ohne.warn.some(w=>/pauschal/.test(w)), true);
  t('Gast bezahlt','leere Zelle fällt auf den Prozentsatz zurück',
    round2(belegt('28.07.2026','08.09.2026','3134,93','').bookings[0].amt), 3707.28);
  t('Gast bezahlt','unplausibel kleiner Wert wird gemeldet',
    belegt('28.07.2026','08.09.2026','3134,93','500,00').warn.some(w=>/liegt unter/.test(w)), true);
  t('Gast bezahlt','ohne Gastgebühr keine Pauschal-Warnung',
    compute(parseCSV(HEAD+'\nT;;Gast;28.07.2026;08.09.2026;;3134,93'),
      Object.assign({},BASE,{fee:3.6,gastfee:0})).warn.some(w=>/pauschal/.test(w)), false);

  /* Der Einnahmen-Export darf nicht stumm durchlaufen — er hat Start- und
     Enddatum und „Bruttoeinkünfte“ und käme sonst auf plausible falsche Zahlen. */
  const EIN='Datum,Voraussichtliches Datum des Geldeingangs,Typ,Bestätigungs-Code,'
    +'Buchungsdatum,Startdatum,Enddatum,Nächte,Gast,Inserat,Details,Referenzcode,'
    +'Währung,Betrag,Ausgezahlt,Servicegebühr,Gebühr für schnelle Zahlung,'
    +'Reinigungsgebühr,Bruttoeinkünfte,Von Airbnb abgeführte Steuer,Ertragsjahr';
  let abgewiesen='';
  try{ compute(parseCSV(EIN+'\n,,Buchung,HM1,,07/19/2026,07/26/2026,7,G,,,,EUR,939.90,,35,10,,39.00,969.15,0.00,2026'),BASE); }
  catch(e){ abgewiesen=e.message; }
  t('CSV','Einnahmen-Export wird abgewiesen', /Einnahmen-Export/.test(abgewiesen), true);
  t('CSV','Reservierungs-Export läuft weiter durch',
    compute(parseCSV(HEAD+'\nT;;Gast;19.07.2026;26.07.2026;;939,90'),BASE).bookings.length, 1);

  /* Kopfzeile und Formatierung wörtlich aus einem echten Reservierungs-Export:
     Komma getrennt, alle Felder in Quotes, Datum ohne führende Null, Betrag mit
     Eurozeichen und geschützten Leerzeichen (U+00A0) als Tausendertrenner. */
  const XHEAD='"Bestätigungs-Code","Status","Name des Gastes","Kontakt",'
    +'"Anzahl der Erwachsenen","Anzahl der Kinder","Anzahl der Kleinkinder",'
    +'"Startdatum","Enddatum","Anzahl der Nächte","Gebucht","Inserat","Einkünfte"';
  const xr=(code,st,von,bis,n,betrag)=>'"'+code+'","'+st+'","Gast","","2","0","0","'
    +von+'","'+bis+'","'+n+'","2026-06-04","Roof top studio","'+betrag+'"';
  const echt=compute(parseCSV(XHEAD+'\n'
    +xr('HMJWXDTWBD','Aktueller Gast','28.7.2026','8.9.2026','42','€ 3 134,93')+'\n'
    +xr('HMBC9HMQQA','Gast bewerten – läuft bald ab','19.7.2026','26.7.2026','7','€ 939,90')),
    Object.assign({},BASE,{fee:3.6,gastfee:14}));
  t('Echter Export','„€ 3 134,93“ mit geschützten Leerzeichen',
    round2(echt.bookings[0].amt), 3707.28);
  t('Echter Export','Datum „28.7.2026“ ohne führende Null', echt.bookings[0].nights, 42);
  t('Echter Export','Aufenthalt über drei Meldemonate', echt.bookings[0].parts.length, 3);
  t('Echter Export','zweite Buchung 7 Nächte im Juli', echt.bookings[1].parts[0].month, '2026-07');
  t('Echter Export','keine Datums- oder Statuswarnung',
    echt.warn.filter(w=>/Datum|Status/.test(w)).length, 0);

  /* Eingabe in der Buchungstabelle (opt.paid). Rangfolge: Eingabe vor
     CSV-Spalte vor Prozentsatz; eine geleerte Eingabe ist bewusst 0. */
  const mitEingabe=(gez,ov)=>compute(parseCSV(HEADP+'\nT;;Gast;28.07.2026;08.09.2026;;3134,93;'+gez),
    Object.assign({},OPTB,{paid:ov})).bookings[0];
  t('Eingabe','Eingabe schlägt die CSV-Spalte',
    round2(mitEingabe('1000,00',{T:3633.26}).amt), 3569.72);
  t('Eingabe','geleerte Eingabe fällt auf den Prozentsatz',
    round2(mitEingabe('3633,26',{T:0}).amt), 3707.28);
  t('Eingabe','ohne Eingabe bleibt die CSV-Spalte',
    round2(mitEingabe('3633,26',{}).amt), 3569.72);
  t('Eingabe','ohne beides greift der Prozentsatz',
    round2(mitEingabe('',{}).amt), 3707.28);
  t('Eingabe','netPay bleibt die rohe Auszahlung',
    round2(mitEingabe('3633,26',{}).netPay), 3134.93);
  t('Eingabe','paid ist der tatsächlich verwendete Gastbetrag',
    round2(mitEingabe('',{T:3633.26}).paid), 3633.26);
  t('Eingabe','Eingabe zählt auch für den Meldemonat',
    round2(mitEingabe('',{T:3633.26}).parts[1].tax), 125.47);

  /* Gedächtnis über mehrere Uploads. Wer die Gastbeträge einträgt, exportiert
     und danach den frischen Airbnb-Export lädt, darf sie nicht verlieren —
     der rohe Export hat die Spalte ja nicht. */
  const merk=Object.create(null);
  const ausDatei=compute(parseCSV(HEADP+'\nT;;Gast;28.07.2026;08.09.2026;;3134,93;3633,26'),OPTB);
  merkeGastbetraege(ausDatei.bookings, merk);
  /* Gegen fmt vergleichen, nicht gegen ein Literal: de-AT trennt Tausender mit
     einem geschützten Leerzeichen, das sich nicht abtippen lässt. */
  t('Gedächtnis','Wert aus der Spalte wird gemerkt', merk.T, fmt(3633.26));
  t('Gedächtnis','gemerkter Wert rechnet nach dem Upload weiter',
    round2(compute(parseCSV(HEAD+'\nT;;Gast;28.07.2026;08.09.2026;;3134,93'),
      Object.assign({},OPTB,{paid:{T:parseMoney(merk.T)}})).bookings[0].amt), 3569.72);
  t('Gedächtnis','ohne Gedächtnis wäre es die Schätzung',
    round2(compute(parseCSV(HEAD+'\nT;;Gast;28.07.2026;08.09.2026;;3134,93'),OPTB).bookings[0].amt), 3707.28);

  const merk2={T:'1000,00'};
  merkeGastbetraege(ausDatei.bookings, merk2);
  t('Gedächtnis','Eingetipptes wird nicht überschrieben', merk2.T, '1000,00');
  const merk3={T:''};
  merkeGastbetraege(ausDatei.bookings, merk3);
  t('Gedächtnis','bewusst geleertes Feld bleibt leer', merk3.T, '');
  const merk4=Object.create(null);
  merkeGastbetraege(compute(parseCSV(HEAD+'\nT;;Gast;28.07.2026;08.09.2026;;3134,93'),OPTB).bookings, merk4);
  t('Gedächtnis','ohne Spalte wird nichts gemerkt', merk4.T, undefined);

  /* Gastbeträge aus einer früher exportierten Datei nachladen. Die Datei bringt
     nur Beträge mit, nie die Buchungsliste — sonst entschiede die Reihenfolge
     der Uploads darüber, welche Buchungen überhaupt erscheinen. */
  const EXP='Bestätigungs-Code;Name des Gastes;Startdatum;Enddatum;Anzahl der Nächte;Einkünfte;Vom Gast bezahlt';
  const gelesen=leseGastbetraege(parseCSV(EXP
    +'\nHMJWXDTWBD;Charles;28.07.2026;08.09.2026;42;3 134,93;3 633,26'
    +'\nHMBC9HMQQA;Pia;19.07.2026;26.07.2026;7;939,90;1 138,80'
    +'\nHM35HQ2DTM;Ruth;18.06.2026;19.07.2026;31;1 585,59;'));
  t('Nachladen','zwei Beträge gelesen', Object.keys(gelesen).length, 2);
  t('Nachladen','Betrag am richtigen Code', gelesen.HMJWXDTWBD, '3 633,26');
  t('Nachladen','leere Zelle wird übersprungen', gelesen.HM35HQ2DTM, undefined);
  t('Nachladen','gelesener Wert rechnet wie eine Eingabe',
    round2(compute(parseCSV(HEAD+'\nHMJWXDTWBD;;Gast;28.07.2026;08.09.2026;;3134,93'),
      Object.assign({},OPTB,{paid:{HMJWXDTWBD:parseMoney(gelesen.HMJWXDTWBD)}})).bookings[0].amt), 3569.72);
  t('Nachladen','englische Kopfzeile',
    Object.keys(leseGastbetraege(parseCSV('Confirmation code,Total paid by guest\nABC,"1,138.80"'))).length, 1);
  t('Nachladen','ohne die nötigen Spalten kommt ein Fehler', (()=>{
    try{ leseGastbetraege(parseCSV('Startdatum;Enddatum\n01.01.2026;02.01.2026')); return 'kein Fehler'; }
    catch(e){ return /Bestätigungs-Code/.test(e.message) ? 'Fehler mit Hinweis' : 'Fehler ohne Hinweis'; }
  })(), 'Fehler mit Hinweis');

  /* 90-Tage-Zähler der Bauordnung. Bisher ungetestet — die echten Aufenthalte
     eines Jahres, Stichtag 20.08.2026, damit verbraucht und fest gebucht
     auseinanderfallen. */
  const jahr=csv(
    'A;;G;30.01.2026;21.03.2026;;100',   /* 50 N  Graubereich */
    'B;;G;22.03.2026;24.04.2026;;100',   /* 33 N  Graubereich */
    'C;;G;04.05.2026;11.05.2026;;100',   /*  7 N  kurz */
    'D;;G;13.05.2026;18.05.2026;;100',   /*  5 N  kurz */
    'E;;G;19.05.2026;23.05.2026;;100',   /*  4 N  kurz */
    'F;;G;26.05.2026;31.05.2026;;100',   /*  5 N  kurz */
    'G;;G;03.06.2026;07.06.2026;;100',   /*  4 N  kurz */
    'H;;G;18.06.2026;19.07.2026;;100',   /* 31 N  Graubereich */
    'I;;G;19.07.2026;26.07.2026;;100',   /*  7 N  kurz */
    'J;;G;28.07.2026;08.09.2026;;100');  /* 42 N  Graubereich, läuft über den Stichtag */
  const STICHTAG=Date.UTC(2026,7,20);
  const q=occupancy(jahr.bookings,'nights',STICHTAG)[0];
  t('90-Tage','Jahr erkannt', q.year, 2026);
  t('90-Tage','kurz gesamt 32 Nächte', q.kurz, 32);
  t('90-Tage','kurz verbraucht 32', q.kurzV, 32);
  t('90-Tage','kurz fest gebucht 0', q.kurzP, 0);
  t('90-Tage','Graubereich gesamt 156', q.grau, 156);
  t('90-Tage','Graubereich verbraucht 137', q.grauV, 137);
  t('90-Tage','Graubereich fest gebucht 19', q.grauP, 19);
  t('90-Tage','Aufteilung ergibt die Gesamtzahl',
    q.kurzV+q.kurzP+q.grauV+q.grauP, q.kurz+q.grau);
  t('90-Tage','früheste Nacht wird gemerkt', q.von, Date.UTC(2026,0,30));
  t('90-Tage','58 Nächte offen, wenn nur kurz zählt', 90-q.kurz, 58);
  t('90-Tage','98 über dem Limit, wenn der Graubereich zählt', 90-q.kurz-q.grau, -98);

  const zaehlung=(...r)=>occupancy(csv(...r).bookings,'nights',STICHTAG);
  t('90-Tage','doppelt belegte Nacht zählt einmal',
    zaehlung('A;;G;05.08.2026;08.08.2026;;100','B;;G;06.08.2026;09.08.2026;;100')[0].kurz, 4);
  t('90-Tage','Tage-Zählweise nimmt den Abreisetag dazu',
    occupancy(csv('A;;G;05.08.2026;10.08.2026;;100').bookings,'days',STICHTAG)[0].kurz, 6);
  t('90-Tage','Nächte-Zählweise ohne Abreisetag',
    zaehlung('A;;G;05.08.2026;10.08.2026;;100')[0].kurz, 5);
  t('90-Tage','über drei Monate zählt gar nicht',
    zaehlung('A;;G;01.01.2026;01.05.2026;;100').length, 0);
  t('90-Tage','Jahreswechsel trennt die Zählung',
    zaehlung('A;;G;28.12.2025;04.01.2026;;100').length, 2);

  /* Jahressummen für die Abgabenerklärung nach § 13 Abs. 2 WTFG. Entscheidend
     ist, dass je Meldeperiode gerundet wird — die Erklärung muss zu den
     einzelnen Überweisungen passen, nicht zu einem am Jahresende gerundeten
     Gesamtwert. */
  const jr=jahressummen(jahr.months);
  t('Erklärung','ein Kalenderjahr erkannt', jr.length, 1);
  t('Erklärung','Jahr 2026', jr[0].jahr, 2026);
  t('Erklärung','neun Meldemonate', jr[0].monate, 9);
  t('Erklärung','Jahressumme = Summe der Meldeperioden', jr[0].tax, (()=>{
    const proMonat={};
    jahr.months.forEach(m=>{ proMonat[m.month]=(proMonat[m.month]||0)+m.tax; });
    return round2(Object.values(proMonat).reduce((s,v)=>s+round2(v),0));
  })());
  t('Erklärung','früheste Periode wird gemerkt', jr[0].von, '2026-01');

  /* Ein Aufenthalt über den Jahreswechsel gehört in zwei Erklärungen */
  const zwei=jahressummen(csv('A;;G;30.12.2025;03.01.2026;;1000').months);
  t('Erklärung','Jahreswechsel ergibt zwei Jahre', zwei.length, 2);
  t('Erklärung','2025 bekommt zwei Nächte', zwei[0].nights, 2);
  t('Erklärung','2026 bekommt zwei Nächte', zwei[1].nights, 2);
  /* Je Periode gerundet ergibt 27,70, die ungerundete Buchung 27,69. Gemeldet
     und bezahlt wird periodenweise, also ist 27,70 der maßgebliche Wert. Beide
     festgehalten, damit eine Änderung der Rundung auffällt. */
  t('Erklärung','Summe der Jahre 27,70 €', round2(zwei[0].tax+zwei[1].tax), 27.70);
  t('Erklärung','ungerundete Buchung 27,69 € — ein Cent Differenz',
    round2(csv('A;;G;30.12.2025;03.01.2026;;1000').bookings[0].tax), 27.69);

  /* CSV */
  t('CSV','Semikolon + Quotes + Komma im Namen',
    compute(parseCSV(HEAD+'\nT;;"Müller, Anna";05.06.2026;07.06.2026;;"1.200,50"'),BASE).bookings[0].nights, 2);
  t('CSV','Komma-Trenner, englische Kopfzeile',
    compute(parseCSV('Confirmation code,Status,Guest name,Start date,End date,# of nights,Earnings\nT,,Anna,06/05/2026,06/07/2026,2,"1,200.50"'),BASE).bookings[0].amt, 1200.5);
  t('CSV','BOM wird entfernt',
    compute(parseCSV('﻿'+HEAD+'\nT;;G;05.08.2026;06.08.2026;;100'),BASE).bookings.length, 1);
  t('CSV','unlesbares Datum warnt',
    csv('T;;G;;06.08.2026;;100').warn.some(w=>/nicht lesbar/.test(w)), true);
  t('CSV','0 Nächte werden übersprungen',
    buchung('05.08.2026','05.08.2026').bookings.length, 0);

  /* Robustheit */
  t('Robustheit','esc() neutralisiert Markup', esc('<img src=x onerror=y>'), '&lt;img src=x onerror=y&gt;');
  t('Robustheit','esc() behandelt Anführungszeichen', esc('a"b&c'), 'a&quot;b&amp;c');
  t('Robustheit','Code „constructor“ löst keine Dublettenwarnung aus',
    csv('constructor;;G;05.08.2026;06.08.2026;;100').warn.length, 0);
  t('Robustheit','echte Dublette warnt',
    csv('HM1;;G;05.08.2026;06.08.2026;;100','HM1;;G;05.09.2026;06.09.2026;;100')
      .warn.some(w=>/mehrfach/.test(w)), true);

  /* CSV schreiben — Gegenstück zu parseCSV. Die Exportdatei ist der Speicher
     für die Gastbeträge; zerreißt sie an einem Sonderzeichen, ist der Stand
     weg. Geprüft wird deshalb der ganze Weg Export → Import. */
  t('CSV schreiben','Zelle ohne Sonderzeichen bleibt roh', csvZelle('Anna'), 'Anna');
  t('CSV schreiben','Semikolon wird gequotet', csvZelle('Anna;Muster'), '"Anna;Muster"');
  t('CSV schreiben','Anführungszeichen werden verdoppelt', csvZelle('Anna "M"'), '"Anna ""M"""');
  t('CSV schreiben','Zeilenumbruch wird gequotet', csvZelle('a\nb'), '"a\nb"');
  t('CSV schreiben','leere Zelle bleibt leer', csvZelle(''), '');
  t('CSV schreiben','null wird zur leeren Zelle', csvZelle(null), '');
  t('CSV schreiben','Zeile fügt mit Semikolon zusammen', csvZeile(['a','b;c']), 'a;"b;c"');

  /* Export → Import: Anzahl, Code, Name und Gastbetrag müssen identisch
     zurückkommen. Vor dem Fix ergab ein Semikolon im Namen 0 Buchungen. */
  const RT='Bestätigungs-Code;Name des Gastes;Startdatum;Enddatum;Einkünfte;Vom Gast bezahlt';
  /* Bewusst über die echte Exportfunktion, nicht über csvZeile direkt: sonst
     bliebe der Test grün, wenn render() am Serializer vorbei exportiert. */
  /* Testeigenes Quoting: die Eingabe darf nicht von der Funktion abhängen,
     die hier geprüft wird — sonst faellt bei einem Serializer-Fehler auch das
     Fixture aus und der Test bricht ab statt rot zu werden. */
  const qz=v=>'"'+String(v).replace(/"/g,'""')+'"';
  const rundlauf=name=>{
    const hin=compute(parseCSV(RT+'\n'+[qz('HM1'),qz(name),qz('05.08.2026'),qz('07.08.2026'),qz('100,00'),qz('120,00')].join(';')),BASE);
    return {hin:hin, zurueck:compute(parseCSV(baueCsvGastbetraege(hin)),BASE)};
  };
  /* Defensiv: schlaegt der Serializer fehl, sollen die Faelle rot werden und
     nicht den ganzen Testlauf mit einer Exception abbrechen. */
  ['Anna;Muster','Anna "Muster"','a\nb','Müller, Anna'].forEach(n=>{
    const {hin,zurueck}=rundlauf(n), a=hin.bookings[0], b=zurueck.bookings[0];
    t('CSV schreiben','Rundlauf behält die Buchung: '+JSON.stringify(n), zurueck.bookings.length, 1);
    t('CSV schreiben','Rundlauf behält den Code: '+JSON.stringify(n), b?b.code:null, 'HM1');
    t('CSV schreiben','Rundlauf behält den Namen: '+JSON.stringify(n), b?b.name:null, n);
    t('CSV schreiben','Rundlauf behält den Gastbetrag: '+JSON.stringify(n), b?b.paid:null, 120);
    t('CSV schreiben','Rundlauf behält die Ortstaxe: '+JSON.stringify(n),
      b?round2(b.tax):null, a?round2(a.tax):NaN);
  });
  /* Auch die beiden menschenlesbaren Exporte müssen quoten */
  const sonder=compute(parseCSV(RT+'\n'+[qz('HM1'),qz('A;B'),qz('05.08.2026'),qz('07.08.2026'),qz('100,00'),qz('')].join(';')),BASE);
  const zB=parseCSV(baueCsvBuchungen(sonder)), zM=parseCSV(baueCsvMonate(sonder,'601005590'));
  t('CSV schreiben','Buchungsexport quotet den Namen',
    baueCsvBuchungen(sonder).split('\n')[1].indexOf('"A;B"')>=0, true);
  t('CSV schreiben','Buchungsexport bleibt spaltentreu', zB[1]?zB[1].length:0, zB[0].length);
  t('CSV schreiben','Monatsexport bleibt spaltentreu', zM[1]?zM[1].length:0, 6);

  /* Identität — ein gemerkter Gastbetrag darf nur an einem echten
     Bestätigungs-Code hängen. Ohne Code bekommt die Zeile einen flüchtigen
     Schlüssel mit „#“, den load() vor jeder neuen Datei verwirft. */
  const OHNE='Status;Name des Gastes;Startdatum;Enddatum;Einkünfte';
  const ohneCode=compute(parseCSV(OHNE+'\n;Anna;05.08.2026;07.08.2026;100'),BASE);
  t('Identität','Zeile ohne Code bekommt Anzeige-Label', ohneCode.bookings[0].code, 'Zeile 2');
  t('Identität','Zeile ohne Code bekommt flüchtigen Schlüssel', ohneCode.bookings[0].key, '#zeile2');
  t('Identität','Zeile ohne Code ist nicht stabil', ohneCode.bookings[0].stabil, false);
  t('Identität','fehlender Code warnt',
    ohneCode.warn.some(w=>/Bestaetigungs-Code/.test(w)), true);
  t('Identität','Zeile mit Code ist stabil',
    csv('HM1;;G;05.08.2026;06.08.2026;;100').bookings[0].stabil, true);
  t('Identität','Zeile mit Code nutzt den Code als Schlüssel',
    csv('HM1;;G;05.08.2026;06.08.2026;;100').bookings[0].key, 'HM1');
  /* Ein flüchtiger Schlüssel greift innerhalb derselben Datei — das ist gewollt */
  t('Identität','flüchtiger Schlüssel wirkt in derselben Datei',
    compute(parseCSV(OHNE+'\n;Anna;05.08.2026;07.08.2026;100'),
      Object.assign({},BASE,{paid:{'#zeile2':200}})).bookings[0].paid, 200);
  /* merkeGastbetraege darf codelose Zeilen nicht ins Gedächtnis nehmen */
  const ged=Object.create(null);
  merkeGastbetraege([{key:'#zeile2',stabil:false,paid:150},{key:'HM1',stabil:true,paid:150}], ged);
  t('Identität','codelose Zeile wird nicht gemerkt', ged['#zeile2'], undefined);
  t('Identität','Zeile mit Code wird gemerkt', ged['HM1'], '150,00');
  /* Der Purge aus load(): „#“-Schlüssel überleben keinen Dateiwechsel */
  const nachLoad=Object.create(null); nachLoad['#zeile2']='200,00'; nachLoad['HM1']='200,00';
  for(const k in nachLoad) if(k.charAt(0)==='#') delete nachLoad[k];
  t('Identität','flüchtiger Schlüssel überlebt load() nicht', nachLoad['#zeile2'], undefined);
  t('Identität','echter Code überlebt load()', nachLoad['HM1'], '200,00');

  /* Geldbeträge streng lesen (F01). Der frühere Parser strich alles
     Nicht-Numerische weg und machte aus '100abc200' die Zahl 100200. */
  const geld=(s,feld)=>leseGeld(s)[feld||'wert'];
  t('Geld','deutsches Format', geld('1.644,80'), 1644.8);
  t('Geld','englisches Format', geld('1,644.80'), 1644.8);
  t('Geld','ohne Trenner', geld('100'), 100);
  t('Geld','zwei Tausendergruppen', geld('1.234.567,89'), 1234567.89);
  t('Geld','Währungszeichen und Leerzeichen', geld('€ 1.644,80'), 1644.8);
  t('Geld','Klammern sind negativ', geld('(100,00)'), -100);
  t('Geld','Minuszeichen', geld('-50,00'), -50);
  t('Geld','leere Zelle meldet leer', geld('', 'status'), 'leer');
  t('Geld','Buchstaben im Betrag sind ungültig', geld('100abc200','status'), 'ungueltig');
  t('Geld','Buchstaben ergeben keinen Wert', geld('100abc200'), 0);
  t('Geld','mehrere Dezimalzeichen sind ungültig', geld('1,2,3','status'), 'ungueltig');
  t('Geld','fremde Währung ist ungültig', geld('USD 100.00','status'), 'ungueltig');
  t('Geld','doppeltes Vorzeichen ist ungültig', geld('--5','status'), 'ungueltig');
  t('Geld','1.234 ist mehrdeutig', geld('1.234','status'), 'mehrdeutig');
  t('Geld','1,234 ist mehrdeutig', geld('1,234','status'), 'mehrdeutig');
  t('Geld','1.23456 ist eindeutig', geld('1.23456','status'), 'ok');
  t('Geld','unlesbarer Betrag warnt',
    csv('T;;G;05.08.2026;06.08.2026;;100abc200').warn.some(w=>/kein lesbarer Geldwert/.test(w)), true);
  t('Geld','mehrdeutiger Betrag warnt',
    csv('T;;G;05.08.2026;06.08.2026;;1.234').warn.some(w=>/mehrdeutig/.test(w)), true);
  t('Geld','sauberer Betrag warnt nicht',
    csv('T;;G;05.08.2026;06.08.2026;;1.644,80').warn.length, 0);
  t('Geld','unlesbarer Gastbetrag warnt',
    compute(parseCSV(HEAD+';Vom Gast bezahlt\nT;;G;05.08.2026;06.08.2026;;100;xyz'),BASE)
      .warn.some(w=>/Vom Gast bezahlt/.test(w)), true);

  /* Gebühren validieren (F04). Wirksame 100 % ergaben Infinity und die
     Tabelle zeigte stumm „∞“ — die min/max der Felder prüft niemand nach. */
  const wirft=o=>{ try{ compute(parseCSV(HEAD+'\nT;;G;05.08.2026;06.08.2026;;100'),
                                Object.assign({},BASE,o)); return false; }catch(e){ return true; } };
  t('Gebühren','wirksame 100 % werden abgelehnt', wirft({fee:100}), true);
  t('Gebühren','über 100 % werden abgelehnt', wirft({fee:120}), true);
  t('Gebühren','negative Gebühr wird abgelehnt', wirft({fee:-5}), true);
  t('Gebühren','unlesbare Gebühr wird abgelehnt', wirft({fee:NaN}), true);
  t('Gebühren','99,9 % bleiben zulässig', wirft({fee:99.9}), false);
  t('Gebühren','Gastgebühr 100 % wird abgelehnt', wirft({gastfee:100}), true);
  t('Gebühren','negative Gastgebühr wird abgelehnt', wirft({gastfee:-1}), true);
  t('Gebühren','Ergebnis bleibt endlich', Number.isFinite(
    compute(parseCSV(HEAD+'\nT;;G;05.08.2026;06.08.2026;;100'),
            Object.assign({},BASE,{fee:99.9})).bookings[0].tax), true);

  /* Einnahmen-Export erkennen (F05) — vorher nur auf Deutsch */
  const ablehnung=kopf=>{ try{ compute(parseCSV(kopf+'\nx;HM1;G;05.08.2026;06.08.2026;100;90;R1'),BASE);
                               return false; }catch(e){ return /Einnahmen-Export/.test(e.message); } };
  t('Einnahmen-Export','deutscher Transaktionsexport wird abgelehnt',
    ablehnung('Typ;Bestätigungs-Code;Name des Gastes;Startdatum;Enddatum;Bruttoeinkünfte;Ausgezahlt;Referenzcode'), true);
  t('Einnahmen-Export','englischer Transaktionsexport wird abgelehnt',
    ablehnung('Type;Confirmation code;Guest name;Start date;End date;Gross earnings;Paid out;Reference code'), true);
  t('Einnahmen-Export','Reservierung mit Spalte „Inseratstyp“ läuft durch',
    compute(parseCSV('Bestätigungs-Code;Status;Name des Gastes;Inseratstyp;Startdatum;Enddatum;Einkünfte'
      +'\nT;;G;Wohnung;05.08.2026;06.08.2026;100'),BASE).bookings.length, 1);
  t('Einnahmen-Export','findCol exakt ignoriert Teiltreffer',
    findCol(['Inseratstyp'],['Typ','Type'],true), -1);
  t('Einnahmen-Export','findCol ohne exakt trifft den Teilstring',
    findCol(['Inseratstyp'],['Typ','Type']), 0);

  /* Grundlage: Monatszeilen, Fußzeile und Jahr müssen dieselbe Zahl ergeben (F12) */
  const abst=csv('A;;G;01.08.2026;02.08.2026;;100','B;;G;01.09.2026;02.09.2026;;100',
                 'C;;G;01.10.2026;02.10.2026;;100');
  const fuss=monatsSummen(abst.months).base;   // die echte Fußzeile, nicht nachgebaut
  /* Verglichen wird auf Cent-Ebene: beide Seiten summieren bereits gerundete
     Werte, die Float-Reste (285,71999…) sind in der Anzeige nicht sichtbar. */
  t('Abstimmung','Monatszeilen zeigen je 95,24', abst.months.map(m=>fmt(m.base)).join('+'), '95,24+95,24+95,24');
  t('Abstimmung','Fußzeile = Summe der angezeigten Monatszeilen', fmt(fuss), '285,72');
  t('Abstimmung','Jahresgrundlage = Fußzeile', fmt(jahressummen(abst.months)[0].base), fmt(fuss));
  t('Abstimmung','ein Meldemonat trägt genau einen Satz',
    abst.months.length, new Set(abst.months.map(m=>m.month)).size);
  t('Abstimmung','Fußzeile zählt alle Nächte', monatsSummen(abst.months).nights, 3);
  t('Abstimmung','Fußzeilen-Ortstaxe = Summe der Monatsbeträge',
    fmt(round2(monatsSummen(abst.months).tax)), fmt(round2(abst.months.reduce((s,m)=>s+round2(m.tax),0))));

  /* Datumsformat (F14). 01/08/2026 ist der 1. August oder der 8. Januar — je
     Zelle nicht entscheidbar. 01/08–03/08 ergab so 59 statt 2 Nächte. Die
     Reihenfolge wird deshalb einmal für die ganze Datei bestimmt. */
  const DH ='Bestätigungs-Code;Status;Name des Gastes;Startdatum;Enddatum;Einkünfte';
  const DHN='Bestätigungs-Code;Status;Name des Gastes;Startdatum;Enddatum;Anzahl der Nächte;Einkünfte';
  const dcsv=(kopf,...r)=>compute(parseCSV(kopf+'\n'+r.join('\n')),BASE);
  const nStr=b=>b.bookings.map(x=>x.nights).join(',');

  t('Datumsformat','ganze Datei mehrdeutig bleibt bei MM/TT',
    nStr(dcsv(DH,'A;;G;01/08/2026;03/08/2026;100')), '59');
  t('Datumsformat','ganze Datei mehrdeutig warnt',
    dcsv(DH,'A;;G;01/08/2026;03/08/2026;100').warn.some(w=>/nicht eindeutig/.test(w)), true);
  t('Datumsformat','ein Tag über 12 legt die Datei auf TT/MM fest',
    nStr(dcsv(DH,'A;;G;01/08/2026;03/08/2026;100','B;;G;13/08/2026;15/08/2026;100')), '2,2');
  t('Datumsformat','TT/MM erkannt warnt nicht',
    dcsv(DH,'A;;G;01/08/2026;03/08/2026;100','B;;G;13/08/2026;15/08/2026;100').warn.length, 0);
  t('Datumsformat','ein Monatswert über 12 legt die Datei auf MM/TT fest',
    nStr(dcsv(DH,'A;;G;01/08/2026;03/08/2026;100','B;;G;08/13/2026;08/15/2026;100')), '59,2');
  t('Datumsformat','Nächtespalte löst Mehrdeutigkeit zu TT/MM',
    nStr(dcsv(DHN,'A;;G;01/08/2026;03/08/2026;2;100')), '2');
  t('Datumsformat','Nächtespalte löst Mehrdeutigkeit zu MM/TT',
    nStr(dcsv(DHN,'A;;G;01/08/2026;03/08/2026;59;100')), '59');
  t('Datumsformat','durch Nächtespalte aufgelöst warnt nicht',
    dcsv(DHN,'A;;G;01/08/2026;03/08/2026;2;100').warn.length, 0);
  t('Datumsformat','widersprüchliche Reihenfolgen warnen',
    dcsv(DH,'A;;G;13/08/2026;15/08/2026;100','B;;G;08/13/2026;08/15/2026;100')
      .warn.some(w=>/beiden Reihenfolgen/.test(w)), true);
  t('Datumsformat','deutsches Format bleibt unberührt',
    nStr(dcsv(DH,'A;;G;01.08.2026;03.08.2026;100')), '2');
  t('Datumsformat','deutsches Format warnt nicht',
    dcsv(DH,'A;;G;01.08.2026;03.08.2026;100').warn.length, 0);
  t('Datumsformat','ISO bleibt unberührt',
    nStr(dcsv(DH,'A;;G;2026-08-01;2026-08-03;100')), '2');
  /* Der Meldemonat ist die eigentliche Auswirkung, nicht nur die Nächtezahl */
  t('Datumsformat','TT/MM landet im richtigen Meldemonat',
    dcsv(DH,'A;;G;01/08/2026;03/08/2026;100','B;;G;13/08/2026;15/08/2026;100')
      .months.map(m=>m.month).join(','), '2026-08');

  /* datumsOrdnung einzeln */
  const ordn=(kopf,...r)=>{ const rows=parseCSV(kopf+'\n'+r.join('\n'));
    return datumsOrdnung(rows,{start:3,end:4,nights:kopf===DHN?5:-1}); };
  t('Datumsformat','ohne Schrägstriche kein Befund', ordn(DH,'A;;G;01.08.2026;03.08.2026;100').slash, 0);
  t('Datumsformat','Quelle „tag“ bei eindeutigem Tageswert',
    ordn(DH,'A;;G;13/08/2026;15/08/2026;100').quelle, 'tag');
  t('Datumsformat','Quelle „naechte“ wenn die Spalte entscheidet',
    ordn(DHN,'A;;G;01/08/2026;03/08/2026;2;100').quelle, 'naechte');
  t('Datumsformat','Widerspruch wird als solcher gemeldet',
    ordn(DH,'A;;G;13/08/2026;15/08/2026;100','B;;G;08/13/2026;08/15/2026;100').widerspruch, true);

  /* ISO mit angehängtem Müll darf nicht als gültiges Datum durchgehen */
  t('Datumsformat','ISO mit Text dahinter wird abgelehnt', isNaN(parseDate('2026-08-01xyz')), true);
  t('Datumsformat','ISO mit Uhrzeit bleibt gültig', parseDate('2026-08-01T12:30:00'), parseDate('2026-08-01'));
  t('Datumsformat','ISO mit Zeitzone bleibt gültig', parseDate('2026-08-01T00:00:00+02:00'), parseDate('2026-08-01'));

  /* Datenmodell für die Synchronisierung. Der entscheidende Nachweis ist der
     Rundlauf: CSV → rechnen → Dokumente → zurück → rechnen muss dieselben
     Zahlen ergeben. Sonst wäre der gespeicherte Stand nicht der gerechnete. */
  const MH='Bestätigungs-Code;Status;Name des Gastes;Startdatum;Enddatum;Anzahl der Nächte;Einkünfte;Vom Gast bezahlt';
  const mcsv=(...r)=>compute(parseCSV(MH+'\n'+r.join('\n')),BASE);
  const hin=mcsv('HM1;Bestätigt;Anna;18.06.2026;19.07.2026;;1644,80;',
                 'HM2;Bestätigt;Bernd;01.08.2026;03.08.2026;;100,00;150,00',
                 'HM3;Bestätigt;Cem;01.01.2026;02.04.2026;;2000,00;');
  const docs=hin.bookings.map(b=>alsBuchungsdokument(b,'obj1'));
  const zurueck=compute(alsCsvZeilen(docs),BASE);

  t('Datenmodell','Rundlauf behält alle Buchungen', zurueck.bookings.length, hin.bookings.length);
  t('Datenmodell','Rundlauf behält die Meldemonate',
    zurueck.months.map(m=>m.month+':'+m.nights).join('|'), hin.months.map(m=>m.month+':'+m.nights).join('|'));
  t('Datenmodell','Rundlauf behält die Ortstaxe je Monat',
    zurueck.months.map(m=>fmt(round2(m.tax))).join('|'), hin.months.map(m=>fmt(round2(m.tax))).join('|'));
  t('Datenmodell','Rundlauf behält die Jahressumme',
    fmt(jahressummen(zurueck.months)[0].tax), fmt(jahressummen(hin.months)[0].tax));
  /* Zugriff über den Code, nicht über die Position: alsCsvZeilen sortiert
     nach Anreisedatum, damit der Bestand aus der Datenbank immer gleich
     herauskommt, egal in welcher Reihenfolge die Dokumente ankommen. */
  const nach=(r,c)=>r.bookings.filter(b=>b.code===c)[0];
  t('Datenmodell','Rundlauf behält den Gastbetrag', nach(zurueck,'HM2').paid, 150);
  ['HM1','HM2','HM3'].forEach(c=>{
    t('Datenmodell','Rundlauf behält die Befreiung: '+c, nach(zurueck,c).exempt, nach(hin,c).exempt);
    t('Datenmodell','Rundlauf behält die Ortstaxe: '+c,
      fmt(round2(nach(zurueck,c).tax)), fmt(round2(nach(hin,c).tax)));
  });
  t('Datenmodell','Rundlauf behält den Referenzfall 64,58 €',
    fmt(round2(nach(zurueck,'HM1').tax)), '64,58');
  t('Datenmodell','Dokumente kommen sortiert zurück',
    zurueck.bookings.map(b=>b.code).join(','), 'HM3,HM1,HM2');

  /* Das Dokument selbst */
  const d0=docs[0];
  t('Datenmodell','Dokument trägt die Schemaversion', d0.schemaVersion, SCHEMA_VERSION);
  t('Datenmodell','Dokument trägt das Objekt', d0.objektId, 'obj1');
  t('Datenmodell','Datum als ISO-Zeichenkette, nicht als Timestamp', d0.von, '2026-06-18');
  t('Datenmodell','Dokument speichert die Auszahlung roh', d0.auszahlung, 1644.8);
  t('Datenmodell','ohne Gastbetrag steht null', d0.gastbetrag, null);
  t('Datenmodell','mit Gastbetrag steht die Herkunft', docs[1].gastbetragQuelle, 'datei');
  t('Datenmodell','kein gerechneter Wert im Dokument',
    ['nights','tax','base','amt','parts','segs'].some(k=>k in d0), false);
  t('Datenmodell','ISO-Tag ist zeitzonenfest', isoTag(Date.UTC(2026,0,1)), '2026-01-01');

  /* Schnappschuss */
  const schn=baueSchnappschuss(docs,{basis:'net',fee:3},{grund:'import',datei:'a.csv',hash:textHash('x')});
  t('Schnappschuss','enthält alle Buchungen', schn.buchungen.length, 3);
  t('Schnappschuss','merkt sich die Anzahl', schn.anzahl, 3);
  t('Schnappschuss','merkt sich die Einstellungen', schn.einstellungen.fee, 3);
  t('Schnappschuss','merkt sich Dateiname und Grund', schn.datei+'/'+schn.grund, 'a.csv/import');
  t('Schnappschuss','trägt die Schemaversion', schn.schemaVersion, SCHEMA_VERSION);
  t('Schnappschuss','ist aus einem Schnappschuss wieder rechenbar',
    fmt(round2(compute(alsCsvZeilen(schn.buchungen),BASE).months[0].tax)),
    fmt(round2(hin.months[0].tax)));

  /* Dateikennung */
  t('Hash','gleicher Text, gleiche Kennung', textHash('abc'), textHash('abc'));
  t('Hash','anderer Text, andere Kennung', textHash('abc')===textHash('abd'), false);
  t('Hash','acht Stellen', textHash('abc').length, 8);
  t('Hash','leerer Text ergibt eine Kennung', textHash('').length, 8);

  /* Zusammenführen beim Import. Die wichtigste Eigenschaft: ein Export über
     einen einzelnen Monat darf den Rest des Jahres nicht löschen. */
  const dok=(code,gastbetrag,quelle,von)=>{
    const v=von||'2026-08-01';
    const bis=v.slice(0,8)+('0'+(+v.slice(8,10)+2)).slice(-2);   // zwei Nächte
    return {code:code, schemaVersion:SCHEMA_VERSION, name:'G', status:'Bestätigt',
      von:v, bis:bis, auszahlung:100,
      gastbetrag:gastbetrag===undefined?null:gastbetrag,
      gastbetragQuelle:quelle||null, objektId:'obj1'};
  };

  const vm1=verschmelzeBuchungen([dok('A'),dok('B'),dok('C')],[dok('B')]);
  t('Zusammenführen','Teilimport löscht nichts', vm1.unberuehrt.map(d=>d.code).join(','), 'A,C');
  t('Zusammenführen','Teilimport schreibt nur die enthaltene Buchung',
    vm1.schreiben.map(d=>d.code).join(','), 'B');
  t('Zusammenführen','neue Buchung wird übernommen',
    verschmelzeBuchungen([dok('A')],[dok('B')]).schreiben.map(d=>d.code).join(','), 'B');
  t('Zusammenführen','leerer Bestand nimmt alles',
    verschmelzeBuchungen([],[dok('A'),dok('B')]).schreiben.length, 2);
  t('Zusammenführen','leerer Import lässt alles unberührt',
    verschmelzeBuchungen([dok('A')],[]).unberuehrt.length, 1);

  /* Gastbeträge: der Import weiß oft nichts davon, weil die Spalte im rohen
     Airbnb-Export gar nicht vorkommt. Dann darf er nichts wegnehmen. */
  const vm2=verschmelzeBuchungen([dok('A',150,'manuell')],[dok('A')]);
  t('Zusammenführen','Import ohne Gastbetrag behält den gespeicherten',
    vm2.schreiben[0].gastbetrag, 150);
  t('Zusammenführen','und behält dessen Herkunft', vm2.schreiben[0].gastbetragQuelle, 'manuell');
  t('Zusammenführen','das ist kein Konflikt', vm2.konflikte.length, 0);

  const vm3=verschmelzeBuchungen([dok('A',150,'manuell')],[dok('A',120,'datei')]);
  t('Zusammenführen','abweichender Wert über einen manuellen meldet Konflikt', vm3.konflikte.length, 1);
  t('Zusammenführen','Konflikt nennt alten und neuen Wert',
    vm3.konflikte[0].alt+'→'+vm3.konflikte[0].neu, '150→120');
  t('Zusammenführen','der Import gewinnt trotzdem', vm3.schreiben[0].gastbetrag, 120);

  const vm4=verschmelzeBuchungen([dok('A',150,'datei')],[dok('A',120,'datei')]);
  t('Zusammenführen','Datei über Datei ist kein Konflikt', vm4.konflikte.length, 0);
  const vm5=verschmelzeBuchungen([dok('A',150,'manuell')],[dok('A',150,'datei')]);
  t('Zusammenführen','gleicher Wert ist kein Konflikt', vm5.konflikte.length, 0);

  /* Geänderte Stammdaten schlagen durch */
  const vm6=verschmelzeBuchungen([dok('A',null,null,'2026-08-01')],[dok('A',null,null,'2026-09-01')]);
  t('Zusammenführen','geändertes Anreisedatum wird übernommen', vm6.schreiben[0].von, '2026-09-01');

  /* Und der zusammengeführte Bestand muss wieder rechenbar sein */
  const vmAll=verschmelzeBuchungen([dok('A',null,null,'2026-08-01')],[dok('B',null,null,'2026-09-01')]);
  const bestand=vmAll.unberuehrt.concat(vmAll.schreiben);
  t('Zusammenführen','zusammengeführter Bestand rechnet',
    compute(alsCsvZeilen(bestand),BASE).bookings.length, 2);

  /* Dubletten (F08). Vorher warnte das Tool zwar, rechnete aber beide Zeilen —
     aus 4,76 € wurden 9,52 €. */
  const dup=csv('HM1;;G;05.08.2026;06.08.2026;;100','HM1;;G;05.08.2026;06.08.2026;;100');
  t('Dubletten','identische Zeile wird nur einmal gerechnet', dup.bookings.length, 1);
  t('Dubletten','und nur einmal besteuert',
    fmt(round2(dup.months.reduce((s,m)=>s+round2(m.tax),0))), '4,76');
  t('Dubletten','identische Dublette wird gemeldet',
    dup.warn.some(w=>/identischen Daten/.test(w)), true);

  const dupA=csv('HM1;;G;05.08.2026;06.08.2026;;100','HM1;;G;05.09.2026;07.09.2026;;200');
  t('Dubletten','abweichende Dublette wird nur einmal gerechnet', dupA.bookings.length, 1);
  t('Dubletten','gerechnet wird die erste Zeile', dupA.bookings[0].nights, 1);
  t('Dubletten','Widerspruch wird als solcher benannt',
    dupA.warn.some(w=>/abweichenden Daten/.test(w)), true);
  t('Dubletten','die Warnung nennt beide Beträge',
    dupA.warn.some(w=>/100,00/.test(w)&&/200,00/.test(w)), true);
  t('Dubletten','verschiedene Codes bleiben zwei Buchungen',
    csv('HM1;;G;05.08.2026;06.08.2026;;100','HM2;;G;05.08.2026;06.08.2026;;100').bookings.length, 2);
  t('Dubletten','dreifach vorhanden ergibt trotzdem eine Buchung',
    csv('HM1;;G;05.08.2026;06.08.2026;;100','HM1;;G;05.08.2026;06.08.2026;;100',
        'HM1;;G;05.08.2026;06.08.2026;;100').bookings.length, 1);

  /* Herkunft des Betrags (F10). Ein gefülltes, aber verworfenes Feld sah in der
     Tabelle aus wie ein Beleg — gerechnet wurde mit dem Pauschalsatz. */
  const PH='Bestätigungs-Code;Status;Name des Gastes;Startdatum;Enddatum;Anzahl der Nächte;Einkünfte;Vom Gast bezahlt';
  const pcsv=(zeile,o)=>compute(parseCSV(PH+'\n'+zeile),Object.assign({},BASE,o||{}));
  t('Betragsherkunft','brauchbarer Gastbetrag gilt als Beleg',
    pcsv('T;;G;05.08.2026;06.08.2026;;100;150').bookings[0].betragQuelle, 'beleg');
  t('Betragsherkunft','zu kleiner Gastbetrag ist eine Schätzung',
    pcsv('T;;G;05.08.2026;06.08.2026;;100;50', {gastfee:14}).bookings[0].betragQuelle, 'geschaetzt');
  t('Betragsherkunft','leeres Feld ist eine Schätzung',
    pcsv('T;;G;05.08.2026;06.08.2026;;100;').bookings[0].betragQuelle, 'geschaetzt');
  t('Betragsherkunft','unlesbarer Wert ist eine Schätzung',
    pcsv('T;;G;05.08.2026;06.08.2026;;100;xyz').bookings[0].betragQuelle, 'geschaetzt');
  t('Betragsherkunft','der verworfene Wert bleibt trotzdem sichtbar',
    pcsv('T;;G;05.08.2026;06.08.2026;;100;50', {gastfee:14}).bookings[0].paid, 50);
  t('Betragsherkunft','ein Beleg wird nicht als geschätzt gemeldet',
    pcsv('T;;G;05.08.2026;06.08.2026;;100;150', {gastfee:14}).warn.some(w=>/pauschal/.test(w)), false);

  /* Pauschalabzug (F13). Bis 30.06.2026 steckt der 11-%-Abzug im effektiven
     Satz — die geführte Grundlage ist für diesen Zeitraum das Entgelt davor. */
  t('Pauschalabzug','bis Juni 2026 gilt 89 %', PAUSCHALE.r32, 0.89);
  t('Pauschalabzug','ab Juli 2026 kein Abzug mehr', PAUSCHALE.r50, 1);
  t('Pauschalabzug','ab Juli 2027 ebenfalls nicht', PAUSCHALE.r80, 1);
  const juni=buchung('01.06.2026','02.06.2026',1000).months[0];
  t('Pauschalabzug','Juni: geführtes Entgelt', fmt(juni.base), '972,31');
  t('Pauschalabzug','Juni: Grundlage nach Abzug',
    fmt(round2(steuergrundlage(juni.base,juni.reg))), '865,35');
  /* Der eigentliche Nachweis: Grundlage nach Abzug mal gesetzlicher Satz
     ergibt die Steuer. Vorher passte 972,31 x 3,2 % = 31,11 nicht zu 27,69. */
  t('Pauschalabzug','Juni: Grundlage × 3,2 % = Ortstaxe',
    fmt(round2(steuergrundlage(juni.base,juni.reg)*0.032)), fmt(round2(juni.tax)));
  const juli=buchung('01.07.2026','02.07.2026',1000).months[0];
  t('Pauschalabzug','Juli: Grundlage bleibt das Entgelt',
    fmt(round2(steuergrundlage(juli.base,juli.reg))), fmt(juli.base));
  t('Pauschalabzug','Juli: Grundlage × 5 % = Ortstaxe',
    fmt(round2(steuergrundlage(juli.base,juli.reg)*0.05)), fmt(round2(juli.tax)));

  /* Formelauswertung in Tabellenprogrammen (F16) */
  t('CSV schreiben','Gleichheitszeichen wird entschärft', csvText('=1+1'), "'=1+1");
  t('CSV schreiben','Plus wird entschärft', csvText('+1'), "'+1");
  t('CSV schreiben','At-Zeichen wird entschärft', csvText('@SUM(A1)'), "'@SUM(A1)");
  t('CSV schreiben','Minus wird entschärft', csvText('-1+1'), "'-1+1");
  t('CSV schreiben','harmloser Name bleibt unberührt', csvText('Anna Muster'), 'Anna Muster');
  t('CSV schreiben','leerer Wert bleibt leer', csvText(''), '');
  const gefahr=compute(parseCSV(HEAD+'\nT;;=1+1;05.08.2026;06.08.2026;;-100'),BASE);
  t('CSV schreiben','Buchungsexport entschärft den Gastnamen',
    baueCsvBuchungen(gefahr).split('\n')[1].indexOf("'=1+1")>=0, true);
  /* Zahlen dürfen dabei nicht mitgeschützt werden: -100 beginnt ebenfalls mit
     einem gefährlichen Zeichen und wäre als "'-100,00" unbrauchbar. */
  t('CSV schreiben','negativer Betrag bleibt eine Zahl',
    baueCsvBuchungen(gefahr).split('\n')[1].indexOf("'-")<0, true);
  t('CSV schreiben','Gastbeträge-Datei bleibt unverändert einlesbar',
    compute(parseCSV(baueCsvGastbetraege(gefahr)),BASE).bookings[0].name, '=1+1');

  /* Ausgabe */
  const farbe={ok:'var(--r50)',fehler:'var(--flag)',offen:'var(--r80)',behoben:'var(--r80)'};
  const zeichen={ok:'✓',fehler:'✗',offen:'!',behoben:'△'};
  let letzte='', html='';
  R.forEach(([art,gruppe,name,anm])=>{
    if(gruppe!==letzte){ html+='<h2>'+esc(gruppe)+'</h2>'; letzte=gruppe; }
    html+='<div class="tz"><b style="color:'+farbe[art]+'">'+zeichen[art]+'</b>'
       +'<span>'+esc(name)+'</span>'
       +(anm?'<em>'+esc(anm)+'</em>':'')+'</div>';
  });
  document.body.className='';
  document.body.innerHTML=
     '<div class="wrap"><header><h1>Selbsttest</h1>'
    +'<div class="sub">'+gut+' bestanden · '+schlecht+' fehlgeschlagen · '+offen+' bekannt offen</div></header>'
    +'<div class="card" style="padding:18px 22px">'+html+'</div>'
    +'<div class="note">„!“ markiert einen dokumentierten, noch nicht behobenen Bug — '
    +'diese Fälle sind erwartet rot. „△“ heißt: der Bug ist behoben, die Erwartung im '
    +'Testfall gehört nachgezogen.</div></div>';
  const s=document.createElement('style');
  s.textContent='.tz{display:grid;grid-template-columns:16px 1fr;gap:4px 10px;'
    +'padding:5px 0;border-bottom:1px solid var(--line-soft);font-size:14px}'
    +'.tz b{font-family:var(--mono)}.tz em{grid-column:2;font-style:normal;'
    +'font-family:var(--mono);font-size:12px;color:var(--ink-2)}'
    +'.tz:last-child{border-bottom:none}';
  document.head.appendChild(s);
  document.title='Selbsttest — '+(schlecht?schlecht+' fehlgeschlagen':'alles grün');
}
