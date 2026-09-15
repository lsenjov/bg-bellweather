# Policy component prototype

Scope: physical components and their documentation only. Leave apps/, packages/, current rulebook, and unrelated work unchanged. Preserve the previous component suite. Component generators and print export tooling are in scope.

## Step 1 — Complete the policy component suite

- Archive replaced component HTML and print styles with working relative links.
- Draft six balanced party orders in reverse pairs, twelve balanced unique firm orders excluding party orders, and thirty directed-pair policies with computed votes and fifteen selected effects used twice each. Opposite policies get different effects; match themes where practical.
- Update printable cards, party workspaces, folios, helper, shared tokens, map, and final score ledger. Remove Court and coalitions; retain final hand rank.
- Document agreed timing, scoring and law composition in the component reference; label unresolved interactions as open questions.
- Record decisions and changelog without updating the application rulebook.
- Validate deck invariants, generated output, document links, and actual print layout/PDFs. Obtain an independent agent review, resolve high/medium findings and low documentation findings, then commit the completed step.

## Validation and completion

Completed.

- `npm run docs:check` passes, including generator invariants and all 169 HTML documents.
- Print export passes: policy deck 4 pages, scoring deck 1, Operations 4, Bonuses 2, party boards 3, folios 2, helper 1, regional labels 1, shared tokens 1, final ledger 1; map is A3. PDF dimensions and embedded fonts validated by the exporter.
- Chromium print inspection found no component overflow; visually checked policy cards, party boards, helper and policy map. Fixed an extra blank ledger page.
- Independent agent review reported no high or medium issues. Fixed its low documentation findings concerning score-marker descriptions, duplicated metadata and archived links to mutable PDF exports.
- Three Bonus/law interactions remain explicitly open in the component reference; no unapproved rules were invented.
- App, package content, existing app map asset, current rulebook and unrelated work remain untouched.
