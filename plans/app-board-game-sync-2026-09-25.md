# Bring the app up to revision 27

Use the current physical board and policy rules as authoritative. Replace old app content directly; do not migrate or preserve older rulesets. Keep existing print archives as design references.

1. Unify current map and policy content, implement permanent Party-law awards and scoped effects, update protocol/state, and test map, elections, scoring and Operation interactions. Review and commit.
2. Update the browser map, policy ordering, recipient displays, party law panels and action controls. Test and inspect desktop/mobile rendering. Review and commit.
3. Align live rules, API documentation and design records; run full checks and resolve final independent review findings. Commit.

Validation focuses on shared-border adjacency, post-thinning recipient ties, permanent ownership, off-home Bonus actions, independent duplicate effects, cross-region follow-ups, public projections and scoring all enacted policies. Existing saves are rejected by the ruleset boundary; no compatibility code will be added.

## Progress

- Step 1 complete: shared map and policy generation, recipient awards, scoped laws, protocol and projection updates. All 160 tests and the production build pass. Independent review found no high/medium issues; fixed both low findings (test assertion and example-agent scoping).

- Step 2 complete: printed vote order and scope, recipient groups, party law reminders and scoped controls. All 47 browser tests pass. Desktop (1440px) and mobile (390px) browser checks passed with no runtime errors or page overflow; verified a scoped two-Support move preview. Independent review found no high/medium issues; restored rank labels for the compact browser priority grid.

- Step 3 complete (2026-09-26): aligned live rulebook, components, API, README, decisions and changelog. Full `npm run check` passes: 163 tests, all workspace type checks, generation checks, 262 HTML documents and production build. Final independent review reports no outstanding issues. No save migration or compatibility layer added.
