# Ortstaxe Wien

Rechnet aus einem Airbnb-Reservierungsexport die Wiener Ortstaxe pro Meldemonat
aus — inklusive der Satzwechsel zum 01.07.2026 und 01.07.2027, der Aufteilung
von Buchungen über den Monatswechsel und dem 90-Tage-Zähler der Bauordnung.

**→ https://manuel.tools/ortstaxe-wien/**

Kein Build-Schritt, keine Bundler, kein Framework — native ES-Module, so
ausgeliefert wie sie im Repo liegen. Die CSV wird ausschließlich im Browser
verarbeitet und nirgendwo hochgeladen.

    index.html            Markup und CSS
    js/kern.js            Rechenkern — reine Funktionen, kein DOM
    js/oberflaeche.js     alles mit document
    selftest.js           die Prüfungen, nur bei ?selftest geladen

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

`index.html?selftest` rechnet gegen dieselben Funktionen aus `js/kern.js`, die auch die Meldung
erstellen — die Schlüsselzahlen der MA 6, beide Stichtagsgrenzen samt dem amtlichen
Rechenbeispiel aus FAQ 3, Meldemonat, Drei-Monats-Befreiung inklusive der Monatsenden
nach § 902 ABGB, Hochrechnung, Rundung, Statusfilter, Betragsprüfung, Gebührengrenzen,
CSV-Parsing und den Rundlauf Export → Import. Die Anzahl der Prüfungen nennt die
Seite selbst; sie wird hier bewusst nicht doppelt gepflegt. Kein Build-Schritt.

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
zum 15. Februar die elektronische Abgabenerklärung für das Vorjahr — die Jahressummen
dafür weist das Tool unter der Monatstabelle aus.

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

## Monatsabschluss, Schutz und Belegpaket

Nach Anmeldung steht im Ergebnisbereich **Monatsabschluss & Belege** zur Verfügung:

1. Monat wählen, Hinweise prüfen und Vollständigkeit sowie Belegprüfung bestätigen.
2. **Geprüft abschließen** friert Buchungen, Einstellungen und Prüfbestätigungen ein.
   Das ist ein interner Prüfstatus, keine Bestätigung einer VIETour-Meldung.
3. Änderungen, neue Buchungen, Stornierungen oder Wiederherstellungen, die den
   geschlossenen Monat berühren, werden vor dem Schreiben abgewiesen. Bei
   Aufenthalten über Monatsgrenzen schützt der Abschluss die ganze Buchung.
   Auch abweichende Recheneinstellungen werden im Schreibweg des Objekts blockiert.
4. **Mit Grund wieder öffnen** gibt den Monat wieder frei. Der bisherige Abschluss
   und der Grund bleiben in der Abschlusshistorie gespeichert.
5. **Belegpaket als ZIP** enthält ein direkt erzeugtes PDF, eine UTF-8-Buchungs-CSV,
   Abschlussdaten und Einstellungen als JSON. Die Buchungs-CSV enthält vollständige
   Aufenthalte; die Summe im PDF gilt nur für den gewählten Monat. Airbnb-Originalbelege
   sind nicht enthalten. Das PDF nutzt WinAnsi; andere Schriftzeichen bleiben in CSV/JSON erhalten.

Der **Änderungsverlauf je Buchung** beginnt mit Einführung dieser Version. Er zeigt
Import, manuelle Änderung, Wiederherstellung und Löschen mit Vorher-/Nachher-Werten.
Unveränderte Buchungen erzeugen keinen neuen Eintrag. Bestehende alte Änderungen
werden nicht nachträglich erfunden. Das Protokoll ist keine zertifizierte revisionssichere Archivierung.

### Speicherung und Rollout

- Neue Pfade je Objekt: `verwaltung/aktuell`, `verlauf/{id}` und `abschlusshistorie/{id}`.
- Buchungsänderungen, Verlauf, Einstellungen und Objektversion werden in einer
  Firestore-Transaktion gemeinsam geschrieben. Monatsabschluss und Wiederöffnen
  verwenden dieselbe Objektversion; konkurrierende Änderungen erfordern erneutes Laden.
- Änderungen und Abschlüsse benötigen eine Serververbindung. Offline bleibt die
  CSV-Berechnung verfügbar; ein fehlgeschlagener Import stellt die vorherige Anzeige wieder her.
- Maximal 400 geänderte Buchungen je Vorgang, maximale JSON-Nutzlast eines
  Protokoll-/Verwaltungsdokuments 700 kB. Größere Vorgänge werden vollständig
  abgelehnt, statt einen Teilbestand zu schreiben. Unveränderte Zeilen zählen nicht mit.
- **Rules und Anwendung gemeinsam ausrollen.** Die neuen Rules verlangen für jeden
  Buchungsschreibvorgang die atomar erhöhte Objektversion. Alte offene Tabs müssen
  nach dem Rollout neu geladen werden. Die Rules wurden nicht automatisch produktiv deployt.
- Die Monatssperre ist eine Schutzfunktion der Anwendung. Der Eigentümer kann über
  eigene API-Clients oder die Firebase-Administration Daten verändern; sie ist keine
  Berechtigungsgrenze gegen den Eigentümer selbst. Neue Protokolle können über die
  Client-Rules nicht überschrieben oder gelöscht werden.
- Eingefrorene Abschlüsse sind die maßgebliche Ablage für geschlossene Monate.
  Die allgemeine Rechneransicht verwendet weiterhin die aktuellen Einstellungen;
  im Abschlussbereich wird eine abweichende aktuelle Summe ausdrücklich angezeigt.

### Tests

```sh
node test/node-selftest.mjs
node test/daten-transaktionen.mjs
node test/integration.mjs
```

Der Node-Transaktionstest führt den echten Datenzugriffscode mit einem simulierten SDK
und kontrollierten Commitfehlern aus. Die Chromium-Integration verwendet die sichtbare
Oberfläche und eine Datenbankattrappe. Beides ersetzt nicht den Rules-Test gegen den
Firestore-Emulator oder einen Test der echten Anmeldung.

Rules-Prüfung im lokalen Demo-Emulator (kein Zugriff auf das Produktivprojekt):

```sh
java -jar firestore.jar --host 127.0.0.1 --port 8088 --project_id demo-ortstaxe-review --rules firestore.rules
# In einer zweiten Konsole:
node test/firestore-regeln.mjs
```

Validiert: 370 Selbsttests, 19 Prüfungen des Transaktionscodes, 76 Browserprüfungen
und 14 Zugriffsprüfungen gegen den Firestore-Emulator. Die echte Google-Anmeldung
und ein produktiver Rollout sind nicht Teil dieser Validierung.
