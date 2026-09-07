# Ruleset 24: inland regions, middle-region scoring and reciprocal Court

Adopt the approved inland map (16 districts, three regions of 18 Support, Coast 4 / Westfield 2), shared borders and nine bridges. District elections stay local. Each agenda assigns three different parties to Urban/Mixed/Outlying; its base score is the middle regional total including reciprocal coalition Support. Two/three-player pairs score each card separately and add the two results; replace a conflicting second card when a region–party pair repeats within that Election slot. First card supplies Capital parties; no gain/lose references at low player counts. Other players' base scores supply gain/lose references at four or more players. Keep Capital and final hand-ranking bonuses.

Court adds both reciprocal Court Support and updates both Targets using existing strict-lead/tie rules. Bonus cards are playable at any open party. An off-home card first performs an additional Court toward its home party, then its printed action; the entire card remains atomic. Institutional Memory chooses a destination district within each selected objective region.

1. [x] Implement content, scoring/dealing, reciprocal Court, automatic Bonus Court and protocol changes with meaningful engine/content tests. Independent review, fix findings, commit.
2. [x] Update browser map/scoring/action controls and automated playtest agent, including legality after automatic Court and region destinations. Verify consumers and UI tests; independent review, fix findings, commit.
3. [ ] Archive replaced rules/components, update current documentation and printable map/cards/aids, record decisions/changelog, and run complete project checks. Independent review, fix findings, commit.

No compatibility layer for old district IDs, scoring objectives or Ruleset 23 games. Preserve historical archives and playtest records. Use the accepted prototype as the geometry source. Check exact topology agreement, regional capacities, card party uniqueness/balance, conflict-free low-player dealing, middle-score ties and paired scoring, unaffected Capital/modifiers, symmetric Target changes, off-home Court ordering/rollback, and Institutional Memory destination validation.

Step 1: 92 content/game/protocol tests pass; game TypeScript and default-map reproducibility pass. Independent review approved with no findings. Consumer migration and documentation remain in steps 2–3.

Browser design: reuse the approved map silhouette and navy #19354b, water #d9edf5, Urban #d5e7f5, Mixed #dbeaca, Outlying #f5e7ac and Centre #e4dfea. Keep the existing editorial page typography, with small centered district labels over the actual territories. SVG coastlines/bridges sit beneath accessible HTML district and Support controls; compact screens scroll the whole map instead of breaking its geography into disconnected cards. Regional agenda lines show party and region together, with a concise middle-score rule.

Step 2: browser map and regional controls migrated; 32 UI tests and full build pass. Full suite passed 149 tests before adding the extra off-home UI test. Existing playtest agent reads shared district content and required no behavior changes. Visual render inspected. Review caught a hover-centering conflict; fixed with independent CSS translation and re-review approved without remaining findings.
