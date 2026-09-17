import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(root, "docs/components/player-shields.html");
const folios = readFileSync(join(root, "docs/components/player-folios.html"), "utf8");
const symbols = folios.match(/<svg class="symbol-library"[\s\S]*?<\/svg>/)?.[0];
if (!symbols) throw new Error("Missing Firm emblems in player sheets.");

const firms = [
  { className: "swoop", emblem: "swoop", name: "One Fell Swoop", subtitle: "Public Affairs", motto: ["Rapid response", "Wing of influence"] },
  { className: "pairliament", emblem: "pairliament", name: "Pairliament Partners", subtitle: "", motto: ["Joint submissions", "Two voices, one brief"] },
  { className: "triumvirat", emblem: "triumvirat", name: "TriumviRAT", subtitle: "Advisory", motto: ["Three routes in", "No trail out"] },
  { className: "ivy-league", emblem: "ivy", name: "IVy League", subtitle: "Public Affairs", motto: ["Cultivated access", "Perennial influence"] },
  { className: "vested", emblem: "vested", name: "Vested Interests", subtitle: "", motto: ["Tailored positions", "Buttoned-up briefs"] },
  { className: "vip-access", emblem: "vip", name: "VI.P. Access Group", subtitle: "", motto: ["Credentials cleared", "Doors discreetly opened"] },
];

const helper = `<div class="helper-panel helper-year">
  <h3>Year sequence</h3>
  <ol class="year-sequence">
    <li><strong>Party Openings</strong><p>Early Bird first · snake order 2–3p · once clockwise 4–6p</p></li>
    <li><strong>Lobby</strong><p>Clockwise · one action per turn</p></li>
    <li><strong>Cleanup</strong><p>Close remainder to owners (+ Bonus if available) · New Year → hand · refill Collection · ending player → Early Bird</p></li>
    <li><strong>Election</strong><p>After Years 2, 4 &amp; 6</p></li>
  </ol>
</div>
<div class="helper-panel helper-main">
  <header class="helper-title"><h2>Player Helper</h2><span>Bellwether · POL</span></header>
  <div class="helper-columns">
    <section class="lobby-reference">
      <h3>Lobby</h3>
      <dl>
        <div><dt>Operate</dt><dd>Resolve 1–3 cards, one at a time, with one acting party.</dd></div>
        <div class="shared-result"><dt>Collect &amp; Close</dt><dd>Pile + 1 Bonus if available → New Year.</dd></div>
        <div><dt>Collect</dt><dd>Spend counter; any open party; stays open.</dd></div>
        <div><dt>Close</dt><dd>After first turn; party with your Firm; return it.</dd></div>
        <div><dt>Pass</dt><dd>Only when all your Firms are returned; do nothing.</dd></div>
      </dl>
      <p class="callout"><strong>At turn end:</strong> more than half the Firms currently returned ends the Lobby.</p>
    </section>
    <section class="election-reference">
      <h3>Election</h3>
      <ol>
        <li>Outside Centre: randomly retain up to half capacity (1 / 2 / 3). Centre keeps all.</li>
        <li>Each remaining Support votes on its region’s policy.</li>
        <li>For &gt; Against passes; ties fail. Party: most For votes, ties leftmost For. Count all four before activation.</li>
        <li>After Elections 1 &amp; 2: deal four new policies face up.</li>
        <li>Election 3: reveal priorities; score all laws (+ value − value).</li>
        <li>Add final hand rank: one point per other player with ≤ your card count.</li>
      </ol>
      <p class="victory">Negative totals allowed. Highest final total wins; ties share.</p>
    </section>
  </div>
</div>
<div class="helper-panel helper-operations">
  <h3>Operations</h3>
  <dl>
    <div><dt>Organise</dt><dd>Move to a free neighbouring district.</dd></div>
    <div><dt>Rally</dt><dd>Add Support where present.</dd></div>
    <div><dt>Smear</dt><dd>Remove rival here / next door.</dd></div>
  </dl>
  <h3>Keywords</h3>
  <dl>
    <div><dt>Open party</dt><dd>Has a Firm marker.</dd></div>
    <div><dt>Acting party</dt><dd>Open party chosen for the entire Operate.</dd></div>
    <div><dt>New Year</dt><dd>Gained cards wait; move to hand at Cleanup.</dd></div>
    <div><dt>Bonus</dt><dd>Any open party; resolve printed action; return home.</dd></div>
  </dl>
</div>`;

function brandPanel(firm, position) {
  return `<section class="brand-panel ${position}" aria-label="${position} Firm identity">
  <svg class="emblem" aria-hidden="true"><use href="#emblem-${firm.emblem}"/></svg>
  <h2>${firm.name}${firm.subtitle ? `<small>${firm.subtitle}</small>` : ""}</h2>
  <p class="motto">${firm.motto.join("<br>")}</p>
</section>`;
}

function shieldPage(firm, index, interior) {
  const name = `${firm.name}${firm.subtitle ? ` ${firm.subtitle}` : ""}`;
  const side = interior ? "Interior" : "Exterior";
  const content = interior ? helper : ["left", "centre", "right"].map((position) => brandPanel(firm, position)).join("\n");
  return `<section class="shield-page ${firm.className}" aria-label="${name} ${side.toLowerCase()}">
<header class="page-label"><h2>${name}</h2><p>${side} · ${index * 2 + (interior ? 2 : 1)} / 12</p></header>
<div class="shield-template">
  <div class="shield-face ${interior ? "interior" : "exterior"}">${content}</div>
  <svg class="cut-outline" viewBox="0 0 280 110" aria-hidden="true"><path d="M0 30 80 0H200L280 30V100L200 110H80L0 100Z"/><path class="fold-lines" d="M80 0V110M200 0V110"/></svg>
  <span class="panel-label left">80 mm wing · outer edge 70 mm</span><span class="panel-label centre">120 × 110 mm centre</span><span class="panel-label right">80 mm wing · outer edge 70 mm</span>
  <i class="fold-guide first top"></i><i class="fold-guide second top"></i><i class="fold-guide first bottom"></i><i class="fold-guide second bottom"></i>
</div>
<footer class="assembly-caption"><p>${interior ? "Matching reverse with complete player helper. Use the exterior guides to score first, then cut." : "Score the dashed fold lines before cutting the solid outline. Fold the wings back; lean the shield back onto its sloping lower edges."}</p><p>280 × 110 mm overall · Outer corners: top −30 mm / bottom +10 mm · Print at 100% · ${interior ? "Even page: interior" : "Odd page: exterior"}</p></footer>
</section>`;
}

const output = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Firm shields &amp; player helper — Bellwether</title><link rel="stylesheet" href="../player-shields.css"></head><body>
<header class="screen-header"><a href="player-kits.html">← Player kit specification</a><h1>Firm shields &amp; player helper</h1>
<p>Each Firm’s colour and pattern cover the exterior, with its emblem, name and motto on all three panels. The complete player helper is printed inside. One shield per human, including at 2–3 players; choose one of your controlled Firms.</p>
<p><a href="../../assets/print/player-shields-a4.pdf">Print-ready shields PDF →</a> · <a href="player-folios.html">Public &amp; private sheets →</a> · <a href="voting-reminders.html">Yes reminder markers →</a></p>
<details open><summary>Printing and assembly</summary><ol>
<li>Print at actual size on opaque cardstock. Twelve A4 landscape pages alternate exterior and matching helper interior. Duplex with short-edge binding produces six shields. Test the first pair on plain paper for orientation and alignment. For a one-sided printer, print each pair separately and mount back-to-back with both top edges aligned.</li>
<li>Before cutting, score the two dashed vertical fold lines at 80 mm and 200 mm from the artwork’s left edge. Cut along the sloping outer outline. The centre stays 120 × 110 mm; each 80 mm wing has a 70 mm outer edge, with its top corner 30 mm lower and bottom corner 10 mm higher than the centre.</li>
<li>Fold both wings back towards the player, approximately at right angles. Lean the shield back slightly until its sloping lower edges rest on the table—about 7° at right-angle folds. The top and player’s side remain open. Fold flat for storage; no separate feet are needed.</li>
<li>Place the private sheet behind the centre, top edge nearest the shield. Keep Private Priorities, the blank reminder grid and unused yes markers inside. Put the public New Year/Collection sheet beside the shield, fully visible. New Year card faces remain covered and its total count stays public; returned Firm markers also remain public.</li>
</ol><p><strong>Open prototype check:</strong> verify seated privacy through the tapered sides, stability with the chosen cardstock, and helper readability once folded. The helper replaces the separate reference sheet.</p></details>
<p><a href="../../archive/components/before-tapered-shields-2026-09-17/index.html">Previous office-front shields and standalone helper →</a></p>
</header>
${symbols}
<main>${firms.map((firm, index) => shieldPage(firm, index, false) + "\n" + shieldPage(firm, index, true)).join("\n")}</main>
</body></html>
`;

if (process.argv.includes("--check")) {
  if (readFileSync(outputPath, "utf8") !== output) throw new Error("Player shields are stale; run node scripts/generate-player-shields.mjs.");
  console.log("Checked six Firm shields with matching complete helper interiors.");
} else {
  writeFileSync(outputPath, output);
  console.log("Generated six Firm shields with matching complete helper interiors.");
}
