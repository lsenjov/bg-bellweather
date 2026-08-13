# Completed-game replay admission

## Goal

Let a new observer use an invitation code to open a completed game's full state and replay when observer admission was enabled, without changing the completed game's event history.

## Step 1: replay-only admission

- Accept observer joins for lobby, active, and completed games when `allowSpectators` is enabled.
- Persist a token-authenticated observer for a completed game, but do not append or broadcast `spectator.joined`; the completed event stream and latest sequence must remain unchanged.
- Return the existing completed-state envelope so the browser can immediately offer the replay archive.
- Cover successful completed-game admission, replay authentication, unchanged history, and disabled observer admission in server tests.

Commit when the focused server tests and typechecks pass.

## Step 2: product history and verification

- Record the completed-game replay admission decision in the design log and changelog.
- Run the relevant tests, then the complete repository check where compatible with the in-progress ruleset work already present in the worktree.
- Have a fresh agent review the implementation. Fix all high and medium findings and repeat review until none remain; fix low documentation findings.

Commit documentation and each review-fix pass separately.
