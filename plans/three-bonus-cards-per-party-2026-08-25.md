# Three Bonus Cards Per Party

Expand the collectible Bonus-card supply from twelve to eighteen cards. Each party keeps its two preferred-Operation cards and gains one Unbound card that resolves only its printed effect. Preserve the existing one-card award limit, home/reciprocal-partner play rule, New Year circulation, and return-home timing.

## Selected Unbound cards

- Honeycomb — **Every Bee Counts:** add acting-party Support in every district containing exactly one acting-party Support and a free spot.
- Old Shell — **Institutional Memory:** choose a revealed scoring card and move any legal subset of its three named-party Support into their objective districts.
- Foxglove — **Shell Firm:** move the acting party's Firm marker and complete pile to another party without a Firm marker, then end the Lobby action.
- Riverworks — **Mass Transit:** shift chosen Support along a two-to-five-district path toward a free endpoint.
- Many Wings — **Empty Every Nest:** move one acting-party Support from every district containing at least two into the same number of distinct districts where it is absent and a spot is free.
- Night Parliament — **Midnight Session:** place one of the acting player's returned Firm markers on a closed party, reopening it empty under that player's ownership.

## Rules clarifications

- An Unbound Bonus card has no Operation baseline but otherwise occupies one card slot in an Operate action.
- A Bonus-card play must change game state. Institutional Memory is the exception to complete resolution: at least one objective must resolve, but blocked objectives may be skipped.
- Shell Firm may relocate another player's active Firm. The Firm owner does not change.
- Midnight Session may reopen a party more than once in a year and may enable repeated Closure awards.
- At the end of every Lobby turn, the year ends when strictly more than half of the Firm markers placed during Party Openings are returned. Shell Firm does not change this count; Midnight Session reduces it.
- Collect and every form of Closure still award at most one Bonus card.

## Steps

1. [x] Expand canonical content and protocol types, implement the six Unbound resolutions and returned-Firm year-end rule in the game engine, and add focused content, legality, resolution, circulation, ownership, and timing tests.
2. [x] Update protocol consumers, server/testkit adapters, projections, and the browser Operate workflow for Unbound card choices; add focused integration and UI tests.
3. [ ] Update current rules, examples, glossary, design decisions, open questions, component specifications, candidate archive status, changelog, and the eighteen-card printable sheet/PDF.
4. [ ] Run the complete repository check, conduct an independent code review, fix all high and medium findings plus low documentation findings, and repeat review until no high or medium issues remain.
