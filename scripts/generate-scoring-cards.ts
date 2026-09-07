import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DISTRICTS, DISTRICTS_BY_ID, PARTIES_BY_ID, REGION_NAMES, SCORING_CARDS } from "@bellweather/content";

const root = fileURLToPath(new URL("../", import.meta.url));
const check = process.argv.includes("--check");
const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const seatName = (seat: string) => seat.replace("second-", "2 ").replaceAll("-", " ");
function output(path: string, value: string) {
  if (check) {
    if (readFileSync(root + path, "utf8") !== value) throw new Error(`${path} is stale`);
  } else writeFileSync(root + path, value);
}
const cards = SCORING_CARDS.map((card) => `<article class="score-card" aria-label="Scoring card ${card.id}">
<header class="card-head"><strong>Election brief</strong><span>${card.id} · R24</span></header>
<div class="objectives">${card.objectives.map((objective) => `<div class="objective party-${objective.partyId}"><div class="objective-copy"><span class="district">${REGION_NAMES[objective.regionId]}</span><span class="party-line"><span class="party-name">${escape(PARTIES_BY_ID[objective.partyId].shortName)}</span></span></div></div>`).join("\n")}</div>
<p class="middle-score">Score the middle region</p>
<footer class="seat-stakes"><span class="seat gain"><b class="seat-symbol">+</b><small>Gain</small><strong>${seatName(card.gain)}</strong></span><span class="seat lose"><b class="seat-symbol">−</b><small>Lose</small><strong>${seatName(card.lose)}</strong></span></footer></article>`);
output("docs/components/printable-scoring-cards.html", `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Twenty-four Ruleset 24 regional scoring cards on two A4 sheets."><title>Printable Scoring Cards — Bellweather</title><link rel="stylesheet" href="../scoring-cards-print.css"></head><body>
<header class="screen-header"><a href="scoring-cards.html">Scoring deck specification</a><h1>Ruleset 24 election dossiers</h1><p>Print at 100% on two A4 portrait sheets. Cards are 40 × 61 mm for 41 × 63 mm sleeves. Each card scores its middle regional total; the same three parties supply Capital scoring. At two/three players, add both cards’ middle scores and use only the first for Capital.</p><p><a href="../../assets/print/scoring-cards-a4.pdf">Print-ready PDF</a></p></header>
<main>${[0, 12].map((start, i) => `<section class="print-sheet" aria-label="Scoring card sheet ${i + 1} of 2">${cards.slice(start, start + 12).join("\n")}</section>`).join("\n")}</main></body></html>
`);
const scoringPath = "docs/components/scoring-cards.html";
const rows = SCORING_CARDS.map((card) => `<tr><td>${card.id}</td>${card.objectives.map((o) => `<td>${escape(PARTIES_BY_ID[o.partyId].name)}</td>`).join("")}<td>${seatName(card.gain)}</td><td>${seatName(card.lose)}</td></tr>`).join("\n");
output(scoringPath, readFileSync(root + scoringPath, "utf8").replace(/<tbody>[\s\S]*?<\/tbody>/, `<tbody>\n${rows}\n</tbody>`));
const boardPath = "docs/components/board.html";
const districtRows = DISTRICTS.map((d) => `<tr><td>${escape(d.name)}</td><td>${d.regionId === null ? "Centre" : REGION_NAMES[d.regionId]}</td><td>${d.capacity}</td><td>${d.regionId === null ? "separate" : d.capacity / 2}</td><td>${d.adjacentDistrictIds.map((id) => escape(DISTRICTS_BY_ID[id].name)).join(", ")}</td></tr>`).join("\n");
output(boardPath, readFileSync(root + boardPath, "utf8").replace(/<thead>[\s\S]*?<\/thead>/, "<thead><tr><th>District</th><th>Region</th><th>Support</th><th>Votes</th><th>Neighbors</th></tr></thead>").replace(/<tbody>[\s\S]*?<\/tbody>/, `<tbody>\n${districtRows}\n</tbody>`));
console.log("Checked 24 regional scoring cards and the default district inventory.");
