# Regional starting Support

## Agreed setup

Each party starts once in Harbormouth, once in Northgate, and once in Outlying.
Shuffle one Support of each party into two spaces each in Coast, Vale and Marsh.
All other districts start empty, including Centre.

## Implementation

1. Update shared setup and initialization, add distribution and replay tests, archive
   the replaced rule and board specification, and align current documentation as
   Ruleset 28. Run the repository checks and independent code review, resolve
   findings, then commit this step.

## Completed

- Implemented Ruleset 28 setup and updated action tests for the new positions.
- Archived Ruleset 27 rules and board reference; aligned current documentation.
- `npm run check` passed: type checks, 165 tests, generated-document and link
  checks, and production build. Document checks also passed after the final
  current-version label updates.
- Independent code review reported no high, medium or low issues.
