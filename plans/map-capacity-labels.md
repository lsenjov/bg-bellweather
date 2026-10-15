# Map capacity labels and agent space

## Approved change

Remove Support circles/checks. Show Election retention limit / Support capacity above each district name (1/2, 2/4, 3/6, Centre 3/3). Use muted district-type fills: rural green, town ochre, city terracotta, capital lavender. Thicken borders between regions, keep within-region borders thin, and neutralise policy-area headers. Add no shared reminder. Preserve map size, district geometry, adjacency and rules.

## Steps

1. Archive the replaced map and generator. Update generator, SVG and component/design/history documents. Validate geometry and labels, inspect the rendered map, independently review, resolve findings, and commit.
2. Regenerate the A3 PDF, TTS images/manifest/importer. Upload the new map image to S3, verify public delivery, and commit/push the new importer for the other machine.

## Status

Step 1 complete. Previous SVG, generator and geometry archived. New rendered map inspected; four focused tests and docs checks pass. Independent review found no issues and verified unchanged district geometry, adjacency and fixture dimensions. Step 2 exports underway.
