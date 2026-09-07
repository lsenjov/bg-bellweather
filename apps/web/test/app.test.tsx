/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  PARTY_IDS,
  SCORING_CARDS_BY_ID,
  PARTIES_BY_ID,
  type ScoringCardId,
  RULESET_VERSION,
  type BonusCardId,
  type PartyId
} from "@bellweather/content";
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
  OperationComposer,
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
    expect(screen.getByLabelText("Grand Market: 6 of 6 Support spaces occupied")).toBeTruthy();
  });

  it("renders every latest Support change as its own accessible map glyph", async () => {
    const view = privateView(initializeGame(configuration(2), random).state, "seat-1");
    render(
      <DistrictMap
        view={view}
        supportChanges={[
          {
            type: "move",
            partyId: "honeycomb",
            sourceDistrictId: "grand-market",
            destinationDistrictId: "northgate"
          },
          { type: "add", partyId: "honeycomb", destinationDistrictId: "northgate" },
          { type: "add", partyId: "honeycomb", destinationDistrictId: "northgate" }
        ]}
      />
    );
    await waitFor(() => {
      expect(document.querySelectorAll('[data-map-change="move"]')).toHaveLength(1);
      expect(document.querySelectorAll('[data-map-change="add"]')).toHaveLength(2);
    });
    expect(within(screen.getByLabelText("Latest map changes")).getAllByText("Honeycomb added to Northgate")).toHaveLength(2);
  });

  it("separates Support change glyphs from different parties at one district", async () => {
    const view = privateView(initializeGame(configuration(2), random).state, "seat-1");
    render(
      <DistrictMap
        view={view}
        supportChanges={[
          { type: "add", partyId: "honeycomb", destinationDistrictId: "northgate" },
          { type: "remove", partyId: "foxglove", sourceDistrictId: "northgate" },
          { type: "add", partyId: "riverworks", destinationDistrictId: "northgate" }
        ]}
      />
    );

    await waitFor(() => {
      const glyphs = [...document.querySelectorAll('[data-map-change="add"], [data-map-change="remove"]')];
      expect(new Set(glyphs.map((glyph) => glyph.getAttribute("transform"))).size).toBe(3);
    });
  });

  it("summarizes every completed Lobby action beside the map", () => {
    const view = privateView(openEveryParty(initializeGame(configuration(2), random).state), "seat-1");
    const action = (overrides: Partial<GameView["lobbyActions"][number]>): GameView["lobbyActions"][number] => ({
      id: "action-1",
      year: 1,
      turn: 1,
      seatId: "seat-1",
      type: "pass",
      partyId: null,
      operationCount: 0,
      cardCount: 0,
      bonusCardId: null,
      supportChanges: [],
      ...overrides
    });
    view.lobbyActions = [action({
      type: "collect",
      partyId: "honeycomb",
      bonusCardId: "honeycomb-waggle-route"
    })];
    const { rerender } = render(
      <GameDesk view={view} ownSeat={undefined} ownSeatId={undefined} spectator busy={false} onCommand={async () => true} />
    );
    let latest = screen.getByLabelText("Latest Lobby action");
    expect(within(latest).getByText("Player 1 collected Honeycomb Cooperative")).toBeTruthy();
    expect(within(latest).getByText("Bonus · Waggle Route")).toBeTruthy();

    view.lobbyActions = [action({ type: "close", partyId: "honeycomb" })];
    rerender(<GameDesk view={view} ownSeat={undefined} ownSeatId={undefined} spectator busy={false} onCommand={async () => true} />);
    latest = screen.getByLabelText("Latest Lobby action");
    expect(within(latest).getByText("Player 1 closed Honeycomb Cooperative")).toBeTruthy();
    expect(within(latest).getByText("No Bonus card")).toBeTruthy();

    view.lobbyActions = [action({ type: "pass" })];
    rerender(<GameDesk view={view} ownSeat={undefined} ownSeatId={undefined} spectator busy={false} onCommand={async () => true} />);
    expect(within(screen.getByLabelText("Latest Lobby action")).getByText("Player 1 passed")).toBeTruthy();

    view.lobbyActions = [action({
      type: "operate",
      partyId: "honeycomb",
      operationCount: 1,
      cardCount: 1,
      supportChanges: [{
        type: "add",
        partyId: "honeycomb",
        destinationDistrictId: "northgate"
      }]
    })];
    view.resolvedOperations = [{
      year: 1,
      turn: 1,
      seatId: "seat-1",
      partyId: "honeycomb",
      cardType: "operation",
      operation: "rally",
      bonusCardId: null,
      bonusHomePartyId: null,
      choice: { operation: "rally", districtId: "northgate" },
      bonusCardReturnedHome: false
    }];
    rerender(<GameDesk view={view} ownSeat={undefined} ownSeatId={undefined} spectator busy={false} onCommand={async () => true} />);
    latest = screen.getByLabelText("Latest Lobby action");
    expect(within(latest).getByText("Player 1 operated Honeycomb Cooperative")).toBeTruthy();
    expect(within(latest).getByText("Rally")).toBeTruthy();
    expect(within(latest).getByText("Honeycomb added to Northgate")).toBeTruthy();
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

  it("shows Court Support amounts and reciprocal coalition status", () => {
    const state = initializeGame(configuration(2), random).state;
    state.courtSupport.honeycomb.foxglove = 2;
    state.courtSupport.honeycomb.riverworks = 1;
    state.coalitionTargets.honeycomb = "foxglove";
    state.coalitionTargets.foxglove = "honeycomb";

    render(<PartyBoard view={privateView(state, "seat-1")} />);

    const honeycomb = screen.getByText("Honeycomb").closest("article")!;
    expect(within(honeycomb).getByLabelText("Foxglove Court Support: 2").textContent).toBe("2");
    expect(within(honeycomb).getByLabelText("Riverworks Court Support: 1").textContent).toBe("1");
    expect(within(honeycomb).getByLabelText("Coalition with Foxglove")).toBeTruthy();
  });

  it("styles parties without an opening as closed", () => {
    const state = initializeGame(configuration(2), random).state;
    render(<PartyBoard view={privateView(state, "seat-1")} />);
    const honeycomb = screen.getByText("Honeycomb").closest("article")!;
    expect(within(honeycomb).getByText("Closed")).toBeTruthy();
    expect(honeycomb.className).toContain("party-file-closed");
  });

  it("styles explicitly closed parties the same way", () => {
    const state = openEveryParty(initializeGame(configuration(2), random).state);
    state.parties.honeycomb!.status = "closed";
    render(<PartyBoard view={privateView(state, "seat-1")} />);
    const honeycomb = screen.getByText("Honeycomb").closest("article")!;
    expect(within(honeycomb).getByText("Closed")).toBeTruthy();
    expect(honeycomb.className).toContain("party-file-closed");
  });

  it("selects an opening party on the table before confirming its Firm", () => {
    const view = privateView(initializeGame(configuration(2), random).state, "seat-1");
    const onCommand = vi.fn(async () => true);
    render(
      <GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={onCommand} />
    );
    fireEvent.click(screen.getByRole("button", { name: /^Night Closed/ }));
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

  it("selects the acting party directly, then uses party clicks for Court targets", () => {
    const state = sixPartyState();
    const view = privateView(state, "seat-1");
    render(<GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={async () => true} />);
    fireEvent.click(screen.getByRole("button", { name: /^Foxglove Open/ }));
    expect((screen.getByLabelText("Party") as HTMLSelectElement).value).toBe("foxglove");
    expect(document.activeElement).toBe(screen.getByLabelText("Choose an Operation card"));
    fireEvent.click(screen.getByRole("button", { name: /^court 2$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Old Shell Open/ }));
    expect((screen.getByLabelText("Party") as HTMLSelectElement).value).toBe("foxglove");
    expect((screen.getByLabelText("Court target") as HTMLSelectElement).value).toBe("old-shell");
  });

  it("keeps Collect and Close selected when choosing a party on the board", () => {
    const state = openEveryParty(initializeGame(configuration(2), random).state);
    if (state.phase.type !== "lobby") throw new Error("Expected Lobby");
    state.phase.turnsTaken["seat-1"] = 1;
    const view = privateView(state, "seat-1");
    render(<GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={async () => true} />);
    fireEvent.click(screen.getByRole("button", { name: "collect" }));
    fireEvent.click(screen.getByRole("button", { name: /^Foxglove Open/ }));
    expect((screen.getByLabelText("Party") as HTMLSelectElement).value).toBe("foxglove");
    expect(screen.getByRole("heading", { name: "Collect" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    const owned = Object.values(view.parties).find((party) => party?.ownerSeatId === "seat-1" && party.partyId !== "honeycomb")!;
    const board = screen.getByText(PARTIES_BY_ID[owned.partyId].shortName).closest(".party-file")!;
    fireEvent.click(board);
    expect((screen.getByLabelText("Party") as HTMLSelectElement).value).toBe(owned.partyId);
    expect(screen.getByRole("heading", { name: "Close" })).toBeTruthy();
  });

  it("locks acting-party board selection after an Operation resolves", () => {
    let state = openEveryParty(initializeGame(configuration(2), random).state);
    state = apply(state, organiseAction("seat-1"));
    const view = privateView(state, "seat-1");
    render(<GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={async () => true} />);
    fireEvent.click(screen.getByText("Foxglove").closest(".party-file")!);
    expect((screen.getByLabelText("Party") as HTMLSelectElement).value).toBe("honeycomb");
    expect((screen.getByLabelText("Party") as HTMLSelectElement).disabled).toBe(true);
  });

  it.each(["map", "list"])("advances Organise from a %s source choice to a map destination", async (sourceInput) => {
    const state = openEveryParty(initializeGame(configuration(2), random).state);
    const view = privateView(state, "seat-1");
    const onCommand = vi.fn(async () => true);
    render(
      <GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={onCommand} />
    );
    if (sourceInput === "map") {
      fireEvent.click(screen.getByLabelText("Grand Market: 6 of 6 Support spaces occupied"));
    } else {
      fireEvent.change(screen.getByLabelText("Source"), { target: { value: "grand-market" } });
    }
    expect(screen.getByText("Select the Organise destination district on the map.")).toBeTruthy();
    expect(screen.getByLabelText("Destination").closest(".target-field")?.classList.contains("target-field-active")).toBe(true);
    fireEvent.click(screen.getByLabelText("Northgate: 0 of 6 Support spaces occupied"));
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
            sourceDistrictId: "grand-market",
            destinationDistrictId: "northgate"
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
    state.support["northgate"]["night-parliament"] = 1;
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
      target: { value: "northgate" }
    });
    const quietHoursField = screen.getByLabelText("Quiet Hours district").parentElement!;
    fireEvent.click(within(quietHoursField).getByRole("button", { name: "Select on map" }));
    expect(
      screen.getByLabelText("Grand Market: 6 of 6 Support spaces occupied").getAttribute("aria-disabled")
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
            districtId: "northgate",
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

  it("submits a chosen Canal Network quantity and prevents overfilling", () => {
    const state = sixPartyState();
    state.support["canal-ward"] = { riverworks: 3 };
    state.support.northgate = {};
    const { onSubmit } = renderUnboundComposer(state, "riverworks", "riverworks-canal-network");
    fireEvent.click(screen.getByRole("button", { name: /Canal Network Bonus/ }));
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "canal-ward" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "northgate" } });
    fireEvent.change(screen.getByLabelText("Support to move"), { target: { value: "5" } });
    expect(screen.getByRole("button", { name: "Resolve Canal Network" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Support to move"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve Canal Network" }));
    expect(onSubmit).toHaveBeenCalledWith({
      cardType: "bonus", bonusCardId: "riverworks-canal-network",
      choice: { operation: "organise", sourceDistrictId: "canal-ward", destinationDistrictId: "northgate", count: 2 }
    });
  });

  it("submits Every Bee Counts without extra choices", () => {
    const state = sixPartyState();
    state.support["canal-ward"].honeycomb = 1;
    const { onSubmit } = renderUnboundComposer(
      state,
      "honeycomb",
      "honeycomb-every-bee-counts"
    );

    fireEvent.click(screen.getByRole("button", { name: /Every Bee Counts Bonus/ }));
    expect(screen.getByText("Ready to resolve this card.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolve Every Bee Counts" }));
    expect(onSubmit).toHaveBeenCalledWith({
      cardType: "bonus",
      bonusCardId: "honeycomb-every-bee-counts",
      choice: { effect: "every_bee_counts" }
    });
  });

  it("offers an off-home Bonus at an unrelated open party", () => {
    const state = sixPartyState();
    state.support.harbormouth = { foxglove: 1 };
    const { onSubmit } = renderUnboundComposer(state, "foxglove", "honeycomb-every-bee-counts");
    fireEvent.click(screen.getByRole("button", { name: /Every Bee Counts Bonus/ }));
    expect(screen.getByText("First Court Honeycomb.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolve Every Bee Counts" }));
    expect(onSubmit).toHaveBeenCalledWith({ cardType: "bonus", bonusCardId: "honeycomb-every-bee-counts", choice: { effect: "every_bee_counts" } });
  });

  it("requires destinations for all available Institutional Memory objectives", () => {
    const state = sixPartyState();
    state.support.ironwood = {};
    state.support["northgate"].honeycomb = 1;
    state.electionHistory = [{
      scoringCards: [{
        seatId: "seat-1",
        scoringCardIds: ["SC-01"],
        capitalCardId: "SC-01"
      }]
    } as GameState["electionHistory"][number]];
    const { onSubmit } = renderUnboundComposer(
      state,
      "old-shell",
      "old-shell-institutional-memory"
    );

    fireEvent.click(screen.getByRole("button", { name: /Institutional Memory Bonus/ }));
    fireEvent.change(screen.getByLabelText("Revealed scoring card"), {
      target: { value: "SC-01" }
    });
    fireEvent.change(screen.getByLabelText("Urban · Honeycomb destination"), { target: { value: "ironwood" } });
    expect(screen.getByRole("button", { name: "Resolve Institutional Memory" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Mixed · Old Shell destination"), { target: { value: "northgate" } });
    fireEvent.change(screen.getByLabelText("Outlying · Foxglove destination"), { target: { value: "westfield" } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve Institutional Memory" }));
    expect(onSubmit).toHaveBeenCalledWith({
      cardType: "bonus",
      bonusCardId: "old-shell-institutional-memory",
      choice: {
        effect: "institutional_memory",
        scoringCardId: "SC-01",
        placements: [{ objectiveIndex: 0, destinationDistrictId: "ironwood" }, { objectiveIndex: 1, destinationDistrictId: "northgate" }, { objectiveIndex: 2, destinationDistrictId: "westfield" }]
      }
    });
  });

  it("offers closed parties to Shell Firm", () => {
    const state = sixPartyState();
    state.parties["old-shell"]!.status = "closed";
    const { onSubmit } = renderUnboundComposer(
      state,
      "foxglove",
      "foxglove-shell-firm"
    );

    fireEvent.click(screen.getByRole("button", { name: /Shell Firm Bonus/ }));
    fireEvent.change(screen.getByLabelText("Destination party"), {
      target: { value: "old-shell" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve Shell Firm" }));
    expect(onSubmit).toHaveBeenCalledWith({
      cardType: "bonus",
      bonusCardId: "foxglove-shell-firm",
      choice: { effect: "shell_firm", targetPartyId: "old-shell" }
    });
  });

  it("submits Mass Transit in movement order toward its endpoint", () => {
    const state = sixPartyState();
    state.support["canal-ward"] = { honeycomb: 1 };
    state.support["northgate"] = {};
    const { onSubmit } = renderUnboundComposer(
      state,
      "riverworks",
      "riverworks-mass-transit"
    );

    fireEvent.click(screen.getByRole("button", { name: /Mass Transit Bonus/ }));
    fireEvent.change(screen.getByLabelText("District 1"), {
      target: { value: "canal-ward" }
    });
    fireEvent.change(screen.getByLabelText("Support moved onward"), {
      target: { value: "honeycomb" }
    });
    fireEvent.change(screen.getByLabelText("District 2 · free endpoint"), {
      target: { value: "northgate" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve Mass Transit" }));
    expect(onSubmit).toHaveBeenCalledWith({
      cardType: "bonus",
      bonusCardId: "riverworks-mass-transit",
      choice: {
        effect: "mass_transit",
        districtIds: ["canal-ward", "northgate"],
        supportPartyIds: ["honeycomb"]
      }
    });
  });

  it("requires one Empty Every Nest destination per qualifying district", () => {
    const state = sixPartyState();
    state.support["grand-market"]["many-wings"] = 2;
    const { onSubmit } = renderUnboundComposer(
      state,
      "many-wings",
      "many-wings-empty-every-nest"
    );

    fireEvent.click(screen.getByRole("button", { name: /Empty Every Nest Bonus/ }));
    const sources = screen.getByLabelText("Source districts") as HTMLSelectElement;
    within(sources).getByRole("option", { name: "Grand Market" }).setAttribute("selected", "");
    fireEvent.change(sources);
    const destinations = screen.getByLabelText("Different destination districts") as HTMLSelectElement;
    within(destinations).getByRole("option", { name: "Canal Ward" }).setAttribute("selected", "");
    fireEvent.change(destinations);
    fireEvent.click(screen.getByRole("button", { name: "Resolve Empty Every Nest" }));
    expect(onSubmit).toHaveBeenCalledWith({
      cardType: "bonus",
      bonusCardId: "many-wings-empty-every-nest",
      choice: {
        effect: "empty_every_nest",
        sourceDistrictIds: ["grand-market"],
        destinationDistrictIds: ["canal-ward"]
      }
    });
  });

  it("offers returned Firms and closed parties to Midnight Session", () => {
    const state = sixPartyState();
    state.parties.honeycomb!.status = "closed";
    const { onSubmit } = renderUnboundComposer(
      state,
      "night-parliament",
      "night-parliament-midnight-session"
    );

    fireEvent.click(screen.getByRole("button", { name: /Midnight Session Bonus/ }));
    fireEvent.change(screen.getByLabelText("Closed party"), {
      target: { value: "honeycomb" }
    });
    fireEvent.change(screen.getByLabelText("Returned Firm marker"), {
      target: { value: "one-fell-swoop" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve Midnight Session" }));
    expect(onSubmit).toHaveBeenCalledWith({
      cardType: "bonus",
      bonusCardId: "night-parliament-midnight-session",
      choice: {
        effect: "midnight_session",
        targetPartyId: "honeycomb",
        firmId: "one-fell-swoop"
      }
    });
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
    fireEvent.click(screen.getByRole("button", { name: "Old Shell Support in Grand Market: 1" }));
    expect((screen.getByLabelText("District") as HTMLSelectElement).value).toBe("grand-market");
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
    expect(screen.getByRole("button", { name: /^Honeycomb Open/ }).hasAttribute("aria-disabled")).toBe(false);
    expect(screen.getByRole("button", { name: /^Old Shell Open/ }).hasAttribute("aria-disabled")).toBe(false);
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

  it("blocks first-turn closure and Pass while the player's Firms remain open", () => {
    const state = openEveryParty(initializeGame(configuration(2), random).state);
    const view = privateView(state, "seat-1");
    const onCommand = vi.fn(async () => true);
    render(
      <GameDesk view={view} ownSeat={view.seats[0]} ownSeatId="seat-1" spectator={false} busy={false} onCommand={onCommand} />
    );
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.getByRole("button", { name: "Close party" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /^Honeycomb Open/ }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(/cannot Close on your first Lobby turn/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "pass" }));
    expect(screen.getByText(/Return all your Firm markers before passing/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pass this turn" }).hasAttribute("disabled")).toBe(true);
  });

  it("lets each opener choose a Bonus card during automatic Closure", () => {
    let state = openEveryParty(initializeGame(configuration(2), random).state);
    state = apply(state, { type: "collect", seatId: "seat-1", partyId: "honeycomb" });
    state = apply(state, { type: "collect", seatId: "seat-2", partyId: "honeycomb" });
    state = apply(state, { type: "close", seatId: "seat-1", partyId: "honeycomb" });
    state = apply(state, { type: "close", seatId: "seat-2", partyId: "old-shell" });
    state = apply(state, { type: "close", seatId: "seat-1", partyId: "riverworks" });
    const view = privateView(state, "seat-2");
    const onCommand = vi.fn(async () => true);
    render(
      <ActionDesk view={view} seat={view.seats[1]!} seatId="seat-2" busy={false} onCommand={onCommand} />
    );

    fireEvent.change(screen.getByLabelText("Bonus card"), {
      target: { value: "foxglove-spin" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Closure choice" }));
    expect(onCommand).toHaveBeenCalledWith({
      type: "game_action",
      action: {
        type: "choose_closure_bonus",
        partyId: "foxglove",
        bonusCardId: "foxglove-spin"
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
    expect(screen.getByText("All agendas").closest("details")?.open).toBe(false);
    fireEvent.click(screen.getByText("All agendas"));
    expect(screen.getAllByText(/Capital card/)).toHaveLength(3);
  });

  it.each([2, 6])("shows only current private regional objectives in stable card order for %i players", (count) => {
    const state = initializeGame(configuration(count), random).state;
    state.year = 3;
    let view = privateView(state, "seat-1");
    const props = { ownSeatId: "seat-1", spectator: false, busy: false, onCommand: async () => true };
    const { container, rerender } = render(<GameDesk {...props} view={view} ownSeat={view.seats[0]} />);
    const assertObjectives = (slotIndex: number) => {
      for (const region of ["urban", "mixed", "outlying"]) {
        const labels = [...container.querySelectorAll(`.map-objectives-${region} [role="img"]`)].map((icon) => icon.getAttribute("aria-label"));
        const cards = view.seats[0]!.scoringCardIds![slotIndex]!;
        expect(labels).toEqual(cards.map((id, index) => {
          const objective = SCORING_CARDS_BY_ID[id as ScoringCardId].objectives.find((value) => value.regionId === region)!;
          return `${region[0]!.toUpperCase()}${region.slice(1)}: ${PARTIES_BY_ID[objective.partyId].shortName}${cards.length > 1 ? ` · Card ${index + 1}` : ""}`;
        }));
      }
    };
    assertObjectives(1);
    expect(container.querySelectorAll(".capital-objectives [role='img']")).toHaveLength(3);
    state.year = 6;
    view = privateView(state, "seat-1");
    rerender(<GameDesk {...props} view={view} ownSeat={view.seats[0]} />);
    assertObjectives(2);
    rerender(<GameDesk {...props} view={view} ownSeat={undefined} spectator />);
    expect(container.querySelectorAll(".map-objectives [role='img']")).toHaveLength(0);
    expect(screen.queryByText("All agendas")).toBeNull();
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
        baseRegionScore: 2,
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
        baseRegionScore: 2,
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

function sixPartyState(): GameState {
  return openEveryParty(
    initializeGame(configuration(6), random).state,
    [...PARTY_IDS]
  );
}

function renderUnboundComposer(
  state: GameState,
  partyId: PartyId,
  bonusCardId: BonusCardId
) {
  state.bonusCards[bonusCardId] = { zone: "hand", seatId: "seat-1" };
  const view = privateView(state, "seat-1");
  const onSubmit = vi.fn(async () => true);
  render(
    <OperationComposer
      view={view}
      seat={view.seats[0]!}
      partyId={partyId}
      onPartyId={() => undefined}
      busy={false}
      onSubmit={onSubmit}
      onFinish={async () => true}
    />
  );
  return { onSubmit };
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
        sourceDistrictId: "grand-market",
        destinationDistrictId: "northgate"
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
