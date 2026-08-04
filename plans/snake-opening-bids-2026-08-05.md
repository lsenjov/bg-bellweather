# Snake opening bids

## Goal

Make every low-player opening bid an individual turn in Early Bird-relative snake order—ABBA at two players and ABCCBA at three—while retaining one clockwise opening turn per player at four to six players.

## Steps

1. **Plan and rule boundaries — completed.** Define the authoritative turn sequence, repeated turn-around seat, affordability/pass behavior, public progress contract, and unchanged four-to-six-player path.
2. **Engine and protocol — completed.** Replace once-per-seat opening completion with an ordered repeated-seat sequence and cursor, accept exactly one affordable opening or an insolvent pass per turn, preserve replay determinism, advance to ruleset version 9, and cover every Early Bird rotation, wraparound, turn-around, insolvency, gifts, and standard-player order.
3. **Server, web, and agent integration — completed.** Project the full public sequence and cursor, submit one opening at a time from the browser and example agent, reset the form across a consecutive turn-around, show every repeated opening turn with completed/current/waiting state to players and spectators, and update focused server/UI coverage.
4. **Physical rules, history, verification, and review.** Archive the replaced batched low-player opening rule, update current rules, glossary, player aids, agent API, decisions, and changelog, run the full repository check, and resolve every high or medium independent-review finding.

## Committed interpretation

- Rotate clockwise seat order so the Early Bird holder is A. Low-player turn order is the outward sequence followed by its reverse, including the turn-around player twice: ABBA or ABCCBA.
- Each sequence entry is one opening opportunity and may create at most one party contest.
- A player with at least one Leverage at the start of an opening opportunity must fund that opportunity. A player with none submits an empty opening list to pass; receiving Leverage before a later repeated turn makes that later opening mandatory.
- The automatic Pecking Order auction remains separate and has no opening bid.
- The public phase exposes the complete repeated-seat sequence and current index. The active seat is derived from them rather than stored as redundant authoritative state.
- Four-to-six-player games keep one clockwise opening opportunity per player.
