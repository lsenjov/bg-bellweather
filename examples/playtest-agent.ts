import { AgentClient, AgentClientError } from "@bellweather/testkit";
import {
  DISTRICTS,
  PARTIES,
  type FirmId,
  type PartyId
} from "@bellweather/content";
import {
  type GameCommand,
  type GameId,
  type ParticipantSession,
  type ViewerStateEnvelope
} from "@bellweather/protocol";
import { parsePlayerTarget } from "./playtest-settings.js";

const baseUrl = process.env["BELLWEATHER_URL"] ?? "http://127.0.0.1:4317";
const inviteCode = process.env["BELLWEATHER_INVITE"];
const displayName = process.env["BELLWEATHER_NAME"] ?? "Conservative Agent";
const playerTarget = parsePlayerTarget(process.env["BELLWEATHER_PLAYERS"]);
const anonymous = new AgentClient({ baseUrl });

const joined =
  inviteCode === undefined
    ? await anonymous.createGame({
        displayName,
        controller: "agent",
        configuration: { allowSpectators: true }
      })
    : await anonymous.joinGame({
        inviteCode: inviteCode as never,
        displayName,
        controller: "agent",
        role: "player"
      });

const session = joined.session;
if (session.participantType !== "seat") {
  throw new Error("The playtest agent requires a player seat");
}
const client = anonymous.withAccessToken(session.accessToken);
const eventStream = client.subscribe(session.gameId);
void (async () => {
  for await (const frame of eventStream) {
    if (frame.type === "event") {
      process.stderr.write(
        `event ${frame.event.sequence}: ${frame.event.eventType}\n`
      );
    }
  }
})();
let introduced = false;

process.stdout.write(
  `${JSON.stringify({
    inviteCode: "inviteCode" in joined ? joined.inviteCode : inviteCode,
    session
  })}\n`
);

for (;;) {
  const state = await client.getState(session.gameId);
  try {
    await takeTurn(client, session, state);
  } catch (error) {
    if (!(error instanceof AgentClientError) || error.status !== 409) {
      throw error;
    }
  }
  if (state.publicState.lifecycle === "completed") {
    const replay = await client.getReplay(session.gameId);
    process.stdout.write(`Game complete: ${replay.events.length} events\n`);
    eventStream.close();
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 750));
}

async function takeTurn(
  client: AgentClient,
  session: Extract<ParticipantSession, { participantType: "seat" }>,
  envelope: ViewerStateEnvelope
): Promise<void> {
  const publicState = envelope.publicState;
  const lobbySeat = publicState.seats.find(
    (seat) => seat.seatId === session.seatId
  );
  if (publicState.lifecycle === "lobby") {
    if (lobbySeat?.ready !== true) {
      await command(client, session.gameId, publicState.version, {
        type: "set_lobby_ready",
        ready: true
      });
      return;
    }
    if (
      lobbySeat.role === "host" &&
      publicState.configuration.playerCount >= playerTarget
    ) {
      await command(client, session.gameId, publicState.version, {
        type: "start_game"
      });
    }
    return;
  }

  const game = objectValue(publicState.publicGame);
  const phaseType = stringValue(game["phase"]);
  const phase = objectValue(game["phaseData"]);
  const privateGame =
    envelope.scope === "seat" ? objectValue(envelope.seatState.privateGame) : {};
  const ownSeat = objectValue(privateGame["seat"]);

  if (!introduced) {
    await command(client, session.gameId, publicState.version, {
      type: "post_chat",
      message: `${displayName} connected through the playtest API.`
    });
    introduced = true;
    return;
  }

  if (phaseType === "opening" && openingSeatId(phase) === session.seatId) {
    const parties = objectValue(game["parties"]);
    const usedFirms = new Set(
      Object.values(parties).map((party) => stringValue(objectValue(party)["firmId"]))
    );
    const firmId = arrayValue(ownSeat["firmIds"])
      .map((value) => stringValue(value) as FirmId)
      .find((candidate) => !usedFirms.has(candidate));
    const partyId = PARTIES.map((party) => party.id).find(
      (candidate) => !(candidate in parties)
    );
    if (firmId !== undefined && partyId !== undefined) {
      await gameAction(client, session.gameId, publicState.version, {
        type: "open_party",
        firmId,
        partyId
      });
    }
    return;
  }

  if (phaseType === "lobby" && phase["activeSeatId"] === session.seatId) {
    if (phase["inProgressOperate"] !== null) {
      await gameAction(client, session.gameId, publicState.version, {
        type: "finish_operate"
      });
      return;
    }
    const operation = chooseRally(game, ownSeat);
    await gameAction(
      client,
      session.gameId,
      publicState.version,
      operation ?? chooseClose(game, phase, session.seatId) ?? { type: "pass" }
    );
    return;
  }

  if (phaseType === "closure") {
    const partyId = arrayValue(phase["pendingPartyIds"])[0];
    const party = objectValue(objectValue(game["parties"])[String(partyId)]);
    if (party["ownerSeatId"] === session.seatId) {
      await gameAction(client, session.gameId, publicState.version, {
        type: "choose_closure_bonus",
        partyId
      });
    }
    return;
  }

  if (phaseType === "election" && phase["resultsRecorded"] === true) {
    const ready = arrayValue(phase["readySeatIds"]);
    if (!ready.includes(session.seatId)) {
      await gameAction(client, session.gameId, publicState.version, {
        type: "set_election_ready",
        ready: true
      });
    }
  }
}

function chooseRally(
  game: Record<string, unknown>,
  ownSeat: Record<string, unknown>
): Record<string, unknown> | null {
  const operations = objectValue(ownSeat["operations"]);
  if (Number(operations["rally"] ?? 0) < 1) {
    return null;
  }
  const parties = objectValue(game["parties"]);
  const support = objectValue(game["support"]);
  for (const [partyValue, partyState] of Object.entries(parties)) {
    const partyId = partyValue as PartyId;
    if (objectValue(partyState)["status"] !== "open") {
      continue;
    }
    const hasSupport = DISTRICTS.some(
      (district) => Number(objectValue(support[district.id])[partyId] ?? 0) > 0
    );
    const district = DISTRICTS.find((candidate) => {
      const districtSupport = objectValue(support[candidate.id]);
      const occupied = Object.values(districtSupport).reduce<number>(
        (total, count) => total + Number(count ?? 0),
        0
      );
      return (
        occupied < candidate.capacity &&
        (!hasSupport || Number(districtSupport[partyId] ?? 0) > 0)
      );
    });
    if (district !== undefined) {
      return {
        type: "operate",
        partyId,
        play: {
          cardType: "operation",
          operation: "rally",
          choice: { operation: "rally", districtId: district.id }
        }
      };
    }
  }
  return null;
}

function chooseClose(
  game: Record<string, unknown>,
  phase: Record<string, unknown>,
  seatId: string
): Record<string, unknown> | null {
  const turnsTaken = objectValue(phase["turnsTaken"]);
  if (Number(turnsTaken[seatId] ?? 0) === 0) {
    return null;
  }
  for (const [partyId, partyValue] of Object.entries(objectValue(game["parties"]))) {
    const party = objectValue(partyValue);
    if (party["ownerSeatId"] === seatId && party["status"] === "open") {
      return { type: "close", partyId };
    }
  }
  return null;
}

function openingSeatId(phase: Record<string, unknown>): unknown {
  return arrayValue(phase["turnSeatIds"])[Number(phase["turnIndex"] ?? -1)];
}

async function gameAction(
  client: AgentClient,
  gameId: GameId,
  expectedVersion: number,
  action: Record<string, unknown>
): Promise<void> {
  await command(client, gameId, expectedVersion, {
    type: "game_action",
    action: action as never
  });
}

async function command(
  client: AgentClient,
  gameId: GameId,
  expectedVersion: number,
  gameCommand: GameCommand
): Promise<void> {
  await client.sendCommand(gameId, {
    gameId,
    expectedVersion,
    idempotencyKey: crypto.randomUUID() as never,
    command: gameCommand
  });
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
