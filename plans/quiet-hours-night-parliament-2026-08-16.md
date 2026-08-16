# Quiet Hours for Night Parliament

## Goal

Replace Night Shift's provisional same-district Double Rally with **Quiet Hours**:
after Rally, add one Night Support to an otherwise empty district chosen by the
acting player.

This is a breaking balance change. Advance to Ruleset 16 without migrating
Ruleset 15 games.

## Step 1 — Record the rule change

- Archive the replaced Ruleset 15 Night Shift rule and party-board text.
- Record Quiet Hours in the current rules, examples, party-board specification,
  design decisions, open questions, playtest guidance, and changelog.
- Advance the documented and executable ruleset version to 16.

Commit when the documentation checker passes.

## Step 2 — Implement and test Quiet Hours

- Rename the content and engine bonus.
- Reuse the Rally choice's `bonusDistrictId` for the selected empty district.
- Require the selected district to contain no Support after the Rally baseline;
  reject absent, occupied, or omitted selections atomically.
- Replace Double Rally coverage with successful and failed Quiet Hours cases.

Commit when the content and game tests and typechecks pass.

## Step 3 — Update the web controls

- Show a Quiet Hours district selector when the Night Parliament Rally bonus is
  claimed.
- Keep map-assisted selection limited to legal empty districts.
- Add interaction coverage for the new selector and submitted choice.

Commit when the web tests and typecheck pass.

## Step 4 — Verify and review

- Run the full repository check and inspect the final diff for unrelated edits.
- Have a separate agent review correctness, security, performance, and
  maintainability.
- Fix all high and medium findings and repeat review until none remain.
- Fix low documentation findings and report any other low findings.

Commit each review-fix pass separately.
