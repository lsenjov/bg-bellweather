# Consistent Tabletop Simulator component sizes

## Problem and scope

The importer assigned arbitrary board scales and left cards at their native defaults, so the imported map and policy cards did not share the printed proportions. Correct importer sizing against intended physical dimensions; do not change game rules or artwork.

## Implementation

1. Replace arbitrary scaling with explicit millimetre dimensions and a shared project convention of 25.4 mm per TTS world unit. Measure rotation-normalized bounds after assets load before applying scale. Preserve flat-piece thickness and scale standees uniformly by width. Cover policies, other cards, boards, references, folios, agents and tokens. Keep staging pieces apart at their corrected sizes.
2. Provide a safe way to resize already imported matching objects, if feasible without reconstructing the table. Match custom asset identity, never ambiguous display names. Add focused Lua runtime tests for scale math, asset readiness, card/board ratios and unrelated-object exclusion.
3. Regenerate the committed importer, document usage, independently review and resolve findings, then commit and push. No image upload is required.

## Validation

Policy width must be 63/420 = 15% of board width; policy height must be 88/297 of board height. Dimensions must not depend on initial model bounds or current scale. Local tests cannot substitute for an in-game visual check.

## Status

Complete. Added validated physicalSizeMm metadata, normalized-bounds sizing after custom assets load, footprint-based staging, and resizeBellwether for existing known assets (including the original map URL). Nine loader tests, asset checks, documentation checks and Lua compilation pass. Independent review found a repair lock-state issue; fixed and freshly re-reviewed with no remaining high/medium findings. The reviewer independently checked all 138 staging footprints for overlap. In-game drawn-card size propagation and collider appearance still need validation. No image changes or uploads were required.
