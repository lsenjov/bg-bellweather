# Final Card Ranking Bonus

## Goal

After Year 6 Cleanup, rank each human player's combined ordinary Operation and held Bonus cards, add the upward-tied rank bonus after Election 3's ordinary score, and determine the final shared winners from the adjusted totals.

## Steps

1. [x] Add canonical final-card totals and rank bonuses to final Election scoring, records, winner calculation, projection, and focused game tests.
2. [ ] Expose the Election 3 card-count and rank-bonus breakdown in the browser and update dependent protocol/server tests.
3. [ ] Update Ruleset 21 rules, examples, glossary, decisions, changelog, player aids, and current print identifiers; archive the replaced final-scoring rule.
4. [ ] Run the complete validation suite, obtain an independent code review, resolve every high and medium finding, and prepare the implementation for publication.
5. [ ] Push the complete implementation for the PER-31 handoff.

## Validation

- Focused Election, engine, projection, protocol, server, and web tests during each step
- `npm run check`
- Print export and rendered print-asset spot-check
- Independent review with no high or medium findings
