# Pecking Order resolution refresh

## Goal

Ensure party contests resolve in the Pecking Order produced by the current round's completed Pecking Order auction.

## Steps

1. ✅ Centralize construction of the resolution contest order and refresh its unresolved party portion when the Pecking Order contest finishes.
2. ✅ Add an engine regression test proving an adjacent swap changes the next party contest, update the changelog, and run the full project checks.
3. 🔄 Request an independent code review and address every high- or medium-severity finding. The first review identified deterministic version-5 snapshot and replay compatibility; ruleset 6 now gates the corrected transition while version 5 retains its historical behavior.

## Constraints

- Keep the Pecking Order contest first.
- Include only party contests that exist in the current round.
- Do not reorder a party contest after its resolution has started.
- Preserve the live `partyOrder` as the source of truth for subsequent rounds and projections.
