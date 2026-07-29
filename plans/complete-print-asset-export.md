# Complete print asset export

## Objective

Expand the A3 district-map exporter into one command that regenerates every
printable prototype component as a validated PDF.

## Export set

- District map: one A3 landscape page.
- Party boards: three A4 landscape pages.
- Lobbying house boards: three A4 portrait pages.
- Lobbying house tokens: three A4 landscape pages.
- Operation tokens: one A4 portrait page.
- Scoring cards: two A4 portrait pages.
- Pecking Order board and tokens: two A4 landscape pages.

## Steps

1. Replace the board-only command with a unified exporter. Retain the existing
   Inkscape/Ghostscript board path, add a Playwright/Chromium HTML print helper,
   and validate every output’s page count and physical page size before
   installation.
2. Pin the fonts used by all printable HTML sources, generate the complete PDF
   set, and inspect every rendered page for clipping, missing backgrounds, and
   unintended layout changes.
3. Add print-ready PDF links and regeneration guidance to the component
   documents, README, and changelog.
4. Run repository validation and independent review. Resolve every high- or
   medium-severity finding and report low-severity findings before continuing.

## Validation

- One command creates all seven PDFs under `assets/print/`.
- The PDFs contain fifteen pages in total with the declared A3/A4 orientation.
- Source dimensions are preserved at 100% scale.
- HTML print backgrounds and vector artwork remain present.
- Every PDF embeds or outlines its fonts.
- Re-exported component pages are visually unchanged after font pinning.
- Documentation links and repository whitespace checks pass.
