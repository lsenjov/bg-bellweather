import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, copyFile, readdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const manifestPath = path.resolve(process.argv[2] ?? 'data/strategy-league-2026-09-12/manifest.json');
const root = path.dirname(manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const strategies = new Map(manifest.strategies.map(strategy => [strategy.id, strategy]));
if (strategies.size !== 10 || manifest.games.length !== 10) throw new Error('Expected ten strategies and ten games');
for (const strategy of strategies.values()) {
  if (!/^[a-zA-Z0-9_-]+$/.test(strategy.id)) throw new Error('Unsafe strategy ID');
}
for (const [index, game] of manifest.games.entries()) {
  if (game.number !== index + 1 || game.strategies.length !== 4 || new Set(game.strategies).size !== 4 || game.strategies.some(id => !strategies.has(id))) {
    throw new Error('Each sequential game must have four distinct known strategies');
  }
}
const statePath = path.join(root, 'runner-state.json');
const state = await readJson(statePath, { identities: {}, games: {} });
const children = new Set();
const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), 'league-player.mjs');
const playerDirectory = id => path.join(root, 'players', id);
let saveQueue = Promise.resolve();
const save = () => {
  saveQueue = saveQueue.then(() => atomicJson(statePath, state));
  return saveQueue;
};

async function readJson(filename, fallback) {
  try { return JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function atomicJson(filename, value) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, filename);
}
async function api(method, route, body, session) {
  const response = await fetch(`${manifest.baseUrl.replace(/\/$/, '')}/api/v1${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status}: ${JSON.stringify(result)}`);
  return result;
}
const getState = session => api('GET', `/games/${session.gameId}/state`, undefined, session);
async function command(session, value) {
  const current = await getState(session);
  return api('POST', `/games/${session.gameId}/commands`, {
    gameId: session.gameId, expectedVersion: current.publicState.version,
    idempotencyKey: randomUUID(), command: value,
  }, session);
}
async function distributeDossier() {
  let dossier = '# Shared postmortems\n\nEvery completed game’s full player postmortems follow. Opponent strategy assignments are private during play.\n';
  for (const game of manifest.games) {
    const saved = state.games[game.number];
    if (!saved?.completed) break;
    for (let seat = 0; seat < 4; seat++) {
      const postmortem = await readFile(path.join(root, 'games', String(game.number), `seat-${seat + 1}-postmortem.md`), 'utf8');
      dossier += `\n## Game ${game.number}, ${saved.seats[seat].alias}\n\n${postmortem}\n`;
    }
  }
  await writeFile(path.join(root, 'shared-postmortems.md'), dossier);
  for (const id of strategies.keys()) await writeFile(path.join(playerDirectory(id), 'shared-postmortems.md'), dossier);
  return dossier;
}
function promptFor(game, seat, continuation = false) {
  const strategy = strategies.get(game.strategies[seat]);
  return `${continuation ? 'Continue this unfinished assignment from your existing context.' : `You are the persistent league player with priority: ${strategy.name}. ${strategy.priority}`}
Your overall objective is to win. The priority is a preference, not a restriction on legal actions. Adapt using evidence and shared lessons. This is game ${game.number}; your opaque display name is game-${game.number}-seat-${seat + 1}. Other players' strategies are private. Do not reveal your strategy assignment or identity during play or in postmortems, or link your current alias to a previous alias.
Operate ONLY inside your current player workspace. Do not read the repository, parent directories, other players' files, server database, other sessions, Codex configuration or thread storage. Do not spawn agents. Use only your own authenticated session through league-player.mjs and the supplied local references. Your private notes from previous appearances are in notes.md. Before playing, read references/rules.txt, references/api.txt, references/content.json, shared-postmortems.md, and notes.md when present. The shared dossier contains ALL completed games' full postmortems, including games you did not play.
Play the entire game through its authenticated API. This is an LLM playtest: YOU must reason about and choose EVERY action. Do not write or use any automated move-selection policy, heuristics, simulation bot, or fallback agent. You may use calculations to compare candidate actions you choose. Legal actions are unrestricted. After every Operation card, inspect fresh state and make a new LLM decision about further cards, optional Bonuses, and ending the Operation. Independently consider optional Closure choices. Inspect each Election result before acknowledging it. There is no turn, decision, token, or pacing cap imposed by the league. Do not hurry or simplify play to finish quickly.
The transport is a passive helper: node league-player.mjs state; node league-player.mjs wait; node league-player.mjs act VERSION 'ACTION_JSON'; node league-player.mjs replay. Read its supplied API documentation for exact invocation. Save full state and replay responses into local files, then extract relevant fields for readable output without losing access to the complete evidence. If it is another player's turn, use wait to await state changes, then inspect state and continue. Individual waits must be at most 45 seconds. NEVER end your turn merely because another player is active: keep waiting and playing until the game lifecycle is completed. Resolve legal-action errors by checking current state and rules; never silently substitute automated play. The orchestrator already readied and started the game.
After observing that the game lifecycle is completed, return GAME_COMPLETED. A separate postgame turn will request your replay analysis and full postmortem. Do not produce a final answer while the game remains in progress.\n`;
}
async function runPlayer(game, seat, gameState, gameDir) {
  const id = game.strategies[seat];
  const identity = state.identities[id] ??= {};
  const cwd = playerDirectory(id);
  if (gameState.postmortems?.[seat]) return;
  let attempt = gameState.attempts?.[seat] ?? 0;
  for (;;) {
    attempt++;
    gameState.attempts ??= {};
    gameState.attempts[seat] = attempt;
    await save();
    const prefix = `game-${game.number}-attempt-${attempt}`;
    const finalFile = path.join(cwd, `${prefix}-postmortem.md`);
    const logFile = path.join(gameDir, `seat-${seat + 1}-attempt-${attempt}.jsonl`);
    const errFile = path.join(gameDir, `seat-${seat + 1}-attempt-${attempt}.stderr`);
    const common = ['--json', '--skip-git-repo-check', '-c', 'approval_policy="never"', '-c', 'sandbox_mode="danger-full-access"', '-o', finalFile];
    const args = identity.threadId
      ? ['exec', 'resume', ...common, identity.threadId, '-']
      : ['exec', ...common, '-C', cwd, '-'];
    const child = spawn('codex', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    children.add(child);
    process.stdout.write(`Game ${game.number} seat ${seat + 1}: agent started (attempt ${attempt}${identity.threadId ? ', resumed identity' : ', new identity'}).\n`);
    let pending = '';
    let writes = Promise.resolve();
    child.stdout.on('data', chunk => {
      writes = writes.then(() => appendFile(logFile, chunk));
      pending += chunk.toString();
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        try {
          const event = JSON.parse(line);
          if (event.type === 'thread.started' && event.thread_id) {
            identity.threadId = event.thread_id;
            writes = writes.then(save);
          }
        } catch { /* Non-JSON CLI diagnostics remain in the durable log. */ }
      }
    });
    child.stderr.on('data', chunk => { writes = writes.then(() => appendFile(errFile, chunk)); });
    const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    child.stdin.on('error', () => {});
    child.stdin.end(gameState.postgame?.[seat]
      ? `The orchestrator has confirmed game ${game.number} completed. Stay within this private workspace and use only your own session and references. Fetch the completed replay using node league-player.mjs replay, save it locally, and inspect it alongside final state. Write your full first-person postmortem as the final answer, including your alias game-${game.number}-seat-${seat + 1}, score/rank, important decisions and their observed consequences, mistakes, what you learned from opponents, which prior shared lessons you applied, and changes to consider next time. Distinguish evidence from speculation. Update private notes.md for future appearances. Do not reveal your assigned strategy label, private identity, or mappings between aliases across games. Your complete postmortem will be shared with all ten league identities before the next game.\n`
      : promptFor(game, seat, attempt > 1));
    const code = await exited;
    children.delete(child);
    process.stdout.write(`Game ${game.number} seat ${seat + 1}: agent exited ${code}.\n`);
    await writes;
    if (code !== 0) throw new Error(`Game ${game.number} seat ${seat + 1}: codex exited ${code}; inspect ${errFile}`);
    if (!identity.threadId) throw new Error(`No persistent thread ID for ${id}`);
    const current = await getState(gameState.seats[seat].session);
    if (current.publicState.lifecycle !== 'completed') {
      await appendFile(path.join(root, 'interventions.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), game: game.number, seat: seat + 1, attempt, reason: 'Player ended before completion; resumed without strategic guidance' })}\n`);
      continue;
    }
    if (!gameState.postgame?.[seat]) {
      gameState.postgame ??= {};
      gameState.postgame[seat] = true;
      await save();
      continue;
    }
    const postmortem = await readFile(finalFile, 'utf8');
    if (!postmortem.trim()) throw new Error(`Empty postmortem for game ${game.number} seat ${seat + 1}`);
    await writeFile(path.join(gameDir, `seat-${seat + 1}-postmortem.md`), postmortem);
    gameState.postmortems ??= {};
    gameState.postmortems[seat] = true;
    await save();
    return;
  }
}
function stopChildren() {
  for (const child of children) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
}
process.once('SIGINT', () => { stopChildren(); process.exit(130); });
process.once('SIGTERM', () => { stopChildren(); process.exit(143); });
try {
  for (const id of strategies.keys()) {
    const cwd = playerDirectory(id);
    await mkdir(path.join(cwd, 'references'), { recursive: true });
    await copyFile(helper, path.join(cwd, 'league-player.mjs'));
    for (const filename of await readdir(path.join(root, 'references'))) {
      await copyFile(path.join(root, 'references', filename), path.join(cwd, 'references', filename));
    }
    await writeFile(path.join(cwd, 'AGENTS.md'), 'This is a private playtest-player workspace. Play through league-player.mjs using only your own session and supplied references. Read and write only within this directory. Do not inspect parent/repository directories or other identities, and do not delegate or implement game-playing software. Preserve your private notes. Before each game, read every full postmortem in shared-postmortems.md, using chunks small enough to avoid tool-output truncation. Before Game N there should be 4 * (N - 1) complete postmortems; do not substitute a summary or skip earlier entries.\n');
  }
  let dossier = await distributeDossier();
  for (const game of manifest.games) {
    if (state.games[game.number]?.completed) continue;
    const gameDir = path.join(root, 'games', String(game.number));
    await mkdir(gameDir, { recursive: true });
    await writeFile(path.join(gameDir, 'shared-postmortems-before.md'), dossier);
    const saved = state.games[game.number] ??= { seats: [], started: false, completed: false };
    for (let seat = saved.seats.length; seat < 4; seat++) {
      const alias = `game-${game.number}-seat-${seat + 1}`;
      const joined = seat === 0
        ? await api('POST', '/games', { displayName: alias, controller: 'agent', configuration: { allowSpectators: true } })
        : await api('POST', '/games/join', { inviteCode: saved.inviteCode, displayName: alias, controller: 'agent', role: 'player' });
      if (joined.session.participantType !== 'seat') throw new Error('Expected player session');
      if (seat === 0) saved.inviteCode = joined.inviteCode;
      saved.seats.push({ alias, strategyId: game.strategies[seat], session: joined.session });
      await save();
    }
    for (let seat = 0; seat < 4; seat++) {
      await atomicJson(path.join(playerDirectory(game.strategies[seat]), 'session.json'), { baseUrl: manifest.baseUrl, session: saved.seats[seat].session });
    }
    if (!saved.started) {
      const current = await getState(saved.seats[0].session);
      if (current.publicState.lifecycle === 'lobby') {
        for (const { session } of saved.seats) await command(session, { type: 'set_lobby_ready', ready: true });
        const readyState = await getState(saved.seats[0].session);
        const expectedSeats = new Set(saved.seats.map(({ session }) => session.seatId));
        if (readyState.publicState.seats.length !== 4 || readyState.publicState.seats.some(seat => !expectedSeats.has(seat.seatId) || !seat.ready)) throw new Error('Lobby seats do not match the four ready league players');
        await command(saved.seats[0].session, { type: 'start_game' });
      }
      saved.started = true;
      await save();
    }
    process.stdout.write(`Game ${game.number} started: ${saved.seats[0].session.gameId}\n`);
    await Promise.all(saved.seats.map((_, seat) => runPlayer(game, seat, saved, gameDir)));
    const finalState = await getState(saved.seats[0].session);
    if (finalState.publicState.lifecycle !== 'completed') throw new Error('All players exited without completing game');
    const finishedGame = finalState.publicState.publicGame;
    if (finishedGame.phase !== 'complete' || finishedGame.year !== 6 || finishedGame.yearHistory?.length !== 6 || finishedGame.electionHistory?.length !== 3) throw new Error('Completed game must contain six years and three elections');
    const replay = await api('GET', `/games/${saved.seats[0].session.gameId}/replay`, undefined, saved.seats[0].session);
    if (!replay.events?.length || replay.events.some(event => event.scope !== 'completed_replay')) throw new Error('Expected full completed replay');
    await atomicJson(path.join(gameDir, 'replay.json'), replay);
    await atomicJson(path.join(gameDir, 'result.json'), { game: game.number, gameId: saved.seats[0].session.gameId, players: saved.seats.map(({ alias, strategyId, session }) => ({ alias, strategyId, seatId: session.seatId })), publicState: finalState.publicState });
    saved.completed = true;
    saved.completedAt = new Date().toISOString();
    await save();
    dossier = await distributeDossier();
    const results = [];
    for (const completed of manifest.games.filter(item => state.games[item.number]?.completed)) results.push(await readJson(path.join(root, 'games', String(completed.number), 'result.json')));
    await atomicJson(path.join(root, 'results.json'), results);
    process.stdout.write(`Game ${game.number} complete; all ten identities received all ${game.number * 4} postmortems.\n`);
  }
} catch (error) {
  stopChildren();
  await appendFile(path.join(root, 'interventions.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), reason: 'Runner stopped on error', error: String(error) })}\n`);
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
}
