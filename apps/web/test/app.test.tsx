/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RULESET_VERSION, type PartyId } from "@bellweather/content";
import {
  executeAction,
  initializeGame,
  projectGameState,
  type GameAction,
  type GameState
} from "@bellweather/game";
import type { ViewerStateEnvelope } from "@bellweather/protocol";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActionDesk,
  App,
  DistrictMap,
  GameDesk,
  LobbyDesk,
  PartyBoard,
  extractView,
  type GameView
} from "../src/App.js";

const random = { integer: () => 0 };

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value)
    } satisfies Storage
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("yearly browser play surface", () => {
  it("creates a table without auction or timer settings", async () => {
    const lobby = lobbyEnvelope();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        if (String(input) === "/api/v1/games" && init?.method === "POST") {
          return Response.json({
            inviteCode: "PRESS42",
            session: session(),
            state: lobby
          }, { status: 201 });
        }
        return Response.json(lobby);
      }
    );
    render(<App />);
    fireEvent.change(screen.getByLabelText("Byline"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Print first edition" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const createCall = fetchSpy.mock.calls.find(([input]) => String(input) === "/api/v1/games")!;
    const body = JSON.parse(String(createCall[1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      displayName: "Ada",
      controller: "human",
      configuration: { allowSpectators: true }
    });
    expect(JSON.stringify(body)).not.toContain("counterbid");
  });

  it("lets a host start a variable lobby at two players", async () => {
    const onCommand = vi.fn(async () => undefined);
    const envelope = lobbyEnvelope(2);
    render(
      <LobbyDesk
        state={envelope}
        session={session()}
        hostSeatId={session().seatId}
        busy={false}
        onCommand={onCommand}
      />
    );
    expect(screen.getByText("4 open desks.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start Year 1" }));
    expect(onCommand).toHaveBeenCalledWith({ type: "start_game" });
    expect(screen.getByText("Operate, Collect, Close, or Pass.")).toBeTruthy();
  });

  it("merges only the viewing player's private hand and New Year area", () => {
    const state = initializeGame(configuration(2), random).state;
    state.seats[0]!.newYearOperations.rally = 2;
    const view = extractView(activeEnvelope(state, "seat-1"))!;
    expect(view.seats[0]).toMatchObject({
      operations: { organise: 4, rally: 8, smear: 4, court: 4 },
      newYearOperations: { organise: 0, rally: 2, smear: 0, court: 0 },
      newYearCardCount: 2
    });
    expect(view.seats[1]!.operations).toBeNull();
    expect(view.seats[1]!.scoringCardIds).toBeNull();
  });

  it("rejects obsolete and incomplete active projections", () => {
    const state = initializeGame(configuration(2), random).state;
    const old = activeEnvelope(state, "seat-1");
    (old.publicState.publicGame as Record<string, unknown>)["rulesetVersion"] = "14";
    expect(() => extractView(old)).toThrow("unsupported ruleset");

    const incomplete = activeEnvelope(state, "seat-1");
    delete (incomplete.publicState.publicGame as Record<string, unknown>)["resolvedOperations"];
    expect(() => extractView(incomplete)).toThrow("incomplete");
  });

  it("gives every district an accessible Support and capacity summary", () => {
    const view = privateView(initializeGame(configuration(2), random).state, "seat-1");
    render(<DistrictMap view={view} />);
    expect(screen.getAllByRole("article")).toHaveLength(16);
    expect(screen.getByLabelText("Bellweather Centre: 0 of 3 Support spaces occupied")).toBeTruthy();
    expect(screen.getByLabelText("Harbormouth: 6 of 6 Support spaces occupied")).toBeTruthy();
  });

  it("shows exact public party piles and yearly bonus use", () => {
    let state = openEveryParty(initializeGame(configuration(2), random).state);
    state = apply(state, organiseAction("seat-1", true));
    const view = privateView(state, "seat-2");
    render(<PartyBoard view={view} />);
    const honeycomb = screen.getByText("Honeycomb").closest("article")!;
    expect(within(honeycomb).getByText("org 1")).toBeTruthy();
    expect(within(honeycomb).getByText("Waggle Route").className).toContain("bonus-used");
  });

  it("files one Firm and one party during an active opening", () => {
    const view = privateView(initializeGame(configuration(2), random).state, "seat-1");
    const onCommand = vi.fn(async () => true);
    render(
      <ActionDesk view={view} seat={view.seats[0]!} seatId="seat-1" busy={false} onCommand={onCommand} />
    );
    fireEvent.change(screen.getByLabelText("Party"), { target: { value: "night-parliament" } });
    fireEvent.click(screen.getByRole("button", { name: "Open party access" }));
    expect(onCommand).toHaveBeenCalledWith({
      type: "game_action",
      action: {
        type: "open_party",
        firmId: "one-fell-swoop",
        partyId: "night-parliament"
      }
    });
  });

  it("composes an ordered Operate action and permits only one bonus", async () => {
    const state = openEveryParty(initializeGame(configuration(2), random).state);
    const view = privateView(state, "seat-1");
    const onCommand = vi.fn(async () => true);
    render(
      <ActionDesk view={view} seat={view.seats[0]!} seatId="seat-1" busy={false} onCommand={onCommand} />
    );
    fireEvent.click(screen.getByRole("button", { name: /\+ organise/ }));
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "harbormouth" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "cloverfield" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Waggle Route/ }));
    expect(screen.getByText("All cards resolve in the listed order.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Operate with 1 card" }));
    await waitFor(() => expect(onCommand).toHaveBeenCalledWith({
      type: "game_action",
      action: {
        type: "operate",
        partyId: "honeycomb",
        plays: [{
          operation: "organise",
          choice: {
            operation: "organise",
            sourceDistrictId: "harbormouth",
            destinationDistrictId: "cloverfield"
          },
          claimBonus: true
        }]
      }
    }));
  });

  it("collects a whole pile into the visible New Year area", () => {
    let state = openEveryParty(initializeGame(configuration(2), random).state);
    state = apply(state, organiseAction("seat-1", false));
    const view = privateView(state, "seat-2");
    const onCommand = vi.fn(async () => true);
    render(
      <ActionDesk view={view} seat={view.seats[1]!} seatId="seat-2" busy={false} onCommand={onCommand} />
    );
    fireEvent.click(screen.getByRole("button", { name: "collect" }));
    fireEvent.click(screen.getByRole("button", { name: "Collect 1 cards" }));
    expect(onCommand).toHaveBeenCalledWith({
      type: "game_action",
      action: { type: "collect", partyId: "honeycomb" }
    });
  });

  it("blocks first-turn closure and explains consecutive passing", () => {
    const state = openEveryParty(initializeGame(configuration(2), random).state);
    const view = privateView(state, "seat-1");
    const onCommand = vi.fn(async () => true);
    render(
      <ActionDesk view={view} seat={view.seats[0]!} seatId="seat-1" busy={false} onCommand={onCommand} />
    );
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.getByRole("button", { name: "Close party" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/cannot Close on your first Lobby turn/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "pass" }));
    expect(screen.getByText(/every party closes to its opening Firm/)).toBeTruthy();
  });

  it("labels collected cards unavailable and explains the Capital card", () => {
    const state = initializeGame(configuration(2), random).state;
    state.seats[0]!.newYearOperations.organise = 2;
    const view = privateView(state, "seat-1");
    render(
      <GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={async () => true} />
    );
    expect(screen.getByText("New Year area · unavailable this year")).toBeTruthy();
    expect(screen.getAllByText(/Capital card/)).toHaveLength(3);
  });

  it("reports Capital scoring separately in an Election bulletin", () => {
    const view = privateView(initializeGame(configuration(2), random).state, "seat-1");
    view.electionHistory.push({
      electionNumber: 1,
      afterYear: 4,
      scoringCards: [
        { seatId: "seat-1", scoringCardIds: ["SC-01", "SC-02"], capitalCardId: "SC-01" },
        { seatId: "seat-2", scoringCardIds: ["SC-03", "SC-04"], capitalCardId: "SC-03" }
      ],
      draws: {},
      scores: [{
        playerId: "seat-1",
        baseDistrictScore: 2,
        seatModifier: 1,
        capitalMatches: 3,
        capitalScore: 3,
        pointsChange: 6,
        resultingPoints: 16
      }],
      winnerSeatIds: ["seat-1"]
    });
    render(
      <GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={async () => true} />
    );
    expect(screen.getByText(/Capital 3 \(3\/3\)/)).toBeTruthy();
    expect(screen.getByText("+6 points")).toBeTruthy();
  });
});

function configuration(playerCount: number) {
  return {
    seats: Array.from({ length: playerCount }, (_, index) => ({
      id: `seat-${index + 1}`,
      displayName: `Player ${index + 1}`,
      controller: "human" as const
    }))
  };
}

function openEveryParty(initial: GameState): GameState {
  let state = initial;
  const partyIds: PartyId[] = ["honeycomb", "old-shell", "foxglove", "riverworks"];
  while (state.phase.type === "opening") {
    const seatId = state.phase.turnSeatIds[state.phase.turnIndex]!;
    const seat = state.seats.find((candidate) => candidate.id === seatId)!;
    const used = new Set(Object.values(state.parties).flatMap((party) => party === undefined ? [] : [party.firmId]));
    const firmId = seat.firmIds.find((candidate) => !used.has(candidate))!;
    state = apply(state, {
      type: "open_party",
      seatId,
      firmId,
      partyId: partyIds[state.phase.turnIndex]!
    });
  }
  return state;
}

function organiseAction(seatId: string, claimBonus: boolean): GameAction {
  return {
    type: "operate",
    seatId,
    partyId: "honeycomb",
    plays: [{
      operation: "organise",
      choice: {
        operation: "organise",
        sourceDistrictId: "harbormouth",
        destinationDistrictId: "cloverfield"
      },
      ...(claimBonus ? { claimBonus: true } : {})
    }]
  };
}

function apply(state: GameState, action: GameAction): GameState {
  return executeAction(state, action).state;
}

function privateView(state: GameState, viewerSeatId: string): GameView {
  return extractView(activeEnvelope(state, viewerSeatId))!;
}

function activeEnvelope(
  state: GameState,
  viewerSeatId: string
): ViewerStateEnvelope {
  const publicView = projectGameState(state, null);
  const privateView = projectGameState(state, viewerSeatId);
  return {
    scope: "seat",
    viewerSeatId,
    publicState: {
      gameId: "018f47d2-7830-7b84-a854-1b741f285f5d",
      inviteCode: "PRESS42",
      version: 2,
      latestSequence: 2,
      lifecycle: "active",
      configuration: {
        playerCount: state.seats.length,
        allowSpectators: true
      },
      seats: [],
      spectators: [],
      publicGame: publicView as unknown as Record<string, never>
    },
    seatState: {
      seatId: viewerSeatId,
      privateGame: {
        seat: privateView.seats.find((seat) => seat.id === viewerSeatId)!
      } as unknown as Record<string, never>
    }
  } as ViewerStateEnvelope;
}

function lobbyEnvelope(playerCount = 1): ViewerStateEnvelope {
  return {
    scope: "seat",
    viewerSeatId: session().seatId,
    publicState: {
      gameId: session().gameId,
      inviteCode: "PRESS42",
      version: playerCount,
      latestSequence: playerCount,
      lifecycle: "lobby",
      configuration: { playerCount, allowSpectators: true },
      seats: Array.from({ length: playerCount }, (_, index) => ({
        seatId: index === 0 ? session().seatId : `018f47d2-7830-7b84-a854-1b741f285f6${index}`,
        seatIndex: index,
        displayName: `Player ${index + 1}`,
        role: index === 0 ? "host" as const : "player" as const,
        controller: "human" as const,
        ready: false
      })),
      spectators: [],
      publicGame: { phase: "lobby", rulesetVersion: RULESET_VERSION }
    },
    seatState: { seatId: session().seatId, privateGame: null }
  } as ViewerStateEnvelope;
}

function session() {
  return {
    participantType: "seat" as const,
    gameId: "018f47d2-7830-7b84-a854-1b741f285f5d" as never,
    seatId: "018f47d2-7830-7b84-a854-1b741f285f5e" as never,
    accessToken: "a".repeat(32) as never
  };
}
