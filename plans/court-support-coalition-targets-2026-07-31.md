# Court Support and Coalition Targets

## Goal

Replace the direct Coalition redirection operation with a Court operation that builds temporary support for prospective partners, while preserving persistent directional Coalition Targets and reciprocal coalitions.

## Committed rules

- Rename the Coalition operation and transferable card to Court.
- Each party board has one Court space for every other party.
- Court places one acting-party Support on a chosen Court space, including the space for the current Coalition Target.
- After each placement, a unique Court Support leader becomes the acting party's Coalition Target. A tie leaves the existing target unchanged.
- Coalition Targets begin unpointed, persist through Election Day, and form a coalition only when reciprocal.
- Clear all Court Support after Election Day scoring without changing Coalition Targets.
- Binding Pact places a second Old Shell Support on the Court space chosen by its triggering Court operation.
- Local Chapters adds Many Wings Support to a free district spot containing Support belonging to Many Wings' current Coalition Target after Court resolves.
- Existing once-per-contest bonus availability and timing remain unchanged.
- Court Support uses normal unlimited party Support but is separate from district Support and Election Day draws.

## Steps

1. Change content and game state from Coalition operations and reinforcement state to Court operations and per-party Court Support. Add unique-leader target updates, bonus behavior, Election Day clearing, and focused tests.
2. Migrate protocol, server projection, example agent, and web controls to Court and expose Court Support publicly.
3. Archive the replaced direct-redirection rule and component specification. Update live rules, glossary, examples, decisions, changelog, party boards, bid cards, and related component text.
4. Run repository tests, type checks, and builds. Inspect affected printable pages and browser UI where practical.
5. Request an independent code review and fix all medium- or high-severity findings, repeating review until none remain.

## Compatibility

This is a breaking ruleset-version-5 migration. Operation inventories and choices use `court`; game state uses `courtSupport`; the removed `coalition` operation and reinforcement fields have no compatibility aliases because the current project has no persisted public playtest saves.
