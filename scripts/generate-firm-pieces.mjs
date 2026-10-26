import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {firms} from './lib/firm-identities.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const check=process.argv.includes('--check');
function save(path,text){if(check){if(readFileSync(root+path,'utf8')!==text)throw Error(`Stale ${path}`);}else writeFileSync(root+path,text);}
const style=f=>`--accent:${f.tint};--firm:${f.color};--tint:${f.tint}`;
const icon=f=>f.symbol.replace('<svg','<svg class="emblem"');
function page(title,body,css='firm-pieces.css',intro='Print at 100% actual size. Cut along solid outlines.'){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — Bellwether</title><link rel="stylesheet" href="../${css}"></head><body><header class="screen-header"><a href="player-kits.html">← Player kits</a><h1>${title}</h1><p>${intro}</p></header><main>${body}</main></body></html>\n`;}
const art={Fiddler:'<path d="M24 46V25l8-9 8 9v21M26 16h12M24 20h16M19 29h6v11h-6zM40 23l8-8M45 11l7 7M30 46v10M36 46v10"/>',Doppelgänger:'<path d="M15 53V37c0-12 8-16 17-16s17 4 17 16v16M20 21c-5-8 2-16 12-16s17 8 12 16M23 38h5M37 38h5M28 46h8"/>',Sister:'<path d="M9 54 18 22 32 7l14 15 9 32ZM23 29q9-12 18 0M24 35h5M35 35h5M27 44h10"/>',Witch:'<path d="m9 29 15-4L30 6l15 19 10 4ZM22 32v10l10 8 10-8V32M19 55h26"/>',Crow:'<path d="M9 47q16-1 17-20 2-11 13-9l13 7-12 3q0 18-19 23ZM20 45l-7 11M30 45l2 11"/>',Cat:'<path d="M20 30 17 12l13 8 14-8-2 18q8 18-10 24-21-2-12-24ZM25 31h3M36 31h3M30 39h5M41 49q18 2 11-17"/>',Toad:'<path d="M14 44q-5-17 8-23 10-7 20 0 13 6 8 23M20 44 10 54h17M44 44l10 10H37M22 30h3M39 30h3M26 39q6 5 12 0"/>',Puppeteer:'<path d="M20 13h24M32 6v15M12 27h40M18 27v15M32 27v22M46 27v15M13 49l5-7 5 7M27 56l5-7 5 7M41 49l5-7 5 7"/>',Marionette:'<circle cx="32" cy="17" r="7"/><path d="M32 3v7M32 24v20M16 29l16 4 16-4M32 44 21 56M32 44l11 12M16 29V12M48 29V12"/>'};
const portrait=(awake)=>`<rect x="10" y="5" width="44" height="54" rx="3"/><rect x="15" y="10" width="34" height="44"/>${awake?'<path d="M21 46q11-15 22 0M24 28q-5-17 8-17t8 17M25 35q7 6 14 0"/><circle cx="27" cy="27" r="1.7"/><circle cx="37" cy="27" r="1.7"/>':''}`;
const roleIcon=role=>`<svg viewBox="0 0 64 64" aria-hidden="true">${art[role]||''}</svg>`;
let agents=[];
const roles=[['Fiddler'],['Doppelgänger','Doppelgänger'],['Sister','Sister','Sister'],['Witch','Crow','Cat','Toad'],['Puppeteer','Marionette','Marionette','Marionette','Marionette'],Array(6).fill('Portrait')];
firms.forEach((f,i)=>roles[i].forEach(role=>{
  const face=state=>{
    const emptyPortrait=role==='Portrait'&&state==='Asleep';
    return `<div class="agent-face ${role==='Portrait'?'portrait':''}${emptyPortrait?' portrait-empty':''}" style="${style(f)}">${emptyPortrait?'':`<span class="agent-number">${f.number}</span>`}${role==='Portrait'?`<svg viewBox="0 0 64 64" aria-hidden="true">${portrait(state==='Awake')}</svg>`:roleIcon(role)}${emptyPortrait?'':`<strong>${role==='Portrait'?state:role}</strong>`}${role!=='Portrait'?'<span class="clip-zone">clip</span>':''}</div>`;
  };
  agents.push({label:`Firm ${f.number} ${role}`,front:face('Awake'),back:face('Asleep')});
}));
const agentSheet=side=>`<section class="piece-page ${side}-sheet" aria-label="Agent ${side}s"><div class="agent-grid">${agents.map((agent,index)=>`<article class="agent-piece" data-agent-id="${index+1}" aria-label="${agent.label}" style="grid-row:${Math.floor(index/3)+1};grid-column:${side==='front'?index%3+1:3-index%3}">${agent[side]}</article>`).join('')}</div></section>`;
save('docs/components/agents.html',page('Agents · double sided',agentSheet('front')+agentSheet('back'),'firm-pieces.css','Print these two A4 portrait pages double sided on one sheet at 100% actual size; flip on the long edge. Cut along the shared solid edges into 21 pieces, each 25.4 × 25.4 mm. Fifteen pieces use standee bases with the clip area at the bottom; six portraits lie flat and flip between a figure awake and an empty frame asleep.'));
const handshake='<path d="m8 32 12-12 9 3 8-3 19 14-12 17-11-2-15-10M21 24l10 9 9-7M22 42l7-7M29 47l7-8M36 49l7-8"/>';
const door='<path d="M14 56V8h34v48M21 56V15l20 7v34M32 36h2M8 56h48"/>';
const trap='<path stroke-width="4" d="M32 6 58 54H6zM32 22v16M32 45v3"/>';
let markers=firms.flatMap(f=>Array.from({length:2},()=>`<article class="opening-card" style="${style(f)}"><small>FIRM ${f.number} · OPENING</small>${icon(f)}<h2>${f.name}</h2><p>${f.motto}</p></article>`)).join('');
const token=(f,s,label)=>`<article class="small-token" style="${style(f)}" aria-label="${label}"><svg viewBox="0 0 64 64">${s}</svg><small>${f.number}</small></article>`;
let tokens=Array(6).fill(token(firms[0],handshake,'Favour owed')).join('')+Array(6).fill(token(firms[0],door,'Primary opening history')).join('')+Array(3).fill(token(firms[2],trap,'Hecate district trap')).join('');
save('docs/components/shared-state-tokens.html',page('Opening markers & firm tokens',`<section class="state-page"><h2>Opening markers & firm tokens</h2><div class="opening-grid">${markers}</div><div class="token-row">${tokens}</div><p>Six handshake favours · six permanent open-door history tokens · three Hecate district traps. All small tokens: 16 mm, single layer.</p><div class="public-markers"><div>EARLY BIRD</div><div>YEAR</div></div><p>Opening markers: 40 × 61 mm. Use one per firm at 4–6 players, both at 2–3. Retain existing Collection cubes and private reminder markers.</p></section>`,'firm-state.css','Single-sided A4 landscape. Cut twelve opening cards, fifteen small tokens, one 24 mm Early Bird and one 12 mm Year marker.'));
const refs=[
  [
    [
      "Setup",
      "Place the Fiddler in any district. Start with no favours and four cards: two Just Passing Through and two I Can Wait."
    ],
    [
      "The Grand Tour",
      "Make the first Party Opening each year, choosing a party without one of your open-door tokens. Place a token there. At 2–3 players, this restriction does not apply to your second opening."
    ],
    [
      "One More Thing",
      "Each card you play in a turn must have a different name. If your third card is a common card or Just Passing Through, you may repeat its effect. Use the same party for a common card. Each law applies only once across both resolutions."
    ],
    [
      "Earning favours",
      "When your third card is a common or party card, place a favour on the party you chose for it. Each party can hold only one favour."
    ],
    [
      "Spending favours",
      "After Party Openings, spend last year’s favours in any order. Each lets you move the Fiddler to a neighbouring district or perform an Operation for that party, even if closed. No agent is needed; normal Support requirements and laws apply. Discard unused favours. These actions cannot repeat or earn favours."
    ],
    [
      "Final favours",
      "Start with no favours. At the end of Year 6, count each remaining favour as one card for final hand ranking."
    ]
  ],
  [
    [
      "Setup & movement",
      "Place your two doppelgängers in different districts. Start with four Parallel Paths cards. Each moves one doppelgänger to a neighbouring district, then optionally the other. Your doppelgängers cannot share a district."
    ],
    [
      "Mirror the pile",
      "The first time you play a common card for each party on your turn, note the top card already in its pile. You may also perform that card’s Operation. Resolve the two Operations in either order, using a different doppelgänger for each and the same party for both."
    ],
    [
      "Resolve sequentially",
      "Perform the Operations one at a time, following normal agent and law rules. Choose targets separately for each. Apply each law at most once across both Operations. Your doppelgängers may travel with Organise but cannot share a district."
    ],
    [
      "One opportunity per party",
      "Only your first common card for each party can mirror, even if its pile is empty or you don’t use the copy. You get a fresh opportunity for each party on your next turn."
    ],
    [
      "One card played",
      "The copy is an extra Operation, not another card played. After both Operations, place your played card on the pile. The copied card stays where it is. Party and firm cards do not use your mirror ability."
    ]
  ],
  [
    [
      "Setup & supply",
      "Start with three sisters anywhere, three movement cards and fourteen prophecies in hand. Sisters may share districts and perform any common Operation. Your six reward cards start face up in their supply, two of each Operation."
    ],
    [
      "Playing a prophecy",
      "Play a prophecy only as your third card, after two non-prophecy cards. You cannot both play a prophecy and fulfil one during the same turn."
    ],
    [
      "Placed prophecies",
      "Prophecies are public and need no nearby sister. Limit: one per regional Election, district, party or firm. They remain until resolved, but you may withdraw them to New Year at any time."
    ],
    [
      "Success",
      "When a prophecy succeeds, take one available reward card into hand and optionally move one sister to a neighbouring district. Election prophecies grant this reward twice. Take rewards after the triggering card finishes. Reward cards can be played from your next turn, following normal Operation rules, then return to their supply."
    ],
    [
      "Prophecy types",
      "<b>Election:</b> predict a region’s voting margin. Place in Years 1, 3 or 5.<br><b>Harvest:</b> predict how many pile cards another player will take.<br><b>Foretell:</b> predict a common card another firm will play.<br><b>Trap:</b> make another player send a common card to New Year when their agent enters the district.<br>Follow each card’s placement and success conditions."
    ]
  ],
  [
    [
      "Setup",
      "Place the witch, crow, cat and toad each in any district independently. Sharing is allowed; no adjacency is required. Start with the Crow, Cat and Toad cards in hand."
    ],
    [
      "Specialised familiars",
      "Use the crow for Organise, the cat for Rally and the toad for Smear. The witch cannot perform common Operations."
    ],
    [
      "Familiar movement",
      "Before performing its common Operation, the familiar may move to a neighbouring district. It must then perform the Operation."
    ],
    [
      "Three teleport cards",
      "Each familiar’s card teleports it to the witch, or the witch to it. Before or after teleporting, you may move that familiar to a neighbouring district. Then send the card to New Year."
    ]
  ],
  [
    [
      "Setup",
      "Place the puppeteer in any district. Move him four times to a neighbouring district, leaving one marionette in each district he leaves. You may revisit districts. Start with three Set the Stage cards."
    ],
    [
      "Only marionettes operate",
      "Use a marionette for common Operations, never the puppeteer. Your agents cannot follow Support during Organise."
    ],
    [
      "Mandatory cycle",
      "After resolving a common card and its laws, retrieve the marionette that performed it. Move the puppeteer to a neighbouring district, leaving that marionette in the district he left."
    ],
    [
      "Set the Stage",
      "Play Set the Stage to retrieve any marionette. Move the puppeteer to a neighbouring district, leaving that marionette in the district he left."
    ]
  ],
  [
    [
      "Setup",
      "Place your six portraits in different districts. Choose three to be awake and three asleep. Start with two Overnight Shipping cards."
    ],
    [
      "Perform, then rotate",
      "Use an awake portrait to perform a common Operation. For a party card, choose any awake portrait. After resolving the card, put that portrait to sleep and wake one that was asleep before you played it."
    ],
    [
      "Connected districts",
      "Districts with awake portraits count as neighbours. You may use these connections freely."
    ],
    [
      "Other players using connections",
      "Other players must give you one common or party card from hand before using your connections. One payment covers all uses during a single played card. Normal neighbouring connections remain free."
    ],
    [
      "Overnight Shipping",
      "Overnight Shipping moves one portrait to any district without changing whether it is awake or asleep. Portraits cannot follow Support moved by Organise. They may share districts after setup."
    ]
  ]
];
const firmComplexities=[3,2,3,1,1,2];
const firmReferences=firms.map((f,i)=>`<section class="reference-page" style="${style(f)}"><header><span class="firm-no">${f.number}</span>${icon(f)}<div><h2 class="firm-title">${f.name}</h2><p>${f.character} · “${f.motto}”</p></div><span class="complexity">Complexity ${firmComplexities[i]}/3</span></header><div class="reference-grid">${refs[i].map(([h,p])=>`<section><h2>${h}</h2><p>${p}</p></section>`).join('')}</div></section>`);
save('docs/components/firm-references.html',page('Firm references',Array.from({length:firmReferences.length/2},(_,i)=>`<section class="reference-sheet">${firmReferences.slice(i*2,i*2+2).join('')}</section>`).join(''),'firm-reference.css','Six single-sided landscape firm references on three A4 portrait sheets, two per sheet. Print at actual size, cut between the references and keep one per firm beside the shield.'));
const aid1=`<section class="aid-page"><h2 class="aid-title">Bellwether · Your turn</h2><h2>Choose one action</h2>
<p><b>Operate:</b> play one to three cards, finishing each before choosing another. For each common card, choose an open party and an agent positioned to perform its Operation. Party cards need an open party but no nearby agent. Firm cards need no party. You may choose a different party for each card.</p>
<p><b>Collect:</b> spend a Collection counter. Take any open party’s Operation pile and one available party card into New Year. The party stays open.</p>
<p><b>Close:</b> close a party bearing your Firm marker. Take its Operation pile and one available party card into New Year, then return your marker. You cannot Close on your first Lobby turn of the year.</p>
<p><b>Pass:</b> you may pass only when all your Firm markers have returned.</p>
<p><b>After your turn:</b> if more than half the Firm markers used for Party Openings have returned, end the year. Otherwise, play continues clockwise.</p>
<h2>Parties and Operations</h2>
<p><b>An open party is available to everyone.</b> Its Firm marker determines who receives its Closure, not who may use it.</p>
<p>Choose a party with Support in your agent’s district:</p>
<table><tbody><tr><th>Organise</th><td>Move one of that party’s Support to a neighbouring district with space. Your agents there may follow, subject to your firm’s rules.</td></tr><tr><th>Rally</th><td>Add one of that party’s Support to a free spot there.</td></tr><tr><th>Smear</th><td>Remove one other party’s Support from there or a neighbouring district.</td></tr></tbody></table>
<p>Agents use no Support spaces. Districts are neighbours when they share a border, not just a corner. Follow your firm helper for special agent permissions and connections.</p>
<p><b>Absent-party recovery:</b> if the party has no Support anywhere, Organise or Rally adds one at your agent’s district; Smear removes one rival Support there. Recovery Organise carries no agents.</p>
<h2>Laws</h2>
<p>Use the chosen party’s laws, whoever performs the Operation. Global laws affect everyone.</p>
<p>Different laws combine; duplicates do not stack. Apply each law at most once per card. Law extras do not trigger further extras or require additional agents. Resolve mandatory extras when possible; skip them otherwise.</p>
<p>Party cards perform their printed effects. They do not use Operation laws or carry agents.</p>
<h2>Where cards go</h2>
<table><tbody><tr><th>Common card</th><td>Chosen party’s Operation pile</td></tr><tr><th>Party card</th><td>Its home party</td></tr><tr><th>Firm card</th><td>New Year, unless placed on the board</td></tr><tr><th>Hecate reward card</th><td>Hecate’s reward supply</td></tr></tbody></table>
<p>Reward cards use normal card slots and common Operation requirements.</p>
<p><b>New Year is set aside, not your hand.</b> You cannot play those cards until they return to hand at year-end. Keep their contents private and their total count visible. Hand contents and private priorities are secret; hand size and party piles are public.</p></section>`;
const aid2=`<section class="aid-page aid-year"><h2 class="aid-title">Bellwether · Year &amp; Elections</h2><h2>Starting reminder</h2>
<p>One firm and one private priority card per player.</p>
<table><thead><tr><th>Players</th><th>Firm markers</th><th>Collection counters</th><th>Starting common cards</th></tr></thead><tbody><tr><td>4–6</td><td>1</td><td>2</td><td>3 Organise, 4 Rally, 2 Smear</td></tr><tr><td>2–3</td><td>2</td><td>4</td><td>6 Organise, 8 Rally, 4 Smear</td></tr></tbody></table>
<p>Set up the board using the rulebook, then complete each firm’s setup in order <b>1–6</b>. Agents and firm-card supplies do not double at lower player counts.</p>
<h2>Start each year</h2>
<ol><li><b>Resurgence:</b> identify every party with no Support on the board. Starting with Early Bird, each player adds one Support of each identified party to any free spots. Complete one trip around the players; skip additions if no space remains.</li><li><b>Party Openings:</b> place a Firm marker on a party without one. Fiddler opens first, then go clockwise from Early Bird, skipping Fiddler. Without Fiddler, start with Early Bird. At 2–3 players, reverse this order for a second opening round.</li><li><b>Fiddler’s favours:</b> resolve last year’s favours using the firm helper.</li><li><b>Lobby:</b> Early Bird takes the first turn; continue clockwise.</li></ol>
<h2>End the year</h2>
<ol><li>Close remaining parties in Firm order <b>1–6</b>. Each marker’s owner takes the pile and one available party card into New Year, then returns the marker. Players with two parties choose their Closure order.</li><li>After Years <b>2, 4 and 6</b>, hold an Election.</li><li>Return New Year cards to hand. Agents stay on the board.</li><li>For another year, refresh Collection counters and Firm markers. The player whose turn ended the year becomes Early Bird.</li></ol>
<p>After Year 6, score the game instead of starting another year.</p>
<h2>Election</h2>
<ol><li><b>Thin Support:</b> outside Centre, randomly retain up to half each district’s capacity—1, 2 or 3 Support in districts with 2, 4 or 6 spaces. Keep all if fewer are present. Centre keeps all its Support.</li><li><b>Vote:</b> each remaining Support casts one vote on its region’s policy, following its party’s printed For/Against position. More For than Against passes; ties fail.</li><li><b>Award laws:</b> give each passed Party law to the party contributing the most For votes in that region. Break ties using the leftmost tied party in the printed For row. Keep Global laws in the shared display. Discard failed policies.</li><li>Count all regions before activating new laws. Resolve Election prophecies before returning New Year cards.</li><li>After Elections 1 and 2, reveal a new policy for each region. After Election 3, proceed to final scoring.</li></ol>
<h2>Final scoring</h2>
<p><b>Policies:</b> reveal your private priorities. For every enacted policy, gain your value for its <b>+ issue</b> and lose your value for its <b>− issue</b>. Every enacted policy scores for everyone, regardless of who received its law. Apply Global scoring laws.</p>
<p><b>Hand ranking:</b> after returning New Year cards, count your common and party cards. Fiddler also counts each remaining favour as one card. Exclude firm and reward cards.</p>
<p>Gain <b>one point for each other player whose count is equal to or lower than yours</b>.</p>
<p>Highest total wins. Tied players share victory.</p></section>`;
save('docs/components/player-aids.html',page('Shared player reference',`<section class="aid-sheet">${aid1}${aid1}</section><section class="aid-sheet">${aid2}${aid2}</section>`,'player-reference.css','Two identical A5 portrait helpers on one A4 landscape sheet: two fronts, then two backs. Print duplex, short-edge binding, at actual size and cut between the helpers; one per player. Keep separate from privacy shields.'));
const folioClasses=['swoop','pairliament','triumvirat','ivy-league','vested','vip-access'];
const folio=f=>`<article class="folio-pair ${folioClasses[f.number-1]}" style="${style(f)}" aria-label="${f.name} player sheets"><section class="player-folio public-folio"><header class="identity">${icon(f)}<h2>${f.name}</h2></header><div class="folio-body"><div class="card-well new-year"><strong>New Year</strong></div><div class="counter-bank"><strong>Collection</strong><div class="counter-wells"><i></i><i></i><i class="low-player">2–3p</i><i class="low-player">2–3p</i></div></div></div></section><section class="player-folio private-folio"><header class="identity">${icon(f)}<h2>${f.name}</h2></header><div class="folio-body"><div class="card-well priorities"><strong>Private<br>Priorities</strong></div><div class="reminder-grid" aria-label="Four blank spaces for reminder pairs"><i></i><i></i><i></i><i></i></div></div></section></article>`;
save('docs/components/player-folios.html',page('Public & private player sheets',[firms.slice(0,3),firms.slice(3)].map(group=>`<section class="print-sheet">${group.map(folio).join('')}</section>`).join(''),'player-folios.css','Two single-sided A4 portrait sheets. Each firm has two separate 100 × 90 mm sheets; cut the central border. Keep New Year and Collection public. Put the 61 × 40 mm Private Priorities well and four blank reminder spaces behind the shield. Use the reminder spaces with four reversible vote markers per human and your own generic counters. One pair of sheets per human at every player count.'));
const shield=f=>`<section class="shield-page" style="${style(f)}"><header class="page-label"><h2>${f.number}. ${f.name}</h2><p>Single-sided privacy shield · A4 landscape</p></header><div class="shield-template"><div class="shield-face exterior">${['left','centre','right'].map(pos=>`<section class="brand-panel ${pos}">${icon(f)}<h2>${f.name}</h2><p class="motto">${f.motto}</p></section>`).join('')}</div><svg class="cut-outline" viewBox="0 0 280 110"><path d="M0 30 80 0H200L280 30V100L200 110H80L0 100Z"/><path class="fold-lines" d="M80 0V110M200 0V110"/></svg></div><footer class="assembly-caption"><p>Score dashed folds at 80 and 200 mm, then cut the solid outline. Fold wings back; lean slightly until sloping lower edges rest on the table.</p><p>280 × 110 mm · 120 mm centre, 80 mm wings · Blank interior · Separate firm and shared references</p></footer></section>`;
save('docs/components/player-shields.html',page('Firm privacy shields',firms.map(shield).join(''),'player-shields.css','Six A4 landscape sheets, single-sided at 100%. The existing tapered shape is retained. Rule-free interiors stay blank; keep the A5 references separate.'));
console.log(`${check?'Checked':'Generated'} agent pieces, markers, references, shields and player sheets.`);
