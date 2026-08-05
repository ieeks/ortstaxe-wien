# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier festgehalten.

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
das Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

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
