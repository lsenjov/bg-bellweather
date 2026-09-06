# Three-region map prototypes

Create three reviewable concept maps, without adopting a production map.

- [x] Generate three SVG territory maps and an HTML comparison page; link from the design index. Validate capacity, connectivity, Centre contact, and presentation; obtain an independent review and resolve findings; commit the complete prototype set.

Design: white paper, dark navy ink (#19354b), blue urban (#d5e7f5), green mixed (#dbeaca), yellow outlying (#f5e7ac), neutral Centre (#e4dfea). Use system sans-serif for maps and Georgia for page titles. Make the territories the main visual, with quiet supporting text and direct SVG links. Thick boundaries distinguish regions; district labels and Support circles retain meaning without color.

The three studies compare a compact hub, a rural fringe, and a city corridor. All use urban 6+6+6, mixed 6+4+4+2+2, and outlying 4+4+2+2+2+2+2. Centre retains its current capacity of 3 as a prototype assumption. Boundaries and names remain proposals. The design uses territorial polygons rather than a generic network diagram so shared borders can be reviewed directly.

Validation completed: all three district and region graphs are connected; capacities and Centre contacts verified during generation and independently from final SVGs. All three SVGs inspected in browser; HTML checked at a 546px viewport with all images loaded and no horizontal overflow. `npm run docs:check` passes (113 HTML files). Independent review: no high, medium, or low findings.

## Revision: density and distance

- [x] Archive the first concepts; redraw compact connected city districts and broader rural areas, separate the mixed region's city from the urban cluster, update explanations, validate and review, then commit.

Keep all regions and districts connected. Preserve each region's 18 Support and the Centre's contact with all three. Physical size represents density rather than vote allocation; movement distance still counts shared district borders.

Revision validation: inspected all three SVGs in the browser; comparison page loads all maps without overflow at 390px. Generator assertions verify capacities, connected districts and regions, Centre contacts, and the separation of Northgate from the urban cluster. Exact SVG regeneration verified. `npm run docs:check` passes (114 HTML files). Independent review found no high, medium, or low issues and verified the archived SVGs match the originals.

## Fourth study: outer country

- [x] Add an outer-country prototype with a connected outlying region covering at least half the map perimeter, without Centre adjacency. Use cropped edge districts and continuation marks. Preserve all district capacities, connected regions, and the three earlier studies; update the comparison page, validate, obtain independent review, and commit.

Fourth-study validation: 48/56 perimeter units (85.7%) belong to the connected outlying region. Centre neighbors are Grand Market, Ironwood, and Crown Road; no outlying contact. Verified connected districts/regions, 18 Support each, 57 circles including Centre, and 31 district adjacencies. Inspected SVG rendering and all four comparison-page images. Exact regeneration passes and prior three SVGs remain byte-identical. `npm run docs:check` and `git diff --check` pass. Independent review: no high, medium, or low findings.

## Outer country: river and lake

- [x] Archive the dry map; add a river from the north edge along Orchard's western boundary, crossings at Westfield–Heath, Crown Road–Orchard, and Meadow–Coast, and a lake north of Northgate that blocks Eastfield–Meadow while preserving both Northgate approaches. Validate the movement graph has no dead ends, cut edges, or cut vertices; review the rendering and code independently; commit.

Keep water changes explicitly scoped to this prototype. The lake removes Eastfield–Meadow and the river removes Canal Ward–Orchard and Orchard–Coast by turning east along Coast. The crossings preserve Westfield–Heath, Crown Road–Orchard, and Meadow–Coast. Crossing placement alone adds no within-district movement or bridge-control rule.

Water-study validation: the final river blocks Canal Ward–Orchard and Orchard–Coast; Market Lake blocks Eastfield–Meadow. Bridges preserve Westfield–Heath, Crown Road–Orchard, and Meadow–Coast. All 28 passable connections and all 16 districts pass independent removal checks without disconnecting the remaining graph. Capacity, region connectivity, perimeter, and Centre checks pass. Inspected final SVG rendering; all Support spaces and labels remain clear. Exact regeneration verified. The dry map is archived byte-for-byte; other prototypes are unchanged. Documentation checks pass. Independent review of final geometry and movement graph reports no high, medium, or low issues.
