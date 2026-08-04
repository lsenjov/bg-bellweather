# Double Court card supply

## Goal

Give each player twice as many Court cards while preserving the existing rule
that every resource in the two- and three-player setup is double the standard
four-to-six-player supply.

## Steps

1. **Canonical setup and ruleset — completed.** Increase Court from one to two cards in the
   standard supply and from two to four in the doubled supply, advance the
   executable ruleset to version 10 without a saved-game migration, and update
   focused setup and compatibility coverage.
2. **Rules, components, and print supply — completed.** Update current setup guidance,
   playtest material, component inventories, the decision log, and changelog;
   archive the replaced one-Court-per-standard-player rule and six-card print
   specification; repack the nine printable bid-card sheets as a full 144-card
   supply and regenerate the print-ready PDF.
3. **Verification and review — completed.** Run focused checks and the full repository
   validation, inspect the regenerated card PDF, obtain an independent review,
   and resolve every high or medium finding before handoff.

## Committed interpretation

- “Double the number” applies to the current per-player quantities: standard
  players move from one Court card to two, and low-player doubled supplies move
  from two Court cards to four.
- The maximum six-player shared supply moves from six Court cards to twelve and
  from 138 transferable bid cards to 144. Nine 4 × 4 sheets still suffice, now
  with no blank positions.
- This is a closed-economy balance change. Ruleset version 10 rejects pre-change
  saved games rather than fabricating the additional cards.
- Court behavior, party bonuses, card dimensions, and all non-Court setup
  quantities remain unchanged.

## Verification

- Focused content, engine, server, and web coverage passed with 100 tests.
- `npm run check` passed all typechecks, 148 tests, validation of 67 HTML
  documents, and the production build.
- The regenerated bid-card PDF contains nine A4 pages. Its full final sheet has
  four Smear cards and all twelve Court cards with no blank positions.
- The first independent review found one stale active playtest prompt; the
  correction and a stale 138-card footer were included in a fresh review that
  reported no high, medium, or low issues.
