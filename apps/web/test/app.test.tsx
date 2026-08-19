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

  it("shows the current campaign schedule after a game starts", async () => {
    const state = initializeGame(configuration(2), random).state;
    localStorage.setItem("bellweather-register-session", JSON.stringify(session()));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(activeEnvelope(state, "seat-1"))
    );

    render(<App />);

    expect(await screen.findByText("Year 1 / 6")).toBeTruthy();
    expect(screen.getByText("Election years 2 · 4 · 6")).toBeTruthy();
  });

  it("merges only the viewing player's private hand and New Year area", () => {
    const state = initializeGame(configuration(2), random).state;
    state.seats[0]!.newYearOperations.rally = 2;
    const view = extractView(activeEnvelope(state, "seat-1"))!;
    expect(view.seats[0]).toMatchObject({
      operations: { organise: 6, rally: 8, smear: 4, court: 4 },
      newYearOperations: { organise: 0, rally: 2, smear: 0, court: 0 },
      newYearCardCount: 2
    });
    expect(view.seats[1]!.operations).toBeNull();
    expect(view.seats[1]!.scoringCardIds).toBeNull();
  });

  it("rejects obsolete and incomplete active projections", () => {
    const state = initializeGame(configuration(2), random).state;
    const old = activeEnvelope(state, "seat-1");
    (old.publicState.publicGame as Record<string, unknown>)["rulesetVersion"] = "17";
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

  it("shows exact public party piles and Bonus card locations", () => {
    let state = openEveryParty(initializeGame(configuration(2), random).state);
    state = apply(state, organiseAction("seat-1"));
    state.bonusCards["honeycomb-waggle-route"] = {
      zone: "hand",
      seatId: "seat-1"
    };
    const view = privateView(state, "seat-2");
    render(<PartyBoard view={view} />);
    const honeycomb = screen.getByText("Honeycomb").closest("article")!;
    expect(within(honeycomb).getByText("org 1")).toBeTruthy();
    expect(within(honeycomb).getByText("Waggle Route").className).toContain("bonus-used");
  });

  it("shows that a closed party's opening has returned", () => {
    const state = openEveryParty(initializeGame(configuration(2), random).state);
    state.parties.honeycomb!.status = "closed";
    render(<PartyBoard view={privateView(state, "seat-1")} />);
    const honeycomb = screen.getByText("Honeycomb").closest("article")!;
    expect(within(honeycomb).getByText("Closed · opening returned")).toBeTruthy();
  });

  it("selects an opening party on the table before confirming its Firm", () => {
    const view = privateView(initializeGame(configuration(2), random).state, "seat-1");
    const onCommand = vi.fn(async () => true);
    render(
      <GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={onCommand} />
    );
    fireEvent.click(screen.getByRole("button", { name: /^Night Not opened/ }));
    expect((screen.getByLabelText("Party") as HTMLSelectElement).value).toBe("night-parliament");
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

  it("targets and resolves one Operation card with mouse clicks", async () => {
    const state = openEveryParty(initializeGame(configuration(2), random).state);
    const view = privateView(state, "seat-1");
    const onCommand = vi.fn(async () => true);
    render(
      <GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={onCommand} />
    );
    fireEvent.click(screen.getByLabelText("Harbormouth: 6 of 6 Support spaces occupied"));
    const destinationField = screen.getByLabelText("Destination").parentElement!;
    fireEvent.click(within(destinationField).getByRole("button", { name: "Select on map" }));
    fireEvent.click(screen.getByLabelText("Cloverfield: 0 of 4 Support spaces occupied"));
    expect(screen.getByText("Ready to resolve this card.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolve organise" }));
    await waitFor(() => expect(onCommand).toHaveBeenCalledWith({
      type: "game_action",
      action: {
        type: "operate",
        partyId: "honeycomb",
        play: {
          cardType: "operation",
          operation: "organise",
          choice: {
            operation: "organise",
            sourceDistrictId: "harbormouth",
            destinationDistrictId: "cloverfield"
          }
        }
      }
    }));
  });

  it("selects an empty Quiet Hours district on the map", async () => {
    let state = openEveryParty(
      initializeGame(configuration(2), random).state,
      ["night-parliament", "old-shell", "foxglove", "riverworks"]
    );
    state.support.cloverfield["night-parliament"] = 1;
    state.bonusCards["night-parliament-quiet-hours"] = {
      zone: "hand",
      seatId: "seat-1"
    };
    const view = privateView(state, "seat-1");
    const onCommand = vi.fn(async () => true);
    render(
      <GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={onCommand} />
    );

    fireEvent.change(screen.getByLabelText("Party"), {
      target: { value: "night-parliament" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Quiet Hours Bonus/ }));
    fireEvent.change(screen.getByLabelText("Rally district"), {
      target: { value: "cloverfield" }
    });
    const quietHoursField = screen.getByLabelText("Quiet Hours district").parentElement!;
    fireEvent.click(within(quietHoursField).getByRole("button", { name: "Select on map" }));
    expect(
      screen.getByLabelText("Harbormouth: 6 of 6 Support spaces occupied").getAttribute("aria-disabled")
    ).toBe("true");
    fireEvent.click(screen.getByLabelText("Bellweather Centre: 0 of 3 Support spaces occupied"));

    expect(screen.getByText("Ready to resolve this card.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolve Quiet Hours" }));
    await waitFor(() => expect(onCommand).toHaveBeenCalledWith({
      type: "game_action",
      action: {
        type: "operate",
        partyId: "night-parliament",
        play: {
          cardType: "bonus",
          bonusCardId: "night-parliament-quiet-hours",
          choice: {
            operation: "rally",
            districtId: "cloverfield",
            bonusDistrictId: "bellweather-centre"
          }
        }
      }
    }));
  });

  it("allows Midnight Leak to target rival Court Support on the acting party", () => {
    const state = openEveryParty(
      initializeGame(configuration(2), random).state,
      ["night-parliament", "old-shell", "foxglove", "riverworks"]
    );
    state.bonusCards["night-parliament-midnight-leak"] = {
      zone: "hand",
      seatId: "seat-1"
    };
    state.courtSupport["old-shell"]["night-parliament"] = 1;
    const view = privateView(state, "seat-1");
    render(
      <GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={async () => true} />
    );

    fireEvent.change(screen.getByLabelText("Party"), {
      target: { value: "night-parliament" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Midnight Leak Bonus/ }));

    expect(within(screen.getByLabelText("Rival Court space")).getByRole("option", {
      name: "Night Parliament"
    })).toBeTruthy();
  });

  it("offers another card or Finish after each resolved Operation", () => {
    let state = openEveryParty(initializeGame(configuration(2), random).state);
    state = apply(state, organiseAction("seat-1"));
    const view = privateView(state, "seat-1");
    const onCommand = vi.fn(async () => true);
    render(
      <ActionDesk view={view} seat={view.seats[0]!} seatId="seat-1" busy={false} onCommand={onCommand} />
    );

    expect(screen.getByText(/Card 2 of up to 3/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "collect" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Finish Operate" }));
    expect(onCommand).toHaveBeenCalledWith({
      type: "game_action",
      action: { type: "finish_operate" }
    });
  });

  it("sets both Smear targets by clicking rival Support", () => {
    const state = openEveryParty(initializeGame(configuration(2), random).state);
    const view = privateView(state, "seat-1");
    render(
      <GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={async () => true} />
    );

    fireEvent.click(screen.getByRole("button", { name: /^smear/ }));
    fireEvent.click(screen.getByRole("button", { name: "Old Shell Support in Harbormouth: 1" }));
    expect((screen.getByLabelText("District") as HTMLSelectElement).value).toBe("harbormouth");
    expect((screen.getByLabelText("Rival party") as HTMLSelectElement).value).toBe("old-shell");
  });

  it("collects a whole pile into the visible New Year area", () => {
    let state = openEveryParty(initializeGame(configuration(2), random).state);
    state = apply(state, organiseAction("seat-1"));
    state = apply(state, { type: "finish_operate", seatId: "seat-1" });
    const view = privateView(state, "seat-2");
    const onCommand = vi.fn(async () => true);
    render(
      <GameDesk view={view} ownSeat={view.seats[1]} ownSeatId="seat-2" spectator={false} busy={false} onCommand={onCommand} />
    );
    fireEvent.click(screen.getByRole("button", { name: "collect" }));
    expect(screen.getByRole("button", { name: /^Honeycomb open/ }).hasAttribute("aria-disabled")).toBe(false);
    expect(screen.getByRole("button", { name: /^Old Shell open/ }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByLabelText("Bonus card"), {
      target: { value: "honeycomb-waggle-route" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Collect 1 cards" }));
    expect(onCommand).toHaveBeenCalledWith({
      type: "game_action",
      action: {
        type: "collect",
        partyId: "honeycomb",
        bonusCardId: "honeycomb-waggle-route"
      }
    });
  });

  it("blocks first-turn closure and explains consecutive passing", () => {
    const state = openEveryParty(initializeGame(configuration(2), random).state);
    const view = privateView(state, "seat-1");
    const onCommand = vi.fn(async () => true);
    render(
      <GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={onCommand} />
    );
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.getByRole("button", { name: "Close party" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /^Honeycomb open/ }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(/cannot Close on your first Lobby turn/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "pass" }));
    expect(screen.getByText(/every party closes to its opening Firm/)).toBeTruthy();
  });

  it("lets each opener choose a Bonus card during automatic Closure", () => {
    let state = openEveryParty(initializeGame(configuration(2), random).state);
    state = apply(state, { type: "pass", seatId: "seat-1" });
    state = apply(state, { type: "pass", seatId: "seat-2" });
    const view = privateView(state, "seat-1");
    const onCommand = vi.fn(async () => true);
    render(
      <ActionDesk view={view} seat={view.seats[0]!} seatId="seat-1" busy={false} onCommand={onCommand} />
    );

    fireEvent.change(screen.getByLabelText("Bonus card"), {
      target: { value: "honeycomb-common-cause" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Closure choice" }));
    expect(onCommand).toHaveBeenCalledWith({
      type: "game_action",
      action: {
        type: "choose_closure_bonus",
        partyId: "honeycomb",
        bonusCardId: "honeycomb-common-cause"
      }
    });
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
      afterYear: 2,
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
        finalCardCount: null,
        finalCardRankBonus: 0,
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

  it("reports final card count and rank bonus in the Election 3 bulletin", () => {
    const view = privateView(initializeGame(configuration(2), random).state, "seat-1");
    view.electionHistory.push({
      electionNumber: 3,
      afterYear: 6,
      scoringCards: [
        { seatId: "seat-1", scoringCardIds: ["SC-01", "SC-02"], capitalCardId: "SC-01" },
        { seatId: "seat-2", scoringCardIds: ["SC-03", "SC-04"], capitalCardId: "SC-03" }
      ],
      draws: {},
      scores: [{
        playerId: "seat-1",
        baseDistrictScore: 2,
        seatModifier: 0,
        capitalMatches: 2,
        capitalScore: 1,
        finalCardCount: 14,
        finalCardRankBonus: 1,
        pointsChange: 4,
        resultingPoints: 14
      }],
      winnerSeatIds: ["seat-1"]
    });
    render(
      <GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={async () => true} />
    );

    expect(screen.getByText(/Final cards 14 · Rank \+1/)).toBeTruthy();
    expect(screen.getByText("+4 points")).toBeTruthy();
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

function openEveryParty(
  initial: GameState,
  partyIds: PartyId[] = ["honeycomb", "old-shell", "foxglove", "riverworks"]
): GameState {
  let state = initial;
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

function organiseAction(seatId: string): GameAction {
  return {
    type: "operate",
    seatId,
    partyId: "honeycomb",
    play: {
      cardType: "operation",
      operation: "organise",
      choice: {
        operation: "organise",
        sourceDistrictId: "harbormouth",
        destinationDistrictId: "cloverfield"
      }
    }
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
