# Resolution map actions and staged reveal

## Goal

Put resolution decisions beside the board state they affect, make operation-card choice and district targeting faster, and reveal bid contents contest by contest without leaking future contests.

## Steps

1. Replace the global resolution reveal with current-and-completed contest reveals, and project remaining operation-card counts for the current filing. Add server projection coverage for owners, opponents, current contests, completed contests, future contests, cancelled bids, and delayed decisions.
2. Move the resolution desk beneath the map, replace the operation select with count-labelled radios, and add explicit source/destination/bonus map-target arming with non-overwriting district clicks. Add component and interaction tests.
3. Record the committed presentation and staged reveal in the design archive and changelog, run the complete project checks, and inspect desktop and narrow layouts.
4. Have a fresh reviewer inspect rules correctness, hidden-information boundaries, state synchronization, accessibility, and responsive behavior; fix every high or medium finding and rerun verification.
