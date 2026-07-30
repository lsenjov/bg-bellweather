# Rally supply and Election retention

## Goal

Increase board growth by giving each standard player four Rally cards, doubled to eight at two or three players, and make Election Day retain only the randomly drawn Support in each district named by a revealed agenda.

## Steps

- [x] Update setup data, printable bid-card quantities, component specifications, and tests for the 2 Organise / 4 Rally / 2 Smear / 1 Court standard supply.
- [x] Change Election Day so each named district keeps its shared 3/2/1 draw while every undrawn Support there returns to supply; leave unnamed districts, including Bellwether Centre, unchanged.
- [x] Regenerate print exports, inspect the repacked bid-card sheets, and run full repository validation.
- [x] Obtain an independent review and resolve every high or medium finding before handoff.

## Design constraints

- The retained draw is still shared by every revealed objective naming that district.
- Coalition matching changes scoring only; it does not change which Support remains.
- A named district containing fewer Support than its draw count keeps all of them.
- Bellwether Centre is absent from the scoring deck and therefore remains an Election-proof chokepoint.

## Verification

- Regenerated all print assets; the bid-card export is eighteen A4 portrait pages.
- Inspected the Rally-only seventh front, mixed Rally/Smear eighth front, and final Smear/Court front with their duplex pagination intact.
- Passed workspace typechecks, 75 tests, 50-document validation, and the production build.
- Independent review found no high, medium, or low issues.
