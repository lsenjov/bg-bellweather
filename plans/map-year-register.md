# Map year register

## Goal

Move the six-year campaign register onto the A3 district-map sheet without shrinking or repositioning the district diagram. Leave the 0–40 Firm score track on its own A4 sheet.

## Implementation

1. Add a 3 × 2 register to the map’s lower-right corner using the existing 27 mm Year-marker spaces: Y1/Y3/Y5 above a Midterms rule and Y2/Y4/Y6 above an Elections rule. Connect the spaces in chronological column order, preserve the map transform and Coalition summary, and update the map revision to R22.
2. Remove the duplicate Year register from the A4 tracker source, centre the unchanged 0–40 score snake, and update the active component documentation, design decision, changelog, print manifest, and archive record.

## Verification

- Validate the SVG and documentation links.
- Regenerate the A3 map and A4 score PDFs.
- Confirm both remain one-page at their existing physical sizes with embedded or outlined fonts.
- Inspect both rendered PDFs at print scale for marker fit, sequence clarity, clearance, clipping, and unchanged map geometry.
- Run the complete repository check and obtain an independent review with no high or medium findings.
