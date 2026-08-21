# Ruleset 22 Player Helper

## Goal

Replace pass-ended years with mandatory personal Closure before Pass, allow Collect at empty open parties, and keep the digital game, current rules, and affected physical references aligned. Add a one-sided player helper that fits three-up on A4 and reduce the player folios without changing their card-well layout.

## Decisions

- Collect may target any open party, including one with an empty Operation pile and no available Bonus card.
- Pass is legal only after every Firm marker controlled by that player has returned.
- Only a strict majority of returned Firm markers ends the Lobby; the player who creates it becomes Early Bird.
- The digital edition implements the rules changes but does not display the printable helper.
- The helper is a neutral, one-sided 210 × 99 mm reference printed three-up on A4.
- Player folios become 200 × 90 mm, three per A4 page, retain their mottos, and remove instructional copy.
- Agenda wells retain their geometry but reverse their visual stack to Election 3, 2, 1 from bottom to top.
- Unchanged physical components retain their current revision and are not regenerated.
- A variable Bonus-card setup remains an open design question, not a Ruleset 22 rule.

## Steps

1. [x] Remove pass-orbit state and endings, enforce returned-Firm Pass eligibility, allow empty Collects, update Ruleset 22 state and dependent digital surfaces, and cover the behavior with focused tests.
2. [x] Update the current rules, glossary, examples, player-aid and player-kit specifications, decisions, open questions, changelog, and playtest/API references; archive the replaced Ruleset 21 rules and folio specification.
3. [x] Create the three-up printable helper, reduce and reorder the player folios, update print export checks, export only the helper and folio PDFs, and inspect both at print resolution.
4. [x] Run the complete validation suite, obtain an independent review, resolve every high and medium issue, record any low issues before continuing, and complete the plan.

## Validation

- Focused game, server, web, protocol, content, and example-agent tests while changing behavior
- `npm run check`
- PDF page-count, A4 geometry, font-embedding, and rendered-image inspection for the helper and player folios
- Independent review with no remaining high or medium findings
