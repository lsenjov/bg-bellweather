# Paired reversible reminder markers

## Step 1 — Update the physical reminder kit

- Archive the preceding token sheet, private-sheet layout, styles, affected specifications and PDFs with working relative links.
- Supply 24 reversible Yes/No markers (check/cross) and 24 reversible range markers (1–2/3+). Each human gets four of each, including at 2–3 players. Both types remain optional private reminders with no gameplay effect or prescribed meaning.
- Keep markers 16 × 16 mm and arrange each set in a gapless block of 24. Use two physical A4 landscape sheets: existing Firm/public pieces with a blank reverse, then the two marker blocks with horizontally registered backs. The four-page PDF prints duplex with short-edge binding.
- Keep folios 100 × 90 mm. Put the Private Priorities card well landscape (61 × 40 mm) beside the private firm header and four blank 36 × 20 mm pair spaces in a 2 × 2 grid below. Preserve the public sheet and its upside-down header.
- Remove “Public Affairs” from the One Fell Swoop and IVy League folio headers as subsequently requested; retain their other identity details and the public header orientation.
- Update component inventory, setup wording, shield assembly references, navigation, print exporter, decisions and changelog. Do not change the helper's gameplay reference or introduce voting mechanics for reminders.
- Verify marker counts, front/back pairing and geometry, slot fit, sheet dimensions, content preservation and PDF pages/fonts. Inspect actual prints in the browser/PDF, obtain an independent review, resolve findings and commit the completed step.

## Validation

Step 1 complete.

- Archived the previous token/folio sources, styles, specifications and PDFs with working relative links.
- Added 24 faces each of ✓, ✕, 1–2 and 3+: 48 physical reversible markers. Each face stays 16 × 16 mm in a gapless 6 × 4 block. Browser geometry checks matched all 48 front faces to the correct horizontally registered reverse for short-edge landscape duplex.
- The shared-token PDF contains four A4 landscape pages for two physical sheets. Page 2 is intentionally blank, verified in both print rendering and PDF text extraction. Existing Firm cards, Early Bird and Year markup remain unchanged.
- All six private sheets measure 100 × 90 mm with 61 × 40 mm landscape card wells and four 36 × 20 mm reminder spaces. Each space fits two 16 mm markers plus a 1 mm gap, leaving more than 1 mm horizontal and 1.5 mm vertical clearance inside the border. No content overflow or browser errors.
- Compared the public sheets with the archive: only the requested Public Affairs subtitle was removed. Header rotation, other firm names and physical areas are unchanged.
- Visually inspected both folio pages, the existing Firm-piece page, and the front/back reminder blocks, including rasterized PDF pages.
- Full `scripts/export-print-assets.sh` run passed all page-count, page-size and embedded-font checks. Current PDFs remain ignored local build outputs.
- `npm run docs:check` passes for 259 HTML documents and generated content. `git diff --check` and the modified scoring-document generator syntax check pass.
- Independent review returned no high, medium or low findings. Printer registration, material thickness and physical handling remain covered by the plain-paper/cardstock print check in the assembly instructions.
