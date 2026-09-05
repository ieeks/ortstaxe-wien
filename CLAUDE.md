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

## Aufbau

    index.html            Markup und CSS, lädt js/oberflaeche.js als Modul
    js/kern.js            Rechenkern — reine Funktionen, kein DOM
    js/oberflaeche.js     alles mit document: render, Handler, Sitzungszustand
    selftest.js           alle Prüfungen, per ?selftest nachgeladen

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

`firestore.rules` sind **noch nicht gegen den Emulator geprüft**. Vor dem ersten
echten Einsatz: `firebase emulators:start --only firestore`.

Was noch fehlt: das Firebase-Projekt selbst (Console), `.firebaserc`, die
Anmeldung und `js/daten.js` mit dem eigentlichen Lesen und Schreiben.

## Offene Punkte

Siehe `TODO.md` und die Issues im Repo.
