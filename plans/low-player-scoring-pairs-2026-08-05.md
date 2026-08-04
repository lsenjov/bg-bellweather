# Low-player scoring pairs

## Goal

Give every player two compatible hidden scoring cards at two or three players, score all six distinct district objectives, and preserve the existing single-card game at four to six players across the engine, app, and physical rules.

## Steps

1. **Plan and rule boundaries — completed.** Define per-player pair compatibility, whole-deck reshuffling between campaign periods, replay-safe deck preparation, privacy, and the unchanged four-to-six-player path.
2. **Engine state, dealing, and scoring — completed.** Replace the single scoring-card field with a card list, pre-record one shuffled deck for each campaign period, deal compatible low-player pairs by discarding overlapping second draws, sum both cards' objectives, and cover setup, scoring, privacy, redealing, and replay invariants with focused tests.
3. **Server and web integration.** Project private scoring-card lists, reveal complete Election agendas, render paired private/replay agendas, mark every revealed objective on the map, and update server and UI coverage without exposing opponents' agendas early.
4. **Physical rules, history, verification, and review.** Archive the superseded single-card low-player rule, record the new rule in decisions and the changelog, update rules/component/player-aid/playtest language and printable firm boards, regenerate affected print assets, run the full repository check, and resolve every high or medium independent-review finding.

## Committed interpretation

- Compatibility applies within each player's two-card hand: the second card must share no district with the first, producing six distinct districts for that player.
- Both cards score; at two or three players their six objective scores are summed and every Gain/Lose seat reference remains ignored.
- Rejected second cards stay face down. A fresh shuffle of all twenty-four scoring cards is used for each four-round campaign period, so rejected and previously held cards are available after the next shuffle.
- The app records all three shuffled deck orders in the initialization event. Later dealing is therefore deterministic under replay without adding a player-controlled random action.
- Four-to-six-player games continue to deal and score one card per player.
