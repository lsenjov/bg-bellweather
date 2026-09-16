# Cube-fit physical map and integrated policy display

One implementation step, committed after verification and independent review:
- Archive the previous physical SVG/PDF, board specification and generator.
- Render in millimetres: use 13 mm support slots with visible retained rims and 15 mm spacing for 8 mm cubes (about 12 mm diagonally).
- Compact the land map while preserving every district, capacity and adjacency. Aim to fit two full-size 63 × 88 mm policy cards on each side of an A3 landscape sheet; prioritize token clearance and label legibility over squeezing.
- Preserve checks, random-retention reminder and six Year spaces large enough for the existing 22 mm marker. Update component instructions and design history; leave app unchanged.
- Validate exact print dimensions, all slot/border and slot/slot clearances, label and card fit, generated files and docs. Inspect an actual-size PDF and an occupied-board mockup. Obtain independent review and fix high/medium findings before committing.

Completed: 264 × 210 mm land map on landscape A3 with two 63 × 88 mm policy wells per side. All 51 slots are 13 mm diameter on 15 mm centres; the 27 green rings have a 12 mm clear interior and 14 mm outer diameter. Slot centres maintain at least 7.5 mm to district borders. Year spaces are 24 mm. Preserved every district polygon/capacity/adjacency; JSON changes only add print anchors. Verified actual browser text bounds, SVG physical dimensions and full-size card/Year footprints, inspected the A3 PDF and a fully occupied mockup with 8 mm squares rotated 0/45 degrees. Documentation and generator checks pass; independent review found no high, medium or low issues. App and shared game content unchanged.
