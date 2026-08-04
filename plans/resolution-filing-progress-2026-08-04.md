# Resolution filing progress

## Goal

Make resolution progress legible on every filing, including filings with no operations, without confusing completion with cancellation or revealing private information.

## Steps

1. Project a public, derived resolution cursor containing the current filing and completed filing IDs, and cover zero-operation and delayed-decision cases with server tests.
2. Render waiting, resolving, resolved, and cancelled filings as distinct visual states; document the committed treatment and verify the web UI, full checks, and responsive layout.
3. Have a fresh reviewer inspect correctness, information exposure, accessibility, and regressions; fix every high or medium finding and rerun verification.
