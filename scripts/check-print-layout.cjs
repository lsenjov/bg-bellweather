#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
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
      ['agents.html', [['.piece-page',1,210,297],['.agent-grid',1,186,225.8],['.agent-pair',21,50.8,25.4],['.agent-face',42,25.4,25.4]]],
      ['shared-state-tokens.html', [['.opening-card',12,40,61],['.small-token',15,16,16]]],
      ['firm-references.html', [['.reference-sheet',3,210,297],['.reference-page',6,210,148]]],
      ['player-aids.html', [['.aid-sheet',2,297,210],['.aid-page',4,148,210]]],
    ];
    for (const [file, checks] of specs) { const page = await inspect(browser, file, checks); await page.close(); }
    const helpers = await inspect(browser, 'player-aids.html', []);
    const helperProblems = await helpers.evaluate(() => {
      const sheets = [...document.querySelectorAll('.aid-sheet')];
      const fronts = [...sheets[0].children], backs = [...sheets[1].children];
      const f = sheets[0].getBoundingClientRect(), r = sheets[1].getBoundingClientRect();
      const issues = [];
      if (fronts[0].innerHTML !== fronts[1].innerHTML || backs[0].innerHTML !== backs[1].innerHTML) issues.push('Copies differ');
      if (fronts.some(face => face.classList.contains('aid-year')) || backs.some(face => !face.classList.contains('aid-year'))) issues.push('Incorrect front/back order');
      fronts.forEach((front, index) => {
        const a = front.getBoundingClientRect(), b = backs[1-index].getBoundingClientRect();
        if (Math.abs((a.left-f.left)+(b.right-r.left)-f.width) > .8 || Math.abs((a.top-f.top)-(b.top-r.top)) > .8) issues.push(`helper ${index}: short-edge duplex mismatch`);
      });
      return issues;
    });
    assert.deepEqual(helperProblems, [], 'Player helper copies and duplex alignment');
    await helpers.close();
    const reminders = await inspect(browser, 'shared-state-tokens-duplex.html', [['.print-sheet',2,297,210],['.vote-marker',48,16,16],['.range-marker',0]]);
    const reminderProblems = await reminders.evaluate(() => {
      const sheets = [...document.querySelectorAll('.reminder-sheet')];
      const fronts = [...sheets[0].querySelectorAll('.vote-marker')];
      const backs = [...sheets[1].querySelectorAll('.vote-marker')];
      const f = sheets[0].getBoundingClientRect(), r = sheets[1].getBoundingClientRect();
      return fronts.flatMap((front, index) => {
        const a = front.getBoundingClientRect(), b = backs[Math.floor(index / 6) * 6 + 5 - index % 6].getBoundingClientRect();
        return front.dataset.face !== 'yes' || backs[index].dataset.face !== 'no' || Math.abs((a.left-f.left)+(b.right-r.left)-f.width) > .8 || Math.abs((a.top-f.top)-(b.top-r.top)) > .8 ? [`vote marker ${index}: face or duplex alignment mismatch`] : [];
      });
    });
    assert.deepEqual(reminderProblems, [], 'Vote reminder duplex alignment');
    await reminders.close();
    for (const [file, count, sheets] of [['firm-cards.html',33,6],['reward-cards.html',6,2],['operation-cards.html',54,8],['bonus-cards.html',18,4]]) {
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
          const key=card.dataset.suit;
          if(card.textContent.trim() || card.querySelectorAll('.corner').length!==2 || card.querySelector('.corner-rank')) issues.push(`back leaks identity or lacks suits: ${card.dataset.cardId}`);
          const design=card.innerHTML;
          if (backDesigns.has(key) && backDesigns.get(key)!==design) issues.push(`non-identical back for ${key}`);
          backDesigns.set(key,design);
        }
        const fixedRanks={'Just Passing Through':'M','I Can Wait':'…','Parallel Paths':'M','A Step Foreseen':'M','Set the Stage':'M','Overnight Shipping':'M','Crow':'Crow','Cat':'Cat','Toad':'Toad','An Unwelcome Step':'D','Foretell Organise':'F O','Foretell Rally':'F R','Foretell Smear':'F S','Harvest: 0–2':'P 0–2','Harvest: 3–4':'P 3–4','Harvest: 5–6':'P 5–6'};
        for(const card of document.querySelectorAll('.print-card.front')) {
          const title=card.querySelector('h2').textContent;
          const expected=card.dataset.suit.startsWith('party-')?'':card.dataset.suit==='common'||card.dataset.suit==='hecate-reward'?title[0]:title==='Election Prophecy'?`E ${card.querySelector('.prediction').textContent}`:fixedRanks[title];
          if(expected===undefined || card.dataset.rank!==expected) issues.push(`incorrect index ${title}: ${card.dataset.rank}, expected ${expected}`);
          const corners=[...card.querySelectorAll('.corner')];
          if(corners.length!==2 || corners[0].innerHTML!==corners[1].innerHTML) issues.push(`missing or unequal corners: ${title}`);
          for(const corner of corners) {
            const a=corner.getBoundingClientRect(), b=card.querySelector('.card-body').getBoundingClientRect();
            const first=card.querySelector('.card-kicker').getBoundingClientRect();
            if(a.bottom>first.top+.5) issues.push(`corner overlaps body: ${title}`);
            const rank=corner.querySelector('.corner-rank');
            if(expected && !rank) issues.push(`missing rank: ${title}`);
            if(expected && !['Crow','Cat','Toad'].includes(expected) && rank?.textContent!==expected) issues.push(`wrong rendered rank: ${title}`);
            if(['Crow','Cat','Toad'].includes(expected) && !rank?.querySelector('.rank-animal')) issues.push(`missing familiar symbol: ${title}`);
            if(!expected && rank) issues.push(`party card unexpectedly has rank: ${title}`);
          }
          const back=document.querySelector(`.back[data-card-id="${card.dataset.cardId}"]`);
          if(back.dataset.suit!==card.dataset.suit || back.querySelector('.corner-suit').innerHTML!==card.querySelector('.corner-suit').innerHTML) issues.push(`incorrect back suit: ${title}`);
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
    const policyPage = await inspect(browser, 'printable-policy-cards.html', [
      ['.print-sheet', 8, 210, 297], ['.policy-card.front', 30, 63, 88], ['.policy-card.back', 30, 63, 88], ['.policy-blank', 12, 63, 88],
    ]);
    const policyData = JSON.parse(readFileSync(join(root, 'docs/components/policy-deck.json'), 'utf8'));
    const policyProblems = await policyPage.evaluate(({ policies, effects, parties }) => {
      const problems = [];
      const votes = (card, forPolicy) => parties
        .filter(p => (p.order.indexOf(card.plus) < p.order.indexOf(card.minus)) === forPolicy)
        .sort((a, b) => {
          const gap = p => Math.abs(p.order.indexOf(card.plus) - p.order.indexOf(card.minus));
          return gap(b) - gap(a) || a.order.indexOf(card.plus) - b.order.indexOf(card.plus);
        }).map(p => p.name);
      for (const card of policies) {
        const front = document.querySelector(`.policy-card.front[data-card-id="${card.id}"]`);
        const back = document.querySelector(`.policy-card.back[data-card-id="${card.id}"]`);
        const effect = effects.find(e => e.id === card.effect);
        const text = (node, selector) => node.querySelector(selector)?.textContent.trim();
        for (const face of [front, back]) {
          if (text(face, 'h2') !== card.name || face.dataset.plus !== card.plus || face.dataset.minus !== card.minus) problems.push(`${card.id}: mismatched name/issues`);
        }
        if (front.querySelector('.law') || text(front, 'header b') !== 'Proposal') problems.push(`${card.id}: proposal exposes ability or lacks face label`);
        if (text(back, 'header b') !== 'Enacted' || back.dataset.effect !== String(effect.id) || back.dataset.scope !== effect.scope || text(back, '.law-scope') !== `${effect.scope} ability` || text(back, '.law h3') !== effect.name || text(back, '.law-text') !== effect.text) problems.push(`${card.id}: enacted ability changed or missing`);
        if (text(front, '.policy-flavour') !== card.frontFlavour || text(back, '.consequence') !== card.backFlavour) problems.push(`${card.id}: flavour changed or missing`);
        for (const [i, forPolicy] of [true, false].entries()) {
          const row = front.querySelectorAll('.vote-row')[i];
          if (text(row, 'h3 span') !== `${forPolicy ? '+' : '−'} ${forPolicy ? card.plus : card.minus}` || text(row, 'h3 small') !== (forPolicy ? 'For' : 'Against')) problems.push(`${card.id}: issue/vote label changed`);
          if (JSON.stringify([...row.querySelectorAll('.party-vote span')].map(n => n.textContent)) !== JSON.stringify(votes(card, forPolicy))) problems.push(`${card.id}: vote order changed`);
        }
        if (JSON.stringify([...back.querySelectorAll('.policy-issues b')].map(n => n.textContent)) !== JSON.stringify([`+ ${card.plus}`, `− ${card.minus}`])) problems.push(`${card.id}: enacted issues changed`);
        const flavour = front.querySelector('.policy-flavour').getBoundingClientRect();
        const voteBox = front.querySelector('.policy-votes').getBoundingClientRect();
        if (flavour.bottom > voteBox.top) problems.push(`${card.id}: proposal flavour overlaps votes`);
        const law = back.querySelector('.law').getBoundingClientRect();
        const consequence = back.querySelector('.consequence').getBoundingClientRect();
        if (law.bottom > consequence.top) problems.push(`${card.id}: ability overlaps consequence`);
      }
      for (const front of document.querySelectorAll('.front-sheet')) {
        const back = document.querySelector(`.back-sheet[data-sheet="${front.dataset.sheet}"]`);
        const fronts = [...front.children], backs = [...back.children];
        fronts.forEach((card, index) => {
          const match = backs[Math.floor(index / 3) * 3 + 2 - index % 3];
          if (card.dataset.cardId !== match?.dataset.cardId || card.classList.contains('policy-blank') !== match?.classList.contains('policy-blank')) problems.push(`sheet ${front.dataset.sheet} slot ${index}: policy back mismatch`);
          const a = card.getBoundingClientRect(), b = match.getBoundingClientRect(), f = front.getBoundingClientRect(), r = back.getBoundingClientRect();
          if (Math.abs((a.left - f.left) + (b.right - r.left) - f.width) > .8 || Math.abs((a.top - f.top) - (b.top - r.top)) > .8) problems.push(`sheet ${front.dataset.sheet} slot ${index}: policy duplex cut misaligned`);
        });
      }
      return problems;
    }, policyData);
    assert.deepEqual(policyProblems, [], 'Policy content and duplex alignment');
    await policyPage.close();
    console.log('Print layout checks pass: component counts, physical dimensions, content bounds, matching card backs, all 60 policy faces and unchanged mechanical content, and mirrored duplex alignment.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
