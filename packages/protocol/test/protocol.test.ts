import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CommandEnvelopeSchema,
  ClientWebSocketFrameSchema,
  CounterbidTimerSettingsSchema,
  CreateLobbyRequestSchema,
  GameIdSchema,
  GiveResourcesCommandSchema,
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
  version: 2,
  latestSequence: 4,
  lifecycle: "active",
  configuration: {
    playerCount: 4,
    counterbidTimer: { mode: "countdown", durationSeconds: 90 },
    allowSpectators: true
  },
  seats: [],
  spectators: [],
  publicGame: { phase: "counterbidding" }
};

describe("protocol primitives", () => {
  it("brands valid IDs and rejects malformed IDs", () => {
    const parsed = GameIdSchema.parse(gameId);

    expectTypeOf(parsed).toEqualTypeOf<GameId>();
    expect(GameIdSchema.safeParse("game-1").success).toBe(false);
  });

  it("accepts only explicit timer modes and bounded durations", () => {
    expect(CounterbidTimerSettingsSchema.parse({ mode: "off" })).toEqual({
      mode: "off"
    });
    expect(
      CounterbidTimerSettingsSchema.safeParse({
        mode: "countdown",
        durationSeconds: 4
      }).success
    ).toBe(false);
    expect(
      CounterbidTimerSettingsSchema.safeParse({
        mode: "off",
        durationSeconds: 90
      }).success
    ).toBe(false);
  });

  it("rejects unknown request fields", () => {
    expect(
      CreateLobbyRequestSchema.safeParse({
        displayName: "Ada",
        controller: "human",
        configuration: {
          playerCount: 4,
          counterbidTimer: { mode: "off" },
          allowSpectators: true
        },
        admin: true
      }).success
    ).toBe(false);
  });
});

describe("commands", () => {
  it("requires a non-empty atomic gift", () => {
    const emptyGift = {
      type: "give_resources",
      recipientSeatId: seatId,
      leverage: 0,
      bluff: 0,
      operations: { organise: 0, rally: 0, smear: 0, court: 0 },
      points: 0
    };

    expect(GiveResourcesCommandSchema.safeParse(emptyGift).success).toBe(false);
    expect(
      GiveResourcesCommandSchema.safeParse({ ...emptyGift, points: 1 }).success
    ).toBe(true);
    expect(
      GiveResourcesCommandSchema.safeParse({ ...emptyGift, bluff: 1 }).success
    ).toBe(true);
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
            type: "set_counterbid",
            slotIndex: 1,
            bid: {
              contestId: "pecking-order",
              firmId: "one-fell-swoop",
              leverage: 2,
              bluff: 1,
              operations: { organise: 1, rally: 0, smear: 0, court: 0 }
            }
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
          action: { type: "place_counterbid", slot: 1 }
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
        fullState: { fullGame: { bids: [] } }
      }).success
    ).toBe(false);
    expect(
      ViewerStateEnvelopeSchema.safeParse({
        scope: "completed_replay",
        publicState: { ...publicState, lifecycle: "completed" },
        fullState: { fullGame: { bids: [] } }
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
        eventType: "counterbid_changed",
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
          eventType: "counterbid_changed",
          scope: "seat",
          viewerSeatId: seatId,
          publicData: { target: "honeycomb" },
          seatData: { leverage: 3, operations: ["rally"] }
        }
      }).success
    ).toBe(true);
  });
});
