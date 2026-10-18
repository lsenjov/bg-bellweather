# Party-neutral physical Private Priorities

Replace the physical deck with the twelve enumerated rankings closest to every public party across all thirty policies. Preserve parties, policies, effects and app files. Accept six reverse pairs.

1. Archive the replaced sources; update the deck, generator invariants, physical specification, printable cards, decision and changelog. Make app data generation opt-in. Verify generation and documentation, export and inspect the PDF, obtain independent review, resolve valid findings and repeat review as needed, then commit.

## Completion

Step 1 complete.

- Normal component generation and `npm run docs:check` pass (297 HTML files).
- Independent enumeration of all 720 rankings confirms the twelve optimal cards, rank balance, six reverse pairs, and documented scoring-law ranges. Parties, policies and effects are unchanged.
- Refreshed `assets/print/scoring-cards-a4.pdf`: one A4 page with embedded fonts. The generated PDF remains ignored by Git.
- Visually inspected the PDF. Chromium checks confirm all twelve printed IDs, rankings and values match the source, cards measure 40 × 61 mm, and no card or text overflows.
- Independent review approved with no findings. `git diff --check` passes.
- App and package files are untouched. `node scripts/generate-policy-components.mjs --include-app` explicitly includes app data output; add `--check` to check it. Default generation/checking deliberately excludes deferred app content.
