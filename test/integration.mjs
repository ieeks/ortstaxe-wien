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
seite.on('dialog', d => d.accept());

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

console.log('\nEingetippte Gastbeträge werden gespeichert');
await lade(KOPF + 'HM1;Bestätigt;Anna;05.08.2026;06.08.2026;100,00;\n');
await seite.waitForSelector('#out:not(.hide)'); await seite.waitForTimeout(700);
const obj = Object.keys((await db()).buchungen)[0];
t('nach dem Import noch kein Gastbetrag', (await db()).buchungen[obj].HM1.gastbetrag, null);
await seite.fill('.paid-in[data-key="HM1"]', '150,00');
await seite.waitForTimeout(2200);                       // Entprellung
t('nach dem Tippen in der Datenbank', (await db()).buchungen[obj].HM1.gastbetrag, 150);
t('Herkunft ist „manuell“',            (await db()).buchungen[obj].HM1.gastbetragQuelle, 'manuell');

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

console.log('\nEigene JS-Fehler: ' + (fehler.length ? fehler.join(' | ') : 'keine'));
if (fehler.length) schlecht += fehler.length;
console.log('\n' + gut + ' bestanden · ' + schlecht + ' fehlgeschlagen');
await browser.close(); server.close(); fs.rmSync(tmp, {recursive: true, force: true});
process.exit(schlecht ? 1 : 0);
