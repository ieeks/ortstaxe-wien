# TODO

Grob nach Priorität. Die Issues im Repo sind die ausführliche Fassung.

## Mehrere CSVs kombinieren — nur ohne Anmeldung

→ [Issue #3](https://github.com/ieeks/ortstaxe-wien/issues/3)

Angemeldet ist der Punkt erledigt: der gespeicherte Bestand ist die Quelle, und
jeder Import führt zusammen statt zu ersetzen. Ohne Anmeldung ersetzt eine neue
Datei weiterhin den Bestand — für die Monatsmeldung egal, für den 90-Tage-Zähler
zu günstig gerechnet.

Zu tun wäre nur noch der Komfort auf dem CSV-Weg: `multiple` am File-Input, alle
`dataTransfer.files` statt `[0]`, additiv statt ersetzend, Deduplizierung über den
Bestätigungs-Code, Liste der geladenen Dateien mit ✕ und „Zurücksetzen". Wer den
Airbnb-Jahresexport zieht — er deckt den ganzen Kalenderjahreszeitraum ab —,
braucht das nicht.

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
