# Three Organise card supply

## Goal

Increase each standard player's starting Organise supply from two cards to
three, and keep the existing low-player rule by doubling that supply to six.
Ship the change as Ruleset 18 without saved-game compatibility.

## Steps

1. Update setup data and automated expectations for three standard and six
   doubled Organise cards, bump the ruleset, and run the focused code checks.
2. Archive the replaced setup and printable-supply specifications, then update
   current rules, component documentation, decision history, changelog, and the
   printable Operation-card asset for an eighteen-card Organise supply.
3. Run the full repository checks, review the complete diff with a separate
   agent, and resolve every high- or medium-severity finding before delivery.

## Validation

- `npm test -- packages/content/test/content.test.ts packages/game/test/engine.test.ts apps/server/test/projection.test.ts`
- `npm run check`
- `./scripts/export-print-assets.sh`

## Progress

- Step 1 complete: Ruleset 18 setup and focused tests pass.
- Step 2 complete: active and archived documentation plus print sources are updated.
- Step 3 complete: full checks pass and the independent review is clean after
  correcting the README print manifest.
