# Projektkontext — ortstaxe-wien

## Was das ist

Single-File-Tool, das eine Airbnb-Reservierungs-CSV einliest und daraus die Wiener
Ortstaxe pro Meldemonat berechnet. Läuft per Doppelklick im Browser und über
GitHub Pages unter https://ieeks.github.io/ortstaxe-wien/

## Harte Regeln

- **Eine einzige Datei.** Alles steckt in `index.html` — Markup, CSS im `<style>`,
  JS im `<script>`. Nicht in separate `.css`/`.js`-Dateien aufsplitten.
- **Kein Build-Schritt.** Kein npm, kein Bundler, kein Framework. Einzige externe
  Abhängigkeit sind die Google Fonts per CDN.
- **Kein localStorage, kein sessionStorage.** Auch nicht „nur für die Einstellungen".
- **Deutschsprachige UI.** Auch Fehlermeldungen und Hinweistexte.
- **Schriften:** IBM Plex Sans, IBM Plex Sans Condensed, IBM Plex Mono.
- Änderungen gehen immer direkt in `index.html`.

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

## Aufbau von index.html

- `parseCSV` — eigener Parser, kommt mit `,` und `;` sowie Quotes zurecht
- `findCol` — normalisiert Spaltennamen, matcht DE und EN, dann Teilstring-Fallback
- `compute` — zerlegt jede Buchung in Nächte, ordnet Satz und Meldemonat zu
- `occupancy` / `renderQuota` — 90-Tage-Zähler der Bauordnung, getrennt nach
  `kurz` (bis 30 Nächte), `grau` (31 Nächte bis 3 Monate) und `lang` (befreit)
- `render` — Monatstabelle, Überweisungen, Buchungsdetail, Warnhinweise
- Print-CSS erzeugt die PDFs, `body.print-months` blendet für die Kurzfassung aus

## Offene Punkte

Siehe `TODO.md` und die Issues im Repo.
