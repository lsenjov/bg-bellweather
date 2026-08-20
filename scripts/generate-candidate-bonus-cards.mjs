import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidateSourcePath = join(repositoryRoot, "docs", "design", "bonus-card-candidates.html");
const currentCardPath = join(repositoryRoot, "docs", "components", "bonus-cards.html");
const outputPath = join(repositoryRoot, "docs", "design", "printable-bonus-card-candidates.html");
const candidateSource = readFileSync(candidateSourcePath, "utf8");
const currentCardSource = readFileSync(currentCardPath, "utf8");
const symbolBlock = currentCardSource.match(/    <svg aria-hidden="true"[\s\S]*?    <\/svg>/)?.[0];

if (!symbolBlock) {
  throw new Error("Could not find the party symbols in the current Bonus-card sheet.");
}

const partyNames = new Map([
  ["honeycomb", "Honeycomb"],
  ["old-shell", "Old Shell"],
  ["foxglove", "Foxglove"],
  ["riverworks", "Riverworks"],
  ["many-wings", "Many Wings"],
  ["night-parliament", "Night Parliament"],
]);
const cards = [];
const sectionPattern = /      <section class="party-section ([a-z-]+)" id="[^"]+">([\s\S]*?)\n      <\/section>/g;
const cardPattern = /<li class="candidate-card"><span class="family(?: unbound)?">([^<]+)<\/span><h3>([^<]+)<\/h3><p>([\s\S]*?)<\/p><\/li>/g;

for (const sectionMatch of candidateSource.matchAll(sectionPattern)) {
  const partyClass = sectionMatch[1];
  const partyName = partyNames.get(partyClass);

  if (!partyName) {
    throw new Error(`Unknown party class: ${partyClass}`);
  }

  for (const cardMatch of sectionMatch[2].matchAll(cardPattern)) {
    cards.push({ partyClass, partyName, family: cardMatch[1], title: cardMatch[2], effect: cardMatch[3] });
  }
}

if (cards.length !== 106) {
  throw new Error(`Expected 106 candidates, found ${cards.length}.`);
}

for (const [partyClass, partyName] of partyNames) {
  if (!cards.some((card) => card.partyClass === partyClass)) {
    throw new Error(`No candidates found for ${partyName}.`);
  }
}

function cardMarkup(card) {
  const effectLength = card.effect.replace(/<[^>]+>/g, "").length;
  const densityClass = effectLength > 205 ? " very-dense" : effectLength > 165 ? " dense" : "";
  const titleClass = card.title.length > 22 ? " long-title" : "";

  return `          <article class="bonus-card candidate-print-card ${card.partyClass}${densityClass}${titleClass}"><svg class="party-watermark" aria-hidden="true"><use href="#party-${card.partyClass}"/></svg><span class="card-kicker">${card.partyName} · ${card.family}</span><span class="candidate-mark" aria-label="Candidate card">C</span><h2>${card.title}</h2><p>${card.effect}</p><footer><span>Bonus action</span><span>R21</span></footer></article>`;
}

const cardsPerSheet = 12;
const sheetCount = Math.ceil(cards.length / cardsPerSheet);
const sheets = Array.from({ length: sheetCount }, (_, sheetIndex) => {
  const firstCard = sheetIndex * cardsPerSheet;
  const sheetCards = cards.slice(firstCard, firstCard + cardsPerSheet).map(cardMarkup).join("\n");
  const pageNumber = sheetIndex + 1;

  return `      <section class="print-sheet" aria-label="Candidate Bonus-card sheet ${pageNumber} of ${sheetCount}">
        <div class="card-grid">
${sheetCards}
        </div>
        <p class="sheet-label">Ruleset 21 / Candidate Bonus cards / ${pageNumber} of ${sheetCount}</p>
      </section>`;
}).join("\n");

const document = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Nine printable A4 sheets containing all 106 untested Bellweather Ruleset 21 Bonus-card candidates.">
    <title>Printable Candidate Bonus Cards — Ladder Bidding</title>
    <link rel="stylesheet" href="../bonus-cards-print.css">
    <link rel="stylesheet" href="../candidate-bonus-cards-print.css">
  </head>
  <body class="candidate-print">
${symbolBlock}
    <header class="screen-header">
      <a href="bonus-card-candidates.html">← Candidate report</a>
      <h1>Ruleset 21 candidate Bonus cards</h1>
      <p>Print these nine front-only A4 portrait sheets at actual size. All 106 untested candidates use the current 40 × 61 mm Bonus-card format. The small outlined C distinguishes them from the twelve current cards; the R21 footer identifies the rules vocabulary they use.</p>
      <p><a href="../../assets/print/bonus-card-candidates-a4.pdf">Open print-ready PDF →</a></p>
    </header>
    <main>
${sheets}
    </main>
  </body>
</html>
`;

writeFileSync(outputPath, document);
process.stdout.write(`Generated ${cards.length} cards across ${sheetCount} sheets.\n`);

