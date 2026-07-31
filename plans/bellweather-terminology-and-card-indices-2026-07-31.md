# Bellweather terminology and card indices

## Goal

Complete a breaking terminology migration from Bellwether, Clout, Court, and Overture to Bellweather, Leverage, Coalition, and Coalition Target, then redesign transferable bid cards with unique playing-card-style corner initials.

## Steps

- [x] Rename internal package scopes, content IDs, API fields, protocol payloads, engine state, environment variables, application code, and tests with no compatibility layer; bump the ruleset version.
- [x] Rename all live player-facing rules, component specifications, application labels, and printable content while preserving superseded terminology in archives and historical entries.
- [x] Redesign all six transferable bid-card fronts with unique L/B/O/R/S/C corner indices, including a lower-right index rotated 180 degrees, while retaining full names, effects, colour families, central glyphs, and the shared back.
- [x] Record the breaking terminology decision and archive the replaced nomenclature.
- [x] Regenerate all print assets, inspect every revised card family and affected board, and run full repository validation.
- [x] Obtain an independent review and resolve every high or medium finding before handoff.

## Migration map

- Bellwether / `bellwether` / `BELLWETHER` → Bellweather / `bellweather` / `BELLWEATHER`
- Clout / `clout` → Leverage / `leverage`
- Court / `court` → Coalition / `coalition`
- Overture state → Coalition Target state / `coalitionTargets`
- Reinforced Overture state → reinforced Coalition state
- `@bellwether/*` → `@bellweather/*`

## Constraints

- Do not change operation, coalition, bidding, scoring, or Election mechanics.
- Pre-rename web-playtest saves may be incompatible; no migration or legacy alias is required.
- Preserve superseded terms in `archive/`, old changelog entries, old decision entries, and prior implementation plans.
