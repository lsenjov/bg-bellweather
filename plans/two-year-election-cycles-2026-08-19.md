# Two-year Election cycles

## Goal

Shorten the campaign from twelve years to six while retaining three Elections.
Treat Years 1, 3, and 5 as thematic midterm boundaries with ordinary Cleanup
only, and hold Elections after Years 2, 4, and 6. Ship the breaking schedule as
Ruleset 19 without saved-game compatibility.

## Steps

1. Change the Election-year content, typed phase data, final-Election checks,
   engine tests, and browser schedule copy for two-year cycles.
2. Archive the replaced twelve-year rule and tracker specification, then update
   current rules, examples, glossary, component sources, playtest guidance,
   design history, changelog, README, and generated print assets.
3. Run the full repository checks, review the complete diff with a separate
   agent, and resolve every high- or medium-severity finding before delivery.

## Validation

- `npm test -- packages/content/test/content.test.ts packages/game/test/engine.test.ts apps/web/test/app.test.tsx`
- `./scripts/export-print-assets.sh`
- `npm run check`

## Progress

- Step 1 complete: Ruleset 19 engine, types, tests, and browser schedule are updated.
- Step 2 complete: archives, active documentation, trackers, and print sources are updated.
- Step 3 complete: full checks pass and the independent review reports no
  high, medium, or low findings.
