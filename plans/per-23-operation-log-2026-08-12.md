# PER-23 operation log

## Goal

Show the canonical operation-resolution history during live and spectator play, with automatic failures easy to find and repeated identical failures kept compact.

## Steps

1. Retain and validate public operation and round-history data in the web view. Add helpers that resolve filing owners across current and prior rounds, format outcomes, and group consecutive identical automatic failures from one filing.
2. Add the persistent accessible Game log panel to the game desk, style it for the existing newspaper interface, and cover successful, current-round, grouped, historical, and spectator cases.
3. Run the full validation suite and print checks, resolve independent review findings, publish the commits, and transition PER-23 with exact evidence.

## Constraints

- Do not change operation legality, engine state, persistence, or the command protocol.
- Use only server-projected canonical state so refreshes and reconnects retain the log.
- Keep failures verbatim and visually prominent.
- Leave room for future log entry types without implementing an exhaustive action feed now.
