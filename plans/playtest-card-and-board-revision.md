# Playtest card and board revision

## Goal

Apply the 2026-07-30 physical-prototype feedback across the live rules, component specifications, printable HTML/CSS sources, export pipeline, and generated PDFs.

## Committed interpretation

- Each party board uses one source-party overture token across a neutral setup position and five target-coloured positions.
- Opening-bid areas no longer say “Place container here.”
- Standard player supplies become ten one-Clout cards, four inert Bluff cards, two Organise cards, two Rally cards, two Smear cards, and one Court card. Two- and three-player supplies remain doubled.
- Transferable bid cards share one back. Bluff cards transfer with their bid and have no effect.
- Opening bids show their Clout cards face up while their operation and Bluff cards remain face down.
- Counterbids are face-down card stacks topped by a firm-specific A or B Counterbid Cover card. Cover cards remain with their firm when bid contents transfer.
- Scoring cards and all new bid cards are 40 × 61 mm for 41 × 63 mm sleeves.
- Opening-bid and score markers remain tokens.
- Firm boards retain operation baselines, use an exact-size sealed-agenda well, remove issued-piece and round-overview panels, and add terse reminders for both powers of every party.
- The Pecking Order becomes one A4 landscape sheet: the upper board remains in play, while its former procedure area supplies six 44 mm party tokens plus shared Early Bird and round markers.
- “Early Bird” is the component name; “first opener” remains the rules term for its holder.
- The map removes printed capacity labels while retaining every Support spot, and gains a twelve-round/three-election tracker plus a 0–20 score track.
- The 0–20 physical score track does not cap or floor the rules value.

## Step 1 — Rules, specifications, and history

- Archive the replaced operation-token and opaque-cover component formats.
- Update current rules, glossary, component inventories, setup, private-information rules, Revolving Door handling, and player aids from tokens/covers to cards/stacks.
- Record the committed playtest choices in the decision log and changelog.
- Update navigation and print-export descriptions where page counts or component families change.
- Run document validation and commit.

## Step 2 — Authoritative game and browser compatibility

- Add Bluff holdings to player reserves, bids, gifts, events, projections, persistence, and replay-safe public state.
- Accept Bluff counts when players place or revise opening bids and counterbids.
- Hide opening operation/Bluff composition from opponents while keeping opening Clout public.
- Transfer Bluff cards with complete bids through the Revolving Door and allow eligible Bluff gifts.
- Update the HTTP/WebSocket protocol, example agent, browser controls, and automated tests.
- Run typechecks and the complete test suite, then commit.

## Step 3 — Bid-card print asset

- Replace the operation-token printable with a combined bid-card document and stylesheet.
- Supply the maximum six-standard-player economy: 60 Clout, 24 Bluff, 12 Organise, 12 Rally, 12 Smear, and 6 Court cards.
- Give transferable cards a common back and readable fronts.
- Replace twelve 70 mm counterbid-cover roundels with twelve 40 × 61 mm firm Counterbid Cover cards while retaining the six opening-bid and six score markers.
- Update the exporter and generated-output allowlist.
- Export, inspect representative pages, validate, and commit.

## Step 4 — Party boards

- Remove the opening-area container instruction.
- Redesign overture tracks with one neutral setup position and five target-coloured positions using names and emblems as redundant identifiers.
- Add six printable overture tokens without changing the three-sheet party-board count if layout permits; otherwise add the minimum required token sheet and update export validation.
- Export, inspect all party variants, validate, and commit.

## Step 5 — Firm boards

- Make each Sealed Agenda well exactly 40 × 61 mm.
- Remove Issued Pieces and the Campaign Round overview.
- Keep the four operation baselines.
- Add a compact six-party reference with two short power summaries per party.
- Export, inspect all firm variants, validate, and commit.

## Step 6 — Pecking Order and shared markers

- Remove the A/B/C procedure panels.
- Place the six existing party-order tokens in the former lower-board area.
- Add one shared Early Bird marker and one shared round marker.
- Reduce the export from two A4 landscape pages to one.
- Preserve essential exceptional-auction guidance in the masthead/footer or player aids.
- Export, inspect, validate, and commit.

## Step 7 — District map trackers

- Remove all visible capacity text while retaining semantic district capacities and every Support circle.
- Add the round sequence `1–4 / Election I / 5–8 / Election II / 9–12 / Election III`.
- Add a public score track labelled 0 through 20.
- Preserve the 396 × 297 mm source-artwork size and A3 export.
- Export, inspect the full map, validate, and commit.

## Step 8 — Integrated verification

- Run the complete print exporter.
- Run document checks and the repository test suite.
- Verify generated PDF page counts, page sizes, and embedded fonts.
- Render representative PDF pages to images and inspect card fronts/backs, all board families, cut lines, track readability, and clipping.
- Commit any integration fixes.

## Step 9 — Independent review

- Have a fresh agent review the complete implementation for rules consistency, component counts, print usability, accessibility, and export integrity.
- Resolve every high- or medium-severity finding and repeat review until none remain.
- Report any low-severity findings to the user before further work.
