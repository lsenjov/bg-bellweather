import { AgentClient } from "@bellwether/testkit";
import type {
  GameCommand,
  GameId,
  ParticipantSession,
  ViewerStateEnvelope
} from "@bellwether/protocol";

const baseUrl = process.env["BELLWETHER_URL"] ?? "http://127.0.0.1:4317";
const inviteCode = process.env["BELLWETHER_INVITE"];
const displayName = process.env["BELLWETHER_NAME"] ?? "Conservative Agent";
const playerCount = Number(process.env["BELLWETHER_PLAYERS"] ?? "2");
const anonymous = new AgentClient({ baseUrl });

const joined =
  inviteCode === undefined
    ? await anonymous.createGame({
        displayName,
        controller: "agent",
        configuration: {
          playerCount,
          counterbidTimer: { mode: "off" },
          allowSpectators: true
        }
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

process.stdout.write(
  `${JSON.stringify({
    inviteCode: "inviteCode" in joined ? joined.inviteCode : inviteCode,
    session
  })}\n`
);

for (;;) {
  const state = await client.getState(session.gameId);
  await takeTurn(client, session, state);
  if (state.publicState.lifecycle === "completed") {
    const replay = await client.getReplay(session.gameId);
    process.stdout.write(`Game complete: ${replay.events.length} events\n`);
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
  const ownLobbySeat = publicState.seats.find(
    (seat) => seat.seatId === session.seatId
  );
  if (publicState.lifecycle === "lobby") {
    if (ownLobbySeat?.ready !== true) {
      await command(client, session.gameId, publicState.version, {
        type: "set_lobby_ready",
        ready: true
      });
      return;
    }
    if (
      ownLobbySeat.role === "host" &&
      publicState.seats.length === publicState.configuration.playerCount
    ) {
      await command(client, session.gameId, publicState.version, {
        type: "start_game"
      });
    }
    return;
  }

  const game = objectValue(publicState.publicGame);
  const phase = objectValue(game["phase"]);
  const phaseType = stringValue(phase["type"]);
  const privateGame =
    envelope.scope === "seat" ? objectValue(envelope.seatState.privateGame) : {};
  const seats = arrayValue(game["seats"]).map(objectValue);
  const ownSeat = seats.find((seat) => seat["id"] === session.seatId);

  if (
    phaseType === "opening" &&
    phase["activeSeatId"] === session.seatId &&
    ownSeat !== undefined
  ) {
    const reserve = objectValue(privateGame["reserve"]);
    const firms = arrayValue(ownSeat["firmIds"]).map(stringValue);
    const contests = objectValue(game["contests"]);
    const available = arrayValue(game["partyOrder"])
      .map(stringValue)
      .filter((partyId) => !(partyId in contests));
    const count = Math.min(firms.length, Number(reserve["clout"] ?? 0));
    await command(client, session.gameId, publicState.version, {
      type: "game_action",
      action: {
        type: "submit_openings",
        openings: firms.slice(0, count).map((firmId, index) => ({
          firmId,
          partyId: available[index] ?? available[0] ?? "honeycomb",
          clout: 1,
          operations: emptyOperations()
        }))
      }
    });
    return;
  }

  if (phaseType === "counterbidding") {
    const ready = arrayValue(phase["readySeatIds"]);
    if (!ready.includes(session.seatId)) {
      await command(client, session.gameId, publicState.version, {
        type: "game_action",
        action: { type: "set_counterbid_ready", ready: true }
      });
    }
    return;
  }

  if (phaseType === "election" && phase["resultsRecorded"] === true) {
    const ready = arrayValue(phase["readySeatIds"]);
    if (!ready.includes(session.seatId)) {
      await command(client, session.gameId, publicState.version, {
        type: "game_action",
        action: { type: "set_election_ready", ready: true }
      });
    }
    return;
  }

  const pending = objectValue(privateGame["pendingDecision"]);
  if (phaseType === "resolution" && pending["kind"] === "pecking_swap") {
    const adjacent = arrayValue(pending["adjacentIndexes"]);
    await command(client, session.gameId, publicState.version, {
      type: "game_action",
      action: {
        type: "resolve_pecking_swap",
        decisionId: stringValue(pending["id"]),
        adjacentIndex: Number(adjacent[0])
      }
    });
  }
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

function emptyOperations() {
  return { organise: 0, rally: 0, smear: 0, court: 0 };
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
