import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
const data = JSON.parse(readFileSync(root + 'docs/components/policy-deck.json', 'utf8'));
const { categories, parties, scoringCards, policies } = data;
// The physical prototype advances independently of the app's shared policy data.
const effects = data.effects.map((effect) => ({
  ...effect,
  scope: [19, 20].includes(effect.id) ? 'Global' : 'Party',
  ...(effect.id === 29 ? { text: 'After Organise moves Support across a region boundary, add one acting-party Support at its destination.' } : {}),
}));
const key = (order) => order.join('|');
const unique = (values) => new Set(values).size === values.length;
const validOrder = (order) => order.length === 6 && key([...order].sort()) === key([...categories].sort());
assert.equal(categories.length, 6);
assert(unique(categories));
assert.equal(parties.length, 6);
assert.equal(scoringCards.length, 12);
assert.equal(effects.length, 15);
assert.equal(policies.length, 30);
assert.deepEqual(effects.map((e) => e.id), [1, 6, 7, 9, 10, 11, 14, 17, 19, 20, 22, 28, 29, 30, 35]);
for (const deck of [parties, scoringCards]) {
  assert(deck.every((card) => validOrder(card.order)));
  assert(unique(deck.map((card) => key(card.order))));
  for (const category of categories) for (let rank = 0; rank < 6; rank++) {
    assert.equal(deck.filter((card) => card.order[rank] === category).length, deck.length / 6);
  }
}
assert(unique(scoringCards.map((card) => card.id)));
assert(unique(policies.map((card) => card.id)));
for (const party of parties) {
  assert(parties.some((other) => key(other.order) === key([...party.order].reverse())));
  assert(!scoringCards.some((card) => key(card.order) === key(party.order)));
}
const votes = (card, forPolicy) => parties
  .filter((p) => (p.order.indexOf(card.plus) < p.order.indexOf(card.minus)) === forPolicy)
  .sort((a, b) => {
    const gap = (p) => Math.abs(p.order.indexOf(card.plus) - p.order.indexOf(card.minus));
    return gap(b) - gap(a) || a.order.indexOf(card.plus) - b.order.indexOf(card.plus);
  });
for (const plus of categories) for (const minus of categories) {
  if (plus === minus) continue;
  const matches = policies.filter((p) => p.plus === plus && p.minus === minus);
  assert.equal(matches.length, 1);
  const card = matches[0];
  assert.equal(votes(card, true).length, 3);
  assert.notEqual(card.effect, policies.find((p) => p.plus === minus && p.minus === plus).effect);
  assert(effects.some((e) => e.id === card.effect));
}
for (const effect of effects) assert.equal(policies.filter((p) => p.effect === effect.id).length, 2);
assert.equal(policies.filter((p) => effects.find((e) => e.id === p.effect).scope === 'Party').length, 26);
for (const party of parties) assert.equal(policies.filter((p) => votes(p, true)[0] === party).length, 5);
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const effectFor = (card) => effects.find((e) => e.id === card.effect);
function output(path, value) {
  if (check) assert.equal(readFileSync(root + path, 'utf8'), value, `${path} is stale`);
  else writeFileSync(root + path, value);
}
function page(title, body) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — Bellwether</title><link rel="stylesheet" href="../styles.css"></head><body><header class="page-header"><div class="header-inner"><h1>${title}</h1><p class="meta">Policy component prototype · September 2026</p></div></header><main><nav class="breadcrumb"><a href="cards.html">Components</a><span>/</span>${title}</nav>${body}</main></body></html>\n`;
}
function table(headings, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headings.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('\n')}</tbody></table></div>`;
}
output('packages/content/src/policy-data.ts', `export const POLICY_DATA = ${JSON.stringify(data, null, 2)} as const;\n`);
const priorityTable = table(['Party', '1st', '2nd', '3rd', '4th', '5th', '6th'], parties.map((p) => [p.name, ...p.order]));
const policyRows = policies.map((p) => [p.id, escape(p.name), '+' + p.plus, '−' + p.minus, votes(p, true).map((p) => p.name).join(', '), votes(p, false).map((p) => p.name).join(', '), `<a href="#effect-${p.effect}">${effectFor(p).name}</a>`, effectFor(p).scope]);
output('docs/components/policy-cards.html', page('Policy cards', `
<p class="intro">Thirty unique policies: every ordered pair of six issues appears once. Each card has a + issue, a − issue, six printed party votes, and a Party or Global ongoing effect. There are 26 Party cards and 4 Global cards. The + row shows three supporting parties; the − row shows three opposing parties. Every party tile uses its established colour, emblem watermark and name, with explicit For/Against labels. <a href="printable-policy-cards.html">Print the 30-card deck</a>.</p>
<section><h2>Setup and regional votes</h2><p>The physical map uses Urban (18 Support / 9 votes), Industrial Belt (14 / 7), Outlying (16 / 8) and Centre (3 / 3, no thinning). The app and current rulebook retain the previous map; see the <a href="board.html">physical board specification</a>.</p><p>Shuffle once. Deal one policy face up to each of Urban, Industrial Belt, Outlying and Bellwether Centre during setup, then after Elections 1 and 2. Keep all four visible during the following two years. Deal without replacement; failed policies stay discarded. Only twelve cards are used in a game.</p><p>After Years 2, 4 and 6 Cleanup, thin each non-Centre district randomly to half its capacity: retain 3, 2 or 1 Support in capacity-6, -4 or -2 districts, or all Support if fewer are present. Centre is a fourth region with one capacity-3 district: retain all its Support.</p><p>Each surviving Support casts one vote on its region’s policy, following its party’s printed position. More For than Against passes; ties, including 0–0, fail. Count all four votes before activating any newly passed effects. Previously enacted laws remain active.</p><p>Party laws are permanent abilities of the party that supplied the most surviving For votes in that policy’s region when it passed; among tied supporters, the leftmost printed party wins. Parties voting Against are ineligible. Keep each Party policy face up beside its recipient’s party board, separate from Bonus cards and Operation piles. The award never transfers when Support, Firm access or ownership changes. Global laws stay in a shared display and affect every player. Laws accumulate without repeal. Opposite policies can both pass. There are at most eight laws during ongoing play and twelve after the final election. Do not deal new policies after Election 3.</p></section>
<section><h2>Public party priorities</h2><p>These prototype orders are fixed and public. A party votes For exactly when + ranks above −. The three opposite pairs are Honeycomb/Foxglove, Old Shell/Riverworks and Many Wings/Night Parliament. Every issue occupies each rank exactly once, and every policy has three parties on each side. Within each vote row, parties are printed from largest absolute gap between the + and − issue ranks to smallest, then by whichever ranks the + issue higher. Use the printed For row to break recipient ties; no calculation is needed during play.</p>${priorityTable}<p><a href="party-boards.html">Print party workspaces with these rankings</a>.</p></section>
<section><h2>Law resolution</h2><p>Apply a Party law only when its recipient is the acting party, whoever is playing the card. This includes off-home Bonus cards that explicitly resolve the relevant Operation. Moving another party’s Support does not activate that party’s laws; standalone Bonus effects follow their own text. Standalone movement or placement is governed by its own card. Each distinct law effect applies at most once per card action, even if two enacted policies print it or two Support move. An Operate turn may resolve several separate card actions.</p><p>Combine applicable movement permissions: a law may change where Organise can go while Political Exchange permits a swap. With Carpooling, each of two arriving Support needs a free spot or a rival swapped back to the source. Choose the rivals; both arrivals use the same source and destination.</p><p>Resolve the baseline Operation, then all triggered extras, including the Bonus extra and law follow-ups, in the acting firm’s chosen order. Law extra placements and movements are mandatory when possible and otherwise skipped; an unavailable law extra does not block the original Operation. Text offering an alternative remains a choice.</p><p>Follow-ups trigger only from the original Operation, never from other follow-ups. Bridge Campaign and Cross-Region Campaigns compare the original source and destination regions, including Centre. Crossing a region boundary triggers both when awarded to the acting party: Bridge Campaign adds at the destination and Cross-Region Campaigns at the source. A move within one region triggers neither, even if its route passes through another region. The app retains the earlier marked-bridge trigger for Bridge Campaign. Carpooling does not double extras. No loops.</p><p>Identical effects do not stack for the same acting party; copies awarded to different parties work independently. Different applicable effects combine. Duplicate Global scoring effects apply only once. All normal capacity limits and the map’s adjacency rules still apply unless a law explicitly changes the relevant movement or targeting permission.</p></section>
<section><h2>Final scoring</h2><p>Each firm reveals its one secret <a href="scoring-cards.html">issue-priority card</a> after the final election. Every player scores every enacted policy, whether Party or Global and regardless of its recipient: gain the + issue’s value and lose the − issue’s value. Failed and undealt policies score nothing. Global scoring laws from the final election affect scoring, including policies enacted earlier or simultaneously. Party laws awarded at the final election have no later actions to modify, but their policies still score.</p><p>Muted Priorities changes the printed 6-point issue to 4; Broad Interests changes the printed 1-point issue to 3. They do not reorder priorities or change party votes. Both gains and losses use the adjusted values. Laws that double an issue’s score are excluded from this prototype.</p><p>Add the retained final hand-rank bonus: count other human players with fewer than or the same number of ordinary Operation and held Bonus cards after Year 6 Cleanup. Score one point per such player. Home Bonus cards, policy cards and scoring cards do not count. At 2–3 players rank each human’s one combined hand. Final totals may be negative; highest wins, with shared victory on a tie. There is no Capital or regional agenda scoring.</p></section>
<section><h2>Fifteen effects, two copies each</h2>${effects.map((e) => `<h3 id="effect-${e.id}">${e.id}. ${e.name} · ${e.scope}</h3><p>${e.text}</p>`).join('\n')}</section>
<section><h2>Complete deck</h2><p>Names and effect assignments are prototype content, matched thematically where possible. Opposite issue pairs have different ongoing effects.</p>${table(['ID', 'Policy', '+', '−', 'For', 'Against', 'Ongoing effect', 'Scope'], policyRows)}</section>
<section><h2>Previous layout</h2><p><a href="../../archive/rules/before-party-laws-2026-09-16/policy-cards.html">Previous all-Global laws</a>.</p><p><a href="../../archive/components/policy-cards-before-vote-tiles-2026-09-15.html">Policy cards before the coloured vote tiles</a>.</p></section>
<section><h2>Bonus interactions</h2><p>The firm freely orders the Bonus extra and all law extras together. Required Bonus extras must succeed or the entire card action is illegal. Midnight Leak skips if no matching rival is available in a neighboring district. Dig In refills its source if possible and otherwise skips. With Displacement, resolve Smear Bonuses normally against the same rival and original target district: Spin fills the vacated spot; Stonewall removes another matching rival there; Midnight Leak targets a neighbor of the original district.</p></section>`));
output('docs/components/scoring-cards.html', page('Issue scoring cards', `
<p class="intro">Twelve unique secret rankings. Shuffle and deal one card per human firm for the whole game at every player count. Leave unused cards concealed. <a href="printable-scoring-cards.html">Print all twelve cards</a>.</p>
<section><h2>Six issues, six values</h2><p>Top to bottom is worth 6, 5, 4, 3, 2, 1. Every issue occupies each scoring position twice across the deck. No card matches a public party order, including its reverse because that order belongs to its paired party. No two firms receive identical rankings.</p><p>At game end every enacted policy scores + issue value minus − issue value for every firm. For example, +Healthcare worth 6 and −Transport worth 2 scores 4. Failed policies do not score. Apply all enacted scoring laws to all enacted policies, then add the final hand-rank bonus. Negative totals are allowed.</p><p>Muted Priorities changes the printed 6 to 4; Broad Interests changes the printed 1 to 3, for gains and losses. Values change without reordering issues. Party voting positions stay fixed. <a href="policy-cards.html">Full policy component reference</a>.</p></section>
<section><h2>Complete scoring deck</h2>${table(['Card', '6 points', '5 points', '4 points', '3 points', '2 points', '1 point'], scoringCards.map((c) => [c.id, ...c.order]))}</section>
<section><h2>Physical specification</h2><p>40 × 61 mm cards, twelve on one A4 portrait sheet. Use identical opaque sleeves or identical plain backs so rankings and card IDs cannot be identified from the back. Place the card sideways in the 61 × 40 mm Private Priorities well on the separate <a href="player-folios.html">private sheet</a>, behind the Firm shield. These cards do not count toward final hand rank.</p><p>The <a href="../../archive/components/before-policies-2026-09-15/scoring-cards.html">previous agenda deck</a> is archived.</p></section>`));
function printPage(title, description, kind, cards, count) {
  const sheets = [];
  for (let i = 0; i < cards.length; i += count) sheets.push(`<section class="print-sheet ${kind}" aria-label="Sheet ${sheets.length + 1}">${cards.slice(i, i + count).join('\n')}</section>`);
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — Bellwether</title><link rel="stylesheet" href="../policy-cards-print.css"></head><body><header class="screen-header"><a href="cards.html">Component specification</a><h1>${title}</h1><p>${description} Print at 100% on A4 portrait paper.</p></header><main>${sheets.join('\n')}</main></body></html>\n`;
}
output('docs/components/printable-scoring-cards.html', printPage('Issue scoring cards', 'Twelve 40 × 61 mm cards on one sheet. Deal one secret card per firm. Use identical opaque sleeves.', 'scoring-sheet', scoringCards.map((c) => `<article class="scoring-card"><header><b>Private priorities</b><span>${c.id}</span></header><ol>${c.order.map((issue, i) => `<li><b>${6 - i}</b><span>${issue}</span></li>`).join('')}</ol><footer>Rev 27</footer></article>`), 12));
const partyEmblems = {
  "honeycomb": "M32 7l21 12v26L32 57 11 45V19z",
  "old-shell": "M9 48c0-20 10-34 27-34 13 0 21 9 21 21 0 13-9 21-21 21-10 0-17-6-17-15 0-8 6-14 14-14 7 0 12 4 12 10 0 5-4 9-9 9-4 0-7-2-7-6",
  "foxglove": "M12 10l15 10h10l15-10-5 19c5 5 7 10 7 16-7 8-14 12-22 12S17 53 10 45c0-6 2-11 7-16zM24 38l8 6 8-6M23 31h1M40 31h1",
  "riverworks": "M7 16h42l8 9-8 9H7l8-9zM7 38h42l8 9-8 9H7l8-9zM21 16v18M43 38v18",
  "many-wings": "M5 18q8-8 16 0M25 12q8-8 16 0M43 20q8-8 16 0M13 37q8-8 16 0M35 43q8-8 16 0",
  "night-parliament": "M8 12l13 8h22l13-8-4 20v17L40 57H24L12 49V32zM17 30a9 9 0 1 0 18 0 9 9 0 1 0-18 0M29 30a9 9 0 1 0 18 0 9 9 0 1 0-18 0M28 44l4 5 4-5"
};
function voteRow(card, forPolicy) {
  const issue = forPolicy ? card.plus : card.minus;
  const label = forPolicy ? 'For' : 'Against';
  const tiles = votes(card, forPolicy).map((party) => {
    const id = party.name.toLowerCase().replaceAll(' ', '-');
    assert(partyEmblems[id], `Missing emblem for ${party.name}`);
    return `<div class="party-vote party-${id}"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="${partyEmblems[id]}"/></svg><span>${party.name}</span></div>`;
  }).join('');
  return `<section class="vote-row" aria-label="${label}: ${issue}"><h3><span>${forPolicy ? '+' : '−'} ${issue}</span><small>${label}</small></h3><div class="party-tiles">${tiles}</div></section>`;
}
output('docs/components/printable-policy-cards.html', printPage('Policy deck', 'Thirty 63 × 88 mm cards on four sheets. Deal one face up per region. Use identical opaque sleeves for the draw deck.', 'policy-sheet', policies.map((c) => `<article class="policy-card"><header><b>${effectFor(c).scope} policy</b><span>${c.id} · Rev 27</span></header><h2>${escape(c.name)}</h2><div class="policy-votes">${voteRow(c, true)}${voteRow(c, false)}</div><div class="law"><h3>${effectFor(c).name}</h3><p>${effectFor(c).text}</p></div></article>`), 9));
const boardPath = 'docs/components/party-boards.html';
let board = readFileSync(root + boardPath, 'utf8');
for (const p of parties) {
  const pattern = new RegExp(`<section class="promise-ranking" data-party="${p.name}">[\\s\\S]*?</section>`);
  assert(pattern.test(board), `Missing ranking panel for ${p.name}`);
  board = board.replace(pattern, `<section class="promise-ranking" data-party="${p.name}"><strong>Public priorities</strong><ol>${p.order.map((c) => `<li>${c}</li>`).join('')}</ol></section>`);
}
output(boardPath, board);
execFileSync('python', [root + 'scripts/generate-physical-map.py', ...(check ? ['--check'] : [])], { stdio: 'inherit' });
console.log('Validated and ' + (check ? 'checked' : 'generated') + ' 6 balanced party orders, 12 balanced scoring cards, 30 policies and policy map.');
