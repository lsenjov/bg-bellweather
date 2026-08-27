# PER-34 latest action map

## Goal

Show the latest completed Lobby action beside the district map and render every
Support placement, removal, and movement from an Operate action as an individual
party-coloured map glyph without numeric compression.

## Committed behaviour

- The display represents the full completed Lobby action, including all cards in a
  multi-card Operate action.
- Collect, Close, and Pass replace the latest-action summary and clear map glyphs.
- Collect and Close name the selected Bonus card, or state that none was taken.
- Automatic map changes such as Election thinning never appear as player movement.
- Empty Every Nest pairs sources and destinations in district order for display.
- Refreshes and spectators receive the same authoritative completed-action data.

## Steps

1. Add a public per-piece Support-change model, record exact changes while resolving
   Operations and Unbound Bonus cards, aggregate them on the completed
   `LobbyActionRecord`, and cover engine/projection behaviour with tests.
2. Add the latest-action summary and responsive, non-interactive SVG map layer with
   accessible text, then cover all action types, repeated glyphs, and targeting
   compatibility in browser tests.
3. Record the committed interface decision in the HTML design history, update the
   changelog, run the full repository checks, and complete independent review.

Each completed step is committed separately. The complete commit series is pushed
only after all checks and review findings are resolved.
