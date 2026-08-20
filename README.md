# Ortstaxe Wien

Rechnet aus einem Airbnb-Reservierungsexport die Wiener Ortstaxe pro Meldemonat
aus — inklusive der Satzwechsel zum 01.07.2026 und 01.07.2027, der Aufteilung
von Buchungen über den Monatswechsel und dem 90-Tage-Zähler der Bauordnung.

**→ https://manuel.tools/ortstaxe-wien/**

Eine einzige HTML-Datei, kein Build, keine Abhängigkeiten außer den Google Fonts.
Die CSV wird ausschließlich im Browser verarbeitet und nirgendwo hochgeladen.

## Benutzung

1. Bei Airbnb → **Reservierungen** → **Exportieren** die CSV herunterladen
2. Die Datei auf das Feld ziehen oder anklicken und auswählen
3. Optionen prüfen:
   - **Betragsbasis** — ob die Spalte „Einkünfte" ohne USt oder inkl. 10 % USt geführt ist
   - **90-Tage-Zählung** — Nächte oder belegte Tage inkl. Abreisetag
   - **Abgabenkonto MA 6** — geht in den Verwendungszweck ein
   - **Airbnb-Grundgebühr** und **UID hinterlegt** — rechnen von der Auszahlung auf
     den von dir verrechneten Betrag hoch
   - **Gast-Servicegebühr** — der Aufschlag, den Airbnb dem Gast zusätzlich verrechnet.
     Steht nicht in der CSV, muss aus der Airbnb-Abrechnung kommen. Bei Direktbuchungen
     und beim Modell „Gastgeber trägt die ganze Gebühr“ auf 0 setzen
4. Ergebnis als PDF drucken oder als CSV herunterladen

Erkannt werden deutsche und englische Spaltenüberschriften. Stornierte, abgelehnte,
abgelaufene und noch nicht bestätigte Buchungen werden übersprungen — findet kein
entgeltlicher Aufenthalt statt, fällt keine Ortstaxe an (FAQ 9).

Aufenthalte über mehr als drei Monate ununterbrochen sind nach § 11 Abs. 3 WTFG
befreit, und zwar **zur Gänze**: befreit ist die Person, nicht bloß der Zeitraum
jenseits der drei Monate. Die Frist endet nach § 902 ABGB am Monatsletzten, wenn der
Anreisetag im Zielmonat fehlt — drei Monate ab 31.03. enden mit Ablauf des 30.06. Wer
die Befreiung geltend macht, hat die maßgeblichen Umstände nachzuweisen.

## Selbsttest

`index.html?selftest` rechnet 67 Prüfungen gegen dieselben Funktionen, die auch die
Meldung erstellen — die Schlüsselzahlen der MA 6, beide Stichtagsgrenzen samt dem
amtlichen Rechenbeispiel aus FAQ 3, Meldemonat, Drei-Monats-Befreiung inklusive der
Monatsenden nach § 902 ABGB, Hochrechnung, Rundung, Statusfilter und CSV-Parsing.
Kein Build-Schritt, keine zweite Datei.

Vor jeder Änderung an der Rechnung einmal aufrufen; **„0 fehlgeschlagen“ ist die
Bedingung zum Commit.** Ein Testfall kann als bekannter, noch nicht behobener Bug
markiert werden — der zeigt „!“, gilt nicht als Fehlschlag und springt auf „△“, sobald
der Fix greift. Aktuell ist keiner markiert.

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
ist der Wert, der ins Formular gehört. § 12 Abs. 1 WTFG: „Bemessungsgrundlage ist das
Entgelt für den Aufenthalt im Sinne des § 11.“ Nicht dazu gehören nach Abs. 2 nur die
Umsatzsteuer und das Frühstück im ortsüblichen Ausmaß; bis 30.06.2026 kam der
11 %-Pauschalabzug dazu, der mit der ersten Stufe entfallen ist.

Sonst ist nichts abzugsfähig. Hinein gehören insbesondere:

- die **Reinigungsgebühr** — MA-6-FAQ Frage 15, ebenso BFG vom 23.04.2024 zu
  RV/7400107/2023
- **Zuschläge** wie Late Check-out, Early Check-in, Upgrade oder Haustier — FAQ 13
- die einbehaltene **Gastgeber-Servicegebühr**, weil es auf den Aufwand des Gastes
  ankommt und nicht auf die Auszahlung — deshalb wird hochgerechnet
- die **Gast-Servicegebühr** der Plattform — FAQ 16: Service- und Plattformgebühren,
  die dem Gast in Rechnung gestellt werden, sind „ein Entgeltbestandteil des
  Beherbergungsentgelts im Sinne des § 12 WTFG“

Garage, Wellness oder Barkonsumation, die erst vor Ort separat anfallen, zählen in der
Regel nicht dazu.

Meldung und Zahlung sind jeweils am 15. des Folgemonats fällig (§ 13 Abs. 1 WTFG),
Verwendungszweck ist Abgabenkontonummer + MMJJJJ des Aufenthaltsmonats. Dazu kommt bis
zum 15. Februar die elektronische Abgabenerklärung für das Vorjahr — die deckt das Tool
noch nicht ab.

### Geprüftes Beispiel

Buchung 18.06.2026 – 19.07.2026, 1.644,80 € Gastentgelt, ohne USt-Basis, beide
Gebührenfelder auf 0 (der Betrag ist bereits das, was der Gast aufwendet):

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
