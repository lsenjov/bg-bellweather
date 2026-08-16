# City-spoke map and scoring deck

## Goal

Connect Bellweather Centre's three capacity-two spoke districts directly to the
three capacity-six city districts, then rebuild the scoring deck so every card
still names one pairwise non-neighboring district at each scoring capacity.

## Constraints

- Keep all sixteen district names, Support capacities, the outer ring, eighteen
  total connections, and fifty-seven Support spaces.
- Replace Crown Road—Northreach, Canal Ward—Reedwater, and Old Quarter—Westgate
  with Crown Road—Harbormouth, Canal Ward—Grand Market, and Old Quarter—Ironwood.
- Keep all twenty-four scoring-card IDs, twelve registered low-player pairs,
  card dimensions, district frequency, party frequency, and seat-reference
  balance.
- Give every scoring card three different parties and one capacity-six,
  capacity-four, and capacity-two district that are pairwise non-neighboring.
- Treat the topology and deck replacement as a new ruleset without migrating
  older saved games.

## Steps

1. ✅ Update and verify the executable district topology, browser map layout, and
   printable district map while preserving the established territorial-atlas
   presentation and accessibility.
2. ✅ Replace and verify all scoring-card objectives, registered-pair
   compatibility, specification inventory, printable card faces, and generated
   PDF.
3. ✅ Archive the replaced map and scoring-card specifications, record the design
   decision and changelog entry, advance the ruleset, update current rules and
   component documentation, regenerate print assets, and run the full project
   checks.
4. ✅ Obtain an independent code review and resolve all high- and medium-severity
   findings, repeating review until none remain; fix low documentation findings
   and report any other low findings before proceeding.

## Verification

- Content tests assert the exact new eighteen-edge graph and symmetric
  adjacency.
- Deck tests assert all twenty-four exact card definitions, twelve disjoint
  compatible pairs, pairwise non-adjacency, capacity order, and preserved
  district, party, and seat-reference distributions.
- Browser and printable maps visibly place each spoke against its capacity-six
  city rather than its former capacity-two ring district, with matching shared
  curve geometry and a contained Centre label.
- Every printable scoring-card front carries its card ID and an R17 mark so the
  replacement deck cannot be silently mixed with the archived version.
- `npm run check` passes and the print exporter produces valid embedded-font
  PDFs at the expected page sizes.
- Two independent review passes report no remaining high-, medium-, or
  low-severity findings.
