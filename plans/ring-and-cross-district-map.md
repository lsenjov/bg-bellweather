# Ring-and-cross district map

## Objective

Create the first playable district map from the supplied ring-and-cross sketch
as a printable visual component, and record its prototype measurements
consistently across the live documents.

## Committed prototype values

- Twelve districts form the outer ring.
- One central district connects to three inner spoke districts.
- The spoke districts connect to the outer ring at north, southeast, and
  southwest.
- Three evenly spaced outer districts have six Support spots each.
- The six outer districts neighboring those large districts have four Support
  spots each.
- The central district has three Support spots.
- The three spoke districts and three remaining outer junction districts have
  two Support spots each.
- The map has sixteen districts, eighteen connections, and fifty-seven Support
  spots in total.
- District names, Support supply, and starting occupation remain open.

## Steps

1. Create a print-friendly SVG board matching the supplied topology, embed it
   in the board specification, and add only the styles needed to present and
   print it clearly.
2. Update the live rules, decision log, open questions, playtest guide,
   changelog, index, and repository overview with the new prototype values.
3. Run structural and visual checks, then obtain a fresh review and correct all
   high- and medium-severity findings.

## Validation

- The SVG contains sixteen districts and fifty-seven visible Support spots.
- The outer ring has twelve connections; the center and spokes add six.
- The three six-spot districts are evenly separated by three outer districts.
- Each six-spot district's two ring neighbors has four spots.
- The central district has three spots; every remaining district has two.
- The map remains legible in color, grayscale, and at narrow viewport widths.
- Documentation validation and whitespace checks pass.
