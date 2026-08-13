# Sequential Operation resolution

## Goal

Resolve an Operate action one card at a time in the engine and browser. After the first card resolves, the active player may resolve up to two more cards at the same party, seeing the updated board between cards, or finish the action and pass play clockwise.

Restore direct mouse selection on the shared party and district displays. Party Openings use select-then-confirm so an accidental click cannot place a Firm marker.

## Step 1: engine and protocol

- Store an in-progress Operate sequence in the Lobby phase: its locked party, number of cards resolved, and whether its one allowed party bonus has been used.
- Change `operate` to accept and resolve exactly one card.
- Add `finish_operate` after the first or second card. Resolve the third card and finish automatically.
- While an Operate sequence is active, reject Collect, Close, Pass, a different party, and a second bonus.
- Record the sequence as one Lobby action while retaining one public resolved-Operation entry per card.
- Update protocol, server event projection, API agent, and focused tests.

Commit when the non-web tests and typechecks pass.

## Step 2: browser interaction

- Replace the multi-card composer with one current Operation form.
- After each successful card, render the updated map and show either the next-card controls or `Finish Operate`; after card three the turn advances automatically.
- Lock the party selector once the sequence begins and keep the one-bonus limit visible.
- Let party-file clicks select an Opening party, Operate party, or party target according to the armed field.
- Let district clicks fill the armed district field, and Support-piece clicks fill Smear district and rival together.
- Retain select controls as keyboard-accessible alternatives and require explicit confirmation for an Opening.
- Give selectable, selected, and unavailable map targets visible states.

Commit when web tests, typecheck, and build pass.

## Step 3: documentation and verification

- Update current rules, examples, player aid, agent API, decision log, and changelog to describe sequential resolution.
- Run the documentation checker and the complete repository check.
- Have a fresh agent review the implementation. Fix all high and medium findings and repeat review until none remain; fix low documentation findings.

Commit documentation and each review-fix pass separately.
