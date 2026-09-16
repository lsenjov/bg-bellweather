# Party and Global policy effects

Scope: rules and physical game components only. Do not change apps/ or packages/.

## Step 1 — Update and validate the physical rules and components

- Archive replaced rules and component specifications with working relative links.
- Make thirteen Operation effects Party and two scoring effects Global. Award Party laws permanently to the largest surviving For contributor in the policy region, breaking ties by printed leftmost order.
- Sort each printed vote row by descending absolute issue-rank gap, then higher + priority. Apply Party laws only to the recipient acting party, including explicit Bonus Operations. Preserve all-policy scoring and non-stacking.
- Update reference rules, examples, glossary, physical cards, helper, table setup, decisions and changelog. Keep existing app/map divergence explicit.
- Check generated output, deck ordering, links, and print layout; refresh affected PDFs. Obtain independent review and resolve all high/medium and documentation findings before committing this step.

## Completion

Step 1 complete.

- Archived ten replaced rule/component documents; recorded Ruleset 27 and the app deferral.
- `npm run docs:check` passes for generated content and all 214 HTML files.
- Independently verified scope and both vote-row orders for all 30 cards: 26 Party, 4 Global.
- Refreshed local PDF exports: policy deck 4 A4 pages, helper 1, party workspaces 3 landscape. These generated PDFs are ignored by Git, as before.
- Visually inspected the policy deck and helper. Independent Chromium print checks found no overflow on all 30 policy cards and three helpers.
- Independent agent review found no high/medium issues; fixed its two low documentation inconsistencies. `git diff --check` passes.
- No apps/ or packages/ files changed.
