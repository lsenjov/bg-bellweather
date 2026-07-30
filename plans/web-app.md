# Ladder Bidding web application

## Outcome

Build a local-first, server-authoritative web application that supports human
players in browsers and automated playtest agents through a documented API.
Games persist as append-only event streams, can be resumed, and expose a
full-information replay after completion.

## Committed requirements

- Support two to six human or API-controlled seats.
- At four to six players, each human controls one firm. At two or three, each
  human controls two firms and receives the doubled setup and bid allowances.
- Run twelve Campaign Rounds: Election Days follow rounds 4, 8, and 12, and the
  game ends after the third Election Day.
- Time only the simultaneous counterbid phase. The host may disable the timer
  or choose its duration. The phase ends when time expires or every player is
  ready, whichever happens first. With the timer disabled, it ends only when
  every player is ready.
- Assume connected, good-faith players for the first version. Do not add
  disconnect takeovers, host overrides, or abandoned-game policy.
- Give browser players and API agents identical seat-scoped information.
- Allow public table chat and direct one-way transfers of eligible Clout,
  operation tokens, and public points. The server does not model or enforce the
  agreement around a transfer.
- Persist games, events, chat, random choices, and hidden information. During
  play, reveal only seat-visible information; after completion, allow every
  participant to inspect the full-information replay.
- Run locally on one machine initially while keeping the deployment boundary
  suitable for public hosting later.
- Use the established `operation token` terminology.

## Technical direction

- npm workspace with TypeScript packages for the shared protocol, deterministic
  game engine, Node server, browser client, and example API agent.
- React and Vite for the browser client.
- SQLite for durable game metadata, seats, authentication tokens, and
  append-only game events.
- HTTP JSON commands and snapshots plus a WebSocket event stream.
- Opaque per-seat bearer tokens. The server derives visibility and authority
  from the authenticated seat rather than accepting a player identifier from
  the client.
- Pure command validation and event reduction in the engine. Randomness is
  resolved by the server and recorded in events so replay never rerolls.

## Design direction

Treat the game table as a live edition of the *Bellwether Register*: an
editorial election desk layered over the existing cream paper, black ink,
registration red, Crownwater blue, and party colours. The map remains the
visual anchor. Dense auction information should read like annotated copy and
press-room tally boards, while private holdings resemble a lobbying firm's
confidential folio.

The interface must remain usable at laptop widths, expose all actions without
drag-only interaction, clearly distinguish public and private information, and
respect reduced-motion preferences.

## Steps

### 1. Commit the clarified game rules

- Archive the replaced setup, timing, and game-length text where required.
- Update current rules, decision log, open questions, version history, and
  documentation summaries.
- Validate the HTML archive.
- Commit the documentation as one rules change.

### 2. Establish the application and persistence foundation

- Add the npm workspace, strict shared TypeScript configuration, linting, and
  test commands.
- Define protocol schemas, authenticated seat views, command envelopes, event
  envelopes, and API errors.
- Add the SQLite event store, game/lobby metadata, seat tokens, optimistic
  version checks, snapshot rebuilding, and deterministic random recording.
- Implement lobby creation, joining, starting, resuming, and event streaming.
- Test persistence, authorization, visibility boundaries, and restart rebuilds.
- Commit the working foundation.

### 3. Implement the complete game state machine

- Encode map topology, parties, operation families and bonuses, scoring cards,
  initial Support, random Pecking Order, and low-player setup.
- Implement opening contests, configurable counterbid timing and readiness,
  reveal/cancellation, ordered contest resolution, every operation and party
  bonus, Revolving Door transfers, Election Days, scoring, and tied wins.
- Model public chat and atomic one-way transfers without agreement enforcement.
- Provide explicit choice actions wherever a player must choose targets or
  ordering during resolution.
- Add deterministic engine tests for legal and illegal actions, hidden
  information, every operation family and party bonus, two- through six-player
  setup, all three Election Days, and complete replay.
- Commit the rules engine.

### 4. Build the human play experience

- Create lobby, join, host setup, game table, private folio, auction placement,
  readiness/timer, operation-resolution, transfer, chat, Election Day, result,
  and replay views.
- Reuse the Bellwether map and established party identity system.
- Make simultaneous hidden bidding understandable without leaking contents.
- Support keyboard and touch input, responsive layouts, readable focus states,
  reduced motion, and useful empty/error/reconnecting states.
- Verify the complete browser flow against the live server.
- Commit the browser application.

### 5. Complete the agent and replay surfaces

- Publish the HTTP/WebSocket contract and state-visibility rules.
- Add an example agent that can create or join a game, observe events, chat,
  transfer resources, ready, and submit legal game actions.
- Add full-information completed-game replay with an event timeline and
  deterministic seek.
- Add automated mixed human/API integration tests and a scripted complete-game
  smoke test.
- Commit the automation and replay work.

### 6. Verify and review

- Run type checking, linting, unit tests, integration tests, documentation
  checks, production builds, and browser smoke tests.
- Review the implementation with a fresh agent. Fix every high and medium issue
  and repeat review until none remain.
- Report low-severity issues before continuing with any optional polish.
- Commit verified fixes and hand off local run instructions.

