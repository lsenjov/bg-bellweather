# Ladder Bidding

Working repository for the board game currently titled **Ladder Bidding**.

Rival lobbying Firms use reusable Operation cards to influence six animal
political parties in the fictional Republic of Bellweather. Across twelve
years, players open parties, Operate, Collect public card piles, and Close
access before scoring fixed agendas in Elections after Years 4, 8, and 12.
The repository contains the printable design archive and a local,
server-authoritative web application for two to six human or API-controlled
players, including private hands and agendas, persistence, and completed-game
replay.

Start here:

- [`docs/index.html`](docs/index.html) — documentation home
- [`docs/design/vision.html`](docs/design/vision.html) — the pitch and target experience
- [`docs/rules/current-rules.html`](docs/rules/current-rules.html) — current rules, including explicit gaps
- [`docs/design/open-questions.html`](docs/design/open-questions.html) — the next decisions to make
- [`docs/playtesting/playtest-guide.html`](docs/playtesting/playtest-guide.html) — playtest and session guidance

Open `docs/index.html` directly in a browser. No build step or web server is
required.

## Run the web application

Requires Node.js 22 or newer.

```sh
npm install
npm run build
npm start
```

Open `http://127.0.0.1:4317`. The SQLite database is stored at
`data/ladder-bidding.sqlite` unless `BELLWEATHER_DATABASE` overrides it.

For source-reloading server and browser processes:

```sh
npm run dev
npm run dev:web
```

The browser development server runs at `http://127.0.0.1:5173` and proxies the
API to port 4317.

Automated seats can use the contract in
[`docs/playtesting/agent-api.html`](docs/playtesting/agent-api.html) and the
reusable client in `packages/testkit`. To launch the conservative example
agent:

```sh
BELLWEATHER_INVITE=ABC234XY npm run agent:example
```

Omit `BELLWEATHER_INVITE` to have the agent create a new table and print its
invite code and session.

## Validate the archive

Requires Node.js 22 or newer.

```sh
node scripts/check-docs.mjs
```

The check verifies document structure, local links, stylesheet references,
fragment targets, duplicate IDs, and reachability from the docs index.

## Export print assets

The exporter requires:

- Node.js 22 or newer, npm, and Playwright with its Chromium browser installed
- Inkscape and Ghostscript
- Fontconfig's `fc-match`
- Poppler's `pdfinfo` and `pdffonts`
- Noto Serif Black and Black Italic, Noto Sans Mono Black, Liberation Serif
  Bold, Liberation Sans Regular and Bold, and DejaVu Sans Book

Playwright may be installed locally or globally. Install its Chromium browser
for the same Playwright installation before exporting.

```sh
./scripts/export-print-assets.sh
```

The command validates every source, renders all print backgrounds, embeds or
outlines every font, and replaces the PDFs only after all page-count and
physical-size checks pass.

| PDF | Contents |
| --- | --- |
| `assets/print/ring-and-cross-district-map-a3.pdf` | One A3 landscape district map |
| `assets/print/campaign-score-trackers-a4.pdf` | One A4 landscape campaign and 0–40 score tracker sheet |
| `assets/print/party-boards-a4.pdf` | Three A4 landscape party-board sheets |
| `assets/print/player-folios-a4.pdf` | Three A4 portrait player-folio sheets |
| `assets/print/operation-cards-a4.pdf` | Four A4 portrait sheets containing the current 60-card Operation supply |
| `assets/print/scoring-cards-a4.pdf` | Two A4 portrait scoring-card sheets |
| `assets/print/shared-state-tokens-a4.pdf` | One A4 landscape sheet containing all shared state, Firm opening, Collection, and score pieces |

The A3 export keeps the 396 × 297 mm map artwork at 100% scale and centers it
with 12 mm side margins. The A4 exports preserve the millimetre dimensions in
their print CSS. Print every PDF at “Actual size” or 100%, with any “Fit to
page” option disabled.
