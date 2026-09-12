import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const usage = `Run from the player's directory containing session.json:
  node league-player.mjs state
  node league-player.mjs wait
  node league-player.mjs act VERSION 'JSON_ACTION'
  node league-player.mjs replay

session.json: { "baseUrl": "http://127.0.0.1:4317", "session": { "participantType": "seat", "gameId": "...", "seatId": "...", "accessToken": "..." } }
act accepts a game action, or a complete set_lobby_ready, start_game,
post_chat, or game_action command. VERSION is the observed publicState.version.
wait polls for up to 45 seconds and returns { decision, state, timedOut }.
state returns { decision, state }. No command is selected automatically.
Every HTTP request and response is recorded in commands.jsonl without credentials.`;

let accessToken;

function safeJson(value) {
  const json = JSON.stringify(value);
  return accessToken ? json.replaceAll(accessToken, "[REDACTED]") : json;
}

function record(value) {
  appendFileSync("commands.jsonl", `${safeJson({ at: new Date().toISOString(), ...value })}\n`, { mode: 0o600 });
}

function decision(state, seatId) {
  const publicState = state.publicState;
  if (publicState.lifecycle === "completed") return "completed";
  if (publicState.lifecycle === "lobby") {
    const seat = publicState.seats.find((candidate) => candidate.seatId === seatId);
    if (seat && !seat.ready) return "lobby_ready";
    if (seat?.role === "host" && publicState.seats.length === 4 && publicState.seats.every((candidate) => candidate.ready)) return "lobby_start";
    return null;
  }
  const game = publicState.publicGame;
  const phase = game.phaseData;
  if (game.phase === "opening" && phase.turnSeatIds[phase.turnIndex] === seatId) return "opening";
  if (game.phase === "lobby" && phase.activeSeatId === seatId) return "lobby";
  if (game.phase === "closure" && game.parties[phase.pendingPartyIds[0]]?.ownerSeatId === seatId) return "closure";
  if (game.phase === "election" && phase.resultsRecorded && !phase.readySeatIds.includes(seatId)) return "election_ready";
  return null;
}

async function main() {
  const [operation, ...args] = process.argv.slice(2);
  if (operation === "--help" || operation === "help") {
    process.stdout.write(`${usage}\n`);
    return;
  }
  if (!["state", "wait", "act", "replay"].includes(operation) || args.length !== (operation === "act" ? 2 : 0)) throw new Error(usage);
  const { baseUrl, session } = JSON.parse(readFileSync("session.json", "utf8"));
  accessToken = session?.accessToken;
  if (typeof accessToken !== "string" || !accessToken || session.participantType !== "seat" || typeof session.gameId !== "string" || typeof session.seatId !== "string") throw new Error("session.json must contain a player seat session with gameId, seatId, and accessToken.");
  const base = new URL(baseUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("baseUrl must be an HTTP(S) URL without embedded credentials.");
  const route = `/api/v1/games/${encodeURIComponent(session.gameId)}`;

  async function request(method, path, body, timeout = 10000) {
    const requestId = randomUUID();
    record({ kind: "request", requestId, method, path, ...(body === undefined ? {} : { body }) });
    let response;
    let responseBody;
    try {
      response = await fetch(new URL(path, base), {
        method,
        redirect: "error",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(Math.max(1, timeout))
      });
      const raw = await response.text();
      try { responseBody = JSON.parse(raw); } catch { responseBody = { raw }; }
    } catch (error) {
      record({ kind: "transport_error", requestId, error: error.message });
      throw new Error(`Request failed: ${error.message}. Inspect commands.jsonl; refresh state before deciding whether to retry a command.`);
    }
    record({ kind: "response", requestId, status: response.status, body: responseBody });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${safeJson(responseBody)}${response.status === 409 ? " Refresh state and reconsider your action; no automatic retry was made." : ""}`);
    return responseBody;
  }

  let result;
  if (operation === "act") {
    const version = Number(args[0]);
    if (!/^\d+$/.test(args[0]) || !Number.isSafeInteger(version)) throw new Error("VERSION must be the nonnegative integer from the state used to choose this action.");
    const action = JSON.parse(args[1]);
    if (!action || typeof action !== "object" || Array.isArray(action) || typeof action.type !== "string") throw new Error("JSON_ACTION must be an object with a type field.");
    const command = ["set_lobby_ready", "start_game", "post_chat", "game_action"].includes(action.type) ? action : { type: "game_action", action };
    result = await request("POST", `${route}/commands`, { gameId: session.gameId, expectedVersion: version, idempotencyKey: randomUUID(), command });
  } else if (operation === "replay") {
    const state = await request("GET", `${route}/state`);
    if (state.publicState.lifecycle !== "completed") throw new Error("Replay is only available after the game is completed.");
    result = await request("GET", `${route}/replay`);
  } else {
    const deadline = Date.now() + 45000;
    do {
      const state = await request("GET", `${route}/state`, undefined, Math.min(10000, deadline - Date.now()));
      result = { decision: decision(state, session.seatId), state };
      if (operation === "state" || result.decision !== null || Date.now() >= deadline) break;
      await sleep(Math.min(1000, deadline - Date.now()));
    } while (Date.now() < deadline);
    if (operation === "wait") result.timedOut = result.decision === null;
  }
  process.stdout.write(`${safeJson(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${safeJson({ error: error.message })}\n`);
  process.exitCode = 1;
});
