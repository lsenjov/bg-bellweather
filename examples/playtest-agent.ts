import { AgentClient, AgentClientError } from "@bellwether/testkit";
import {
  DISTRICTS,
  PARTIES,
  type FirmId,
  type OperationId,
  type PartyId
} from "@bellwether/content";
import type {
  GameCommand,
  GameId,
  OperationChoice,
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
let gifted = false;
const counterbidRounds = new Set<number>();

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

  if (!introduced) {
    await command(client, session.gameId, publicState.version, {
      type: "post_chat",
      message: `${displayName} connected through the playtest API.`
    });
    introduced = true;
    return;
  }
  const opponent = seats.find((seat) => seat["id"] !== session.seatId);
  const reserve = objectValue(privateGame["reserve"]);
  if (!gifted && opponent !== undefined && Number(reserve["clout"] ?? 0) > 0) {
    await command(client, session.gameId, publicState.version, {
      type: "give_resources",
      recipientSeatId: stringValue(opponent["id"]) as never,
      clout: 1,
      operations: emptyOperations(),
      points: 0
    });
    gifted = true;
    return;
  }

  if (
    phaseType === "opening" &&
    phase["activeSeatId"] === session.seatId &&
    ownSeat !== undefined
  ) {
    const firms = arrayValue(ownSeat["firmIds"]).map(
      (firmId) => stringValue(firmId) as FirmId
    );
    const contests = objectValue(game["contests"]);
    const available = arrayValue(game["partyOrder"])
      .map((partyId) => stringValue(partyId) as PartyId)
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
          operations:
            index === 0 &&
            Number(objectValue(reserve["operations"])["organise"] ?? 0) > 0
              ? { ...emptyOperations(), organise: 1 }
              : emptyOperations()
        }))
      }
    });
    return;
  }

  if (phaseType === "counterbidding") {
    const ready = arrayValue(phase["readySeatIds"]);
    const round = Number(game["round"] ?? 0);
    if (!counterbidRounds.has(round) && ownSeat !== undefined) {
      const firms = arrayValue(ownSeat["firmIds"]).map(
        (firmId) => stringValue(firmId) as FirmId
      );
      const firmId = firms[0];
      if (firmId === undefined) {
        return;
      }
      await command(client, session.gameId, publicState.version, {
        type: "game_action",
        action: {
          type: "set_counterbid",
          slotIndex: 0,
          bid: {
            contestId: "pecking-order",
            firmId,
            clout: 0,
            operations: emptyOperations()
          }
        }
      });
      counterbidRounds.add(round);
      return;
    }
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
    return;
  }
  if (
    phaseType === "resolution" &&
    (pending["kind"] === "party_operation" ||
      pending["kind"] === "night_delayed_operation")
  ) {
    const legal = arrayValue(pending["legalOperations"]).map(stringValue);
    const operationValue = stringValue(pending["operation"] ?? legal[0]);
    if (!isOperationId(operationValue)) {
      return;
    }
    const operation = operationValue;
    const partyId = stringValue(
      pending["partyId"] ?? pending["contestId"]
    ) as PartyId;
    const choice = chooseOperation(
      operation,
      partyId,
      objectValue(game["support"]),
      objectValue(game["overtures"])
    );
    if (choice !== null) {
      await command(client, session.gameId, publicState.version, {
        type: "game_action",
        action: {
          type: "resolve_party_operation",
          decisionId: stringValue(pending["id"]),
          operation,
          choice
        }
      });
    }
  }
}

function chooseOperation(
  operation: OperationId,
  partyId: PartyId,
  rawSupport: Record<string, unknown>,
  overtures: Record<string, unknown>
): OperationChoice | null {
  const support = Object.fromEntries(
    DISTRICTS.map((district) => [
      district.id,
      objectValue(rawSupport[district.id])
    ])
  );
  const occupied = (districtId: string) =>
    Object.values(support[districtId] ?? {}).reduce<number>(
      (total, count) => total + Number(count ?? 0),
      0
    );
  const free = (districtId: string) => {
    const district = DISTRICTS.find((candidate) => candidate.id === districtId);
    return district !== undefined && occupied(districtId) < district.capacity;
  };
  const present = (districtId: string, party: PartyId) =>
    Number(support[districtId]?.[party] ?? 0) > 0;

  if (operation === "organise") {
    const source = DISTRICTS.find((district) => present(district.id, partyId));
    const destination =
      source === undefined
        ? DISTRICTS.find((district) => free(district.id))
        : DISTRICTS.find(
            (district) =>
              (source.adjacentDistrictIds as readonly string[]).includes(
                district.id
              ) &&
              free(district.id)
          );
    return destination === undefined
      ? null
      : {
          operation,
          destinationDistrictId: destination.id,
          ...(source === undefined ? {} : { sourceDistrictId: source.id })
        };
  }
  if (operation === "rally") {
    const partyPresent = DISTRICTS.some((district) =>
      present(district.id, partyId)
    );
    const district = DISTRICTS.find(
      (candidate) =>
        free(candidate.id) &&
        (!partyPresent || present(candidate.id, partyId))
    );
    return district === undefined
      ? null
      : { operation, districtId: district.id };
  }
  if (operation === "smear") {
    const actingDistricts = DISTRICTS.filter((district) =>
      present(district.id, partyId)
    );
    for (const district of DISTRICTS) {
      const inRange =
        actingDistricts.length === 0 ||
        present(district.id, partyId) ||
        actingDistricts.some((source) =>
          (source.adjacentDistrictIds as readonly string[]).includes(
            district.id
          )
        );
      const rival = PARTIES.find(
        (party) =>
          party.id !== partyId && present(district.id, party.id)
      );
      if (inRange && rival !== undefined) {
        return {
          operation,
          districtId: district.id,
          rivalParty: rival.id
        };
      }
    }
    return null;
  }
  if (operation === "court") {
    const target = PARTIES.find(
      (party) =>
        party.id !== partyId && party.id !== overtures[partyId]
    );
    return target === undefined
      ? null
      : { operation, targetParty: target.id };
  }
  return null;
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

function isOperationId(value: string): value is OperationId {
  return (
    value === "organise" ||
    value === "rally" ||
    value === "smear" ||
    value === "court"
  );
}
