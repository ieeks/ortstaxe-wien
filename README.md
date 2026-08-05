# Ortstaxe Wien

Rechnet aus einem Airbnb-Reservierungsexport die Wiener Ortstaxe pro Meldemonat
aus — inklusive der Satzwechsel zum 01.07.2026 und 01.07.2027, der Aufteilung
von Buchungen über den Monatswechsel und dem 90-Tage-Zähler der Bauordnung.

**→ https://ieeks.github.io/ortstaxe-wien/**

Eine einzige HTML-Datei, kein Build, keine Abhängigkeiten außer den Google Fonts.
Die CSV wird ausschließlich im Browser verarbeitet und nirgendwo hochgeladen.

## Benutzung

1. Bei Airbnb → **Reservierungen** → **Exportieren** die CSV herunterladen
2. Die Datei auf das Feld ziehen oder anklicken und auswählen
3. Optionen prüfen:
   - **Betragsbasis** — ob die Spalte „Einkünfte" ohne USt oder inkl. 10 % USt geführt ist
   - **90-Tage-Zählung** — Nächte oder belegte Tage inkl. Abreisetag
   - **Abgabenkonto MA 6** — geht in den Verwendungszweck ein
   - **Airbnb-Grundgebühr** und **UID hinterlegt** — steuern die Hochrechnung von der
     Auszahlung auf das Gastentgelt
4. Ergebnis als PDF drucken oder als CSV herunterladen

Erkannt werden deutsche und englische Spaltenüberschriften. Stornierte Buchungen
werden übersprungen, Aufenthalte über drei Monate als befreit mit 0 ausgewiesen.

## Rechenlogik

Jede Buchung wird in einzelne Nächte zerlegt. Jede Nacht bekommt den Satz, der an
diesem Datum gilt, und fällt in den Meldemonat, in dem sie beginnt. Das Entgelt
wird gleichmäßig auf die Nächte verteilt — bei stark schwankenden Nachtpreisen ist
das eine Näherung.

Angewendet werden die Schlüsselzahlen der Stadt Wien auf den Betrag **inklusive
enthaltener Ortstaxe**:

| Zeitraum | Satz | ohne USt | bei 10 % USt |
|---|---|---|---|
| bis 30.06.2026 | 3,2 % (nach 11 % Pauschalabzug) | 2,7691 % | 2,5237 % |
| ab 01.07.2026 | 5 % | 4,7619 % | 4,3478 % |
| ab 01.07.2027 | 8 % | 7,4074 % | 6,7797 % |

Bemessungsgrundlage ist das Beherbergungsentgelt ohne USt und ohne Ortstaxe — das
ist der Wert, der ins Formular gehört. Nach § 12 WTFG sind nur die Umsatzsteuer und
das Frühstück im ortsüblichen Ausmaß abzugsfähig (bis 30.06.2026 zusätzlich der
11 %-Pauschalabzug). Die Reinigungsgebühr ist **nicht** abzugsfähig — BFG vom
23.04.2024 zu RV/7400107/2023, Amtsrevision anhängig. Die von Airbnb einbehaltene
Servicegebühr ebenfalls nicht, weil es auf den Aufwand des Gastes ankommt und nicht
auf die Auszahlung; deshalb wird von der Auszahlung hochgerechnet.

Meldung und Zahlung sind jeweils am 15. des Folgemonats fällig, Verwendungszweck ist
Abgabenkontonummer + MMJJJJ des Aufenthaltsmonats.

### Geprüftes Beispiel

Buchung 18.06.2026 – 19.07.2026, 1.644,80 € Gastentgelt, ohne USt-Basis:

| Meldemonat | Nächte | Ortstaxe |
|---|---|---|
| 06/2026 | 13 | 19,10 € |
| 07/2026 | 18 | 45,48 € |
| **Summe** | **31** | **64,58 €** |

Gegengeprüft mit dem Ortstaxerechner der Stadt Wien.

### 90-Tage-Zähler

Die Wiener Bauordnung erlaubt seit 01.07.2024 höchstens 90 Tage kurzfristige
Vermietung pro Kalenderjahr ohne Ausnahmebewilligung nach § 129 Abs. 1a BO — nur
außerhalb einer Wohnzone und ohne Aufgabe des Wohnsitzes. Als Richtwert für
„kurzfristig" nennt die Stadt 2 bis 30 Tage: Aufenthalte bis 30 Nächte zählen voll,
darüber bis 3 Monate separat als Graubereich, längere gar nicht. Doppelt belegte
Tage zählen einmal.

Baurechtlich zählt bereits das *Anbieten* der Wohnung — leerstehende, aber
inserierte Tage sind hier nicht erfasst.

## Ohne Gewähr

Selbstgebautes Werkzeug zur Vorbereitung der eigenen Meldung, keine Steuerberatung.
Maßgeblich sind das WTFG und die Auskunft der MA 6.
