# Variable-player lobbies

## Goal

Let hosts open a lobby without choosing a player count, admit up to six players, and start with any occupied group of two to six while freezing the actual player count into game state at start.

## Steps

1. ✅ Separate create-lobby options, live projected player count, and persisted six-seat lobby capacity in the protocol and server model. Migrate current persisted settings without changing canonical game state.
2. ⬜ Change and test server behavior so one player cannot start, two through six players can start, a seventh player cannot join, and active projections report the actual initialized player count.
3. ⬜ Remove the browser player-count prompt, present live occupancy against the six-seat capacity, enable host start from the second player onward, and update the example agent and focused UI tests.
4. ⬜ Update the playtest agent API documentation for count-free lobby creation and variable-size start behavior.
5. ⬜ Run the full project check and repeat independent review until no high- or medium-severity findings remain.

## Retained behavior

- Only the host may start the game.
- Lobby readiness remains advisory rather than a start requirement.
- Spectator admission and the optional counterbid timer remain host-selected lobby options.
- Player joins close when the lobby reaches six seats or when play begins.
- The engine continues to derive all low-player setup and scoring behavior from the seats supplied at start.
