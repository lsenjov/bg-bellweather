# Three-region map prototypes

Create three reviewable concept maps, without adopting a production map.

- [x] Generate three SVG territory maps and an HTML comparison page; link from the design index. Validate capacity, connectivity, Centre contact, and presentation; obtain an independent review and resolve findings; commit the complete prototype set.

Design: white paper, dark navy ink (#19354b), blue urban (#d5e7f5), green mixed (#dbeaca), yellow outlying (#f5e7ac), neutral Centre (#e4dfea). Use system sans-serif for maps and Georgia for page titles. Make the territories the main visual, with quiet supporting text and direct SVG links. Thick boundaries distinguish regions; district labels and Support circles retain meaning without color.

The three studies compare a compact hub, a rural fringe, and a city corridor. All use urban 6+6+6, mixed 6+4+4+2+2, and outlying 4+4+2+2+2+2+2. Centre retains its current capacity of 3 as a prototype assumption. Boundaries and names remain proposals. The design uses territorial polygons rather than a generic network diagram so shared borders can be reviewed directly.

Validation completed: all three district and region graphs are connected; capacities and Centre contacts verified during generation and independently from final SVGs. All three SVGs inspected in browser; HTML checked at a 546px viewport with all images loaded and no horizontal overflow. `npm run docs:check` passes (113 HTML files). Independent review: no high, medium, or low findings.
