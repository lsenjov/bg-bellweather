# Continuous-land physical map

One implementation step, committed after verification and independent review:
- Archive the current physical geometry, SVG/PDF, board and policy reference.
- Fill the waterways with contiguous districts; remove all bridges and water labels. Derive adjacency from shared borders, accepting additional connections. Keep all capacities and setup unchanged; leave app content untouched.
- Update component adjacency/reference text and history. Apply the user’s follow-up: Bridge Campaign triggers on crossing region boundaries, adding at the destination. Update both physical policies and their PDF while preserving the app’s policy data.
- Regenerate the A3 map, validate complete land coverage and geometry, inspect the print, and obtain independent review. Resolve high/medium findings before committing.

Completed: contiguous-land geometry covers the full board with no overlaps or water gaps, all 21 former connections preserved and seven added. Capacities, regional connectivity and Support-circle fit validated; documented adjacency matches all 28 borders. A3 map PDF and four-page A4 policy deck regenerated and visually inspected. Bridge Campaign uses the region-boundary trigger in physical cards and reference only. All 203 documentation checks pass; app/shared policy data unchanged. Independent review reports no high, medium or low issues.
