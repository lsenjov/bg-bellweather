# Tapered firm shields with integrated helper

## Step 1 — Replace the shield and move the helper inside

- Archive the office-front shield artwork, HTML/CSS/PDF, standalone player helper and affected component specifications with working relative links.
- Use each Firm’s established colour/pattern on the exterior. Repeat the emblem, full name and motto on the centre and both wings, smaller on the wings.
- Keep the 120 × 110 mm centre rectangular and each wing 80 mm wide. Lower each wing’s outer top corner by 30 mm and raise its outer bottom corner by 10 mm; join to the full-height fold with straight diagonal cuts.
- Rotate the public folio's firm header 180° for the other players; keep its New Year and Collection areas upright. Remove the Public/Private labels from every folio header, retaining firm identity only.
- Move the entire existing helper onto the inside, rearranging it for readability and keeping text clear of folds and sloping cuts. Retire the separate helper from the active print supply. Omit the redundant one-scoring-card-per-player sentence as subsequently requested.
- Print full-height dashed vertical fold lines on both faces. Verify the helper's bottom paragraph is fully visible in the exported PDF; the early layout clipped it, so it now spans the centre beneath both reference columns.
- Stand the shield with its wings folded back and a slight backward lean, as clarified by the user. At right-angle folds, the 10 mm rise over 80 mm corresponds to about 7° of lean, bringing the sloping bottom edges onto the table. No separate supports.
- Update assembly guidance, inventory, export integration, navigation, decisions and changelog. Preserve gameplay mechanics, sheet dimensions, card/marker areas and yes markers.
- Export and visually inspect all six shields; check helper content coverage, print dimensions, fold/cut registration, type sizes, links and generated output. Obtain an independent agent review, fix findings, then commit this completed step.

## Validation

Step 1 complete.

- Archived the previous office artwork, shield and helper HTML/CSS/PDFs, affected specifications and original folio headers. Historical links to the retired helper now resolve to the archive; archive folio links stay within the snapshot.
- Generated six branded exteriors and six helper interiors from one helper template. All three exterior panels repeat their Firm identity, using the established palette, patterns and emblems. The standalone helper and old office assets are removed from the active print suite.
- Applied the exact tapered cut shape and full-height dashed fold lines at 80 mm and 200 mm on both faces. Assembly uses the user-confirmed backward lean, with no extra supports.
- Rotated all six public folio headers 180° and removed both header labels. All twelve sheets remain 100 × 90 mm, card wells 40 × 61 mm and reminder spaces 18 × 18 mm.
- Full PDF export passed page count, physical-size and embedded-font validation. The shield PDF remains twelve A4 landscape pages; folios remain two A4 portrait pages. Re-exported and checked the final helper after the requested sentence removal. Current PDFs remain ignored local build outputs.
- Compared all six helper interiors against the archived helper: all reference content is retained except the explicitly removed one-scoring-card-per-player sentence. The Party/Global and turn-end reminders are present in all six final PDF interiors.
- Chromium checked 483 text rectangles: none crosses a fold or cut, with a minimum 4.73 mm cut clearance. Helper body text is 8 pt. Both 110 mm fold paths are present on all twelve faces. No browser errors or failed requests; the page header fits a 390 px viewport and actual-size print sheets scroll within their preview.
- Visually inspected all six exteriors, the helper layout, public-header rotation and the final rasterized PDF interior. Fixed the early helper clipping by moving the law paragraph across the centre beneath both columns and tightening spacing.
- `npm run docs:check` passes for 245 HTML documents, generated shields and existing generated assets. Generator syntax, exporter shell syntax and `git diff --check` pass.
- Independent review found no high/medium issues; fixed the low archive-link finding. Final follow-up review of the user-requested sentence removal and documentation returned no findings.
- Cardstock stability, folded reading and seated privacy remain physical prototype checks.
