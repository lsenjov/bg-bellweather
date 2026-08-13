# Yearly party-access implementation

## Goal

Replace ruleset 14's auction and Revolving Door with the provisional twelve-year party-access loop in `provisional-yearly-party-access-loop-2026-08-13.md`, including Capital scoring and the immediate Night Shift bonus.

This is a breaking ruleset change. Existing games and snapshots will not migrate.

## Step 1: content and engine

- Advance the ruleset version.
- Remove Leverage, Bluff, bid, counterbid, Pecking Order, gift, and timer state from the active model.
- Model each seat's Operation hand, New Year pile, points, firms, and available Collection counters.
- Model each party's yearly opening firm, owner, open/closed state, Operation pile, and claimed bonuses.
- Implement ABBA and ABCCBA only for low-player party openings.
- Implement atomic `operate`, `collect`, `close`, and `pass` actions with clockwise Lobby turns.
- Enforce one to three cards at one party and at most one claimed bonus per Operate action.
- Replace delayed Night Shift with an immediate second Rally.
- Implement consecutive-pass and strict-majority automatic closure, pile awards, cleanup, and Early Bird succession.
- Preserve Election acknowledgment while performing yearly cleanup before Elections 1–3.
- Add Capital scoring at 0/0/1/3 after relative-seat adjustments, using the first low-player card in each compatible pair.
- Replace obsolete engine tests with focused coverage of the new state machine and preserve operation/election tests that remain relevant.

Commit when the content and game packages pass their tests and typechecks.

## Step 2: protocol and server

- Replace auction commands with `open_party`, `operate`, `collect`, `close`, and `pass` command schemas.
- Remove gift commands and counterbid timer options from the public protocol.
- Keep obsolete database columns only where removing them would require needless storage migration; write neutral values and omit them from public state.
- Project public yearly party state, pile contents, bonus availability, Collection-counter counts, action history, and Election records.
- Project each player's exact hand, New Year inventory, and fixed scoring cards only to that player until reveal.
- Remove counterbid deadline scheduling.
- Update command stabilization, event redaction, integration tests, and the agent testkit.

Commit when protocol, server, and testkit tests and typechecks pass.

## Step 3: web application

- Preserve the existing Bellweather editorial/bureaucratic visual identity while replacing auction desks with a live yearly lobbying desk.
- Show Early Bird, opening order, active Lobby player, party ownership, open/closed state, Operation piles, claimed bonuses, and Collection counters.
- Provide opening controls and complete Operate/Collect/Close/Pass controls.
- Reuse map-assisted legal Operation choice controls where they stay simple; keep all submitted Operate choices atomic.
- Remove gifts, Leverage, Bluff, counterbid timing, filing stacks, bid resolution, and Pecking Order UI.
- Show private hand/New Year inventories and Capital-card identity.
- Extend Election bulletins with Capital matches and points.
- Update accessible labels, responsive layout, replay display, and interaction tests.

Commit when the web tests, build, and typecheck pass and a browser smoke test confirms the principal flows.

## Step 4: rules and components

- Archive ruleset 14 and any replaced component specifications before rewriting them.
- Rewrite the current rules around years, openings, Lobby actions, cleanup-before-Election timing, Capital scoring, and immediate Night Shift.
- Update printable Operation-card supply and player/party component specifications.
- Update player aids, glossary, examples, vision, open questions, design decisions, and changelog wherever they describe the retired auction.
- Keep unknowns identified as playtest questions rather than silently deciding them.
- Keep relative navigation valid and run the documentation checker.

Commit when documentation checks pass and searches find no current-rule claims that Leverage, Bluff, counterbids, gifts, or the Pecking Order remain active.

## Step 5: verification and review

- Run the full repository check.
- Inspect the final diff for unrelated files and preserve concurrent user work.
- Have a separate agent review the implementation for correctness, security, performance, and maintainability.
- Fix all high and medium findings, then repeat independent review until none remain.
- Fix low documentation findings. Report any other low findings before continuing.

Commit each review-fix pass separately and finish with a clean full check.

## Engine details

### State and visibility

- Party Operation piles and claimed bonuses are public.
- A player's hand and exact New Year inventory are private; other players see New Year card count and spent/available Collection counters.
- Played Operation choices and results are public history.
- Scoring cards retain the current visibility rules. In a low-player pair, the first card is the Capital card and remains first in storage and presentation.

### Atomic Operate input

An Operate action contains one party and one to three ordered plays. Each play includes its Operation family, full baseline/bonus choice, and whether it claims the party bonus. The engine applies plays in order to a cloned state and rejects the whole action if any card, choice, or claimed bonus is illegal.

Night Shift repeats the Rally in the same chosen district against the updated board. Both placements must be legal for the claimed bonus to resolve.

### Year ending

After every Lobby action, check strict-majority closure. Track consecutive passes separately; a non-Pass action resets the count. When either end condition fires, close and award every open party, refresh hands/counters/bonuses, set the acting player as Early Bird, then enter Election or the next opening phase.

### Elections

The server continues to generate deterministic Election random values and records results automatically. Players acknowledge a recorded Election before the next year begins. Capital points are recorded separately and included in `pointsChange` after relative-seat adjustments. Election cleanup clears Court Support but leaves Coalition Targets and Bellweather Centre unchanged.
