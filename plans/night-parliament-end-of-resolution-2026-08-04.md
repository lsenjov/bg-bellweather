# Night Parliament end-of-resolution timing

## Goal

Move Closing Argument and After-Hours Deal from the end of Night Parliament's contest to the end of the complete contest sequence.

## Steps

1. ✅ Introduce ruleset version 7 and preserve ruleset-5/6 replay timing.
2. ✅ Keep Night Parliament claims queued across contest boundaries and resolve them, highest claiming bid first, after every contest and Revolving Door completes.
3. ✅ Add engine and projection regression coverage, including a later party contest resolving before the delayed Night operation.
4. ✅ Archive the replaced contest-local timing and update current rules, components, design decisions, and changelog.
5. Run the complete project check and repeat independent review until no high- or medium-severity findings remain.

The first review found that future delayed-claim filings were marked complete too early and that canonical party content retained the old timing. Both are covered by regressions before re-review.

The second review found old timing in the glossary and lobbying-firm board shorthand. Both player-facing references now use end-of-resolution timing and the printable bundle is regenerated before final review.

## Constraints

- Claim the bonuses during Night Parliament's ordinary operation resolution.
- Retain the original claiming owner and high-to-low claiming-bid order.
- Resolve delayed operations against the final state left by every contest.
- Keep saved ruleset-5 and ruleset-6 games and event streams deterministic.
