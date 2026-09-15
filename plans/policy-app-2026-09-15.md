# Policy app

Use the agreed 30 policies, 15 effects, 12 scoring cards and public party orders from the component prototype, including the coloured vote tiles. Each human receives one secret scoring card; the discarded hypothetical is excluded. Remove Court/coalition code and old agenda scoring without compatibility support. Preserve unrelated league work.

## 1. Rules and data — completed
- Share validated component policy content with the app; make Centre the fourth region and use nine/eighteen-card starting hands and zero starting points.
- Replace scoring slots with one private scoring card and a hidden shuffled policy deck; expose four pending policies, enacted laws and failed policies.
- Resolve district thinning, four majority votes, global law activation, final scoring and hand rank deterministically, with replay-safe private projections.
- Implement the fifteen effects and five revised Bonuses, including choices for combined movement and ordered mandatory extras. Resolve the three documented interaction questions with the user.
- Update protocol validation and focused game/content/privacy tests. Review, resolve findings and commit.

## 2. Playable UI and integration — completed
- Replace Court/coalition/agenda controls with public priorities, regional policies and global laws; use the new coloured vote layout.
- Provide legal choices for all updated Operations, Bonuses and law follow-ups; show election outcomes and final score breakdowns.
- Update agent-facing examples/protocol docs and the current rulebook, archiving replaced rules. Preserve existing components and record changes.
- Run full typecheck/tests/docs/build and browser smoke checks, review until no high/medium issues, fix low documentation issues, and commit.

## Validation
Step 1: 76 focused content/game/protocol tests pass. Independent engine review found no high/medium issues. Removed an unused incomplete legality enumerator. All three Bonus/law interactions were resolved by the user: freely ordered extras, normal Smear Bonus after Displacement, and Dig In skip when full.

Step 2: all 142 tests, workspace/example typechecks, generated component checks, 176-document link/invariant checks, and production build pass. Independent UI/integration review is clear of high/medium issues after fixes for final priority reveal, baseline map targeting, and bounded swap controls. Low documentation issues were reported and corrected. Chromium smoke checks at 1440px and 390px found no page/card overflow or JavaScript errors; a real browser Operation updated the server board. Visually checked party rankings and policy tiles. Updated Bonus PDF has 18 cards with no overflow. Preserved unrelated league work, including index additions.
