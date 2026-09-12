# Ten-strategy agent league

Run ten complete Ruleset 24 games with four LLM players each. Independently
sample four distinct strategies and randomise seats for every game. Keep one
persistent identity per strategy, keep current assignments private, and give
all ten identities every completed player postmortem before the next game.

## Steps

1. [x] Prepare the random schedule, current rules references, durable database,
   authenticated player transport, and persistent LLM orchestration. Review
   implemented tooling independently, fix high/medium findings, and commit.
2. [ ] Run all ten games through the API without strategic automation or pacing
   limits. Preserve sessions, commands, replays, private notes, and the exact
   cumulative postmortems provided before each game. Commit progress record.
3. [ ] Publish an HTML report with schedule, results, strategy appearances,
   score breakdowns, postmortems, learning, and limitations. Validate evidence
   and document links, obtain independent review, fix findings, and commit.

## Evidence and constraints

- Baseline game commit: `409a2626eb44716e23b0de2600235e4f8a69cb46`.
- Runtime evidence: `data/strategy-league-2026-09-12/` (ignored, preserved locally).
- Four separate Codex player sessions; no model override. Resume each identity
  on its next appearance and retain private notes as additional durable memory.
- Use opaque game-specific seat aliases so shared reports do not explicitly
  disclose current strategy assignments. Agents may infer tendencies from play.
- All strategic actions and optional choices belong to each player's LLM.
  Mechanical transport may wait, fetch state, and submit the selected action.
- Uniform independent sampling may leave uneven appearances and seat counts;
  report this rather than adjusting the draw after seeing it.
- Complete six years and three Elections per game. Verify completion from the
  canonical replay before gathering postmortems and proceeding.
- No old-rules learning dossier is carried into Game 1.
- Main questions: how the priorities perform in this sample; how shared
  postmortems change subsequent choices; which current-rule interactions merit
  further playtesting. Treat this as exploratory, not a controlled balance study.

## Predeclared draw

Seed: `98178626828117930159238393925002414826`. Python `random.Random(int(seed)).sample(ids, 4)` in the original strategy-pool order; sampled order determines seats.

1. economy, coalition, next-election, three-election
2. tempo, economy, capital, regional
3. economy, next-election, capital, disruptor
4. coalition, capital, disruptor, three-election
5. bonus, regional, economy, three-election
6. capital, bonus, economy, conservation
7. three-election, economy, bonus, next-election
8. next-election, tempo, three-election, disruptor
9. bonus, next-election, economy, three-election
10. conservation, next-election, bonus, tempo

## Preparation validation

79 existing game/server tests passed. Player transport mock checks passed for
state/turn detection, versioned actions, replay guards and credential-free logs.
Independent review identified and resolved concurrent state-save ordering and
premature postmortem acceptance. A separate analysis turn now follows each
completed game. CLI launch smoke check succeeded with the configured default.
Player isolation is an instruction boundary with separate workspaces and API
credentials, not an operating-system sandbox.
