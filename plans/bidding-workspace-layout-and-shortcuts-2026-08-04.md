# Bidding workspace layout and shortcuts

## Goal

Turn the game desk into one coherent bidding workspace: private information first, party summaries directly above the map, contests and bid controls beside the map, and guarded party/contest shortcuts that accelerate targeting without silently changing placed bids or discarding drafts.

## Steps

1. **Workspace hierarchy** — Move the Private Folio above the main play area and compact it into a horizontal inventory strip. Move party summaries directly above the district map and place the contests/bidding desk beside the map. Preserve structural reading order and stack the workspace cleanly at narrower breakpoints.
2. **Opening-party shortcuts** — Add an explicit active opening draft, expose party summaries as accessible buttons during the active player's opening turn, apply party clicks only to that draft, disable parties assigned to another draft, and show active/selected states. Add focused interaction tests.
3. **Guarded counterbid shortcuts** — Expose contest headers as accessible target buttons during counterbidding. Retarget the current empty slot, otherwise move to the first unused slot; preserve placed bids, block switching when unsaved placed-bid edits would be lost, no-op on the current contest, and show feedback when switching is blocked or no unused slot exists. Add reset controls and regression coverage.
4. **Verification and review** — Run the complete repository check, inspect desktop and mobile layouts and interactions in the collaborative browser, and obtain an independent review. Resolve all high and medium findings before handoff and report low findings.

## Constraints

- Never relocate, replace, or withdraw a placed counterbid from a contest shortcut.
- Never discard unsaved edits without an explicit apply or reset action.
- Party and contest shortcuts must be keyboard accessible and visibly phase-dependent.
- The map must retain useful width on desktop and remain locally scrollable without page overflow on mobile.
- Polling equivalent server state must not reset local bid drafts.
