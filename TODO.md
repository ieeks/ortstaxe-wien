# TODO

Grob nach Priorität. Die ersten drei Punkte hängen zusammen und ergeben zusammen
den laufenden Jahresüberblick.

## Mehrere CSVs kombinieren

→ [Issue #3](https://github.com/ieeks/ortstaxe-wien/issues/3)

Ein neuer Upload ersetzt heute den alten Bestand. Wer im August den Juli lädt und
im September den August, sieht immer nur einen Monat. Für die Monatsmeldung egal,
für den 90-Tage-Zähler aber ein Korrektheitsproblem: der Zähler unterschätzt den
Verbrauch systematisch, weil er nur über die gerade geladenen Buchungen rechnet.

Kleinste Lösung: `multiple` am File-Input, Dateien additiv statt ersetzend,
Deduplizierung über den Bestätigungs-Code. Vorher prüfen, ob Airbnb den ganzen
Jahreszeitraum in einer Datei exportiert — dann erledigt sich das meiste.

## Jahresstand: freie Tage und aufgelaufene Ortstaxe

Das eigentliche Ziel. Ganz oben eine kompakte Übersicht für das laufende Jahr:

- **Noch frei zum Vermieten** — wie viele der 90 Tage sind übrig, plus Graubereich
  und Worst Case. Steckt fachlich schon in `occupancy()`, braucht nur den
  vollständigen Jahresbestand und eine prominentere Platzierung.
- **Ortstaxe bisher im Jahr** — Summe der Abgabe seit 01.01., aufgeschlüsselt nach
  Meldemonat, mit Kennzeichnung, was davon schon gemeldet und gezahlt ist.
- **Bemessungsgrundlage kumuliert** — für die Jahreserklärung, fällig am 15.02. des
  Folgejahres, abgestimmt auf die monatlich gemeldeten Beträge.
- Beim Satzwechsel getrennt ausweisen, sonst wird die Jahressumme unlesbar.

Setzt voraus, dass die Daten des ganzen Jahres da sind — also entweder den
Jahresexport oder den Punkt darüber oder den darunter.

## Persistenz — Firestore oder Sammelstand-Datei

Damit der Jahresstand ohne jedes Mal neues Zusammensuchen dasteht. Zwei Wege:

**Firestore** (ist vorhanden, wird schon bei Wallbox eingesetzt). Sync über Geräte
hinweg, am iPhone einfach aufrufen und der Stand ist da. Drei Dinge vorher klären:

- Es sollten **nur Aggregate** hochgehen — pro Jahr und Meldemonat die Nächte, die
  Bemessungsgrundlage und die Abgabe. Für alles, was oben gefragt ist, reicht das
  vollständig. Buchungsdetails und vor allem **Gästenamen haben in der Cloud nichts
  verloren**, das sind personenbezogene Daten Dritter.
- Der Hinweis im Drop-Feld sagt heute *„Die Datei bleibt im Browser."* — sobald
  irgendetwas synchronisiert wird, muss der Satz geändert werden, sonst stimmt er
  nicht mehr.
- `CLAUDE.md` schließt `localStorage` aus. Firestore ist etwas anderes, aber die
  Regel gehört bei der Gelegenheit präzisiert: gemeint ist wohl „kein stiller
  lokaler Zustand", nicht „keine Persistenz überhaupt".

**Sammelstand-Datei** als Alternative ohne Backend: Export eines kleinen JSON zum
Download, liegt in iCloud Drive, wird beim nächsten Mal zusammen mit der neuen
Monats-CSV wieder eingelesen. Persistenz über die Dateien-App, Daten bleiben zu
100 % lokal, keine neue Abhängigkeit.

Firestore ist bequemer, die Datei ist sauberer. Bei nur Aggregaten ist Firestore
vertretbar.

## Offline-Fähigkeit

Der Google-Fonts-Link macht das Tool ohne Netz unansehnlich. Entweder IBM Plex
lokal einbetten (woff2 als Data-URI, damit es eine Datei bleibt) oder auf einen
sauberen System-Font-Fallback umstellen.

## Mobile: Kartenansicht statt Tabelle

Die Buchungstabelle scrollt am iPhone horizontal. Für schmale Viewports eine
Kartenansicht pro Buchung prüfen — Monatsübersicht und Überweisungsliste sind
schmal genug und können Tabellen bleiben.

## Mehrere Inserate

Die Spalte „Inserat" wird aktuell ignoriert. Bei einer zweiten Wohnung müsste pro
Inserat getrennt gemeldet werden — Gruppierung nach Inserat, eigene
Monatsübersicht und eigener 90-Tage-Zähler je Objekt.

## Manifest + Icon

`manifest.json` und ein Icon, damit sich die Seite am iPhone zum Homescreen
hinzufügen lässt. Kollidiert mit der Single-File-Regel — das Manifest darf als
zweite Datei danebenliegen, `index.html` bleibt in sich geschlossen.
