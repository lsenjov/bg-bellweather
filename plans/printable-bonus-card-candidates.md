# Printable bonus-card candidates

## Goal

Produce a print-ready HTML and PDF set for all 106 Bonus-card candidates while leaving the current twelve-card Ruleset 21 sheet unchanged.

## Constraints

- Preserve the current 40 × 61 mm card geometry, party palette, watermark, typography, and `R21` footer.
- Add only a small outlined `C` badge to distinguish candidates after cutting.
- Keep candidates in report order, grouped by party, at twelve cards per A4 portrait sheet.
- Treat the report as the source of candidate names, families, effects, and ordering.

## Steps

1. Checkpoint the reviewed 106-candidate report that supplies the printable content.
2. Add a repeatable generator, candidate-only print styling, and a nine-sheet printable HTML document.
3. Add the candidate sheet to the print export pipeline, generate and link its PDF, and validate card geometry, page count, fonts, and document references.
4. Review the implementation and resolve every high- or medium-severity finding.

