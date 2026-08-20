# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier festgehalten.

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
das Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Hinzugefügt

- Selbsttest unter `index.html?selftest` — rund fünfzig Prüfungen gegen die
  Rechenfunktionen, darunter beide Stichtagsgrenzen, die Schlüsselzahlen aus
  `CLAUDE.md` und der dort vorgeschriebene Regressionsfall. Bekannte, noch
  offene Bugs sind als solche markiert statt zu fehlen
- Warnung bei negativen Beträgen, die bisher stillschweigend gegengerechnet
  wurden, und bei unbekannten Buchungsstatus

### Geändert

- Der Statusfilter überspringt jetzt auch abgelehnte, abgelaufene und noch
  nicht bestätigte Buchungen — bisher fielen nur Stornos heraus, Anfragen
  und ausstehende Buchungen wurden als Nächtigung gemeldet
- Summenzeilen werden aus den gerundeten Monatsbeträgen gebildet, damit die
  Summe der überwiesenen Beträge entspricht und nicht um einen Cent abweicht
- Die Kurzfassung der PDF blendet die Warnhinweise nicht mehr aus

### Behoben

- Beträge auf halbem Cent wurden gleitkommabedingt abgeschnitten statt
  kaufmännisch gerundet (1,005 € ergab 1,00 € statt 1,01 €)
- Gastnamen und Bestätigungs-Codes aus der CSV werden vor der Ausgabe
  maskiert; ein Name mit `<` oder `&` hat bisher die Tabelle zerlegt
- Ein Bestätigungs-Code wie `constructor` löste eine falsche
  Dublettenwarnung aus

## [1.0.0] — 2026-08-05

### Hinzugefügt

- Import einer Airbnb-Reservierungs-CSV per Drag & Drop oder Dateiauswahl, mit
  eigenem CSV-Parser für `,` und `;` sowie deutschen und englischen Spaltennamen
- Nächteweise Berechnung der Ortstaxe mit den Schlüsselzahlen der Stadt Wien und
  den Stichtagen 01.07.2026 (3,2 → 5 %) und 01.07.2027 (5 → 8 %)
- Aufteilung von Buchungen über den Monatswechsel auf die jeweiligen Meldemonate
- Umschaltbare Betragsbasis: ohne USt oder inkl. 10 % USt
- Hochrechnung von der Airbnb-Auszahlung auf das Gastentgelt über die
  Grundgebühr, wahlweise mit 20 % USt auf die Gebühr oder Reverse Charge bei
  hinterlegter UID
- Monatsübersicht mit Bemessungsgrundlage und Abgabe für die VIETour-Meldung
- Überweisungsliste an die MA 6 mit Fälligkeitsdatum und kopierbarem
  Verwendungszweck aus Abgabenkonto und MMJJJJ
- Buchungsdetail mit Satzverlauf pro Aufenthalt als farbiges Band
- 90-Tage-Zähler nach § 129 Abs. 1a BO, getrennt nach kurzfristig, Graubereich
  und befreit, mit Worst-Case-Anzeige pro Kalenderjahr
- Befreiung für Aufenthalte über drei Monate, Überspringen stornierter Buchungen
- Warnhinweise bei doppelten Codes, fehlenden Beträgen und unlesbaren Daten
- PDF-Ausgabe als Gesamtbericht oder nur Monatsübersicht über Print-CSS
- CSV-Export der Monatsübersicht und des Buchungsdetails

[Unreleased]: https://github.com/ieeks/ortstaxe-wien/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ieeks/ortstaxe-wien/releases/tag/v1.0.0
