import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CommandEnvelopeSchema,
  ClientWebSocketFrameSchema,
  CreateLobbyRequestSchema,
  GameIdSchema,
  PlayerGameActionSchema,
  ProjectedEventEnvelopeSchema,
  ServerWebSocketFrameSchema,
  ViewerStateEnvelopeSchema,
  type GameId,
  type SeatPrivateState,
  type ViewerStateEnvelope
} from "../src/index.js";

const gameId = "018f47d2-7830-7b84-a854-1b741f285f5d";
const seatId = "018f47d2-7830-7b84-a854-1b741f285f5e";
const eventId = "018f47d2-7830-7b84-a854-1b741f285f5f";

const publicState = {
  gameId,
  inviteCode: "PRESS42",
  version: 2,
  latestSequence: 4,
  lifecycle: "active",
  configuration: {
    playerCount: 4,
    allowSpectators: true
  },
  seats: [],
  spectators: [],
  publicGame: { phase: "lobby" }
};

describe("protocol primitives", () => {
  it("brands valid IDs and rejects malformed IDs", () => {
    const parsed = GameIdSchema.parse(gameId);

    expectTypeOf(parsed).toEqualTypeOf<GameId>();
    expect(GameIdSchema.safeParse("game-1").success).toBe(false);
  });

  it("rejects unknown request fields", () => {
    expect(
      CreateLobbyRequestSchema.safeParse({
        displayName: "Ada",
        controller: "human",
        configuration: {
          allowSpectators: true
        },
        admin: true
      }).success
    ).toBe(false);
  });

  it("creates lobbies without a fixed player count", () => {
    expect(
      CreateLobbyRequestSchema.parse({
        displayName: "Ada",
        controller: "human",
        configuration: {
          allowSpectators: true
        }
      }).configuration
    ).toEqual({
      allowSpectators: true
    });
    expect(
      CreateLobbyRequestSchema.safeParse({
        displayName: "Ada",
        controller: "human",
        configuration: {
          playerCount: 4,
          allowSpectators: true
        }
      }).success
    ).toBe(false);
  });
});

describe("commands", () => {
  it("accepts one firm and party for an opening", () => {
    expect(
      PlayerGameActionSchema.safeParse({
        type: "open_party",
        firmId: "one-fell-swoop",
        partyId: "honeycomb"
      }).success
    ).toBe(true);
    expect(
      PlayerGameActionSchema.safeParse({
        type: "open_party",
        firmId: "one-fell-swoop",
        partyId: "honeycomb",
        leverage: 1
      }).success
    ).toBe(false);
  });

  it("accepts one to three ordered Operation plays", () => {
    const play = {
      operation: "rally",
      choice: { operation: "rally", districtId: "harbormouth" },
      claimBonus: true
    };
    expect(
      PlayerGameActionSchema.safeParse({
        type: "operate",
        partyId: "night-parliament",
        plays: [
          play,
          { ...play, claimBonus: false },
          { ...play, claimBonus: false }
        ]
      }).success
    ).toBe(true);
    expect(
      PlayerGameActionSchema.safeParse({
        type: "operate",
        partyId: "night-parliament",
        plays: []
      }).success
    ).toBe(false);
  });

  it("requires the play and choice Operation families to match", () => {
    expect(
      PlayerGameActionSchema.safeParse({
        type: "operate",
        partyId: "honeycomb",
        plays: [
          {
            operation: "rally",
            choice: {
              operation: "organise",
              destinationDistrictId: "cloverfield"
            }
          }
        ]
      }).success
    ).toBe(false);
  });

  it("allows at most one bonus claim in an Operate action", () => {
    expect(
      PlayerGameActionSchema.safeParse({
        type: "operate",
        partyId: "honeycomb",
        plays: [
          {
            operation: "rally",
            choice: { operation: "rally", districtId: "cloverfield" },
            claimBonus: true
          },
          {
            operation: "court",
            choice: { operation: "court", targetParty: "old-shell" },
            claimBonus: true
          }
        ]
      }).success
    ).toBe(false);
  });

  it("accepts documented game actions and rejects unknown shapes", () => {
    expect(
      CommandEnvelopeSchema.parse({
        gameId,
        idempotencyKey: "agent-turn-42",
        expectedVersion: 9,
        command: {
          type: "game_action",
          action: {
            type: "collect",
            partyId: "honeycomb"
          }
        }
      }).command
    ).toMatchObject({ type: "game_action" });
    expect(
      CommandEnvelopeSchema.safeParse({
        gameId,
        idempotencyKey: "unknown-action",
        command: {
          type: "game_action",
          action: { type: "set_counterbid", slot: 1 }
        }
      }).success
    ).toBe(false);
  });
});

describe("hidden-state boundaries", () => {
  it("does not accept seat-private data in a public view", () => {
    expect(
      ViewerStateEnvelopeSchema.safeParse({
        scope: "public",
        publicState,
        seatState: {
          seatId,
          privateGame: { scoringCard: "SC-01" }
        }
      }).success
    ).toBe(false);
  });

  it("requires private state to match the viewing seat", () => {
    expect(
      ViewerStateEnvelopeSchema.safeParse({
        scope: "seat",
        viewerSeatId: seatId,
        publicState,
        seatState: {
          seatId: "018f47d2-7830-7b84-a854-1b741f285f60",
          privateGame: {}
        }
      }).success
    ).toBe(false);
  });

  it("unlocks full information only for completed games", () => {
    expect(
      ViewerStateEnvelopeSchema.safeParse({
        scope: "completed_replay",
        publicState,
        fullState: { fullGame: { parties: [] } }
      }).success
    ).toBe(false);
    expect(
      ViewerStateEnvelopeSchema.safeParse({
        scope: "completed_replay",
        publicState: { ...publicState, lifecycle: "completed" },
        fullState: { fullGame: { parties: [] } }
      }).success
    ).toBe(true);
  });

  it("keeps public and seat projections distinct at the type level", () => {
    type PublicView = Extract<ViewerStateEnvelope, { scope: "public" }>;
    type SeatView = Extract<ViewerStateEnvelope, { scope: "seat" }>;

    expectTypeOf<PublicView>().not.toHaveProperty("seatState");
    expectTypeOf<SeatView["seatState"]>().toEqualTypeOf<SeatPrivateState>();
  });
});

describe("event stream", () => {
  it("requires an access token in the websocket authentication frame", () => {
    expect(
      ClientWebSocketFrameSchema.safeParse({
        type: "authenticate",
        gameId,
        accessToken: "a".repeat(32),
        afterSequence: 12
      }).success
    ).toBe(true);
    expect(
      ClientWebSocketFrameSchema.safeParse({
        type: "authenticate",
        gameId
      }).success
    ).toBe(false);
  });

  it("rejects private event data from public events", () => {
    expect(
      ProjectedEventEnvelopeSchema.safeParse({
        eventId,
        gameId,
        sequence: 5,
        version: 3,
        occurredAt: "2026-07-30T08:00:00.000Z",
        eventType: "game.action_applied",
        scope: "public",
        publicData: { target: "honeycomb" },
        seatData: { operations: ["rally"] }
      }).success
    ).toBe(false);
  });

  it("parses projected event websocket frames", () => {
    expect(
      ServerWebSocketFrameSchema.safeParse({
        type: "event",
        event: {
          eventId,
          gameId,
          sequence: 5,
          version: 3,
          occurredAt: "2026-07-30T08:00:00.000Z",
          eventType: "game.action_applied",
          scope: "seat",
          viewerSeatId: seatId,
          publicData: { target: "honeycomb" },
          seatData: { operations: ["rally"] }
        }
      }).success
    ).toBe(true);
  });
});
