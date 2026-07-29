# Ladder Bidding

Working repository for the board game currently titled **Ladder Bidding**.

Rival lobbying houses use Clout and operatives to influence six animal political
parties in the fictional Republic of Bellwether. The game is at pre-prototype
stage; a printable map of sixteen named districts, Support actions, and all
twelve party bonuses are committed, while starting Support, elections,
government formation, and victory remain open.
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

## Export the A3 game board

Requires Inkscape, Ghostscript, Fontconfig's `fc-match`, Poppler's `pdfinfo`,
and the Noto Serif Black, Noto Serif Black Italic, and Noto Sans Mono Black
font faces.

```sh
./scripts/export-game-board-a3.sh
```

The command exports `docs/assets/ring-and-cross-district-map.svg` to
`assets/print/ring-and-cross-district-map-a3.pdf`. It keeps the 396 × 297 mm
artwork at 100% scale, centers it on one 420 × 297 mm A3 landscape page, and
converts the pinned Noto fonts to paths for portable printing. The command
rejects the export if the source artwork is no longer 396 × 297 mm. Print the
PDF at “Actual size” or 100%, with any “Fit to page” option disabled.
