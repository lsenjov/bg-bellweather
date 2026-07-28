# Ladder Bidding

Working repository for the board game currently titled **Ladder Bidding**.

Rival lobbying houses use Clout and operatives to influence six animal political
parties in the fictional Republic of Bellwether. The game is at pre-prototype
stage; a printable map of sixteen named districts, Support actions, and all
twelve party bonuses are committed, while starting Support, elections,
government formation, and victory remain open.
The documents deliberately separate committed rules, working hypotheses, and
open questions.

Start here:

- [`docs/index.html`](docs/index.html) — documentation home
- [`docs/design/vision.html`](docs/design/vision.html) — the pitch and target experience
- [`docs/rules/current-rules.html`](docs/rules/current-rules.html) — current rules, including explicit gaps
- [`docs/design/open-questions.html`](docs/design/open-questions.html) — the next decisions to make
- [`docs/playtesting/playtest-guide.html`](docs/playtesting/playtest-guide.html) — prototype and session guidance

Open `docs/index.html` directly in a browser. No build step or web server is
required.

## Validate the archive

Requires Node.js 22 or newer.

```sh
node scripts/check-docs.mjs
```

The check verifies document structure, local links, stylesheet references,
fragment targets, duplicate IDs, and reachability from the docs index.
