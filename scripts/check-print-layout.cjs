#!/usr/bin/env node
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(join(execFileSync('npm', ['root', '--global'], { encoding: 'utf8' }).trim(), 'playwright'))); }
const root = resolve(__dirname, '..');
const mm = 96 / 25.4;
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 0.8, `${label}: ${actual.toFixed(2)}px, expected ${expected.toFixed(2)}px`);
async function inspect(browser, file, specs) {
  const page = await browser.newPage();
  try {
    await page.goto(pathToFileURL(join(root, 'docs/components', file)).href);
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    for (const [selector, count, width, height] of specs) {
      const measurements = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
        const r = node.getBoundingClientRect();
        return { width: r.width, height: r.height, overflowX: node.scrollWidth - node.clientWidth, overflowY: node.scrollHeight - node.clientHeight };
      }));
      assert.equal(measurements.length, count, `${file} ${selector} count`);
      const textOverflow = await page.locator(selector).evaluateAll(nodes => nodes.flatMap((node,index) => {
        const box=node.getBoundingClientRect(), walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT), errors=[];
        let text;
        while ((text=walker.nextNode())) {
          if (!text.textContent.trim() || text.parentElement.closest('svg')) continue;
          const range=document.createRange();range.selectNodeContents(text);
          for (const rect of range.getClientRects()) {
            if(rect.left<box.left-1 || rect.right>box.right+1 || rect.top<box.top-1 || rect.bottom>box.bottom+1) errors.push(`${index}: ${text.textContent.trim().slice(0,45)}`);
          }
        }
        return errors;
      }));
      assert.deepEqual(textOverflow,[],`${file} ${selector} text bounds`);
      measurements.forEach((item, index) => {
        if (width) close(item.width, width * mm, `${file} ${selector}[${index}] width`);
        if (height) close(item.height, height * mm, `${file} ${selector}[${index}] height`);
        assert.ok(item.overflowX <= 2 && item.overflowY <= 2, `${file} ${selector}[${index}] overflows by ${item.overflowX}x${item.overflowY}px`);
      });
    }
    return page;
  } catch (error) { await page.close(); throw error; }
}
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const specs = [
      ['agents.html', [['.agent-pair',21,50.8,25.4],['.agent-face',42,25.4,25.4]]],
      ['shared-state-tokens.html', [['.opening-card',12,40,61],['.small-token',13,16,16]]],
      ['firm-references.html', [['.reference-page',6,210,148]]],
      ['player-aids.html', [['.aid-page',2,148,210]]],
    ];
    for (const [file, checks] of specs) { const page = await inspect(browser, file, checks); await page.close(); }
    for (const [file, count, sheets] of [['firm-cards.html',31,4],['reward-cards.html',6,2],['operation-cards.html',54,8],['bonus-cards.html',18,4]]) {
      const page = await inspect(browser,file,[['.print-sheet',sheets,210,297],['.print-card.front',count,40,61],['.print-card.back',count,40,61]]);
      const problems = await page.evaluate(() => {
        const issues = [];
        for (const front of document.querySelectorAll('.front-sheet')) {
          const back = document.querySelector(`.back-sheet[data-sheet="${front.dataset.sheet}"]`);
          const fronts = [...front.querySelectorAll('.print-card')];
          const backs = [...back.querySelectorAll('.print-card')];
          fronts.forEach((card,index) => {
            const match = backs[Math.floor(index / 4) * 4 + 3 - index % 4];
            if (card.dataset.cardId !== match?.dataset.cardId) issues.push(`sheet ${front.dataset.sheet} slot ${index}: mismatched back`);
            const a=card.getBoundingClientRect(),b=match.getBoundingClientRect(),f=front.getBoundingClientRect(),r=back.getBoundingClientRect();
            if (Math.abs((a.left-f.left)+(b.right-r.left)-f.width)>0.8 || Math.abs((a.top-f.top)-(b.top-r.top))>0.8) issues.push(`sheet ${front.dataset.sheet} slot ${index}: misaligned duplex cut`);
          });
        }
        const backDesigns = new Map();
        for (const card of document.querySelectorAll('.print-card.back')) {
          const key=card.querySelector('h2').textContent;
          const design=card.innerHTML;
          if (backDesigns.has(key) && backDesigns.get(key)!==design) issues.push(`non-identical back for ${key}`);
          backDesigns.set(key,design);
        }
        for (const card of document.querySelectorAll('.print-card:not(.blank)')) {
          const parent=card.getBoundingClientRect();
          for (const node of card.querySelectorAll('h2,p,footer,.card-kicker,.prediction-band')) {
            const r=node.getBoundingClientRect();
            if(r.left<parent.left-1 || r.right>parent.right+1 || r.top<parent.top-1 || r.bottom>parent.bottom+1 || node.scrollHeight>node.clientHeight+2) issues.push(`card text exceeds bounds: ${card.dataset.cardId}`);
          }
        }
        return issues;
      });
      assert.deepEqual(problems,[],`${file} duplex/content checks`);
      await page.close();
    }
    console.log('Print layout checks pass: component counts, physical dimensions, content bounds, matching card backs, and mirrored duplex alignment.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
