# Territorial district map

## Objective

Replace the node-map presentation with a named territorial map while preserving
the selected ring-and-cross adjacency graph and capacity distribution.

## Visual direction

- Render the twelve outer districts as an irregular continuous land ring with
  shared borders.
- Render the three inner districts as causeways crossing Crownwater to
  Bellwether Centre.
- Treat a shared border segment as adjacency; meeting only at a point or across
  water does not create adjacency.
- Keep the three six-spot districts grey and retain the existing 6/4/3/2
  capacity pattern.
- Use civic-atlas typography and restrained geographic texture so pieces and
  spot counts remain readable in print.

## District names

- Northreach
- Cloverfield
- Harbormouth
- Millbank
- Reedwater
- Sunmeadow
- Grand Market
- Red Orchard
- Westgate
- Mossfield
- Ironwood
- High Pastures
- Crown Road
- Canal Ward
- Old Quarter
- Bellwether Centre

## Steps

1. Archive the node map and replace it with an A3-printable territorial SVG
   whose named shapes, shared borders, and Support spots preserve the current
   graph.
2. Update the board specification, rules, glossary, decision log, open
   questions, playtest guide, and changelog for named districts and
   shared-border adjacency.
3. Validate SVG structure and documentation, inspect color and grayscale
   renders, then obtain a fresh review and correct all high- and
   medium-severity findings.

## Validation

- Sixteen named district shapes are present exactly once.
- Capacity distribution remains six × 2, one × 3, six × 4, and three × 6.
- The map contains fifty-seven Support spots.
- Every former graph edge is represented by a shared border and no decorative
  terrain implies additional adjacency.
- Labels remain legible without relying on color.
- The SVG fits A3 landscape and retains approximately 10 mm Support spots.
- Documentation validation and whitespace checks pass.
