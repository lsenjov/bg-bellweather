# All-district Election retention

## Goal

Change Election Day so every district except Bellweather Centre takes its capacity-based draw and retains only that Support, whether or not a revealed scoring card names the district. Bellweather Centre remains unchanged as a persistent jumping-off point and possible blocker.

## Steps

1. ✅ Update the Election engine and focused tests so all fifteen non-Centre districts draw and thin, while scoring still reads only the objectives on revealed cards; advance the executable ruleset to version 12.
2. ✅ Archive the replaced agenda-only thinning rule and update current rules, player-facing playtest guidance, design decisions, and the changelog.
3. ✅ Run full repository validation and repeat independent review until no high- or medium-severity findings remain; report any low-severity findings before further changes.
4. Push the completed ruleset changes, then run and record another complete four-agent timerless API playtest.

## Design constraints

- Draw three Support from capacity-six districts, two from capacity-four districts, and one from capacity-two districts.
- A district with fewer Support than its draw count keeps all available Support.
- Each district has one shared recorded draw; objectives continue to score from the draw for their named district.
- Bellweather Centre never draws, never thins, and never appears on a scoring card.
- Coalition matching changes scoring only, not which Support is retained.
- Ruleset version 12 has no saved-game migration.

## Verification

- Focused Election and engine tests cover named and unnamed district retention plus Bellweather Centre persistence.
- Full `npm run check` passes with 177 tests, documentation validation across 72 HTML files, and the production build.
- A fresh independent review approved the final change with no high-, medium-, or low-severity findings.
- The committed branch is pushed before the follow-up playtest begins.
- The follow-up playtest reaches game completion and records all three Elections plus final findings.
