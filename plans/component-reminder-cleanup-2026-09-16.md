# Simplify physical components

Apply the decisions confirmed during the component-by-component review. App and game mechanics stay unchanged. Player folios and player helper stay byte-for-byte unchanged.

## Step 1 — Complete the agreed component pass

- Archive replaced component HTML, styles and map with working relative links.
- Remove Operation footer; remove Bonus type/footer labels and add Rev 27; remove scoring-card reminders and add Rev 27. Preserve effects, names and priority orders.
- Redesign party boards: left identity panel with approved motto and unnumbered vertical priorities (highest first); Party Closed well with visible external “Marker here = party open”; Operation pile; three Bonus wells to its right. Remove approved labels and party numbers.
- Remove the five approved map reminders; keep retention checks, totals, names and year/election track.
- Retire separate regional labels and PDF; remove from current print supply and redirect historical references to archive.
- Replace piece sheet with 18 generic 40 × 61 mm Firm cards (three identical per Firm), existing Early Bird and 22 mm text-free calendar Year marker on one A4 landscape sheet. No score markers, Collection counters, role labels or reference panels. Collection uses cubes; normal active Firm allocation remains unchanged.
- Remove both ledger reminder paragraphs. Update component inventory, decisions and changelog.
- Regenerate affected print exports, verify actual layout/dimensions and content invariants, run docs checks, get an independent agent review and fix findings. Commit the completed step.

## Completion

Step 1 complete.

- Archived previous component documents, relevant styles, map and physical-supply rule wording; historical links to retired region labels now target the archived sheet.
- `npm run docs:check` passes for all 227 HTML documents and generated assets; `git diff --check` passes.
- `bash scripts/export-print-assets.sh` passes all PDF page count, dimensions and embedded-font checks. Removed the retired regional-label PDF from the local print supply.
- Chromium print measurements found no overflow on all six party boards, 18 Firm cards, two markers, 54 Operation cards, 18 Bonus cards and 12 scoring cards. Firm cards remain 40 × 61 mm; markers remain 24 mm and 22 mm; boards remain 287 × 100 mm.
- Visually inspected the rendered party boards, marker sheet, Bonus cards, scoring cards and map. Eighteen Firm cards plus two markers fit one A4 landscape page.
- Content comparison confirms unchanged Bonus effects, Operation baselines, scoring issue values and party priority order; all approved quantities, revision marks and retained reminders are present.
- Independent review found no high/medium issues. Fixed both low documentation findings about old type labels and three-card supply.
- App/packages, current policy cards, folios and player helper remain byte-for-byte unchanged. Generated PDF exports remain local ignored artifacts, as before.
