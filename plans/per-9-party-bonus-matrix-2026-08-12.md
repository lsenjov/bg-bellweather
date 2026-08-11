# PER-9 party bonus matrix

## Goal

Replace the current party bonuses with the approved theme-first matrix as
ruleset version 13, while preserving the old rules and component text in the
archive.

## Committed resolution details

- Common Cause moves one Honeycomb Support between two distinct districts. The
  owner chooses the source and a free destination containing the selected
  Coalition Target's Support.
- Canal Network may end in any free district reached from the source through a
  path whose source and intermediate districts contain Riverworks Support.
- Scatter the Flock moves the maximum possible number of Support from the Rally
  district. The owner chooses that many distinct neighboring districts with a
  free spot; the Rally district may be emptied.
- Night Shift uses the normal Rally presence rule, restricted to the legal
  districts tied for the fewest total Support when the delayed bonus resolves.
  It fails automatically if none is legal.

## Step 1: Migrate the canonical rules and engine

- Archive the replaced rules and party-board specification.
- Record the approved matrix, resolution details, ruleset version, and
  changelog entry.
- Update content, protocol choices, engine semantics, delayed-claim state, and
  focused game tests for all twelve bonuses.
- Commit the completed canonical migration.

## Step 2: Align clients, components, and guidance

- Update the web operation form and map-choice flow for every new bonus input.
- Update the example agent, party boards, token guidance, rules examples,
  glossary, player aid, and playtest API/guide.
- Add focused web and protocol coverage, then run the full repository check.
- Commit the completed client and documentation alignment.

## Review

- Obtain an independent code review.
- Fix every high- or medium-severity finding and repeat review until none
  remain.
- Report low-severity findings before optional changes; fix low documentation
  findings directly.

## Done when

- The engine, public content, web client, physical documents, and playtest
  guidance expose only the approved matrix under ruleset version 13.
- Every bonus has deterministic legality and resolution coverage.
- Replaced rules and component text remain reachable in the archive.
- The full repository check passes and independent review reports no high or
  medium issues.
