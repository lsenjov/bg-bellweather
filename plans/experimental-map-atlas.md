# Seventeen experimental map concepts

Implement concepts 1–10 and 14–20: seventeen detailed maps, one per concept.

## Design

Start from three regions of 18 Support, fifteen regional districts plus Bellweather Centre (capacity 3), district elections, and named districts. Vary geography and connectivity deliberately. Each map states departures from the earlier constraints and the gameplay hypothesis to test. These are experiments, not adopted production rules.

Use a shared atlas palette: white paper #ffffff, navy ink #19354b, blue urban #d5e7f5, green mixed #dbeaca, yellow outlying #f5e7ac, water #a9d9ec. System sans-serif map labels; Georgia titles in the gallery. Maps occupy the main visual area; thumbnail index links to standalone HTML studies and SVGs. Each study includes a district adjacency table and specific discussion rather than generic praise.

```
Atlas: title + shared legend / thumbnail grid (concept numbers preserved)
Study: title + hypothesis / large map / departures + graph facts / adjacency table
```

Use irregular district footprints and explicit drawn routes. Route endpoints define adjacency for every effect; water, walls, ridges, and rails have no implicit crossings. Nearby footprints or crossing lines do not create adjacency. This is a deliberate atlas-wide departure from border-defined adjacency, allowing the seventeen very different geographies to be compared without ambiguous connections. Every bridge, gate, or pass joins two named districts. Dense cities can occupy small footprints; geographic area is independent of capacity.

The visual focus is the geography: confluences, shorelines, gates, ridges, and transport corridors. Avoid making all concepts variants of the same ring with different labels. Use differing graph structures and report single-route vulnerabilities honestly where an experiment intentionally introduces them.

## Steps

1. [x] Build seventeen concept datasets, a reproducible SVG generator, and graph/geometry validation. Inspect representative renders, obtain independent review, resolve findings, and commit the map assets.
2. [x] Consolidate generation into scripts/generate-map-concepts.py and produce separate SVG and HTML files, with no atlas/gallery wrapper. Inspect all seventeen maps and mobile layout, review, resolve findings, and commit.

## Validation

Check requested concept IDs, names/capacities, connectivity, route endpoints, no duplicate routes, route clearance from unrelated district footprints, no unmarked route crossings, and Support/label fit. Report region connectivity, Centre access, degree, cut edges, and cut vertices per map. Check reproducible output, relative links and documentation invariants. Check all seventeen geographic renderings visually; these checks establish map legibility, not gameplay balance.

Step 1 validation: seventeen SVGs and topology reports generate reproducibly. Geometry checks reject overlapping districts, districts on blocked terrain, roads through unrelated districts, and unmarked road crossings. Independent review matched all seventeen connectivity and vulnerability reports and inspected Island chain rendering. No high/medium findings. Two low descriptions confusing dense cities with Urban-region membership were corrected; generated Python cache files were removed.

User refinement: produce separate files, not an atlas/gallery. One script in scripts/ regenerates every SVG, companion HTML note, and topology report. Remove the uncommitted gallery and its filtering UI. The shared JSON dataset also lives in scripts/.

Step 2 validation: all seventeen SVGs and standalone HTML notes pass reproducibility checks; documentation checks pass for 131 HTML files. Inspected all map renders and the Island chain notes at mobile width. Independent review found no issues in generation, links, topology descriptions, or mobile CSS.
