# Two-face policy cards

Implement the approved proposal/enacted design for all thirty physical policy cards. Keep the 63 × 88 mm dimensions, names, issue pairs, vote order, effects, recipients, scopes and scoring rules. Preserve the approved front and back flavour verbatim. App changes and publishing are outside scope.

## Step 1 — Complete the component redesign

- Archive the previous policy specification, printable layout, stylesheet and data with working relative links.
- Add front/back flavour to the physical component source.
- Generate proposal fronts with name, flavour and ordered For/Against issue rows; generate enacted backs with name, unchanged issues, ability name/full text, Party/Global scope and consequence flavour.
- Produce four A4 duplex sheet pairs with mirrored back columns and matching empty slots.
- Update the reference, component inventory, decisions and changelog.
- Update affected print and TTS export/check paths for thirty unique paired backs; generate local assets without publishing.
- Validate generation freshness, original mechanical data, document links, card dimensions, content fit, duplex correspondence and exported assets. Inspect rendered fronts and backs, including long content.
- Obtain an independent gpt-6.1-sol code review. Resolve valid high/medium findings and request a fresh review; fix documentation lows and report any remaining lows.
- Commit the reviewed implementation and record verification here.

## Status

Step 1 complete: implementation, local exports, verification and independent review passed. No text cuts or card-size changes were needed.

## Verification

- Original JSON is identical after removing the two new flavour fields; all names, issue pairs, effects, party priorities and scoring cards are preserved.
- `npm run docs:check` passes, including generated-file freshness and all 299 HTML files' local links.
- Print layout checks cover all sixty policy faces, physical dimensions, text bounds, unchanged content, vote order, issue signs, and mirrored front/back positions including empty slots.
- Full print export passes page-size/count and embedded-font checks. The policy PDF contains eight A4 pages; extracted IDs match in each front/back pair (9, 9, 9, 3 cards).
- Inspected rendered proposal and enacted faces, including long flavour and the longest ability. Ability text is 9.5 pt; approved prose is unchanged.
- Local TTS export/check passes: 151 cards in sixteen decks, including thirty unique policy backs with matching indices and a generic hidden slot. Regenerated loader passes Lua syntax validation and matches the final manifest.
- Ten loader tests and six publishing dry-run tests pass. No assets have been published.
- Independent gpt-6.1-sol review found no high, medium or low issues. Reviewer independently verified print layout, original mechanical-data equality, TTS assets, loader generation and loader tests.

Printer registration and Tabletop Simulator appearance/handling still need physical/in-game confirmation; automated checks cannot verify those environments.
