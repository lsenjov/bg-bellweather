# Player sheets, voting reminders and firm shields

## Step 1 — Complete the physical player kit

- Archive the combined folios, their styles and affected component specifications with working relative links.
- Replace each 200 × 90 mm folio with separate 100 × 90 mm public and private sheets. Public: covered New Year pile and Collection cubes. Private: exact 40 × 61 mm Private Priorities well and four blank, unlabelled spaces in a 2 × 2 grid.
- Supply four yes reminder markers per human player, including at 2–3 players. Reminders are freely used, entirely private and have no gameplay effect.
- Create six illustrated office-front shields, each with a 120 mm front, 80 mm side wings and 110 mm height, with quiet matching interiors. Use straight cuts and two folds; keep physical stability and seated privacy as open prototype checks.
- Add printable HTML/CSS/vector art and PDF export entries, assembly guidance, inventory/navigation updates, decisions and changelog. Keep the public sheet outside the shield and the private sheet inside.
- Export and inspect the affected PDFs, check dimensions, counts, artwork and local links. Get an independent agent review, resolve high/medium findings and fix low documentation findings before committing this step.

## Validation

Step 1 complete.

- Archived the combined folios, their CSS and PDF, plus the affected component and setup specifications with working relative links.
- Added twelve separate 100 × 90 mm sheets, 24 blank 18 × 18 mm reminder spaces, 24 square 16 × 16 mm yes markers, and six shields with matching interiors. Card wells remain exactly 40 × 61 mm; Collection wells remain 14 mm.
- Full `scripts/export-print-assets.sh` export passed page count, page size and embedded-font checks. The new shield PDF contains twelve A4 landscape pages; folios use two A4 portrait pages and markers use one. Current PDFs remain ignored local build outputs, consistent with the repository convention.
- Chromium print measurements confirmed all component dimensions and counts. No component clipping or browser errors. Fold-guide ticks intentionally extend outside the shield cut rectangle.
- Visually inspected both folio pages, the marker page, all six shield exteriors, the interior treatment, and a rasterized final shield PDF page. Exterior and interior cut rectangles share centred 280 × 110 mm geometry and 80/120/80 mm fold positions.
- `npm run docs:check` passes for 238 HTML documents and generated assets. `git diff --check`, exporter shell syntax and the scoring-document generator syntax pass.
- Independent agent review reported no high/medium findings. Fixed both low documentation findings: score the shield before cutting away its guides, and identify the scoring-card well on the separate private sheet. Updated the latter's generator copy too.
- Seated sightlines, cardstock stability and printer duplex registration remain explicitly documented physical prototype checks.
