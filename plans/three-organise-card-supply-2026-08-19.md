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

