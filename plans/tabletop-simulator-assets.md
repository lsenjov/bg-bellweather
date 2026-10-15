# Tabletop Simulator asset preparation

## Scope

Prepare the current tabletop component suite as image assets suitable for Tabletop Simulator, with reproducible exports and an S3 publishing path. Preserve printable components and game rules. No gameplay automation or AWS infrastructure changes are implied.

## Steps

1. Export cropped cards, suit-grouped deck atlases and backs, board/reference images, agents and reversible tokens. Provide an import manifest and guide. Validate inventories, atlas geometry, back privacy and image bounds; independently review and commit.
2. Publish the reviewed assets to the user-specified S3 bucket/prefix using existing credentials, then verify public asset URLs. No upload until the destination is known. Do not change bucket access policies or publish credentials. If access is unavailable, leave a tested upload command and report the precise blocker.

## Requirements

- TTS card backs use normal atlas order, not mirrored physical-print order. Use shared backs per suit and reserve the last atlas cell as a safe hidden image.
- Preserve all 151 playable/policy/priority cards and the 12 opening markers; prepare all required pieces and reference images.
- Standee agents use Custom Figurine; Gallery portraits use two-faced Custom Tile. Omit physical fold/clip instructions from digital faces.
- Stable public HTTPS asset URLs for multiplayer; avoid expiring signed URLs.

## Status

Step 1 complete: 118 images (about 20 MB), sixteen decks / 151 cards, all twenty-one agents, opening markers, tokens, boards, folios, private reminders and references. Manual Lua importer generated. Asset checks, twelve Python tests, Lua syntax/runtime checks and documentation checks pass. Independent review caught a custom-object lifecycle error; fixed and fresh review passed with no high/medium findings. Documented the large staging-area requirement; actual TTS scale/readability/privacy still need an in-game check.

Step 2: bucket confirmed as `lsenjov-boardgame-bellwether` in `ap-southeast-2`; use `tabletop-simulator/`. AWS CLI identity and bucket access verified. Bucket has no public-read policy and ACLs are disabled. Requested approval for public GetObject access limited to this prefix; no access policy changed yet. Upload and public URL verification remain.
