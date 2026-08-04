# Remove prelaunch compatibility

## Goal

Make ruleset version 7 the only executable application behavior and remove compatibility paths for hypothetical prelaunch games, replays, payloads, and contest identifiers.

## Steps

1. ✅ Collapse engine resolution to the current Pecking Order and Night Parliament rules, reject non-current engine state, and remove old-state defaults and legacy replay tests.
2. ✅ Remove old-lobby ruleset preservation from the server and reject persisted games or snapshots whose ruleset does not match the running engine.
3. ✅ Remove web fallbacks for old resolution payloads and unknown contests while retaining validation for malformed current network data.
4. ✅ Update current decisions, changelog, and completed implementation plans so they no longer promise prelaunch compatibility.
5. ✅ Run the full project check and repeat independent review until no high- or medium-severity findings remain. The final fresh review approved current HEAD with no high, medium, or low findings; 119 tests, typechecks, documentation checks, and production builds pass.

## Retained infrastructure

- Keep the current `rulesetVersion` field as an explicit rules identifier.
- Keep SQLite schema migrations as the current database creation and future schema-evolution mechanism.
- Keep protocol parsing, malformed-input rejection, and historical rule/component archives.
- Do not delete or rewrite any local database automatically.
