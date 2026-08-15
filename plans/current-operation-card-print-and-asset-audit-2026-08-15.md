# Current Operation-card print and asset audit

## Goal

Replace the misleading Ruleset 14 bid-card export with the current Ruleset 15
Operation-card supply, then identify every other printable asset that is not
ready for current play.

## Step 1 — Current card sheets

- Keep the established `bid-cards` source and PDF paths for compatibility, but
  retitle their contents as Operation cards.
- Print the complete six-player supply: twelve Organise, twenty-four Rally,
  twelve Smear, and twelve Court cards across four A4 portrait sheets.
- Remove Leverage, Bluff, and auction wording from the live printable.
- Mark every printed sheet as Ruleset 15 so a detached PDF remains identifiable.
- Link the printable from the current card specification and align the exporter,
  README, design decisions, and changelog.
- Regenerate the PDF, inspect every page, and run relevant documentation and
  print validations.

Commit when the source, generated output, and documentation are consistent.

## Step 2 — Independent review

- Have a separate agent review the implementation for correctness and print
  usability.
- Fix every high or medium issue and repeat review until none remain.
- Fix low documentation issues; report any other low issues before continuing.
- Commit each review-fix pass separately.

## Step 3 — Remaining print-asset audit

- Compare every exported printable with Ruleset 15's rules and component specs.
- Distinguish current assets from explicitly archived Ruleset 14 artifacts.
- Report what is current, what is obsolete, and the smallest replacement needed
  for each obsolete asset.
