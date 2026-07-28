# Lobbying House Player Kits

## Goal

Create printable player boards and identity tokens for the six lobbying houses. Each house kit must provide two circular 70 mm counterbid covers, one opening-bid marker, and one score marker. At two or three players, each human takes two house kits so the existing allowance of two openings and four counterbids is represented without changing the player economy or score.

## Component boundary

### Per lobbying-house kit

- One 200 × 140 mm player board with the house identity, number, emblem, component parking, hidden-agenda space, concealed-reserve reminder, and compact Campaign Round reference.
- Two 70 mm circular counterbid cover roundels, labelled A and B.
- One opening-bid marker sized to fit the party-board opening area, with the house emblem and two large copies of the house number.
- One score marker with the house emblem and number.

### Per human player

- One concealed reserve shared by every house that player controls.
- 20 total Clout for the first prototype, not 20 per controlled house.
- One identical operative supply, with its quantity still open.
- One hidden scoring card.
- One active score marker on the shared score track. At two or three players, leave the second controlled house’s marker unused.
- One privacy screen or equivalent concealment. The player board identifies reserve areas but is not itself an opaque screen.

### Shared or unresolved

- Clout should remain neutral rather than house-colored because it transfers between players.
- Operative cards remain neutral reusable assets and their count and physical format are open.
- The Campaign Round/Election Day tracker, score track, timer, party state markers, and Support remain shared.
- Whether low-player games should instead give each controlled house a separate economy, operative reserve, agenda, and score is an open question; this implementation preserves the current player-based rules.
- Printed cover roundels are artwork for mounting on opaque cups, domes, or fabricated covers. Flat paper alone does not satisfy the concealment requirement.

## Visual direction

Treat the six houses as competing influence bureaux whose stationery escaped from a parliamentary records office: oversized docket numbers, guilloche and security-print patterns, blunt approval stamps, and house-specific emblems. Preserve the existing warm-paper archive aesthetic while giving each kit a color, emblem, and pattern so ownership never depends on color alone.

| House | Number device | Emblem | Primary distinction |
| --- | --- | --- | --- |
| One Fell Swoop Public Affairs | One | Descending wing | Vermilion / diagonal flight lines |
| Pairliament Partners | Pair | Mirrored speech-beaks | Blue / paired vertical lines |
| TriumviRAT Advisory | Tri | Three interlocked tails | Ochre / triple-dot register |
| IVy League Public Affairs | IV | Four-leaf ivy sprig | Green / lattice |
| Vested Interests | V | Five-button waistcoat | Plum / chevrons |
| VI.P. Access Group | VI | Six-notch access pass | Teal / hexagonal grid |

## Implementation steps

1. **Specify the kits in the live documentation.**
   - Record the user-committed kit allocation in the decision log.
   - Update component inventory, player-aid requirements, setup language, the documentation index, and changelog.
   - Keep screen requirements clearly provisional where the rules have not committed their physical format.
   - Validate and commit.

2. **Create printable player boards.**
   - Add a six-board HTML print artifact and dedicated CSS.
   - Lay out two 200 × 140 mm boards per A4 portrait sheet at exact physical dimensions.
   - Include all six identities and a shared reference that does not invent unresolved rules.
   - Inspect in the collaborative browser at screen and print-oriented sizes, validate, and commit.

3. **Create printable house tokens.**
   - Add a six-kit HTML print artifact and dedicated CSS.
   - Lay out two kits per A4 landscape sheet.
   - Make every counterbid cover roundel exactly 70 mm across.
   - Include one opening-bid marker per kit, with its emblem and two large number labels readable from opposite sides.
   - Include one score marker per kit with its emblem and number.
   - Inspect dimensions and visual output, validate, and commit.

4. **Integrate and review.**
   - Cross-link the specification, boards, tokens, rules, and index.
   - Run document, whitespace, and physical-dimension checks.
   - Request an independent review and fix every high or medium issue, repeating review until none remain.
   - Report any low issues before further work.
