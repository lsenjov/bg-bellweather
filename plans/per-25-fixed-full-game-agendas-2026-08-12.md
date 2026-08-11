# PER-25 fixed full-game agendas

## Committed rules

- Shuffle the twenty-four-card scoring deck once during setup.
- Give every seat three ordered agenda slots, assigned to Elections 1, 2, and 3 by deal order. Players may inspect all three slots immediately and may not reassign them.
- Each slot contains one card at four to six players and one compatible pair at two or three players. Pair compatibility is checked within that slot only.
- Reveal and score only the assigned slot at each Election. Leave scored cards face up and public for the rest of the game through the retained Election record.
- Do not collect, reshuffle, or redeal agendas after Elections 1 or 2.
- Apply the state and projection break as ruleset 14 without migrating saved games.

## Step 1 — Canonical agenda model and rules

- Replace each seat's flat current hand with three ordered scoring-card slots and remove the unused future-deck state.
- Deal all three slots from one setup shuffle, with low-player compatibility enforced independently for each pair.
- Score the slot assigned to the current Election, retain its public reveal, and advance without redealing.
- Update canonical projections, server projections, replay data, tests, rules, decisions, changelog, and archives.
- Run focused engine, election, projection, server, content, and type checks, then commit.

## Step 2 — Digital play surfaces

- Show the owner all three ordered agenda slots in the private folio while keeping future opponents' slots private.
- Keep the active Election objectives and completed replay aligned with the nested slot model.
- Update web fixtures, playtest-agent examples, and the agent/API guidance.
- Run focused web and example checks, then commit.

## Step 3 — Physical agenda rack and complete validation

- Archive the replaced 200 × 140 mm single-well firm-board specification.
- Redesign each firm board as a compact 200 × 120 mm registered dossier with three ordered, overlapping 40 × 61 mm agenda wells. Each well holds one card or a stacked compatible pair.
- Update player-kit and component documentation, regenerate print assets, and inspect every firm-board sheet visually.
- Run the complete repository check and commit.

## Review and delivery

- Have an independent agent review all PER-25 commits.
- Fix every high or medium finding and repeat review until none remain. Fix low documentation findings directly and report other low findings before continuing.
- Push `main`, post exact implementation and validation evidence to PER-25, then replace `AI Await Implement` with `AI Implemented`.
