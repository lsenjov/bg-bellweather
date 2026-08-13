# Asymmetric map topology options

## Goal

Replace the first topology study with five new connection maps: one Civic Hub variant where each capacity-six district reaches Bellweather Centre through two capacity-two districts, and four heavily asymmetric alternatives.

## Constraints

- Keep all sixteen district names and Support capacities unchanged.
- Keep every map connected and free of duplicate or self connections.
- Show scoring-card compatibility because every current card names three pairwise non-neighboring districts.
- Preserve keyboard and screen-reader access to district neighbor details.
- Make horizontally pannable maps explicit and operable on narrow screens.
- Keep the study exploratory; do not change live rules, decisions, or the current map.

## Steps

1. Define and validate five new asymmetric graphs, including the constrained Civic Hub variant.
2. Update the study presentation, interaction semantics, mobile treatment, and scoring-card compatibility summary.
3. Run repository and browser checks, then obtain a fresh code review and resolve every high or medium issue.

## Verification

- `npm run check` passes: typechecking, 192 tests, documentation checks, and production builds.
- Every option contains all sixteen districts, preserves the 57-Support capacity distribution, has eighteen unique connections, and is connected.
- Capital Corridors uses three distinct Cap 6 → Cap 2 → Cap 2 → Bellweather Centre paths and uses every Cap 2 district once.
- Browser checks found no node collisions, out-of-bounds nodes, or concealed edges at desktop and narrow widths.
- The final independent review reported no high-, medium-, or low-severity issues.
