/* Integrationstest: fährt die echte Oberfläche gegen eine Datenbank-Attrappe.

   Der Selbsttest in selftest.js prüft den Rechenkern. Er erreicht aber nicht,
   was zwischen Eingabe, Import und Speichern passiert — und genau dort lagen
   die Fehler aus der Branch-Nachprüfung vom 05.09.2026: ein eingetippter
   Gastbetrag, der nie gespeichert wurde; eine Stornierung, die den Bestand nie
   erreichte; ein unlesbarer Betrag, der einen richtigen überschrieb.

   Ablauf: Repo in ein Temp-Verzeichnis kopieren, js/daten.js durch die
   Attrappe ersetzen, statisch ausliefern und mit Chromium durchfahren. Die
   Attrappe legt ihren Zustand auf window.__db, das ist die Prüffläche.

   Aufruf (Playwright wird dafür gebraucht, gehört aber NICHT zum Werkzeug —
   ausgeliefert wird weiterhin ohne Build und ohne Abhängigkeiten):

       npm i playwright && node test/integration.mjs
*/
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp  = fs.mkdtempSync(path.join(os.tmpdir(), 'ortstaxe-'));
fs.mkdirSync(path.join(tmp, 'js'));
for (const f of ['index.html', 'selftest.js']) fs.copyFileSync(path.join(repo, f), path.join(tmp, f));
for (const f of fs.readdirSync(path.join(repo, 'js'))) fs.copyFileSync(path.join(repo, 'js', f), path.join(tmp, 'js', f));
fs.copyFileSync(path.join(repo, 'test', 'daten-attrappe.js'), path.join(tmp, 'js', 'daten.js'));

const typ = e => ({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript'})[e] || 'text/plain';
const server = createServer((q, a) => {
  const datei = path.join(tmp, decodeURIComponent(q.url.split('?')[0]));
  if (!datei.startsWith(tmp) || !fs.existsSync(datei)) { a.writeHead(404).end(); return; }
  a.writeHead(200, {'content-type': typ(path.extname(datei)) + '; charset=utf-8'});
  fs.createReadStream(datei).pipe(a);
}).listen(0);
const url = 'http://localhost:' + server.address().port + '/index.html';

/* Chromium: erst der Pfad aus der Umgebung, sonst der von Playwright verwaltete. */
const exe = process.env.CHROMIUM_PFAD || undefined;
const browser = await chromium.launch(exe ? {executablePath: exe} : {});
const seite = await browser.newPage();
const fehler = [];
seite.on('pageerror', e => fehler.push(e.message));
// prompt() ohne Text bestätigen hieße „kein Name“ — das Objekt entstünde nicht.
seite.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Zweitwohnung' : ''));

let gut = 0, schlecht = 0;
const t = (name, ist, soll) => {
  const p = JSON.stringify(ist) === JSON.stringify(soll);
  console.log((p ? '  ✓ ' : '  ✗ ') + name + (p ? '' : '  → ist ' + JSON.stringify(ist) + ', soll ' + JSON.stringify(soll)));
  p ? gut++ : schlecht++;
};
const KOPF = 'Bestätigungs-Code;Status;Name des Gastes;Startdatum;Enddatum;Einkünfte;Vom Gast bezahlt\n';
const lade = text => seite.setInputFiles('#file', {name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8')});
const db   = () => seite.evaluate(() => JSON.parse(JSON.stringify(window.__db)));

await seite.goto(url, {waitUntil: 'networkidle'});
await seite.waitForFunction(() => window.__db);

if(!process.argv.includes('--monatsarbeit')){
console.log('\nEingetippte Gastbeträge werden gespeichert');
await lade(KOPF + 'HM1;Bestätigt;Anna;05.08.2026;06.08.2026;100,00;\n');
await seite.waitForSelector('#out:not(.hide)'); await seite.waitForTimeout(700);
const obj = Object.keys((await db()).buchungen)[0];
t('nach dem Import noch kein Gastbetrag', (await db()).buchungen[obj].HM1.gastbetrag, null);
await seite.fill('.paid-in[data-key="HM1"]', '150,00');
await seite.waitForTimeout(2200);                       // Entprellung
t('nach dem Tippen in der Datenbank', (await db()).buchungen[obj].HM1.gastbetrag, 150);
t('Herkunft ist „manuell“',            (await db()).buchungen[obj].HM1.gastbetragQuelle, 'manuell');
/* Der Punkt auf dem CSV-Knopf und die Schließen-Warnung heißen „nur im
   Arbeitsspeicher“. Nach dem Wolken-Speichern stimmt das nicht mehr. */
t('CSV-Marker ist danach aus',
  await seite.$eval('#dlPaid', n => n.classList.contains('offen')), false);

console.log('\nStornierungen erreichen den Bestand');
await lade(KOPF + 'HM1;Cancelled;Anna;05.08.2026;06.08.2026;100,00;\n');
await seite.waitForTimeout(900);
t('Status gespeichert', (await db()).buchungen[obj].HM1.status, 'Cancelled');
t('keine Ortstaxe mehr', (await seite.$$eval('#months tr.tot td', c => c.map(x => x.textContent.trim())))[4], '0,00');

console.log('\nUnlesbare Beträge überschreiben nichts');
await lade(KOPF + 'HM2;Bestätigt;Bernd;05.09.2026;06.09.2026;100,00;\n');
await seite.waitForTimeout(900);
t('HM2 mit 100 gespeichert', (await db()).buchungen[obj].HM2.auszahlung, 100);
await lade(KOPF + 'HM2;Bestätigt;Bernd;05.09.2026;06.09.2026;100abc200;\n');
await seite.waitForTimeout(900);
t('bleibt bei 100 statt 0', (await db()).buchungen[obj].HM2.auszahlung, 100);
t('Zurückstellung wird gemeldet', /zurückgestellt/.test(await seite.textContent('#paidInfo')), true);

console.log('\nZeilen ohne Bestätigungs-Code werden nicht gespeichert');
await lade('Status;Name des Gastes;Startdatum;Enddatum;Einkünfte\n;Cem;05.10.2026;06.10.2026;100\n');
await seite.waitForTimeout(900);
t('kein Pseudo-Code angelegt', Object.keys((await db()).buchungen[obj]).some(c => /Zeile/.test(c)), false);

console.log('\nFrühere Stände lassen sich zurückspielen');
await lade(KOPF + 'HM3;Bestätigt;Dora;05.11.2026;06.11.2026;100,00;\n');
await seite.waitForTimeout(900);
t('HM3 mit 100 gespeichert', (await db()).buchungen[obj].HM3.auszahlung, 100);
await lade(KOPF + 'HM3;Bestätigt;Dora;05.11.2026;06.11.2026;999,00;\n');
await seite.waitForTimeout(900);
t('HM3 auf 999 geändert', (await db()).buchungen[obj].HM3.auszahlung, 999);
t('Ständeauswahl sichtbar', await seite.isVisible('#standWahl'), true);
await seite.selectOption('#stand', {index: 1});
await seite.click('#standZurueck');
await seite.waitForTimeout(1400);
t('HM3 wieder auf 100', (await db()).buchungen[obj].HM3.auszahlung, 100);
t('vorheriger Bestand gesichert',
  Object.values((await db()).schnappschuesse[obj]).some(x => x.grund === 'wiederherstellung'), true);

console.log('\nZurückspielen entfernt später hinzugekommene Buchungen');
await lade(KOPF + 'HM4;Bestätigt;Emil;05.12.2026;06.12.2026;100,00;\n');
await seite.waitForTimeout(900);
const vorZusatz = Object.keys((await db()).buchungen[obj]).length;
await lade(KOPF + 'HM4;Bestätigt;Emil;05.12.2026;06.12.2026;100,00;\n'
                + 'HM5;Bestätigt;Frida;10.12.2026;11.12.2026;100,00;\n');
await seite.waitForTimeout(900);
t('HM5 zusätzlich importiert', !!(await db()).buchungen[obj].HM5, true);
await seite.selectOption('#stand', {index: 1});
await seite.click('#standZurueck');
await seite.waitForTimeout(1400);
t('HM5 wieder entfernt', !!(await db()).buchungen[obj].HM5, false);
t('Bestandsgröße wie vor dem Fehlimport', Object.keys((await db()).buchungen[obj]).length, vorZusatz);

console.log('\nNachgeladene Gastbeträge werden gespeichert');
await lade(KOPF + 'HM6;Bestätigt;Gita;05.01.2027;06.01.2027;100,00;\n');
await seite.waitForTimeout(900);
t('HM6 ohne Gastbetrag', (await db()).buchungen[obj].HM6.gastbetrag, null);
await seite.setInputFiles('#paidFile', {name:'g.csv', mimeType:'text/csv',
  buffer: Buffer.from('Bestätigungs-Code;Vom Gast bezahlt\nHM6;175,00\n','utf8')});
await seite.waitForTimeout(2400);
t('Gastbetrag aus der Datei gespeichert', (await db()).buchungen[obj].HM6.gastbetrag, 175);

console.log('\nGeleertes Feld hebt die Überschreibung auf');
/* Nach dem ersten Speichern ist die Datenbank die Quelle, nicht mehr die CSV.
   Das Leeren gibt deshalb den gespeicherten Wert frei — nicht den, der in der
   ursprünglich geladenen Datei stand. Der Konflikthinweis erscheint auch nur,
   solange beide auseinandergehen, also im CSV-Betrieb vor dem ersten Speichern. */
await lade(KOPF + 'HM7;Bestätigt;Hans;05.02.2027;06.02.2027;100,00;150,00\n');
await seite.waitForTimeout(900);
t('Dateiwert übernommen', (await db()).buchungen[obj].HM7.gastbetrag, 150);
t('gilt als aus der Datei', (await db()).buchungen[obj].HM7.gastbetragQuelle, 'datei');
await seite.fill('.paid-in[data-key="HM7"]', '120,00');
await seite.waitForTimeout(2200);
t('manueller Wert gewinnt', (await db()).buchungen[obj].HM7.gastbetrag, 120);
t('und gilt als manuell', (await db()).buchungen[obj].HM7.gastbetragQuelle, 'manuell');
await seite.fill('.paid-in[data-key="HM7"]', '');
await seite.waitForTimeout(2200);
t('nach dem Leeren gilt wieder der Bestand', (await db()).buchungen[obj].HM7.gastbetrag, 120);
t('und wieder als aus der Quelle', (await db()).buchungen[obj].HM7.gastbetragQuelle, 'datei');
/* Und der Fall aus Befund 4: im CSV-Betrieb muss ein geleertes Feld den
   Dateiwert wieder freigeben. Frische Seite, damit die Datei die Quelle ist. */
await seite.reload({waitUntil:'networkidle'});
await seite.waitForFunction(() => window.__db);
await lade(KOPF + 'HM8;Bestätigt;Ida;05.03.2027;06.03.2027;100,00;150,00\n');
await seite.waitForSelector('#out:not(.hide)');
await seite.fill('.paid-in[data-key="HM8"]', '120,00');
await seite.waitForTimeout(400);
t('CSV-Betrieb: manueller Wert im Feld',
  await seite.inputValue('.paid-in[data-key="HM8"]'), '120,00');
t('Konflikt wird gemeldet', /die Datei nennt/.test(await seite.textContent('#warnings')), true);
await seite.fill('.paid-in[data-key="HM8"]', '');
await seite.waitForTimeout(400);
t('nach dem Leeren steht der Dateiwert im Feld',
  await seite.inputValue('.paid-in[data-key="HM8"]'), '150,00');

console.log('\nAusstehendes Autospeichern hebt die Wiederherstellung nicht auf');
await seite.reload({waitUntil:'networkidle'});
await seite.waitForFunction(() => window.__db);
await lade(KOPF + 'HA1;Bestätigt;Anna;05.04.2027;06.04.2027;100,00;\n');
await seite.waitForSelector('#out:not(.hide)'); await seite.waitForTimeout(800);
const obj2 = Object.keys((await db()).buchungen)[0];
await lade(KOPF + 'HA1;Bestätigt;Anna;05.04.2027;06.04.2027;100,00;\n'
                + 'HA2;Bestätigt;Bert;10.04.2027;11.04.2027;100,00;\n');
await seite.waitForTimeout(900);
t('zwei Buchungen im Bestand', Object.keys((await db()).buchungen[obj2]).length, 2);
/* Eingabe tippen, damit ein Speichervorgang aussteht — dann sofort zurückspielen. */
await seite.fill('.paid-in[data-key="HA1"]', '150,00');
await seite.waitForTimeout(200);                 // Timer läuft, aber noch nicht ab
await seite.selectOption('#stand', {index: 1});
await seite.click('#standZurueck');
await seite.waitForTimeout(2600);                // alter Timer wäre längst abgelaufen
t('HA2 bleibt entfernt', !!(await db()).buchungen[obj2].HA2, false);
t('HA1 ohne den getippten Wert', (await db()).buchungen[obj2].HA1.gastbetrag, null);

console.log('\nVerspätete Ladeantwort landet nicht im falschen Objekt');
await seite.evaluate(() => { window.__ladeVerzug = {}; });
await seite.click('#objektNeu');                 // Dialog wird automatisch bestätigt
await seite.waitForTimeout(900);
const objekte = await seite.$$eval('#objekt option', o => o.map(x => x.value));
t('zwei Objekte vorhanden', objekte.length >= 2, true);
if (objekte.length < 2) { console.log('  (Objektwechsel-Proben übersprungen)'); }
else {
await seite.evaluate(ids => { window.__ladeVerzug = {[ids[0]]: 900}; }, objekte);
await seite.selectOption('#objekt', objekte[0]);   // langsames Objekt
await seite.waitForTimeout(50);
await seite.selectOption('#objekt', objekte[1]);   // sofort weiter zum schnellen
await seite.waitForTimeout(1600);                  // verspätete Antwort trifft ein
t('Wähler steht auf dem zweiten Objekt', await seite.inputValue('#objekt'), objekte[1]);
const gezeigt = await seite.$$eval('#rows tr td:first-child', c => c.map(x => x.textContent.trim()));
t('kein Bestand des ersten Objekts angezeigt', gezeigt.some(c => /^HA/.test(c)), false);
t('leeres Objekt zeigt keine fremde Tabelle', await seite.isVisible('#months'), false);

console.log('\nWiederherstellung ist unteilbar');
await seite.evaluate(() => { window.__fehlerBeimSchreiben = true; });
await seite.selectOption('#objekt', objekte[0]);
await seite.waitForTimeout(1400);
const vorher = Object.keys((await db()).buchungen[objekte[0]] || {}).length;
if (await seite.isVisible('#standZurueck')) {
  await seite.selectOption('#stand', {index: 1});
  await seite.click('#standZurueck');
  await seite.waitForTimeout(1200);
  t('bei Schreibfehler bleibt der Bestand unangetastet',
    Object.keys((await db()).buchungen[objekte[0]] || {}).length, vorher);
  t('und der Fehler wird angezeigt', /Nicht zurückgespielt/.test(await seite.textContent('#wolkeStand')), true);
}
await seite.evaluate(() => { window.__fehlerBeimSchreiben = false; });
}

console.log('\nKorrigierte CSV kommt auch im Wolken-Betrieb durch');
await seite.reload({waitUntil:'networkidle'});
await seite.waitForFunction(() => window.__db);
await lade(KOPF + 'HK1;Bestätigt;Kim;05.05.2027;06.05.2027;100,00;120,00\n');
await seite.waitForSelector('#out:not(.hide)'); await seite.waitForTimeout(900);
const standK = (await db()).buchungen;
const objK = Object.keys(standK).filter(o => standK[o].HK1)[0];
t('erst 120 gespeichert', standK[objK].HK1.gastbetrag, 120);
await lade(KOPF + 'HK1;Bestätigt;Kim;05.05.2027;06.05.2027;100,00;150,00\n');
await seite.waitForTimeout(1200);
t('korrigierte 150 kommen an', (await db()).buchungen[objK].HK1.gastbetrag, 150);

console.log('\nUnlesbare Eingabe löscht keinen gültigen Betrag');
await seite.reload({waitUntil:'networkidle'});
await seite.waitForFunction(() => window.__db);
await lade(KOPF + 'HU1;Bestätigt;Uwe;05.06.2027;06.06.2027;100,00;150,00\n');
await seite.waitForSelector('#out:not(.hide)'); await seite.waitForTimeout(900);
const alleU = (await db()).buchungen;
const oU = Object.keys(alleU).filter(o => alleU[o].HU1)[0];
t('gültige 150 gespeichert', alleU[oU].HU1.gastbetrag, 150);
await seite.fill('.paid-in[data-key="HU1"]', 'abc');
await seite.waitForTimeout(2200);
t('gültiger Wert bleibt erhalten', (await db()).buchungen[oU].HU1.gastbetrag, 150);
t('Status meldet die unlesbare Eingabe',
  /unlesbar/.test(await seite.textContent('#wolkeStand')), true);
t('und der Ungespeichert-Marker bleibt an',
  await seite.$eval('#dlPaid', n => n.classList.contains('offen')), true);

console.log('\nManuell gesetzter Wert blockiert die korrigierte CSV nicht mehr');
await seite.fill('.paid-in[data-key="HU1"]', '150,00');
await seite.waitForTimeout(2200);
await lade(KOPF + 'HU1;Bestätigt;Uwe;05.06.2027;06.06.2027;100,00;200,00\n');
await seite.waitForTimeout(1400);
t('korrigierte 200 kommen an', (await db()).buchungen[oU].HU1.gastbetrag, 200);

console.log('\nBearbeiten während eines Objektwechsels schreibt nicht ins falsche Objekt');
await seite.click('#objektNeu');
await seite.waitForTimeout(900);
const objs2 = await seite.$$eval('#objekt option', o => o.map(x => x.value));
if (objs2.length >= 2) {
  const [ersterO, zweiterO] = objs2;
  await seite.evaluate(id => { window.__ladeVerzug = {[id]: 1500}; }, zweiterO);
  await seite.selectOption('#objekt', zweiterO);     // lädt langsam
  await seite.waitForTimeout(150);
  const nochDa = await seite.$('.paid-in[data-key="HU1"]');
  if (nochDa) { await nochDa.fill('999,00'); }       // Feld des alten Objekts
  await seite.waitForTimeout(2600);
  const nachher = (await db()).buchungen[zweiterO] || {};
  t('HU1 nicht ins zweite Objekt geschrieben', !!nachher.HU1, false);
  await seite.evaluate(() => { window.__ladeVerzug = {}; });
  await seite.selectOption('#objekt', ersterO);
  await seite.waitForTimeout(900);
}

console.log('\nLaufender Schreibvorgang hebt die Wiederherstellung nicht auf');
await seite.reload({waitUntil:'networkidle'});
await seite.waitForFunction(() => window.__db);
await lade(KOPF + 'HW1;Bestätigt;Wilma;05.07.2027;06.07.2027;100,00;\n');
await seite.waitForSelector('#out:not(.hide)'); await seite.waitForTimeout(900);
const alleW = (await db()).buchungen;
const oW = Object.keys(alleW).filter(o => alleW[o].HW1)[0];
await lade(KOPF + 'HW1;Bestätigt;Wilma;05.07.2027;06.07.2027;100,00;\n'
                + 'HW2;Bestätigt;Xaver;10.07.2027;11.07.2027;100,00;\n');
await seite.waitForTimeout(900);
t('zwei Buchungen vorhanden', Object.keys((await db()).buchungen[oW]).length, 2);
await seite.evaluate(() => { window.__schreibVerzug = 1200; });
await seite.fill('.paid-in[data-key="HW1"]', '150,00');
await seite.waitForTimeout(1400);                    // Schreibvorgang läuft bereits
await seite.selectOption('#stand', {index: 1});
await seite.click('#standZurueck');
await seite.waitForTimeout(3500);                    // alter Auftrag längst durch
await seite.evaluate(() => { window.__schreibVerzug = 0; });
t('HW2 bleibt entfernt', !!(await db()).buchungen[oW].HW2, false);

/* --- Fünfte Nachprüfung (main f0ebaec): R5-01 bis R5-04 -------------------
   Alle vier entstanden aus den Korrekturen der vierten Runde. Die Kette legte
   die Reihenfolge fest, aber nicht, woran ein Auftrag hängt. */

console.log('\nWartender Import landet nicht im inzwischen gewechselten Objekt');
await seite.reload({waitUntil:'networkidle'});
await seite.waitForFunction(() => window.__db);
await lade(KOPF + 'HR1;Bestätigt;Rosa;05.08.2027;06.08.2027;100,00;\n');
await seite.waitForSelector('#out:not(.hide)'); await seite.waitForTimeout(900);
const alleR = (await db()).buchungen;
const oR = Object.keys(alleR).filter(o => alleR[o].HR1)[0];
await seite.click('#objektNeu');                      // zweites Objekt anlegen
await seite.waitForTimeout(900);
const objsR = await seite.$$eval('#objekt option', o => o.map(x => x.value));
const zweitR = objsR.filter(o => o !== oR)[0];
if (zweitR) {
  await seite.selectOption('#objekt', oR);            // zurück auf das erste
  await seite.waitForTimeout(700);
  // Die Kette mit einem laufenden Auftrag belegen, damit der Import wartet.
  await seite.evaluate(() => { window.__schreibVerzug = 2000; });
  await seite.fill('.paid-in[data-key="HR1"]', '150,00');
  await seite.waitForTimeout(1400);                   // Schreibvorgang läuft
  await lade(KOPF + 'HR9;Bestätigt;Rudi;10.08.2027;11.08.2027;100,00;\n');
  await seite.waitForTimeout(200);                    // Import steht in der Kette
  await seite.selectOption('#objekt', zweitR);        // jetzt wechseln
  await seite.waitForTimeout(4500);
  await seite.evaluate(() => { window.__schreibVerzug = 0; });
  t('Import landet nicht im zweiten Objekt',
    !!((await db()).buchungen[zweitR] || {}).HR9, false);
}

console.log('\nEingabe während der Wiederherstellung hebt sie nicht auf');
await seite.reload({waitUntil:'networkidle'});
await seite.waitForFunction(() => window.__db);
await lade(KOPF + 'HS1;Bestätigt;Sara;05.09.2027;06.09.2027;100,00;\n');
await seite.waitForSelector('#out:not(.hide)'); await seite.waitForTimeout(900);
const alleS = (await db()).buchungen;
const oS = Object.keys(alleS).filter(o => alleS[o].HS1)[0];
await lade(KOPF + 'HS1;Bestätigt;Sara;05.09.2027;06.09.2027;100,00;\n'
                + 'HS2;Bestätigt;Timo;10.09.2027;11.09.2027;100,00;\n');
await seite.waitForTimeout(900);
t('zwei Buchungen vor der Wiederherstellung', Object.keys((await db()).buchungen[oS]).length, 2);
await seite.evaluate(() => { window.__standVerzug = 1800; });
await seite.selectOption('#stand', {index: 1});       // Stand mit nur HS1
await seite.click('#standZurueck');
await seite.waitForTimeout(400);                      // Wiederherstellung läuft
t('Gastbetragsfeld ist währenddessen gesperrt',
  await seite.$eval('.paid-in[data-key="HS1"]', n => n.disabled).catch(() => 'kein Feld'), true);
// Ereignis trotzdem auslösen: geprüft wird die Sperre im Code, nicht nur die
// im DOM. Ohne sie erzeugt der Tastendruck aus dem alten Bestand einen
// Auftrag, der sich hinter die Wiederherstellung reiht und sie zurückdreht.
await seite.evaluate(() => {
  const el = document.querySelector('.paid-in[data-key="HS1"]');
  if (el) { el.value = '150,00'; el.dispatchEvent(new Event('input', {bubbles: true})); }
});
await seite.waitForTimeout(4000);
await seite.evaluate(() => { window.__standVerzug = 0; });
t('HS2 bleibt nach der Wiederherstellung entfernt',
  !!(await db()).buchungen[oS].HS2, false);

console.log('\nZurückgestellte Zeile bleibt im lokalen Bestand — die Korrektur kommt an');
await seite.reload({waitUntil:'networkidle'});
await seite.waitForFunction(() => window.__db);
await lade(KOPF + 'HV1;Bestätigt;Vera;05.10.2027;06.10.2027;100,00;150,00\n');
await seite.waitForSelector('#out:not(.hide)'); await seite.waitForTimeout(900);
const alleV = (await db()).buchungen;
const oV = Object.keys(alleV).filter(o => alleV[o].HV1)[0];
t('150 gespeichert', alleV[oV].HV1.gastbetrag, 150);
await seite.fill('.paid-in[data-key="HV1"]', 'abc');
await seite.waitForTimeout(2200);
t('Datenbank behält 150', (await db()).buchungen[oV].HV1.gastbetrag, 150);
// Der eigentliche Befund: vorher ersetzte docs den lokalen Bestand, die
// zurückgestellte Zeile war damit weg — die nächste Rechnung kannte sie nicht
// mehr, schrieb nichts und meldete trotzdem „gespeichert“.
t('Zeile steht weiter in der Tabelle',
  await seite.$$eval('.paid-in[data-key="HV1"]', n => n.length), 1);
await seite.fill('.paid-in[data-key="HV1"]', '200,00');
await seite.waitForTimeout(2400);
t('die Korrektur auf 200 kommt an', (await db()).buchungen[oV].HV1.gastbetrag, 200);

console.log('\nÄlterer Schreibvorgang bestätigt keine neuere Eingabe');
await seite.reload({waitUntil:'networkidle'});
await seite.waitForFunction(() => window.__db);
await lade(KOPF + 'HT1;Bestätigt;Tina;05.11.2027;06.11.2027;100,00;\n');
await seite.waitForSelector('#out:not(.hide)'); await seite.waitForTimeout(900);
const alleT = (await db()).buchungen;
const oT = Object.keys(alleT).filter(o => alleT[o].HT1)[0];
await seite.evaluate(() => { window.__schreibVerzug = 2000; });
await seite.fill('.paid-in[data-key="HT1"]', '150,00');
await seite.waitForTimeout(1400);                     // Auftrag für 150 läuft
await seite.fill('.paid-in[data-key="HT1"]', '200,00');
await seite.waitForTimeout(2200);                     // 150 ist durch, 200 nicht
t('Ungespeichert-Marker bleibt für die neuere Eingabe an',
  await seite.$eval('#dlPaid', n => n.classList.contains('offen')), true);
t('und der Status meldet sie als offen',
  /noch offen/.test(await seite.textContent('#wolkeStand')), true);
await seite.waitForTimeout(3000);
await seite.evaluate(() => { window.__schreibVerzug = 0; });
t('danach steht 200 in der Datenbank', (await db()).buchungen[oT].HT1.gastbetrag, 200);
t('und der Marker ist aus',
  await seite.$eval('#dlPaid', n => n.classList.contains('offen')), false);

/* --- Sechste Nachprüfung (main 6707995): R6-01 ---------------------------
   Die Sperre aus R5-02 nahm den Importweg nicht mit. */

console.log('\nEingabe während eines laufenden Imports wird nicht still verworfen');
await seite.reload({waitUntil:'networkidle'});
await seite.waitForFunction(() => window.__db);
await lade(KOPF + 'HI1;Bestätigt;Ida;05.12.2027;06.12.2027;100,00;120,00\n');
await seite.waitForSelector('#out:not(.hide)'); await seite.waitForTimeout(900);
const alleI = (await db()).buchungen;
const oI = Object.keys(alleI).filter(o => alleI[o].HI1)[0];
t('erst 120 aus der Datei gespeichert', alleI[oI].HI1.gastbetrag, 120);
await seite.evaluate(() => { window.__schreibVerzug = 2000; });
await lade(KOPF + 'HI1;Bestätigt;Ida;05.12.2027;06.12.2027;100,00;150,00\n');
await seite.waitForTimeout(500);                      // Import läuft noch
t('Gastbetragsfeld ist während des Imports gesperrt',
  await seite.$eval('.paid-in[data-key="HI1"]', n => n.disabled).catch(() => 'kein Feld'), true);
// Ereignis trotzdem auslösen: geprüft wird die Sperre im Code, nicht nur die
// im DOM. Ohne sie stand der Wert in paidRaw, wurde angezeigt, erzeugte mangels
// Wolken-Bestand keinen Auftrag und wurde am Ende von importieren weggeräumt.
await seite.evaluate(() => {
  const el = document.querySelector('.paid-in[data-key="HI1"]');
  if (el) { el.value = '200,00'; el.dispatchEvent(new Event('input', {bubbles: true})); }
});
await seite.waitForTimeout(150);
t('die Eingabe wird gar nicht erst übernommen',
  await seite.$eval('.paid-in[data-key="HI1"]', n => n.value), '150,00');
await seite.waitForTimeout(3500);
await seite.evaluate(() => { window.__schreibVerzug = 0; });
t('der Dateiwert 150 ist gespeichert', (await db()).buchungen[oI].HI1.gastbetrag, 150);
t('und das Feld ist danach wieder frei',
  await seite.$eval('.paid-in[data-key="HI1"]', n => n.disabled), false);

/* Aus dem Mutationslauf über die R5-Fixes: neuerBestand() ließ sich zu einem
   No-op machen, ohne dass ein Test rot wurde — in jedem geprüften Ablauf fing
   eine andere Schicht den Fall ab. Dies ist der Ablauf, den nur die
   Bestandsversion abdeckt: load() verwirft den Speichertimer nicht. */

console.log('\nWartendes Autospeichern überschreibt die frisch geladene Datei nicht');
await seite.reload({waitUntil:'networkidle'});
await seite.waitForFunction(() => window.__db);
await lade(KOPF + 'HZ1;Bestätigt;Zoe;05.01.2028;06.01.2028;100,00;120,00\n');
await seite.waitForSelector('#out:not(.hide)'); await seite.waitForTimeout(900);
const alleZ = (await db()).buchungen;
const oZ = Object.keys(alleZ).filter(o => alleZ[o].HZ1)[0];
t('erst 100 aus der Datei gespeichert', alleZ[oZ].HZ1.auszahlung, 100);
/* Bewusst über ein Optionsfeld, nicht über das Gastbetragsfeld: eine getippte
   Überschreibung steht in paidRaw und geht über optionen() in den Import mit
   ein — sie gewinnt dann gegen den Dateiwert und wird als „manuell“ vermerkt.
   Das ist gewollt (siehe Fall darunter), verdeckt hier aber genau das, was
   geprüft werden soll. Der Optionswechsel reiht denselben Auftrag ein, ohne
   paidRaw anzufassen: seine Dokumente tragen die alte Auszahlung. */
await seite.selectOption('#basis', 'ust10');          // löst das Autospeichern aus
await seite.waitForTimeout(300);                      // Timer läuft noch (1200 ms)
await lade(KOPF + 'HZ1;Bestätigt;Zoe;05.01.2028;06.01.2028;555,00;120,00\n');
await seite.waitForTimeout(2600);                     // Timer wäre längst durch
t('der Dateiwert 555 bleibt stehen', (await db()).buchungen[oZ].HZ1.auszahlung, 555);

console.log('\nEine getippte, noch nicht gespeicherte Änderung gewinnt gegen die Datei');
await seite.reload({waitUntil:'networkidle'});
await seite.waitForFunction(() => window.__db);
await lade(KOPF + 'HY1;Bestätigt;Yara;05.02.2028;06.02.2028;100,00;120,00\n');
await seite.waitForSelector('#out:not(.hide)'); await seite.waitForTimeout(900);
const alleY = (await db()).buchungen;
const oY = Object.keys(alleY).filter(o => alleY[o].HY1)[0];
await seite.fill('.paid-in[data-key="HY1"]', '999,00');
await seite.waitForTimeout(300);                      // vor dem Autospeichern
await lade(KOPF + 'HY1;Bestätigt;Yara;05.02.2028;06.02.2028;100,00;150,00\n');
await seite.waitForTimeout(2600);
/* Der zuletzt getippte Wert gewinnt — und wird als solcher vermerkt, nicht als
   Dateiwert ausgegeben. Festgehalten, damit die Regel nicht unbemerkt kippt. */
t('der getippte Wert 999 steht in der Datenbank', (await db()).buchungen[oY].HY1.gastbetrag, 999);
t('und ist als manuell vermerkt', (await db()).buchungen[oY].HY1.gastbetragQuelle, 'manuell');


}
console.log('\nMonatsabschluss, Sperre, Belegpaket und Verlauf');
await seite.reload({waitUntil:'networkidle'});
await seite.waitForFunction(()=>window.__db);
await seite.evaluate(()=>{window.__schreibVerzug=700;});
await lade(KOPF+'MF1;Bestätigt;Maria;05.08.2026;06.08.2026;100,00;150,00\n');
await seite.waitForTimeout(150);
t('Abschlussknöpfe bleiben während Import gesperrt',await seite.$$eval('#monatSchliessen,#monatOeffnen,#belegpaket',a=>a.every(e=>e.disabled)),true);
await seite.waitForTimeout(1200);
await seite.evaluate(()=>{window.__schreibVerzug=0;});
await seite.selectOption('#abschlussMonat','2026-08');
await seite.click('#monatSchliessen');
t('ohne Bestätigung kein Abschluss',Object.keys((await db()).abschluesse||{}).length,0);
await seite.check('#abschlussVoll');await seite.check('#abschlussPruefung');await seite.check('#abschlussHinweise');
await seite.click('#monatSchliessen');await seite.waitForTimeout(500);
const mo=Object.keys((await db()).buchungen)[0];
t('Monat gespeichert',!!(await db()).abschluesse[mo]['2026-08'],true);
t('Betragseingabe gesperrt',await seite.$eval('.paid-in[data-key="MF1"]',e=>e.disabled),true);
const downloadWartet=seite.waitForEvent('download');await seite.click('#belegpaket');
const download=await downloadWartet;
t('Belegpaket ZIP',download.suggestedFilename(),'ortstaxe-2026-08.zip');
await lade(KOPF+'MF1;Bestätigt;Maria;05.08.2026;06.08.2026;100,00;200,00\n');await seite.waitForTimeout(800);
t('Import überschreibt Abschluss nicht',(await db()).buchungen[mo].MF1.gastbetrag,150);
await seite.click('#monatsarbeit details summary');
await seite.click('#verlaufLaden');await seite.waitForTimeout(200);
t('Verlauf enthält Import',/import/.test(await seite.textContent('#verlaufInhalt')),true);
// Existing dialog handler supplies a nonempty reason.
await seite.click('#monatOeffnen');await seite.waitForTimeout(500);
t('bewusst wieder geöffnet',!!(await db()).abschluesse[mo]['2026-08'],false);

await seite.evaluate(()=>{const e=document.getElementById('abschlussMonat');e.innerHTML='';e.dispatchEvent(new Event('change'));});
t('Leere Monatsauswahl sperrt alle Monatsknöpfe',await seite.$$eval('#monatSchliessen,#monatOeffnen,#belegpaket',a=>a.every(e=>e.disabled)),true);
if(process.env.REVIEW_SCREENSHOT) await seite.locator('#monatsarbeit').screenshot({path:process.env.REVIEW_SCREENSHOT});
console.log('\nEigene JS-Fehler: ' + (fehler.length ? fehler.join(' | ') : 'keine'));
if (fehler.length) schlecht += fehler.length;
console.log('\n' + gut + ' bestanden · ' + schlecht + ' fehlgeschlagen');
await browser.close(); server.close(); fs.rmSync(tmp, {recursive: true, force: true});
process.exit(schlecht ? 1 : 0);
