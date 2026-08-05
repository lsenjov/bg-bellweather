# PER-15 counterbid filing selection

## Goal

Let a player select an already placed counterbid by clicking its own filing row during counterbidding, hydrate that exact identity-card draft for editing, and preserve unsaved work when another row is chosen.

## Steps

1. Extend the existing counterbid selection intent with exact filing slots, make only owned counterbid rows accessible selectors, hydrate clean selections, retain the dirty-draft guard, and add focused component coverage.
2. Add selected-row styling and the changelog entry, run complete checks, and have fresh agents review and re-review until no high or medium findings remain.
