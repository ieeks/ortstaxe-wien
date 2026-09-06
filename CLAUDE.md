# Projektkontext — ortstaxe-wien

## Was das ist

Werkzeug, das eine Airbnb-Reservierungs-CSV einliest und daraus die Wiener Ortstaxe
pro Meldemonat berechnet. Läuft über GitHub Pages unter
https://manuel.tools/ortstaxe-wien/

Das Konto `ieeks` hat eine Custom Domain (`manuel.tools`), deshalb läuft auch
dieses Projekt-Pages darunter — `ieeks.github.io/ortstaxe-wien/` leitet dorthin um.

## Harte Regeln

- **Kein Build-Schritt.** Kein npm, kein Bundler, kein Framework. Native
  ES-Module, direkt so ausgeliefert, wie sie im Repo liegen. Externe Abhängigkeiten
  sind die Google Fonts und das Firebase-SDK, beide per CDN.
- **`js/kern.js` fasst kein DOM an.** Dort steht nur, was aus Daten Zahlen macht.
  Alles mit `document` gehört in `js/oberflaeche.js`. Diese Trennung ist der Grund,
  warum der Selbsttest den echten Rechen- und Ausgabeweg prüfen kann statt ihn
  nachzubauen — sie ist keine Kosmetik.
- **Kein localStorage, kein sessionStorage** für Anwendungsdaten. Der Offline-Cache
  von Firestore (IndexedDB) ist bewusst ausgenommen und die einzige Ausnahme.
- **Deutschsprachige UI.** Auch Fehlermeldungen und Hinweistexte.
- **Schriften:** IBM Plex Sans, IBM Plex Sans Condensed, IBM Plex Mono.
- Neue Testfälle gehören immer in `selftest.js`, im selben Commit wie die Änderung.

## Rechenlogik nicht anfassen

Die Schlüsselzahlen und Stichtage sind gegen den Ortstaxerechner der Stadt Wien
geprüft:

- ohne USt: `0.027691` / `0.047619` / `0.074074`
- bei 10 % USt: `0.025237` / `0.043478` / `0.067797`
- Stichtage: `01.07.2026` (3,2 → 5 %) und `01.07.2027` (5 → 8 %)

Im Code stehen diese Werte als Sätze in `EFF` (`0.032*0.89`, `0.05`, `0.08`); die
Schlüsselzahl ergibt sich aus `e/(ustF+e)`, weil auf den Betrag **inklusive**
enthaltener Ortstaxe gerechnet wird.

**Regressionstest bei jeder Änderung an der Rechnung:** Buchung 18.06.2026–19.07.2026
mit 1.644,80 € Gastentgelt, Basis ohne USt, Gebühr 0 → **64,58 €** gesamt
(19,10 € Juni bei 13 Nächten + 45,48 € Juli bei 18 Nächten).

Der komplette Selbsttest läuft über `index.html?selftest`. Weil das Tool aus
ES-Modulen besteht, braucht er einen Server — Browser blockieren Modul-Importe
über `file://`:

    python3 -m http.server
    # http://localhost:8000/index.html?selftest

Bei jeder Änderung vorher und nachher aufrufen; die Anzeige nennt bestandene,
fehlgeschlagene und bekannt offene Fälle.

**Der Selbsttest allein reicht nicht.** Er prüft den Rechenkern; was zwischen
Eingabe, Import und Speichern passiert, erreicht er nicht — und genau dort lagen
die Fehler der Branch-Nachprüfung vom 05.09.2026: ein eingetippter Gastbetrag,
der nie gespeichert wurde; eine Stornierung, die den Bestand nie erreichte; ein
unlesbarer Betrag, der einen richtigen überschrieb. Alle drei waren mit grünem
Selbsttest vorhanden.

Dafür gibt es `test/integration.mjs`: kopiert das Repo, ersetzt `js/daten.js`
durch `test/daten-attrappe.js`, liefert statisch aus und fährt die echte
Oberfläche mit Chromium durch.

    npm i playwright && node test/integration.mjs

Playwright ist reines Entwicklungswerkzeug. **Ausgeliefert wird weiterhin ohne
Build und ohne Abhängigkeiten** — die Regel oben gilt für das Werkzeug, nicht
für die Testwerkbank.

Wer eine Funktion an der Oberfläche ergänzt, ergänzt hier einen Fall. Ein Test,
der seine Eingabe selbst konstruiert statt sie durch den echten Pfad laufen zu
lassen, ist grün und wertlos: `gastbetragQuelle` war so einmal nur in den Tests
vorhanden, während der Produktivpfad den Wert nie erzeugte.

## Aufbau

    index.html              Markup und CSS, lädt js/oberflaeche.js als Modul
    js/kern.js              Rechenkern — reine Funktionen, kein DOM
    js/oberflaeche.js       alles mit document: render, Handler, Sitzungszustand
    js/daten.js             Firestore, spricht als einzige Stelle mit Firebase
    js/firebase-config.js   Projektdaten und gepinnte SDK-Version
    selftest.js             Prüfungen des Rechenkerns, per ?selftest nachgeladen
    test/integration.mjs    Oberfläche gegen eine Datenbank-Attrappe

`js/kern.js`:

- `parseCSV` / `csvZelle` / `csvZeile` — eigener Parser und Serializer, kommen mit
  `,` und `;` sowie Quotes zurecht; geschrieben wird nach RFC 4180
- `findCol` — normalisiert Spaltennamen, matcht DE und EN, dann Teilstring-Fallback;
  mit `exakt` ohne diesen Fallback
- `leseGeld` — prüft den ganzen String gegen ein Zahlenformat und liefert
  `{wert,status}`; `parseMoney` ist der bequeme Zugriff darauf
- `datumsOrdnung` — bestimmt TT/MM oder MM/TT einmal für die ganze Datei
- `compute` — zerlegt jede Buchung in Nächte, ordnet Satz und Meldemonat zu
- `occupancy` — 90-Tage-Zähler der Bauordnung, getrennt nach `kurz` (bis 30
  Nächte), `grau` (31 Nächte bis 3 Monate) und `lang` (befreit)
- `jahressummen` / `monatsSummen` — Jahres- und Fußzeilenwerte
- `baueCsvMonate` / `baueCsvBuchungen` / `baueCsvGastbetraege` — die drei Exporte
- `leseGastbetraege` / `merkeGastbetraege` — Gastbeträge aus einer früher
  exportierten CSV nachladen und über den Bestätigungs-Code zuordnen, ohne die
  Buchungsliste zu ersetzen

`js/oberflaeche.js`: `render`, `renderQuota`, `run`, `load`, die Handler und
`paidRaw`. Print-CSS erzeugt die PDFs, `body.print-months` blendet für die
Kurzfassung aus.

Ein Gastbetrag wird nur über einen echten Bestätigungs-Code wiederverwendet.
Zeilen ohne Code bekommen einen Schlüssel mit `#`, den `load()` vor jeder neuen
Datei verwirft — sonst landet der Betrag auf der Buchung, die zufällig in
derselben Zeile steht.

## Synchronisierung (im Aufbau)

Gespeichert wird die **Buchung**, nie der Meldemonat. Eine Buchung vom 18.06. bis
19.07. gehört in zwei Meldeperioden, der 90-Tage-Zähler rechnet übers Kalenderjahr
und die Drei-Monats-Befreiung über den ganzen Aufenthalt — der Monat ist eine
abgeleitete Sicht. Nichts Gerechnetes geht in die Datenbank, sonst gibt es zwei
Wahrheiten, die auseinanderlaufen.

    users/{uid}/einstellungen/aktuell
    users/{uid}/objekte/{objektId}
    users/{uid}/objekte/{objektId}/buchungen/{code}
    users/{uid}/objekte/{objektId}/schnappschuesse/{zeitpunkt}

Datumsangaben stehen als ISO-Zeichenkette, **nicht** als Firestore-Timestamp: die
Rechnung arbeitet auf UTC-Kalendertagen, ein Timestamp holt genau die
Zeitzonenfehler zurück, die `mkDate`/`plusMonths` vermeiden.

`alsCsvZeilen` führt gespeicherte Dokumente in genau die Tabelle zurück, die
`compute` ohnehin liest. Es gibt damit keinen zweiten Weg in die Berechnung —
der geprüfte Rechenweg bleibt der einzige. Der Selbsttest fährt den Rundlauf
CSV → rechnen → Dokumente → zurück → rechnen und vergleicht Meldemonate,
Ortstaxe je Buchung, Jahressumme und Befreiung.

Vor jedem überschreibenden Import wird ein Schnappschuss abgelegt: ein Dokument
mit dem vollständigen Stand statt Revisionen je Monat — der Jahresbestand sind
wenige hundert Buchungen, und ein einzelnes Dokument spielt sich ohne
Zusammensetzen zurück.

Die neuen `firestore.rules` sind mit `test/firestore-regeln.mjs` gegen den lokalen
Firestore-Emulator geprüft (14 Fälle). Die echte Anmeldung bleibt separat zu prüfen.

Beim Import wird zusammengeführt, **nie ersetzt**: ein Export über einen einzelnen
Monat darf den Rest des Jahres nicht löschen. Ein von Hand gesetzter Gastbetrag
überlebt einen Import, der an dieser Stelle nichts mitbringt — im rohen
Airbnb-Export gibt es die Spalte gar nicht. Siehe `verschmelzeBuchungen`.

Die ganze Schicht ist additiv: ohne Anmeldung, ohne Netz oder bei einem
SDK-Fehler verhält sich das Werkzeug genau wie vorher. `js/daten.js` ist die
einzige Stelle, die mit Firebase spricht. Es koordiniert zusätzlich die Abschluss-
und Sperrprüfung mit den reinen Funktionen aus `abschluss.js`; deren Rechnung
kommt ausschließlich aus `kern.js`. Das läuft im Browser auf revisionsgebundenen
Serverdaten, nicht als serverseitige Steuerprüfung.

**Welche Quelle gerade gilt**, entscheidet `aktuelleZeilen()`: liegt ein Bestand
aus der Datenbank vor, hat er Vorrang; sonst die zuletzt geladene CSV. Nach dem
ersten Speichern ist also die Datenbank die Wahrheit. Ein geleertes Eingabefeld
hebt die Überschreibung auf und gibt den Wert der *aktuellen* Quelle frei — im
CSV-Betrieb den Dateiwert, danach den gespeicherten. `gastbetragQuelle` ist
deshalb ein Vergleich, kein Herkunftsvermerk: „manuell“ heißt, jemand hat etwas
anderes gesetzt als die Quelle sagt.

**Zurückspielen ist ein Bestandsabgleich, kein Überschreiben.** `schreibeBuchungen`
mischt nur und löscht nie — Buchungen, die erst nach dem Schnappschuss dazukamen,
werden deshalb ausdrücklich entfernt. Ohne das ließe sich ein fehlerhafter Import
zusätzlicher Zeilen nicht rückgängig machen.

**Jeder verzögerte Schreibvorgang hält sein Ziel und seine Daten beim Auslösen
fest**, nicht erst beim Ausführen. Sonst landet nach einem Objektwechsel der
Bestand von Wohnung A unter Wohnung B. Aus demselben Grund bekommt jede
Ladeanfrage eine Nummer: eine überholte oder zu einem gewechselten Objekt
gehörende Antwort wird verworfen, statt in `wolkeBestand` zu landen.

**Ein Objektwechsel räumt alles Objektgebundene weg** — ausstehende Timer, die
geladene CSV, `paidRaw` und die Anzeige. Sonst zeigt ein leeres zweites Objekt
die Buchungen des ersten.

**Vor dem Zurückspielen wird der Speichertimer verworfen.** Er gehört zum
verworfenen Stand; liefe er danach ab, schriebe er die alten Daten wieder hinein
und machte die Wiederherstellung rückgängig. Löschen und Zurückschreiben laufen
über `ersetzeBuchungen` als ein Firestore-Batch — sonst bleibt bei einem
Schreibfehler ein Mischbestand zurück, aus dem schon gelöscht, aber noch nichts
wiederhergestellt wurde. Über 400 geänderte Buchungen wird nicht teilweise geschrieben. Der Restore-Pfad
verweist auf einen kontrollierten Migrationslauf durch das Dev-Team; die Sicherung bleibt erhalten.

**Der Marker auf „Buchungen + Gastbeträge als CSV“ und die Warnung beim Schließen
bedeuten „steht nur im Arbeitsspeicher“.** Ein erfolgreiches Speichern in die
Datenbank setzt beide zurück — sonst warnt der Browser vor einem Datenverlust,
den es nicht gibt, und der Punkt wird bedeutungslos. Ohne Anmeldung bleibt es
beim alten Verhalten: erst der CSV-Export löscht ihn.

**Eine Kette legt nur die Reihenfolge fest, nicht die Zugehörigkeit.** Jeder
Auftrag hängt an drei Dingen, und alle drei werden **beim Einreihen** festgehalten,
nie beim Ausführen: am **Objekt** (`ziel`), am **Bestand** (`bestandVersion`) und
am **Bearbeitungsstand** (`eingabeStand`). Fehlt eine dieser Bindungen, führt die
Kette einen Auftrag treu aus, der längst zu etwas anderem gehört — die vier
Befunde der fünften Nachprüfung waren genau das:

- `speichereImport` band das Ziel nicht, `importieren` las `objektId` erst beim
  Ausführen. Die Prüfungen darin verglichen `objektId` mit sich selbst und
  konnten nie auslösen; ein wartender Import landete unter dem Objekt, auf das
  inzwischen umgestellt worden war.
- `bestandVersion` steigt, sobald der Bestand als Ganzes ausgetauscht wird:
  Objektwechsel, Laden, Import, Wiederherstellung, neue Datei. Ein Auftrag aus
  einem älteren Bestand wird verworfen. Ein gewöhnliches Autospeichern erhöht
  sie **nicht** — sonst verwürfe es die eigene, noch wartende Folgeeingabe.
- `eingabeStand` steigt bei jeder Eingabe. Ein Schreibabschluss darf `paidRaw`
  nur leeren und „gespeichert“ nur melden, wenn er **diesen** Stand geschrieben
  hat. Sonst steht die Bestätigung über einer Änderung, die noch aussteht.

**Ein Vorgang, der den Bestand austauscht, sperrt die Eingaben (`sperren`).**
Abwarten allein genügt nicht: während einer laufenden Wiederherstellung blieb die
alte Tabelle bearbeitbar, und ein Tastendruck erzeugte daraus einen Auftrag, der
sich brav dahinter einreihte — und sie damit rückgängig machte. Gesperrt wird
**vor dem ersten `await`**, gezählt (Vorgänge verschachteln sich: die
Wiederherstellung lädt am Ende selbst) und sowohl im DOM (`disabled`) als auch im
Eingabe-Handler.

**Der Dateiimport gehört dazu.** Zwischen dem Anzeigen der neuen Datei und dem
Ende des Imports zeigt die Tabelle etwas, das noch nirgends steht: `wolkeBestand`
ist null, eine Eingabe erzeugt also gar keinen Auftrag, und am Ende räumt
`importieren` `paidRaw` weg und meldet „gespeichert“. Der getippte Wert wäre
verloren, und anders als bei einem verfrühten Erfolgsstatus holt ihn kein
späterer Auftrag nach. Freigegeben wird in beiden Ausgängen des Imports.

**Der Eingabe-Handler prüft die Sperre selbst**, nicht nur `speichereEingabe`.
Sonst landet der Wert in `paidRaw`, wird angezeigt und still verworfen — sichtbar
getippt, nirgends gespeichert.

**Eine getippte, noch nicht gespeicherte Änderung gewinnt gegen eine danach
geladene Datei** und wird als `gastbetragQuelle: 'manuell'` vermerkt: `paidRaw`
geht über `optionen()` in den Import ein. Das ist gewollt — der zuletzt getippte
Wert ist der jüngere —, aber es verdeckt in Tests alles, was sonst über den
Importweg liefe. Ein Testfall für die Bestandsversion muss deshalb über ein
Optionsfeld gehen, nicht über das Gastbetragsfeld.

**Ein Schreibabschluss aktualisiert den Bestand, er ersetzt ihn nicht.**
`wolkeBestand=docs` warf jede wegen unlesbarer Eingabe zurückgestellte Zeile aus
dem lokalen Bestand; die nächste Rechnung kannte sie nicht mehr, schrieb nichts
und meldete trotzdem „gespeichert“ — die Korrektur kam nie an. Übernommen werden
nur die geschriebenen Dokumente, der Rest bleibt stehen.

**`optionen()` liefert eine Kopie von `paidRaw`, keinen Verweis.** Ein
festgehaltener Auftrag muss mit den Werten rechnen, die beim Festhalten galten,
sonst sieht er die Tastendrücke, die nach ihm kamen.

**Alle Schreibvorgänge laufen durch eine Kette (`inReihe`).** `clearTimeout`
stoppt nur einen wartenden Timer — hat sein Rückruf den Datenbankaufruf schon
begonnen, läuft der weiter und schriebe nach einer Wiederherstellung den alten
Stand zurück. Verkettet wartet die Wiederherstellung laufende Schreibvorgänge ab
und ersetzt danach. Einzelne Timer-Fixes reichen hier nicht; die Reihenfolge
gehört an einer Stelle festgelegt.

**Ein Objektwechsel räumt vor dem ersten `await`**, nicht danach: Bestand, CSV,
`paidRaw` und Anzeige. Solange geladen wird, ist Speichern gesperrt (`laedt`) —
sonst ist die Tabelle des alten Objekts weiter bearbeitbar, während `objektId`
schon auf das neue zeigt, und der Bestand von A landet unter B.

**Der Status des Gastbetrags wird getrennt vom Status der Auszahlung geführt**
(`gastbetragStatus` neben `betragStatus`). Eine unlesbare Eingabe darf einen
gültigen gespeicherten Wert nicht mit `null` überschreiben: solche Zeilen werden
nicht geschrieben, gemeldet, und der Ungespeichert-Marker bleibt an.

**`merkeGastbetraege` läuft nur im CSV-Betrieb.** Liegt der Bestand aus der
Datenbank vor, ist er bereits der Speicher — die Werte zusätzlich in `paidRaw`
zu halten ließe sie jede später geladene Datei verdecken, und eine korrigierte
CSV käme nie durch.

**Ungeprüft und vor dem ersten Einsatz zu prüfen:**

- Die in `js/firebase-config.js` gepinnte SDK-Version. Sie ließ sich in der
  Entwicklungsumgebung nicht abrufen (gstatic.com dort gesperrt).
- `firestore.rules` gegen den Emulator: `firebase emulators:start --only firestore`
- Der gesamte Anmelde- und Speicherweg gegen das echte Projekt.

## Offene Punkte

Siehe `TODO.md` und die Issues im Repo.

## Monatsarbeit (Feature-Branch)

`js/abschluss.js` enthält ausschließlich die reine Monatsprüfung und Sperrvergleiche;
`js/belegpaket.js` den lokalen PDF-/ZIP-Export. Beide verwenden den bestehenden Rechenkern.
Abschlussdaten sind bewusst eingefrorene Prüfbelege, keine zweite Quelle für die laufende Rechnung.
Alle Buchungsschreibwege müssen durch `aendereBestand` laufen: Guard-Revision,
Monatssperren, Buchungen und Änderungsprotokoll werden zusammen verarbeitet.
Bei einem abgewiesenen Import muss die zuvor sichtbare Quelle wiederhergestellt werden.
Kein automatisches Wiederöffnen gesperrter Monate, keine Teilwrites bei Größenüberschreitung.

### Entscheidungen aus dem Review von PR #18

- Die Online-Pflicht für geschützte Writes ist beabsichtigt: Monatssperre und
  Buchungen müssen gemeinsam in einer aktuellen Firestore-Transaktion geprüft
  werden. Ein später synchronisierter Offline-Write könnte einen inzwischen
  abgeschlossenen Monat verändern. IndexedDB bleibt für SDK-Lesedaten erhalten;
  CSV-Rechnen funktioniert offline. Es gibt keine Offline-Schreibwarteschlange.
- Der Sitzungsbestand ist an seine Serverrevision gebunden. Normales Autospeichern
  scannt die Sammlung nicht erneut; bei abweichender Revision wird abgebrochen.
- `verwaltung/aktuell` enthält nur Zusammenfassungen und Referenzen auf die
  unveränderlichen Belege. `ladeAbschluss` holt den Volltext für das Belegpaket.
- Verlaufseinträge werden nach Größe aufgeteilt, ohne Werte wegzulassen, und
  zusammen mit den Buchungen committed.

Bei Netzfehlern zeigt die Buchungsansicht vorhandene SDK-Cache-Daten ausdrücklich
als möglicherweise veralteten, schreibgeschützten Offline-Stand. Erst erneutes
Online-Laden gibt Bearbeitung und Monatsaktionen frei. Berechtigungsfehler
fallen nicht auf den Cache zurück. Der Anzeige-Cache füllt niemals den
revisionsgebundenen Arbeitsbestand; Abmelden leert die Sitzungscaches.
