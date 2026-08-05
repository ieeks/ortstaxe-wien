# TODO

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

## Jahresübersicht

Für die Jahressteuererklärung, fällig am 15.02. des Folgejahres: Summe der
Bemessungsgrundlagen und der Abgabe pro Kalenderjahr, abgestimmt auf die bereits
monatlich gemeldeten Beträge.

## Manifest + Icon

`manifest.json` und ein Icon, damit sich die Seite am iPhone zum Homescreen
hinzufügen lässt. Kollidiert mit der Single-File-Regel — das Manifest darf als
zweite Datei danebenliegen, `index.html` bleibt in sich geschlossen.
