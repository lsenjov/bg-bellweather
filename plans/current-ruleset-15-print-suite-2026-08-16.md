# Current Ruleset 15 print suite

## Goal

Replace every remaining Ruleset 14 printable in the main export bundle with a
current Ruleset 15 component. Give the active sources and PDFs clean current
names; retain the auction specification only in the historical archive required
by the project documentation rules.

## Design direction

Use the existing Bellweather visual language as a government field dossier:
strong party colours for public state, low-saturation Firm stationery for
player ownership, large physical wells for cards and markers, and compact
monospaced procedural labels. These are the current print components and do not
carry a separate prototype label.

## Step 1 — Party workspaces and shared state

- Redraw the six party boards around one annual Firm opening, one public
  Operation pile, an open/closed state, two once-per-year bonus states, five
  Court spaces, and one Coalition Target.
- Replace the Pecking Order export with a shared state sheet containing Early
  Bird, Year/Election, six Coalition Targets, six Closed markers, and twelve
  bonus-used markers.
- Produce three A4 landscape party-board sheets and one A4 landscape
  `shared-state-tokens` sheet.
- Export, inspect every page, validate physical sizes and fonts, and commit.

## Step 2 — Player folios and Firm/player pieces

- Redraw the six Firm boards as player folios with three ordered Election
  slots, a physically distinguished first/Capital pair position, one visible
  New Year card well, available-hand guidance, four Collection-counter wells,
  and a concise Lobby action reference.
- Replace each Firm's three bid-identity cards with one annual opening marker,
  two distinct Collection counters, and one score marker. Combining two Firm
  kits supplies the doubled low-player quantities.
- Produce three A4 portrait `player-folios` sheets and three A4 landscape
  `firm-player-pieces` sheets.
- Export, inspect every page, validate physical sizes and fonts, and commit.

## Step 3 — Documentation and complete-bundle verification

- Rename the Operation-card source, stylesheet, and PDF away from the legacy
  `bid-cards` name.
- Remove retired output names from the current exporter and print directory.
- Update current component specifications, player aids, current-rule open
  questions, README, design decisions, and changelog.
- Remove current-document claims that the four print sources are historical or
  still awaiting replacement while retaining links to the Ruleset 14 archive.
- Correct the Year-marker terminology in the tracker instructions.
- Regenerate the complete print bundle, inspect representative cross-component
  fit, run the full repository check, and commit.

## Step 4 — Independent review

- Have a separate agent review the implementation for rules correctness,
  component completeness, accessibility, and print usability.
- Fix every high or medium issue and repeat review until none remain.
- Fix low documentation issues; report any other low issues before continuing.
- Commit each review-fix pass separately.
