# Ladder Bidding

Working repository for the board game currently titled **Ladder Bidding**.

Rival lobbying firms use Clout and operatives to influence six animal political
parties in the fictional Republic of Bellwether. The game is at pre-prototype
stage; a printable map of sixteen named districts, Support actions, and all
twelve party bonuses are committed. Coalition partners share Election Day
scoring, players may trade Clout and operation tokens, and immediate deals are
binding while future promises are not. Starting Support and tie-breakers remain
open.
The documents deliberately separate committed rules, working hypotheses, and
open questions.

Start here:

- [`docs/index.html`](docs/index.html) — documentation home
- [`docs/design/vision.html`](docs/design/vision.html) — the pitch and target experience
- [`docs/rules/current-rules.html`](docs/rules/current-rules.html) — current rules, including explicit gaps
- [`docs/design/open-questions.html`](docs/design/open-questions.html) — the next decisions to make
- [`docs/playtesting/playtest-guide.html`](docs/playtesting/playtest-guide.html) — prototype and session guidance

Open `docs/index.html` directly in a browser. No build step or web server is
required.

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
| `assets/print/party-boards-a4.pdf` | Three A4 landscape party-board sheets |
| `assets/print/lobbying-firm-boards-a4.pdf` | Three A4 portrait player-board sheets |
| `assets/print/lobbying-firm-tokens-a4.pdf` | Three A4 landscape firm-token sheets |
| `assets/print/operation-tokens-a4.pdf` | One A4 portrait operation-token sheet |
| `assets/print/scoring-cards-a4.pdf` | Two A4 portrait scoring-card sheets |
| `assets/print/pecking-order-a4.pdf` | Two A4 landscape Pecking Order sheets |

The A3 export keeps the 396 × 297 mm map artwork at 100% scale and centers it
with 12 mm side margins. The A4 exports preserve the millimetre dimensions in
their print CSS. Print every PDF at “Actual size” or 100%, with any “Fit to
page” option disabled.
