# Party and lobbying-house colour systems

## Goal

Separate persistent party state from temporary lobbying-house ownership at a glance while matching the colours available for the physical prototype.

## Committed direction

- Assign the prototype party colours as follows:
  - Honeycomb Cooperative: yellow
  - Old Shell Union: green
  - Foxglove League: pink
  - Riverworks Party: blue
  - Many Wings Coalition: orange
  - Night Parliament: black
- Reserve saturated colour for party identity and persistent party state.
- Render lobbying houses as warm-paper stationery with low-saturation pastel tints.
- Keep charcoal numbers, emblems, and house-specific patterns as the primary lobbying-house identifiers.
- Permit lobbying-house tints to reuse party hues because saturation, layout, typography, numbering, emblems, and patterns distinguish the two component families.

## Implementation

1. Record the colour assignments and visual hierarchy in the decision log, component specifications, and changelog.
2. Update the party tracking boards and scoring-card objectives to use the six prototype colours consistently.
3. Update lobbying-house boards, counterbid covers, opening markers, and score markers to use pastel stationery tints with charcoal identity marks.
4. Run document checks, render the affected print sheets, inspect them in colour and grayscale, and correct any legibility or layout regressions.
5. Obtain an independent review and resolve every high- or medium-severity finding.

## Validation

- Party boards and scoring-card objectives use the same party assignment.
- Lobbying-house components contain no large saturated identity fields.
- House emblems, numbers, labels, and patterns remain readable without colour.
- Yellow and orange party panels use dark text; green, pink, blue, and black panels maintain sufficient text contrast.
- Print dimensions and pagination remain unchanged.
- Local links and document structure pass the repository checks.
