# Bid controls, stack counts, and party emblems

## Goal

Align the web play surface with players' physical card inventories and the printed party identity system, while making covered bid-stack size public without revealing its composition.

## Steps

1. **Party emblem alignment — completed.** Add reusable SVG party emblems to the web app using the printed board-game artwork for Old Shell, Foxglove, Riverworks, Many Wings, and Night Parliament. Keep the app's single-cell Honeycomb mark and replace the printed Honeycomb cluster wherever the current physical components use it. Record and archive the component decision, update the changelog, and verify documentation.
2. **Inventory-capped bid selectors — completed.** Replace bid quantity number inputs with selects. For simultaneous opening drafts, cap each select at the reserve remaining after the other rows. For a counterbid replacement, cap each select at the uncommitted reserve plus the selected bid's existing cards. Add focused web tests for the selector limits and run the web checks.
3. **Public stack-size projection — completed.** Add a public transferable-card count to each bid projection, including Leverage, Bluff, and operation cards but excluding the firm identity card. Show that count while composition is concealed, retain the revealed breakdown, update and archive the superseded hidden-count rule, record the decision and changelog, and add server/web coverage.
4. **Final verification and review** — Run the complete repository check, inspect the changed app in the collaborative browser at desktop and mobile sizes, and obtain an independent code review. Resolve all high and medium findings before handoff.

## Constraints

- Never expose the family breakdown of a covered bid.
- Empty counterbids show zero transferable cards.
- Selectors must remain valid while editing multiple opening bids or replacing an existing counterbid.
- Party identity must remain recognizable without relying only on colour.
