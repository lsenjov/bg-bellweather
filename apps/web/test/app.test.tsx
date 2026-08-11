/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActionDesk,
  App,
  ContestCard,
  CounterbidForm,
  DistrictMap,
  extractView,
  GameDesk,
  LobbyDesk,
  mergePendingDecision,
  operationLogEntries,
  OpeningForm,
  OperationForm,
  orderedContestIds,
  PartyRail,
  PlayerLedger
} from "../src/App.js";

const TEST_PARTY_ORDER = [
  "honeycomb",
  "old-shell",
  "foxglove",
  "riverworks",
  "many-wings",
  "night-parliament"
] as const;

type GameDeskView = React.ComponentProps<typeof GameDesk>["view"];
type GameDeskSeat = NonNullable<React.ComponentProps<typeof GameDesk>["ownSeat"]>;

function gameDeskView(seats: GameDeskView["seats"]): GameDeskView {
  return {
    playerCount: 2,
    round: 1,
    electionNumber: 0,
    phase: "opening",
    phaseData: {
      activeSeatId: "seat-b",
      turnSeatIds: ["seat-b", "seat-a"],
      turnIndex: 0
    },
    deadlineAt: null,
    nextFirstOpenerSeatId: "seat-b",
    seats,
    partyOrder: [...TEST_PARTY_ORDER],
    support: {},
    courtSupport: {
      honeycomb: {},
      "old-shell": {},
      foxglove: {},
      riverworks: {},
      "many-wings": {},
      "night-parliament": {}
    },
    coalitionTargets: {},
    contests: {},
    bids: [],
    resolvedOperations: [],
    roundHistory: [],
    readySeatIds: [],
    pendingDecision: null,
    counterbidSlots: [],
    electionHistory: [],
    chat: []
  };
}

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return values.size;
      },
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

describe("browser play surface", () => {
  it("keeps public operation counts when private decision details are merged", () => {
    expect(
      mergePendingDecision(
        {
          id: "decision-1",
          seatId: "seat-a",
          availableOperations: [
            { operation: "organise", count: 1 },
            { operation: "rally", count: 3 }
          ]
        },
        {
          id: "decision-1",
          seatId: "seat-a",
          partyId: "honeycomb",
          legalOperations: ["organise", "rally"]
        }
      )
    ).toEqual(expect.objectContaining({
      partyId: "honeycomb",
      availableOperations: [
        { operation: "organise", count: 1 },
        { operation: "rally", count: 3 }
      ]
    }));
  });

  it("retains public operation counts in the acting player's extracted view", () => {
    const view = extractView({
      scope: "seat",
      viewerSeatId: "seat-a",
      publicState: {
        gameId: "game-1",
        inviteCode: "PRESS42",
        version: 1,
        latestSequence: 1,
        lifecycle: "active",
        configuration: {
          playerCount: 2,
          counterbidTimer: { mode: "off" },
          allowSpectators: false
        },
        seats: [],
        spectators: [],
        publicGame: {
          rulesetVersion: "14",
          round: 1,
          electionNumber: 0,
          nextFirstOpenerSeatId: "seat-a",
          partyOrder: [...TEST_PARTY_ORDER],
          support: {},
          courtSupport: {},
          coalitionTargets: {},
          electionHistory: [],
          chat: [],
          phase: {
            type: "resolution",
            pendingDecision: {
              id: "decision-1",
              seatId: "seat-a",
              availableOperations: [
                { operation: "organise", count: 1 },
                { operation: "rally", count: 3 }
              ]
            }
          },
          seats: [],
          contests: {},
          resolvedOperations: [{
            round: 1,
            contestId: "honeycomb",
            bidId: "bid-1",
            operation: "rally",
            choice: null,
            baselineApplied: false,
            failure: "No legal choice remained for this operation"
          }],
          roundHistory: []
        }
      },
      seatState: {
        seatId: "seat-a",
        privateGame: {
          reserve: {
            leverage: 0,
            bluff: 0,
            operations: { organise: 0, rally: 0, smear: 0, court: 0 }
          },
          scoringCardIds: [
            ["SC-01", "SC-02"],
            ["SC-03", "SC-04"],
            ["SC-05", "SC-06"]
          ],
          ownBids: [],
          counterbidSlots: [null, null],
          pendingDecision: {
            id: "decision-1",
            seatId: "seat-a",
            partyId: "honeycomb",
            legalOperations: ["organise", "rally"]
          }
        }
      }
    } as never);

    expect(view?.pendingDecision).toEqual(expect.objectContaining({
      partyId: "honeycomb",
      availableOperations: [
        { operation: "organise", count: 1 },
        { operation: "rally", count: 3 }
      ]
    }));
    expect(view?.resolvedOperations).toEqual([
      expect.objectContaining({ bidId: "bid-1", operation: "rally" })
    ]);
  });

  it("shows spectators successful, grouped, and historical operation results", () => {
    const seats = [
      {
        id: "seat-a",
        displayName: "Sable",
        controller: "human",
        position: 0,
        firmIds: ["one-fell-swoop"],
        points: 0,
        reserve: null,
        scoringCardIds: null
      },
      {
        id: "seat-b",
        displayName: "Ochre",
        controller: "human",
        position: 1,
        firmIds: ["pairliament"],
        points: 0,
        reserve: null,
        scoringCardIds: null
      }
    ] satisfies GameDeskView["seats"];
    const failure = "No legal choice remained for this operation";
    const view = {
      ...gameDeskView(seats),
      round: 2,
      bids: [{ id: "current-bid", ownerSeatId: "seat-a" }],
      roundHistory: [{
        round: 1,
        bids: {
          "prior-bid": { id: "prior-bid", ownerSeatId: "seat-b" }
        }
      }],
      resolvedOperations: [
        {
          round: 2,
          contestId: "honeycomb",
          bidId: "current-bid",
          operation: "rally",
          choice: { operation: "rally", districtId: "northreach" },
          baselineApplied: true,
          failure: null
        },
        {
          round: 2,
          contestId: "honeycomb",
          bidId: "current-bid",
          operation: "rally",
          choice: null,
          baselineApplied: false,
          bonusApplied: false,
          failure
        },
        {
          round: 2,
          contestId: "honeycomb",
          bidId: "current-bid",
          operation: "rally",
          choice: null,
          baselineApplied: false,
          bonusApplied: false,
          failure
        },
        {
          round: 1,
          contestId: "foxglove",
          bidId: "prior-bid",
          operation: "smear",
          choice: null,
          baselineApplied: false,
          bonusApplied: false,
          failure
        }
      ]
    } satisfies GameDeskView;

    expect(operationLogEntries(view)).toMatchObject([
      {
        round: 2,
        contestName: "Honeycomb Cooperative",
        ownerName: "Sable",
        operationName: "Rally",
        count: 1,
        failed: false,
        outcome: "Added Support in Northreach."
      },
      {
        round: 2,
        ownerName: "Sable",
        operationName: "Rally",
        count: 2,
        failed: true,
        outcome: `Failed — ${failure}.`
      },
      {
        round: 1,
        contestName: "Foxglove League",
        ownerName: "Ochre",
        operationName: "Smear",
        count: 1,
        failed: true
      }
    ]);

    render(
      <GameDesk
        view={view}
        ownSeat={undefined}
        ownSeatId={undefined}
        spectator
        busy={false}
        onCommand={async () => undefined}
      />
    );

    expect(screen.getByRole("heading", { name: "Game log" })).toBeTruthy();
    const log = screen.getByRole("list", {
      name: "Operation resolution history"
    });
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(within(log).getAllByRole("listitem")).toHaveLength(3);
    expect(within(log).getByText("Added Support in Northreach.")).toBeTruthy();
    expect(within(log).getByText("2 Rally cards")).toBeTruthy();
    expect(within(log).getAllByText(`Failed — ${failure}.`)).toHaveLength(2);
    expect(within(log).getByText("Round 1")).toBeTruthy();
    expect(within(log).getByText("Ochre")).toBeTruthy();
  });

  it("distinguishes a Night Shift claim from its delayed resolution", () => {
    const failure = "No legal choice remained for the delayed operation";
    const view = {
      ...gameDeskView([]),
      resolvedOperations: [
        {
          round: 1,
          contestId: "night-parliament",
          bidId: "night-bid",
          operation: "rally",
          choice: {
            choice: { operation: "rally", districtId: "northreach" },
            claimBonus: true
          },
          baselineApplied: true,
          bonusApplied: true,
          failure: null
        },
        {
          round: 1,
          contestId: "night-parliament",
          bidId: "night-bid",
          operation: "rally",
          choice: { operation: "rally", districtId: "cloverfield" },
          baselineApplied: true,
          bonusApplied: true,
          failure: null
        },
        {
          round: 1,
          contestId: "night-parliament",
          bidId: "night-bid",
          operation: "rally",
          choice: null,
          baselineApplied: false,
          bonusApplied: true,
          failure
        }
      ]
    } satisfies GameDeskView;

    expect(operationLogEntries(view)).toMatchObject([
      {
        subject: "Rally card",
        outcome: "Added Support in Northreach. Night Shift scheduled."
      },
      {
        subject: "Night Shift bonus",
        outcome: "Added Support in Cloverfield."
      },
      {
        subject: "Night Shift bonus",
        failed: true,
        outcome: `Failed — ${failure}.`
      }
    ]);
  });

  it("does not cross out an owner's covered cancellation before reveal", () => {
    const state = {
      scope: "seat",
      viewerSeatId: "seat-a",
      publicState: {
        gameId: "game-1",
        inviteCode: "PRESS42",
        version: 1,
        latestSequence: 1,
        lifecycle: "active",
        configuration: {
          playerCount: 2,
          counterbidTimer: { mode: "off" },
          allowSpectators: false
        },
        seats: [],
        spectators: [],
        publicGame: {
          rulesetVersion: "14",
          round: 1,
          electionNumber: 0,
          nextFirstOpenerSeatId: "seat-a",
          partyOrder: [...TEST_PARTY_ORDER],
          support: {},
          courtSupport: {},
          coalitionTargets: {},
          electionHistory: [],
          chat: [],
          phase: { type: "resolution" },
          seats: [],
          contests: {
            honeycomb: {
              id: "honeycomb",
              targetPartyId: "honeycomb",
              openingBidId: null,
              bids: [{
                id: "future-bid",
                contestId: "honeycomb",
                ownerSeatId: "seat-a",
                firmId: "one-fell-swoop",
                kind: "counterbid",
                slotIndex: 0,
                cardCount: 2
              }]
            }
          },
          resolvedOperations: [],
          roundHistory: []
        }
      },
      seatState: {
        seatId: "seat-a",
        privateGame: {
          reserve: {
            leverage: 0,
            bluff: 0,
            operations: { organise: 0, rally: 0, smear: 0, court: 0 }
          },
          scoringCardIds: [
            ["SC-01", "SC-02"],
            ["SC-03", "SC-04"],
            ["SC-05", "SC-06"]
          ],
          ownBids: [{
            id: "future-bid",
            contestId: "honeycomb",
            ownerSeatId: "seat-a",
            firmId: "one-fell-swoop",
            kind: "counterbid",
            slotIndex: 0,
            leverage: 2,
            bluff: 0,
            operations: { organise: 0, rally: 0, smear: 0, court: 0 }
          }],
          counterbidSlots: ["future-bid", null],
          pendingDecision: null
        }
      }
    };
    const coveredView = extractView(state as never)!;
    const { container, rerender } = render(
      <ContestCard
        contestId="honeycomb"
        seats={[]}
        bids={coveredView.bids}
      />
    );

    expect(within(container).getByRole("listitem").classList.contains(
      "bid-cancelled"
    )).toBe(false);

    state.publicState.publicGame.contests.honeycomb.bids[0]!.status =
      "cancelled";
    state.seatState.privateGame.ownBids[0]!.status = "cancelled";
    const revealedView = extractView(state as never)!;
    rerender(
      <ContestCard
        contestId="honeycomb"
        seats={[]}
        bids={revealedView.bids}
      />
    );

    expect(within(container).getByRole("listitem").classList.contains(
      "bid-cancelled"
    )).toBe(true);
  });

  it("rejects an active payload from an unsupported ruleset", () => {
    expect(extractView(activePublicState("8", TEST_PARTY_ORDER))).toBeNull();
  });

  it("rejects an incomplete or duplicate current party order", () => {
    expect(extractView(activePublicState("9", []))).toBeNull();
    expect(
      extractView(activePublicState("9", [
        ...TEST_PARTY_ORDER.slice(0, -1),
        "honeycomb"
      ]))
    ).toBeNull();
  });

  it("renders the human table creator with a configurable optional timer", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /every whisper leaves a mark/i })
    ).toBeTruthy();
    expect(
      screen.getByLabelText(/counterbid seconds/i).getAttribute("min")
    ).toBe("5");
    expect(screen.getByLabelText(/disable timer/i)).toBeTruthy();
    expect(screen.queryByLabelText(/seats/i)).toBeNull();
    expect(screen.getByText(/unlimited support/i)).toBeTruthy();
  });

  it("shows the active invitation code to an authenticated observer", async () => {
    localStorage.setItem("bellweather-register-invite", "STALE42");
    localStorage.setItem("bellweather-register-session", JSON.stringify({
      participantType: "spectator",
      gameId: "game-1",
      spectatorId: "018f47d2-7830-7b84-a854-1b741f285f60",
      accessToken: "x".repeat(43)
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(activePublicState("11", TEST_PARTY_ORDER)),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    ));

    render(<App />);

    expect(await screen.findByText("Invite PRESS42")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /leave this desk/i }));
    expect(localStorage.getItem("bellweather-register-session")).toBeNull();
    expect(localStorage.getItem("bellweather-register-invite")).toBeNull();
  });

  it("lets the host start once a second player occupies the six-seat lobby", async () => {
    const onCommand = vi.fn(async () => undefined);
    const host = {
      seatId: "018f47d2-7830-7b84-a854-1b741f285f5e",
      seatIndex: 0,
      displayName: "Ada",
      role: "host",
      controller: "human",
      ready: false
    };
    const state = {
      scope: "seat",
      viewerSeatId: host.seatId,
      publicState: {
        gameId: "018f47d2-7830-7b84-a854-1b741f285f5d",
        inviteCode: "PRESS42",
        version: 1,
        latestSequence: 1,
        lifecycle: "lobby",
        configuration: {
          playerCount: 1,
          counterbidTimer: { mode: "off" },
          allowSpectators: false
        },
        seats: [host],
        spectators: [],
        publicGame: { phase: "lobby", rulesetVersion: "14" }
      },
      seatState: { seatId: host.seatId, privateGame: null }
    };
    const session = {
      participantType: "seat",
      gameId: state.publicState.gameId,
      seatId: host.seatId,
      accessToken: "x".repeat(43)
    };
    const { rerender } = render(
      <LobbyDesk
        state={state as never}
        session={session as never}
        hostSeatId={host.seatId}
        busy={false}
        onCommand={onCommand}
      />
    );

    expect(screen.getByText("1 / 6")).toBeTruthy();
    expect(screen.getByText(/5 desks remain open/i)).toBeTruthy();
    expect(
      (screen.getByRole("button", {
        name: /waiting for one more player/i
      }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.queryByText(/open desk/i)).toBeNull();

    const twoPlayerState = {
      ...state,
      publicState: {
        ...state.publicState,
        version: 2,
        latestSequence: 2,
        configuration: { ...state.publicState.configuration, playerCount: 2 },
        seats: [
          host,
          {
            ...host,
            seatId: "018f47d2-7830-7b84-a854-1b741f285f60",
            seatIndex: 1,
            displayName: "Turing",
            role: "player"
          }
        ]
      }
    };
    rerender(
      <LobbyDesk
        state={twoPlayerState as never}
        session={session as never}
        hostSeatId={host.seatId}
        busy={false}
        onCommand={onCommand}
      />
    );

    expect(screen.getByText("2 / 6")).toBeTruthy();
    const start = screen.getByRole("button", { name: /start the presses/i });
    expect((start as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(start);
    await waitFor(() => expect(onCommand).toHaveBeenCalledWith({ type: "start_game" }));
  });

  it("gives every district an accessible Support and capacity summary", () => {
    render(
      <DistrictMap
        support={{
          harbormouth: { honeycomb: 2, "old-shell": 1 }
        } as never}
      />
    );

    expect(
      screen.getByLabelText(
        "Harbormouth: Honeycomb 2, Old Shell 1; 3 free spots"
      )
    ).toBeTruthy();
  });

  it("marks the points tracker with each firm identity and active readiness", () => {
    const { container } = render(
      <PlayerLedger
        seats={[
          {
            id: "seat-a",
            displayName: "Ada",
            controller: "human",
            position: 0,
            firmIds: ["one-fell-swoop"],
            points: 10,
            reserve: null,
            scoringCardIds: null
          },
          {
            id: "seat-b",
            displayName: "Bert",
            controller: "human",
            position: 1,
            firmIds: ["pairliament"],
            points: 7,
            reserve: null,
            scoringCardIds: null
          }
        ]}
        readySeatIds={["seat-b"]}
        showReadiness
      />
    );

    expect(container.querySelectorAll(".player-ledger-emblem")).toHaveLength(2);
    expect(screen.getByText("One Fell Swoop Public Affairs")).toBeTruthy();
    expect(screen.getByText("Pairliament Partners")).toBeTruthy();
    expect(within(screen.getByText("Ada").closest("article")!).getByText("Waiting")).toBeTruthy();
    expect(within(screen.getByText("Bert").closest("article")!).getByText("Ready")).toBeTruthy();
  });

  it("marks private scoring districts with their objective party", () => {
    render(
      <DistrictMap
        support={{}}
        scoringObjectives={[
          { districtId: "grand-market", partyId: "foxglove" }
        ]}
      />
    );

    const target = screen.getByLabelText(
      "Grand Market: no Support; 6 free spots; private agenda scores Foxglove League"
    );
    expect(target.classList.contains("district-scoring")).toBe(true);
    expect(within(target).getByText("Private agenda")).toBeTruthy();
    expect(within(target).getByText("Foxglove")).toBeTruthy();
    expect(
      within(target.parentElement!).getByLabelText("Cloverfield: no Support; 4 free spots")
        .classList.contains("district-scoring")
    ).toBe(false);
  });

  it("shows every revealed party when scoring cards share a district", () => {
    render(
      <DistrictMap
        support={{}}
        scoringLabel="Election agenda"
        scoringObjectives={[
          { districtId: "ironwood", partyId: "night-parliament" },
          { districtId: "ironwood", partyId: "honeycomb" }
        ]}
      />
    );

    const target = screen.getByLabelText(
      "Ironwood: no Support; 6 free spots; election agenda scores Night Parliament, Honeycomb Cooperative"
    );
    expect(within(target).getAllByText("Election agenda")).toHaveLength(2);
    expect(within(target).getByText("Night")).toBeTruthy();
    expect(within(target).getByText("Honeycomb")).toBeTruthy();
  });

  it("shows all three fixed low-player agendas in the private folio", () => {
    const seat = {
      id: "seat-a",
      displayName: "Ada",
      controller: "human",
      position: 0,
      firmIds: ["one-fell-swoop"],
      points: 10,
      reserve: {
        leverage: 20,
        bluff: 8,
        operations: { organise: 4, rally: 8, smear: 4, court: 4 }
      },
      scoringCardIds: [
        ["SC-01", "SC-02"],
        ["SC-03", "SC-04"],
        ["SC-05", "SC-06"]
      ]
    };
    render(
      <GameDesk
        view={{
          playerCount: 2,
          round: 1,
          electionNumber: 0,
          phase: "opening",
          phaseData: {
            activeSeatId: "seat-b",
            turnSeatIds: ["seat-b", "seat-a", "seat-a", "seat-b"],
            turnIndex: 0
          },
          deadlineAt: null,
          nextFirstOpenerSeatId: "seat-b",
          seats: [seat],
          partyOrder: [...TEST_PARTY_ORDER],
          support: {},
          courtSupport: {},
          coalitionTargets: {},
          contests: {},
          bids: [],
          readySeatIds: [],
          pendingDecision: null,
          counterbidSlots: [],
          electionHistory: [],
          chat: []
        } as never}
        ownSeat={seat as never}
        ownSeatId="seat-a"
        spectator
        busy={false}
        onCommand={async () => undefined}
      />
    );

    expect(screen.getByText("SC-01 · SC-02")).toBeTruthy();
    expect(screen.getByText("SC-03 · SC-04")).toBeTruthy();
    expect(screen.getByText("SC-05 · SC-06")).toBeTruthy();
    expect(screen.getByLabelText("Election 1 agenda, Current")).toBeTruthy();
    expect(screen.getByLabelText("Election 2 agenda, Future")).toBeTruthy();
    expect(screen.getByText(/grand-market · Honeycomb/i)).toBeTruthy();
    expect(screen.getByText(/ironwood · Old Shell/i)).toBeTruthy();
  });

  it("advances the private map and folio to the next fixed agenda", () => {
    const seat = {
      id: "seat-a",
      displayName: "Ada",
      controller: "human",
      position: 0,
      firmIds: ["one-fell-swoop"],
      points: 10,
      reserve: {
        leverage: 20,
        bluff: 8,
        operations: { organise: 4, rally: 8, smear: 4, court: 4 }
      },
      scoringCardIds: [
        ["SC-01", "SC-02"],
        ["SC-03", "SC-04"],
        ["SC-05", "SC-06"]
      ]
    } satisfies GameDeskSeat;
    render(
      <GameDesk
        view={{
          ...gameDeskView([seat]),
          round: 5,
          electionNumber: 1
        }}
        ownSeat={seat}
        ownSeatId="seat-a"
        spectator={false}
        busy={false}
        onCommand={async () => undefined}
      />
    );

    expect(screen.getByLabelText("Election 1 agenda, Scored")).toBeTruthy();
    expect(screen.getByLabelText("Election 2 agenda, Current")).toBeTruthy();
    expect(
      screen.getByLabelText(/Ironwood.*private agenda scores Foxglove/i)
    ).toBeTruthy();
  });

  it("keeps scored agendas in the public archive after the next campaign starts", () => {
    const seats = [
      {
        id: "seat-a",
        displayName: "Ada",
        controller: "human",
        position: 0,
        firmIds: ["one-fell-swoop"],
        points: 14,
        reserve: null,
        scoringCardIds: null
      },
      {
        id: "seat-b",
        displayName: "Grace",
        controller: "human",
        position: 1,
        firmIds: ["pairliament"],
        points: 9,
        reserve: null,
        scoringCardIds: null
      }
    ] satisfies GameDeskView["seats"];
    render(
      <GameDesk
        view={{
          ...gameDeskView(seats),
          round: 5,
          electionNumber: 1,
          electionHistory: [{
            electionNumber: 1,
            afterRound: 4,
            scoringCards: [
              { seatId: "seat-a", scoringCardIds: ["SC-01", "SC-02"] },
              { seatId: "seat-b", scoringCardIds: ["SC-03", "SC-04"] }
            ],
            scores: [
              { playerId: "seat-a", pointsChange: 4, resultingPoints: 14 },
              { playerId: "seat-b", pointsChange: -1, resultingPoints: 9 }
            ]
          }]
        }}
        ownSeat={undefined}
        ownSeatId={undefined}
        spectator
        busy={false}
        onCommand={async () => undefined}
      />
    );

    const archive = screen.getByLabelText("Public Election archive");
    expect(within(archive).getByText("Election 1")).toBeTruthy();
    expect(within(archive).getAllByText("Ada")).toHaveLength(2);
    expect(within(archive).getByText("SC-01 · SC-02")).toBeTruthy();
    expect(within(archive).getAllByText("Grace")).toHaveLength(2);
    expect(within(archive).getByText("SC-03 · SC-04")).toBeTruthy();
  });

  it("limits gift selects to the live transferable reserve", () => {
    const ownSeat = {
      id: "seat-a",
      displayName: "Ada",
      controller: "human",
      position: 0,
      firmIds: ["one-fell-swoop"],
      points: 3,
      reserve: {
        leverage: 2,
        bluff: 1,
        operations: { organise: 1, rally: 2, smear: 0, court: 1 }
      },
      scoringCardIds: [[], [], []]
    } satisfies GameDeskSeat;
    const otherSeat = {
      id: "seat-b",
      displayName: "Grace",
      controller: "human",
      position: 1,
      firmIds: ["pairliament"],
      points: 4,
      reserve: null,
      scoringCardIds: null
    } satisfies GameDeskSeat;
    render(
      <GameDesk
        view={gameDeskView([ownSeat, otherSeat])}
        ownSeat={ownSeat}
        ownSeatId="seat-a"
        spectator={false}
        busy={false}
        onCommand={async () => undefined}
      />
    );

    const maximums = {
      leverage: 2,
      bluff: 1,
      points: 3,
      organise: 1,
      rally: 2,
      smear: 0,
      court: 1
    };
    for (const [label, maximum] of Object.entries(maximums)) {
      const select = screen.getByLabelText(label) as HTMLSelectElement;
      expect(Array.from(select.options, (option) => Number(option.value))).toEqual(
        Array.from({ length: maximum + 1 }, (_, value) => value)
      );
    }
  });

  it("treats a negative score as zero transferable points", () => {
    const ownSeat = {
      id: "seat-a",
      displayName: "Ada",
      controller: "human",
      position: 0,
      firmIds: ["one-fell-swoop"],
      points: -2,
      reserve: {
        leverage: 2,
        bluff: 1,
        operations: { organise: 1, rally: 2, smear: 0, court: 1 }
      },
      scoringCardIds: [[], [], []]
    } satisfies GameDeskSeat;
    render(
      <GameDesk
        view={gameDeskView([ownSeat])}
        ownSeat={ownSeat}
        ownSeatId="seat-a"
        spectator={false}
        busy={false}
        onCommand={async () => undefined}
      />
    );

    const points = screen.getByLabelText("points") as HTMLSelectElement;
    expect(Array.from(points.options, (option) => Number(option.value))).toEqual([0]);
    expect(points.value).toBe("0");
  });

  it("submits the gift payload and clears a successful draft", async () => {
    const ownSeat = {
      id: "seat-a",
      displayName: "Ada",
      controller: "human",
      position: 0,
      firmIds: ["one-fell-swoop"],
      points: 3,
      reserve: {
        leverage: 2,
        bluff: 1,
        operations: { organise: 1, rally: 2, smear: 0, court: 1 }
      },
      scoringCardIds: [[], [], []]
    } satisfies GameDeskSeat;
    const otherSeat = {
      id: "seat-b",
      displayName: "Grace",
      controller: "human",
      position: 1,
      firmIds: ["pairliament"],
      points: 4,
      reserve: null,
      scoringCardIds: null
    } satisfies GameDeskSeat;
    let finishGift: (() => void) | undefined;
    const onCommand = vi.fn(() => new Promise<void>((resolve) => {
      finishGift = resolve;
    }));
    render(
      <GameDesk
        view={gameDeskView([ownSeat, otherSeat])}
        ownSeat={ownSeat}
        ownSeatId="seat-a"
        spectator={false}
        busy={false}
        onCommand={onCommand}
      />
    );

    fireEvent.change(screen.getByLabelText("Recipient"), { target: { value: "seat-b" } });
    fireEvent.change(screen.getByLabelText("leverage"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("points"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("rally"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /record one-way gift/i }));

    expect(onCommand).toHaveBeenCalledWith({
      type: "give_resources",
      recipientSeatId: "seat-b",
      leverage: 2,
      bluff: 0,
      points: 3,
      operations: { organise: 0, rally: 1, smear: 0, court: 0 }
    });
    expect((screen.getByLabelText("Recipient") as HTMLSelectElement).value).toBe("seat-b");
    expect(screen.getByLabelText("Recipient").closest("fieldset")?.matches(":disabled")).toBe(true);

    finishGift?.();
    await waitFor(() => {
      expect((screen.getByLabelText("Recipient") as HTMLSelectElement).value).toBe("");
      expect((screen.getByLabelText("leverage") as HTMLSelectElement).value).toBe("0");
      expect((screen.getByLabelText("points") as HTMLSelectElement).value).toBe("0");
      expect((screen.getByLabelText("rally") as HTMLSelectElement).value).toBe("0");
    });
  });

  it("preserves a gift draft when the command fails", async () => {
    const ownSeat = {
      id: "seat-a",
      displayName: "Ada",
      controller: "human",
      position: 0,
      firmIds: ["one-fell-swoop"],
      points: 3,
      reserve: {
        leverage: 2,
        bluff: 1,
        operations: { organise: 1, rally: 2, smear: 0, court: 1 }
      },
      scoringCardIds: [[], [], []]
    } satisfies GameDeskSeat;
    const otherSeat = {
      id: "seat-b",
      displayName: "Grace",
      controller: "human",
      position: 1,
      firmIds: ["pairliament"],
      points: 4,
      reserve: null,
      scoringCardIds: null
    } satisfies GameDeskSeat;
    render(
      <GameDesk
        view={gameDeskView([ownSeat, otherSeat])}
        ownSeat={ownSeat}
        ownSeatId="seat-a"
        spectator={false}
        busy={false}
        onCommand={async () => false}
      />
    );

    fireEvent.change(screen.getByLabelText("Recipient"), { target: { value: "seat-b" } });
    fireEvent.change(screen.getByLabelText("leverage"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("points"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /record one-way gift/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /record one-way gift/i }).matches(":disabled")).toBe(false));
    expect((screen.getByLabelText("Recipient") as HTMLSelectElement).value).toBe("seat-b");
    expect((screen.getByLabelText("leverage") as HTMLSelectElement).value).toBe("2");
    expect((screen.getByLabelText("points") as HTMLSelectElement).value).toBe("3");
  });

  it("clamps a gift draft when the projected reserve falls", async () => {
    const ownSeat = {
      id: "seat-a",
      displayName: "Ada",
      controller: "human",
      position: 0,
      firmIds: ["one-fell-swoop"],
      points: 3,
      reserve: {
        leverage: 2,
        bluff: 1,
        operations: { organise: 1, rally: 2, smear: 0, court: 1 }
      },
      scoringCardIds: [[], [], []]
    } satisfies GameDeskSeat;
    const otherSeat = {
      id: "seat-b",
      displayName: "Grace",
      controller: "human",
      position: 1,
      firmIds: ["pairliament"],
      points: 4,
      reserve: null,
      scoringCardIds: null
    } satisfies GameDeskSeat;
    const { rerender } = render(
      <GameDesk
        view={gameDeskView([ownSeat, otherSeat])}
        ownSeat={ownSeat}
        ownSeatId="seat-a"
        spectator={false}
        busy={false}
        onCommand={async () => undefined}
      />
    );
    fireEvent.change(screen.getByLabelText("leverage"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("points"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("court"), { target: { value: "1" } });

    const reducedSeat = {
      ...ownSeat,
      points: 1,
      reserve: {
        ...ownSeat.reserve,
        leverage: 1,
        operations: { ...ownSeat.reserve.operations, court: 0 }
      }
    };
    rerender(
      <GameDesk
        view={gameDeskView([reducedSeat, otherSeat])}
        ownSeat={reducedSeat}
        ownSeatId="seat-a"
        spectator={false}
        busy={false}
        onCommand={async () => undefined}
      />
    );

    await waitFor(() => {
      expect((screen.getByLabelText("leverage") as HTMLSelectElement).value).toBe("1");
      expect((screen.getByLabelText("points") as HTMLSelectElement).value).toBe("1");
      expect((screen.getByLabelText("court") as HTMLSelectElement).value).toBe("0");
    });
  });

  it("keeps gift controls private from spectators", () => {
    render(
      <GameDesk
        view={gameDeskView([])}
        ownSeat={undefined}
        ownSeatId={undefined}
        spectator
        busy={false}
        onCommand={async () => undefined}
      />
    );

    expect(screen.getByText("Observers cannot move table resources.")).toBeTruthy();
    expect(screen.queryByLabelText("Recipient")).toBeNull();
    expect(screen.queryByRole("button", { name: /record one-way gift/i })).toBeNull();
  });

  it("locks table talk while a message is in flight", async () => {
    let finishChat: (() => void) | undefined;
    const onCommand = vi.fn(() => new Promise<void>((resolve) => {
      finishChat = resolve;
    }));
    render(
      <GameDesk
        view={gameDeskView([])}
        ownSeat={undefined}
        ownSeatId={undefined}
        spectator={false}
        busy={false}
        onCommand={onCommand}
      />
    );

    const message = screen.getByLabelText("Public chat message") as HTMLInputElement;
    const send = screen.getByRole("button", { name: "Send" });
    fireEvent.change(message, { target: { value: "A recorded statement" } });
    fireEvent.click(send);

    expect(onCommand).toHaveBeenCalledWith({
      type: "post_chat",
      message: "A recorded statement"
    });
    expect(message.matches(":disabled")).toBe(true);
    expect(send.matches(":disabled")).toBe(true);
    expect(message.value).toBe("A recorded statement");

    finishChat?.();
    await waitFor(() => {
      expect(message.value).toBe("");
      expect(message.matches(":disabled")).toBe(false);
      expect(send.matches(":disabled")).toBe(false);
    });
  });

  it("marks every revealed low-player agenda objective on Election Day", () => {
    render(
      <GameDesk
        view={{
          playerCount: 2,
          round: 4,
          electionNumber: 0,
          phase: "election",
          phaseData: {},
          deadlineAt: null,
          nextFirstOpenerSeatId: "seat-a",
          seats: [],
          partyOrder: [...TEST_PARTY_ORDER],
          support: {},
          courtSupport: {},
          coalitionTargets: {},
          contests: {},
          bids: [],
          readySeatIds: [],
          pendingDecision: null,
          counterbidSlots: [],
          electionHistory: [
            {
              scoringCards: [
                { seatId: "seat-a", scoringCardIds: ["SC-01", "SC-02"] }
              ]
            }
          ],
          chat: []
        } as never}
        ownSeat={undefined}
        ownSeatId={undefined}
        spectator
        busy={false}
        onCommand={async () => undefined}
      />
    );

    expect(screen.getByLabelText(/Grand Market.*Election agenda scores Honeycomb/i)).toBeTruthy();
    expect(screen.getByLabelText(/Ironwood.*Election agenda scores Old Shell/i)).toBeTruthy();
  });

  it("uses an armed blank district field without overwriting map selections", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <DistrictMap
        support={{}}
        interaction={{
          activeTarget: "destination",
          selections: { source: "harbormouth" },
          selectableDistrictIds: ["cloverfield"],
          onSelect
        }}
      />
    );

    const source = screen.getByRole("button", {
      name: /Harbormouth.*selected as source.*choose as destination/i
    });
    expect(source.classList.contains("district-selected-source")).toBe(true);
    expect((source as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: /Cloverfield.*choose as destination/i })
    );
    expect(onSelect).toHaveBeenCalledWith("cloverfield");

    rerender(
      <DistrictMap
        support={{}}
        interaction={{
          activeTarget: null,
          selections: { source: "harbormouth" },
          onSelect
        }}
      />
    );
    expect(
      screen.queryByRole("button", { name: /Harbormouth/i })
    ).toBeNull();
    expect(
      screen.getByLabelText(/Harbormouth.*selected as source/i).tagName
    ).toBe("ARTICLE");
  });

  it("shows covered, owned, and revealed bid information", () => {
    const { container } = render(
      <ContestCard
        contestId="honeycomb"
        seats={[
          {
            id: "seat-a",
            displayName: "Ada",
            controller: "human",
            position: 0,
            firmIds: ["one-fell-swoop"],
            points: 5,
            reserve: null,
            scoringCardIds: null
          }
        ]}
        bids={[
          {
            id: "bid-1",
            contestId: "honeycomb",
            ownerSeatId: "seat-a",
            firmId: "pairliament",
            kind: "counterbid",
            slotIndex: 2,
            status: "active",
            leverage: 3,
            bluff: 1,
            operations: { organise: 1, rally: 0, smear: 1, court: 0 },
            cardCount: 6
          }
        ]}
      />
    );
    const filing = within(container);

    expect(
      filing.getByLabelText("3 Leverage, 1 Bluff, 1 Organise, 1 Smear")
    ).toBeTruthy();
    expect(filing.getByText("3 L")).toBeTruthy();
    expect(filing.getByText("1 B")).toBeTruthy();
    expect(filing.getByText("1 O")).toBeTruthy();
    expect(filing.getByText("1 S")).toBeTruthy();
    expect(filing.queryByText(/0 [LBORSC]/)).toBeNull();
    expect(filing.getByText("6 bid cards in stack")).toBeTruthy();
    expect(filing.getByText(/One Fell Swoop Public Affairs/i)).toBeTruthy();
    expect(filing.queryByText(/Pairliament Partners/i)).toBeNull();
    expect(filing.getByText(/counterbid · identity card · active/i)).toBeTruthy();
    expect(container.querySelector(".filing-firm-emblem")).toBeTruthy();
  });

  it("preserves the covered total beside a partially revealed opening", () => {
    const { container } = render(
      <ContestCard
        contestId="honeycomb"
        seats={[]}
        bids={[{
          id: "bid-opening",
          firmId: "pairliament",
          kind: "opening",
          status: "active",
          leverage: 3,
          bluff: null,
          operations: null,
          cardCount: 6
        }]}
      />
    );

    const filing = within(container);
    expect(filing.getByText("3 L")).toBeTruthy();
    expect(filing.getByText("6 bid cards in stack")).toBeTruthy();
    expect(filing.queryByText(/[BORSC]$/)).toBeNull();
  });

  it("omits the card summary for an empty filing", () => {
    const { container } = render(
      <ContestCard
        contestId="honeycomb"
        seats={[]}
        bids={[{
          id: "bid-empty",
          firmId: "triumvirat",
          kind: "counterbid",
          status: "active",
          leverage: 0,
          bluff: 0,
          operations: { organise: 0, rally: 0, smear: 0, court: 0 },
          cardCount: 0
        }]}
        resolutionProgress={{
          currentBidId: null,
          completedBidIds: ["bid-empty"]
        }}
      />
    );

    const filing = within(container).getByRole("listitem");
    expect(filing.querySelector(".filing-cards")).toBeNull();
    expect(filing.querySelector(".filing-total")).toBeNull();
    expect(filing.classList.contains("bid-resolved")).toBe(true);
    expect(within(filing).getByText("✓ Resolved")).toBeTruthy();
  });

  it("distinguishes the current, resolved, waiting, and cancelled filings", () => {
    const { container } = render(
      <ContestCard
        contestId="honeycomb"
        seats={[]}
        resolutionProgress={{
          currentBidId: "bid-current",
          completedBidIds: ["bid-done", "bid-cancelled"]
        }}
        bids={[
          { id: "bid-current", firmId: "pairliament", status: "active", leverage: 4, cardCount: 4 },
          { id: "bid-done", firmId: "triumvirat", status: "transferred", leverage: 3, cardCount: 3 },
          { id: "bid-waiting", firmId: "one-fell-swoop", status: "active", leverage: 2, cardCount: 2 },
          { id: "bid-cancelled", firmId: "blackletter", status: "cancelled", leverage: 1, cardCount: 1 }
        ]}
      />
    );
    const filings = within(container).getAllByRole("listitem");

    expect(filings[0]!.classList.contains("bid-resolving")).toBe(true);
    expect(within(filings[0]!).getByText("Resolving")).toBeTruthy();
    expect(filings[1]!.classList.contains("bid-resolved")).toBe(true);
    expect(within(filings[1]!).getByText("✓ Resolved")).toBeTruthy();
    expect(filings[2]!.classList.contains("bid-resolving")).toBe(false);
    expect(filings[2]!.classList.contains("bid-resolved")).toBe(false);
    expect(filings[3]!.classList.contains("bid-cancelled")).toBe(true);
    expect(filings[3]!.classList.contains("bid-resolved")).toBe(false);
    expect(within(filings[3]!).queryByText("✓ Resolved")).toBeNull();
  });

  it("shows a covered stack total without exposing its card families", () => {
    const { container } = render(
      <ContestCard
        contestId="honeycomb"
        seats={[]}
        bids={[{
          id: "bid-covered",
          contestId: "honeycomb",
          kind: "counterbid",
          status: "active",
          cardCount: 6
        }]}
      />
    );

    expect(within(container).getByText("6 bid cards in stack")).toBeTruthy();
    expect(within(container).queryByText("Contents concealed")).toBeNull();
  });

  it("exposes a contest target button during counterbidding", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ContestCard
        contestId="old-shell"
        seats={[]}
        bids={[]}
        selected={false}
        onSelect={onSelect}
      />
    );

    fireEvent.click(
      within(container).getByRole("button", { name: /target old shell union/i })
    );
    expect(onSelect).toHaveBeenCalledWith("old-shell");
    const contest = within(container).getByRole("article");
    expect(contest.classList.contains("contest-card-party")).toBe(true);
    expect(contest.style.getPropertyValue("--contest-party")).toBe("#3f7447");
  });

  it("makes only an owned counterbid filing selectable", () => {
    const onSelectCounterbid = vi.fn();
    const { container } = render(
      <ContestCard
        contestId="honeycomb"
        seats={[
          {
            id: "seat-a",
            displayName: "Ada",
            controller: "human",
            position: 0,
            firmIds: ["one-fell-swoop"],
            points: 5,
            reserve: null,
            scoringCardIds: null
          },
          {
            id: "seat-b",
            displayName: "Turing",
            controller: "human",
            position: 1,
            firmIds: ["pairliament"],
            points: 5,
            reserve: null,
            scoringCardIds: null
          }
        ]}
        bids={[
          {
            id: "bid-own",
            contestId: "honeycomb",
            ownerSeatId: "seat-a",
            kind: "counterbid",
            slotIndex: 1,
            status: "active",
            leverage: 3,
            cardCount: 3
          },
          {
            id: "bid-opponent",
            contestId: "honeycomb",
            ownerSeatId: "seat-b",
            kind: "counterbid",
            slotIndex: 0,
            status: "active",
            leverage: 2,
            cardCount: 2
          }
        ]}
        ownSeatId="seat-a"
        selectedCounterbidSlotIndex={1}
        onSelectCounterbid={onSelectCounterbid}
      />
    );

    const ownFiling = within(container).getByRole("button", {
      name: "Edit counterbid 2 in Honeycomb Cooperative"
    });
    expect(ownFiling.getAttribute("aria-pressed")).toBe("true");
    expect(ownFiling.closest("li")?.classList.contains("bid-line-selected")).toBe(
      true
    );
    fireEvent.click(ownFiling);
    expect(onSelectCounterbid).toHaveBeenCalledWith({
      contestId: "honeycomb",
      slotIndex: 1
    });
    expect(
      within(container).getByText(/Turing/).closest("li")?.querySelector("button")
    ).toBeNull();
  });

  it("hydrates the counterbid desk from a clicked owned filing", async () => {
    const ownSeat = {
      id: "seat-a",
      displayName: "Ada",
      controller: "human",
      position: 0,
      firmIds: ["one-fell-swoop"],
      points: 5,
      reserve: {
        leverage: 3,
        bluff: 2,
        operations: { organise: 2, rally: 0, smear: 0, court: 0 }
      },
      scoringCardIds: [[], [], []]
    };
    render(
      <GameDesk
        view={{
          playerCount: 2,
          round: 1,
          electionNumber: 0,
          phase: "counterbidding",
          phaseData: {},
          deadlineAt: null,
          nextFirstOpenerSeatId: "seat-a",
          seats: [ownSeat],
          partyOrder: [...TEST_PARTY_ORDER],
          support: {},
          courtSupport: {},
          coalitionTargets: {},
          contests: { honeycomb: {}, "old-shell": {} },
          bids: [
            {
              id: "bid-1",
              contestId: "honeycomb",
              ownerSeatId: "seat-a",
              firmId: "one-fell-swoop",
              kind: "counterbid",
              slotIndex: 0,
              status: "active",
              leverage: 1,
              bluff: 0,
              operations: { organise: 0, rally: 0, smear: 0, court: 0 },
              cardCount: 1
            },
            {
              id: "bid-2",
              contestId: "old-shell",
              ownerSeatId: "seat-a",
              firmId: "one-fell-swoop",
              kind: "counterbid",
              slotIndex: 1,
              status: "active",
              leverage: 2,
              bluff: 1,
              operations: { organise: 1, rally: 0, smear: 0, court: 0 },
              cardCount: 4
            }
          ],
          readySeatIds: [],
          pendingDecision: null,
          counterbidSlots: ["bid-1", "bid-2"],
          electionHistory: [],
          chat: []
        } as never}
        ownSeat={ownSeat as never}
        ownSeatId="seat-a"
        spectator={false}
        busy={false}
        onCommand={async () => undefined}
      />
    );

    await waitFor(() =>
      expect((screen.getByLabelText("Hidden Leverage") as HTMLSelectElement).value).toBe("1")
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit counterbid 2 in Old Shell Union"
      })
    );
    await waitFor(() =>
      expect((screen.getByLabelText("Counterbid card") as HTMLSelectElement).value).toBe("1")
    );
    expect((screen.getByLabelText("Contest") as HTMLSelectElement).value).toBe(
      "old-shell"
    );
    expect((screen.getByLabelText("Hidden Leverage") as HTMLSelectElement).value).toBe(
      "2"
    );
    expect(
      screen
        .getByRole("button", { name: "Edit counterbid 2 in Old Shell Union" })
        .getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("keeps the Pecking Order contest visually neutral", () => {
    const { container } = render(
      <ContestCard
        contestId="pecking-order"
        seats={[]}
        bids={[]}
      />
    );

    const contest = within(container).getByRole("article");
    expect(contest.classList.contains("contest-card-neutral")).toBe(true);
    expect(contest.classList.contains("contest-card-party")).toBe(false);
    expect(contest.style.getPropertyValue("--contest-party")).toBe("");
  });

  it("orders every party contest by the live Pecking Order", () => {
    const contests = {
      foxglove: {},
      "pecking-order": {},
      honeycomb: {},
      "old-shell": {},
      "unknown-contest": {}
    };

    expect(orderedContestIds(
      contests,
      ["old-shell", "honeycomb", "foxglove"] as const
    )).toEqual([
      "pecking-order",
      "old-shell",
      "honeycomb",
      "foxglove"
    ]);
    expect(orderedContestIds(
      contests,
      ["foxglove", "old-shell", "honeycomb"] as const
    )).toEqual([
      "pecking-order",
      "foxglove",
      "old-shell",
      "honeycomb"
    ]);
  });

  it("does not fabricate operation inventory from obsolete decision fields", () => {
    render(
      <OperationForm
        view={{} as never}
        busy={false}
        decision={{
          id: "decision-1",
          partyId: "honeycomb",
          legalOperations: ["organise"]
        }}
        decisionId="decision-1"
        onCommand={async () => undefined}
      />
    );

    expect(screen.getByRole("alert").textContent).toMatch(
      /operation inventory is unavailable/i
    );
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("files one low-player opening per turn", () => {
    const onCommand = vi.fn(async () => undefined);
    const { container } = render(
      <OpeningForm
        view={{ playerCount: 2, contests: {} } as never}
        seat={{
          firmIds: ["one-fell-swoop"],
          reserve: {
            leverage: 3,
            bluff: 2,
            operations: { organise: 2, rally: 0, smear: 0, court: 0 }
          }
        } as never}
        busy={false}
        onCommand={onCommand}
      />
    );

    const form = within(container);
    const leverage = form.getByLabelText("Leverage") as HTMLSelectElement;
    expect([...leverage.options].map((option) => option.value)).toEqual(["1", "2", "3"]);
    fireEvent.change(leverage, { target: { value: "2" } });

    fireEvent.change(form.getByLabelText("Face-down Bluff"), {
      target: { value: "2" }
    });
    expect(form.getByText(/as One Fell Swoop Public Affairs/i)).toBeTruthy();
    expect(form.queryByText(/Pairliament Partners/i)).toBeNull();

    fireEvent.click(form.getByRole("button", { name: /file opening bid/i }));
    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({
        openings: [expect.objectContaining({
          firmId: "one-fell-swoop",
          leverage: 2,
          bluff: 2
        })]
      })
    }));
  });

  it("applies party shortcuts to the current opening", async () => {
    const view = { playerCount: 2, contests: {} };
    const seat = {
      firmIds: ["one-fell-swoop"],
      reserve: {
        leverage: 3,
        bluff: 0,
        operations: { organise: 0, rally: 0, smear: 0, court: 0 }
      }
    };
    const { container, rerender } = render(
      <OpeningForm
        view={view as never}
        seat={seat as never}
        busy={false}
        onCommand={async () => undefined}
      />
    );

    const form = within(container);
    const party = form.getByLabelText("Party") as HTMLSelectElement;
    rerender(
      <OpeningForm
        view={view as never}
        seat={seat as never}
        busy={false}
        partySelection={{ value: "riverworks", revision: 1 }}
        onCommand={async () => undefined}
      />
    );
    await waitFor(() => expect(party.value).toBe("riverworks"));
    rerender(
      <OpeningForm
        view={view as never}
        seat={seat as never}
        busy={false}
        partySelection={{ value: "foxglove", revision: 2 }}
        onCommand={async () => undefined}
      />
    );
    await waitFor(() => expect(party.value).toBe("foxglove"));
  });

  it("rotates the points ledger to Early Bird and shows snake progress", () => {
    const seats = [
      {
        id: "seat-a",
        displayName: "Ada",
        controller: "human" as const,
        position: 0,
        firmIds: ["one-fell-swoop"],
        points: 10,
        reserve: null,
        scoringCardIds: null
      },
      {
        id: "seat-b",
        displayName: "Bert",
        controller: "human" as const,
        position: 1,
        firmIds: ["pairliament"],
        points: 8,
        reserve: null,
        scoringCardIds: null
      },
      {
        id: "seat-c",
        displayName: "Cy",
        controller: "human" as const,
        position: 2,
        firmIds: ["triumvirat"],
        points: 6,
        reserve: null,
        scoringCardIds: null
      }
    ];
    const { rerender } = render(
      <PlayerLedger
        seats={seats as never}
        readySeatIds={[]}
        showReadiness={false}
        firstSeatId="seat-c"
        openingProgress={{
          activeSeatId: "seat-b",
          turnSeatIds: [
            "seat-c",
            "seat-a",
            "seat-b",
            "seat-b",
            "seat-a",
            "seat-c"
          ],
          turnIndex: 2
        }}
      />
    );

    const cards = screen.getByLabelText(
      "Opening order, player identities, points, and readiness"
    ).querySelectorAll("article");
    expect([...cards].map((card) => card.textContent)).toEqual([
      expect.stringMatching(/Cy.*Opening 1 · turns 1 & 6.*Waiting · 1\/2 filed/i),
      expect.stringMatching(/Ada.*Opening 2 · turns 2 & 5.*Waiting · 1\/2 filed/i),
      expect.stringMatching(/Bert.*Opening 3 · turns 3 & 4.*Now filing · 0\/2 filed/i)
    ]);
    expect(screen.getByText("Opening order · snake")).toBeTruthy();
    expect(screen.getByText("Early Bird first")).toBeTruthy();

    rerender(
      <PlayerLedger
        seats={seats as never}
        readySeatIds={[]}
        showReadiness={false}
        firstSeatId="seat-c"
      />
    );
    const retainedCards = screen.getByLabelText(
      "Opening order, player identities, points, and readiness"
    ).querySelectorAll("article");
    expect([...retainedCards].map((card) => card.textContent)).toEqual([
      expect.stringMatching(/Cy.*Opening 1 · turns 1 & 6/i),
      expect.stringMatching(/Ada.*Opening 2 · turns 2 & 5/i),
      expect.stringMatching(/Bert.*Opening 3 · turns 3 & 4/i)
    ]);
    expect(screen.queryByText(/Now filing/i)).toBeNull();

    rerender(
      <PlayerLedger
        seats={seats as never}
        readySeatIds={[]}
        showReadiness={false}
        firstSeatId="missing-seat"
      />
    );
    const fallbackCards = screen.getByLabelText(
      "Opening order, player identities, points, and readiness"
    ).querySelectorAll("article");
    expect([...fallbackCards].map((card) => card.textContent)).toEqual([
      expect.stringMatching(/Ada.*Opening 1 · turns 1 & 6/i),
      expect.stringMatching(/Bert.*Opening 2 · turns 2 & 5/i),
      expect.stringMatching(/Cy.*Opening 3 · turns 3 & 4/i)
    ]);
  });

  it("resets the opening draft when the same turn-around player acts again", () => {
    const baseProps = {
      view: {
        playerCount: 2,
        phase: "opening",
        phaseData: {
          activeSeatId: "seat-b",
          turnSeatIds: ["seat-a", "seat-b", "seat-b", "seat-a"],
          turnIndex: 1
        },
        seats: [
          { id: "seat-a", displayName: "Ada" },
          { id: "seat-b", displayName: "Bert" }
        ],
        contests: {},
        pendingDecision: null
      } as never,
      seat: {
        firmIds: ["one-fell-swoop"],
        reserve: {
          leverage: 3,
          bluff: 0,
          operations: { organise: 0, rally: 0, smear: 0, court: 0 }
        }
      } as never,
      seatId: "seat-b",
      busy: false,
      ownReady: false,
      openingPartyIntent: null,
      onOpeningDraftChange: vi.fn(),
      counterbidContestIntent: null,
      counterbidDraftSummary: {
        contestId: null,
        slotIndex: 0,
        placed: false,
        dirty: false
      },
      onCounterbidDraftChange: vi.fn(),
      onCommand: vi.fn(async () => undefined)
    };
    const { rerender } = render(<ActionDesk {...baseProps} />);

    fireEvent.change(screen.getByLabelText("Party"), {
      target: { value: "riverworks" }
    });
    expect((screen.getByLabelText("Party") as HTMLSelectElement).value).toBe(
      "riverworks"
    );

    rerender(
      <ActionDesk
        {...baseProps}
        view={{
          ...baseProps.view,
          phaseData: { ...baseProps.view.phaseData, turnIndex: 2 }
        } as never}
      />
    );

    expect((screen.getByLabelText("Party") as HTMLSelectElement).value).toBe(
      "honeycomb"
    );
  });

  it("rebuilds the active opening after same-turn reserve gifts", () => {
    const baseProps = {
      view: {
        playerCount: 2,
        phase: "opening",
        phaseData: {
          activeSeatId: "seat-b",
          turnSeatIds: ["seat-a", "seat-b", "seat-b", "seat-a"],
          turnIndex: 1
        },
        seats: [
          { id: "seat-a", displayName: "Ada" },
          { id: "seat-b", displayName: "Bert" }
        ],
        contests: {},
        pendingDecision: null
      } as never,
      seat: {
        firmIds: ["one-fell-swoop"],
        reserve: {
          leverage: 0,
          bluff: 0,
          operations: { organise: 0, rally: 0, smear: 0, court: 0 }
        }
      } as never,
      seatId: "seat-b",
      busy: false,
      ownReady: false,
      openingPartyIntent: null,
      onOpeningDraftChange: vi.fn(),
      counterbidContestIntent: null,
      counterbidDraftSummary: {
        contestId: null,
        slotIndex: 0,
        placed: false,
        dirty: false
      },
      onCounterbidDraftChange: vi.fn(),
      onCommand: vi.fn(async () => undefined)
    };
    const { rerender } = render(<ActionDesk {...baseProps} />);

    expect(screen.getByRole("button", { name: /pass opening turn/i })).toBeTruthy();
    expect(screen.queryByLabelText("Party")).toBeNull();

    rerender(
      <ActionDesk
        {...baseProps}
        seat={{
          ...baseProps.seat,
          reserve: { ...baseProps.seat.reserve, leverage: 1 }
        } as never}
      />
    );
    expect(screen.getByLabelText("Party")).toBeTruthy();
    expect(screen.getByRole("button", { name: /file opening bid/i })).toBeTruthy();

    rerender(
      <ActionDesk
        {...baseProps}
        seat={{
          ...baseProps.seat,
          reserve: {
            leverage: 3,
            bluff: 2,
            operations: { organise: 2, rally: 0, smear: 0, court: 0 }
          }
        } as never}
      />
    );
    fireEvent.change(screen.getByLabelText("Leverage"), {
      target: { value: "3" }
    });
    fireEvent.change(screen.getByLabelText("Face-down Bluff"), {
      target: { value: "2" }
    });
    fireEvent.change(screen.getByLabelText("organise"), {
      target: { value: "2" }
    });
    expect((screen.getByLabelText("Leverage") as HTMLSelectElement).value).toBe("3");

    rerender(
      <ActionDesk
        {...baseProps}
        seat={{
          ...baseProps.seat,
          reserve: {
            leverage: 1,
            bluff: 0,
            operations: { organise: 0, rally: 0, smear: 0, court: 0 }
          }
        } as never}
      />
    );
    expect((screen.getByLabelText("Leverage") as HTMLSelectElement).value).toBe("1");
    expect((screen.getByLabelText("Face-down Bluff") as HTMLSelectElement).value).toBe("0");
    expect((screen.getByLabelText("organise") as HTMLSelectElement).value).toBe("0");

    rerender(<ActionDesk {...baseProps} />);
    expect(screen.getByRole("button", { name: /pass opening turn/i })).toBeTruthy();
    expect(screen.queryByLabelText("Party")).toBeNull();
  });

  it("does not replay an opening shortcut when the form remounts", () => {
    const { container } = render(
      <OpeningForm
        view={{ contests: {} } as never}
        seat={{
          firmIds: ["one-fell-swoop"],
          reserve: {
            leverage: 1,
            bluff: 0,
            operations: { organise: 0, rally: 0, smear: 0, court: 0 }
          }
        } as never}
        busy={false}
        partySelection={{ value: "riverworks", revision: 3 }}
        onCommand={async () => undefined}
      />
    );

    expect(
      (within(container).getByLabelText("Party") as HTMLSelectElement).value
    ).toBe("honeycomb");
  });

  it("makes assigned opening parties unavailable from the party summaries", () => {
    const onSelect = vi.fn();
    render(
      <PartyRail
        view={{
          partyOrder: ["honeycomb", "old-shell", "foxglove"],
          coalitionTargets: {},
          courtSupport: {}
        } as never}
        interaction={{
          activePartyId: "honeycomb",
          assignedPartyIds: ["honeycomb", "old-shell"],
          onSelect
        }}
      />
    );

    const assigned = screen.getByRole("button", {
      name: /old shell.*assigned to another opening bid/i
    });
    expect(assigned.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(assigned);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /foxglove/i }));
    expect(onSelect).toHaveBeenCalledWith("foxglove");
  });

  it("returns the selected counterbid stack to its available select limits", async () => {
    const view = {
      partyOrder: TEST_PARTY_ORDER,
      contests: { honeycomb: {} },
      counterbidSlots: ["bid-1", null],
      bids: [{
        id: "bid-1",
        contestId: "honeycomb",
        leverage: 3,
        bluff: 1,
        operations: { organise: 1, rally: 0, smear: 0, court: 0 }
      }]
    };
    const seat = {
      firmIds: ["one-fell-swoop"],
      reserve: {
        leverage: 2,
        bluff: 2,
        operations: { organise: 2, rally: 0, smear: 0, court: 0 }
      }
    };
    const { container, rerender } = render(
      <CounterbidForm
        view={view as never}
        seat={seat as never}
        busy={false}
        onCommand={async () => undefined}
      />
    );

    const form = within(container);
    const leverage = form.getByLabelText("Hidden Leverage") as HTMLSelectElement;
    await waitFor(() => expect(leverage.value).toBe("3"));
    expect([...leverage.options].map((option) => option.value)).toEqual([
      "0", "1", "2", "3", "4", "5"
    ]);
    const organise = form.getByLabelText("organise") as HTMLSelectElement;
    expect([...organise.options].map((option) => option.value)).toEqual([
      "0", "1", "2", "3"
    ]);
    fireEvent.change(leverage, { target: { value: "4" } });
    rerender(
      <CounterbidForm
        view={{ ...view, bids: view.bids.map((bid) => ({ ...bid })) } as never}
        seat={{ ...seat, reserve: { ...seat.reserve } } as never}
        busy={false}
        onCommand={async () => undefined}
      />
    );
    expect(leverage.value).toBe("4");
  });

  it("targets a clicked contest with the first unused counterbid", async () => {
    const view = {
      partyOrder: TEST_PARTY_ORDER,
      contests: { honeycomb: {}, "old-shell": {} },
      counterbidSlots: ["bid-1", null],
      bids: [{
        id: "bid-1",
        contestId: "honeycomb",
        leverage: 3,
        bluff: 0,
        operations: { organise: 0, rally: 0, smear: 0, court: 0 }
      }]
    };
    const seat = {
      firmIds: ["one-fell-swoop"],
      reserve: {
        leverage: 2,
        bluff: 0,
        operations: { organise: 0, rally: 0, smear: 0, court: 0 }
      }
    };
    const { container, rerender } = render(
      <CounterbidForm
        view={view as never}
        seat={seat as never}
        busy={false}
        onCommand={async () => undefined}
      />
    );
    const form = within(container);
    await waitFor(() => expect((form.getByLabelText("Hidden Leverage") as HTMLSelectElement).value).toBe("3"));

    rerender(
      <CounterbidForm
        view={view as never}
        seat={seat as never}
        busy={false}
        contestSelection={{ value: "old-shell", revision: 1 }}
        onCommand={async () => undefined}
      />
    );

    await waitFor(() => expect((form.getByLabelText("Counterbid card") as HTMLSelectElement).value).toBe("1"));
    expect((form.getByLabelText("Contest") as HTMLSelectElement).value).toBe("old-shell");
    expect(form.getByRole("status").textContent).toMatch(/unused counterbid 2 selected/i);
  });

  it("selects and hydrates an exact placed counterbid filing", async () => {
    const view = {
      partyOrder: TEST_PARTY_ORDER,
      contests: { honeycomb: {}, "old-shell": {} },
      counterbidSlots: ["bid-1", "bid-2"],
      bids: [
        {
          id: "bid-1",
          contestId: "honeycomb",
          leverage: 1,
          bluff: 0,
          operations: { organise: 0, rally: 0, smear: 0, court: 0 }
        },
        {
          id: "bid-2",
          contestId: "old-shell",
          leverage: 2,
          bluff: 1,
          operations: { organise: 1, rally: 0, smear: 0, court: 0 }
        }
      ]
    };
    const seat = {
      firmIds: ["one-fell-swoop"],
      reserve: {
        leverage: 3,
        bluff: 2,
        operations: { organise: 2, rally: 0, smear: 0, court: 0 }
      }
    };
    const { container, rerender } = render(
      <CounterbidForm
        view={view as never}
        seat={seat as never}
        busy={false}
        onCommand={async () => undefined}
      />
    );
    const form = within(container);
    await waitFor(() =>
      expect((form.getByLabelText("Hidden Leverage") as HTMLSelectElement).value).toBe("1")
    );

    rerender(
      <CounterbidForm
        view={view as never}
        seat={seat as never}
        busy={false}
        contestSelection={{
          value: { contestId: "old-shell", slotIndex: 1 },
          revision: 1
        }}
        onCommand={async () => undefined}
      />
    );

    await waitFor(() =>
      expect((form.getByLabelText("Counterbid card") as HTMLSelectElement).value).toBe("1")
    );
    expect((form.getByLabelText("Contest") as HTMLSelectElement).value).toBe(
      "old-shell"
    );
    expect((form.getByLabelText("Hidden Leverage") as HTMLSelectElement).value).toBe(
      "2"
    );
    expect((form.getByLabelText("Hidden Bluff") as HTMLSelectElement).value).toBe(
      "1"
    );
    expect((form.getByLabelText("organise") as HTMLSelectElement).value).toBe(
      "1"
    );
    expect(form.getByRole("status").textContent).toMatch(
      /counterbid 2 selected from old shell union/i
    );
  });

  it("keeps a dirty draft when another placed filing is clicked", async () => {
    const view = {
      partyOrder: TEST_PARTY_ORDER,
      contests: { honeycomb: {}, "old-shell": {} },
      counterbidSlots: ["bid-1", "bid-2"],
      bids: [
        {
          id: "bid-1",
          contestId: "honeycomb",
          leverage: 1,
          bluff: 0,
          operations: { organise: 0, rally: 0, smear: 0, court: 0 }
        },
        {
          id: "bid-2",
          contestId: "old-shell",
          leverage: 2,
          bluff: 0,
          operations: { organise: 0, rally: 0, smear: 0, court: 0 }
        }
      ]
    };
    const seat = {
      firmIds: ["one-fell-swoop"],
      reserve: {
        leverage: 3,
        bluff: 0,
        operations: { organise: 0, rally: 0, smear: 0, court: 0 }
      }
    };
    const { container, rerender } = render(
      <CounterbidForm
        view={view as never}
        seat={seat as never}
        busy={false}
        onCommand={async () => undefined}
      />
    );
    const form = within(container);
    await waitFor(() =>
      expect((form.getByLabelText("Hidden Leverage") as HTMLSelectElement).value).toBe("1")
    );
    fireEvent.change(form.getByLabelText("Hidden Leverage"), {
      target: { value: "3" }
    });

    rerender(
      <CounterbidForm
        view={view as never}
        seat={seat as never}
        busy={false}
        contestSelection={{
          value: { contestId: "old-shell", slotIndex: 1 },
          revision: 1
        }}
        onCommand={async () => undefined}
      />
    );

    expect((form.getByLabelText("Counterbid card") as HTMLSelectElement).value).toBe(
      "0"
    );
    expect((form.getByLabelText("Hidden Leverage") as HTMLSelectElement).value).toBe(
      "3"
    );
    expect(form.getByRole("status").textContent).toMatch(
      /apply or reset the unsaved edits before choosing another counterbid/i
    );
  });

  it("labels all four low-player counterbid cards with one firm", () => {
    const { container } = render(
      <CounterbidForm
        view={{
          partyOrder: TEST_PARTY_ORDER,
          contests: { honeycomb: {} },
          counterbidSlots: [null, null, null, null],
          bids: []
        } as never}
        seat={{
          firmIds: ["one-fell-swoop"],
          reserve: {
            leverage: 20,
            bluff: 8,
            operations: { organise: 4, rally: 8, smear: 4, court: 4 }
          }
        } as never}
        busy={false}
        onCommand={async () => undefined}
      />
    );

    const options = [
      ...(within(container).getByLabelText("Counterbid card") as HTMLSelectElement).options
    ].map((option) => option.textContent);
    expect(options).toEqual([
      "1 · counterbid 1",
      "1 · counterbid 2",
      "1 · counterbid 3",
      "1 · counterbid 4"
    ]);
  });

  it("announces the absolute number of a shortcut-selected low-player counterbid", async () => {
    const view = {
      partyOrder: TEST_PARTY_ORDER,
      contests: { honeycomb: {}, "old-shell": {} },
      counterbidSlots: ["bid-1", "bid-2", null, null],
      bids: [{
        id: "bid-1",
        contestId: "honeycomb",
        leverage: 1,
        bluff: 0,
        operations: { organise: 0, rally: 0, smear: 0, court: 0 }
      }]
    };
    const seat = {
      firmIds: ["one-fell-swoop"],
      reserve: {
        leverage: 20,
        bluff: 8,
        operations: { organise: 4, rally: 8, smear: 4, court: 4 }
      }
    };
    const { container, rerender } = render(
      <CounterbidForm
        view={view as never}
        seat={seat as never}
        busy={false}
        onCommand={async () => undefined}
      />
    );
    const form = within(container);
    await waitFor(() =>
      expect((form.getByLabelText("Hidden Leverage") as HTMLSelectElement).value).toBe("1")
    );

    rerender(
      <CounterbidForm
        view={view as never}
        seat={seat as never}
        busy={false}
        contestSelection={{ value: "old-shell", revision: 1 }}
        onCommand={async () => undefined}
      />
    );

    await waitFor(() =>
      expect((form.getByLabelText("Counterbid card") as HTMLSelectElement).value).toBe("2")
    );
    expect(form.getByRole("status").textContent).toMatch(/unused counterbid 3 selected/i);
  });

  it("does not replay a counterbid shortcut when the form remounts", () => {
    const { container } = render(
      <CounterbidForm
        view={{
          partyOrder: TEST_PARTY_ORDER,
          contests: { honeycomb: {}, "old-shell": {} },
          counterbidSlots: [null, null],
          bids: []
        } as never}
        seat={{
          firmIds: ["one-fell-swoop"],
          reserve: {
            leverage: 1,
            bluff: 0,
            operations: { organise: 0, rally: 0, smear: 0, court: 0 }
          }
        } as never}
        busy={false}
        contestSelection={{ value: "old-shell", revision: 4 }}
        onCommand={async () => undefined}
      />
    );

    expect(
      (within(container).getByLabelText("Contest") as HTMLSelectElement).value
    ).toBe("honeycomb");
  });

  it("treats an unused counterbid target as an unsaved edit", async () => {
    const onDraftStateChange = vi.fn();
    const { container } = render(
      <CounterbidForm
        view={{
          partyOrder: TEST_PARTY_ORDER,
          contests: { honeycomb: {}, "old-shell": {} },
          counterbidSlots: [null, null],
          bids: []
        } as never}
        seat={{
          firmIds: ["one-fell-swoop"],
          reserve: {
            leverage: 1,
            bluff: 0,
            operations: { organise: 0, rally: 0, smear: 0, court: 0 }
          }
        } as never}
        busy={false}
        onDraftStateChange={onDraftStateChange}
        onCommand={async () => undefined}
      />
    );
    const form = within(container);

    fireEvent.change(form.getByLabelText("Contest"), {
      target: { value: "old-shell" }
    });
    await waitFor(() =>
      expect(onDraftStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ dirty: true, contestId: "old-shell" })
      )
    );
    fireEvent.change(form.getByLabelText("Counterbid card"), {
      target: { value: "1" }
    });
    expect(
      (form.getByLabelText("Counterbid card") as HTMLSelectElement).value
    ).toBe("0");
    fireEvent.click(form.getByRole("button", { name: /reset unsaved edits/i }));
    expect((form.getByLabelText("Contest") as HTMLSelectElement).value).toBe(
      "honeycomb"
    );
  });

  it("prevents locking while a counterbid draft has unsaved edits", () => {
    const baseProps = {
      view: {
        phase: "counterbidding",
        pendingDecision: null,
        partyOrder: TEST_PARTY_ORDER,
        contests: { honeycomb: {} },
        counterbidSlots: [null, null],
        bids: []
      } as never,
      seat: {
        firmIds: ["one-fell-swoop"],
        reserve: {
          leverage: 1,
          bluff: 0,
          operations: { organise: 0, rally: 0, smear: 0, court: 0 }
        }
      } as never,
      seatId: "seat-a",
      busy: false,
      openingPartyIntent: null,
      onOpeningDraftChange: vi.fn(),
      counterbidContestIntent: null,
      onCounterbidDraftChange: vi.fn(),
      onCommand: vi.fn(async () => undefined)
    };
    const { rerender } = render(
      <ActionDesk
        {...baseProps}
        ownReady={false}
        counterbidDraftSummary={{
          contestId: "old-shell",
          slotIndex: 0,
          placed: false,
          dirty: true
        }}
      />
    );

    expect(
      (screen.getByRole("button", { name: /lock counterbids/i }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      screen.getByText(/current counterbid edits before locking/i)
    ).toBeTruthy();

    rerender(
      <ActionDesk
        {...baseProps}
        ownReady
        counterbidDraftSummary={{
          contestId: "old-shell",
          slotIndex: 0,
          placed: false,
          dirty: true
        }}
      />
    );
    expect(
      (screen.getByRole("button", { name: /unready & revise/i }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it("lists remaining operation cards as radios and applies armed map choices", async () => {
    const onCommand = vi.fn(async () => undefined);
    const onResolutionMapStateChange = vi.fn();
    const decision = {
      id: "decision-1",
      kind: "party_operation",
      contestId: "honeycomb",
      partyId: "honeycomb",
      legalOperations: ["organise", "rally"],
      availableBonusOperations: ["organise", "rally"],
      availableOperations: [
        { operation: "organise", count: 1 },
        { operation: "rally", count: 3 }
      ]
    };
    const baseProps = {
      view: {
        support: { harbormouth: { honeycomb: 1 } },
        courtSupport: {},
        coalitionTargets: {}
      } as never,
      busy: false,
      decision,
      decisionId: "decision-1",
      onResolutionMapStateChange,
      onCommand
    };
    const { container, rerender } = render(<OperationForm {...baseProps} />);
    const form = within(container);
    const organise = form.getByRole("radio", { name: /1 O.*Organise/i });
    const rally = form.getByRole("radio", { name: /3 R.*Rally/i });

    expect((organise as HTMLInputElement).checked).toBe(true);
    expect((rally as HTMLInputElement).checked).toBe(false);
    expect((form.getByLabelText("Destination district") as HTMLSelectElement).value).toBe("");
    expect((form.getByRole("button", { name: /resolve operation/i }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() =>
      expect(onResolutionMapStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ activeTarget: "source" })
      )
    );

    fireEvent.click(rally);
    await waitFor(() =>
      expect(onResolutionMapStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ activeTarget: "district" })
      )
    );
    fireEvent.click(organise);
    await waitFor(() =>
      expect(onResolutionMapStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ activeTarget: "source" })
      )
    );

    rerender(
      <OperationForm
        {...baseProps}
        resolutionDistrictIntent={{
          decisionId: "decision-1",
          value: "harbormouth",
          revision: 1
        }}
      />
    );
    await waitFor(() =>
      expect((form.getByLabelText("Source district (required)") as HTMLSelectElement).value).toBe("harbormouth")
    );
    await waitFor(() =>
      expect(onResolutionMapStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ activeTarget: "destination" })
      )
    );
    rerender(
      <OperationForm
        {...baseProps}
        resolutionDistrictIntent={{
          decisionId: "decision-1",
          value: "millbank",
          revision: 2
        }}
      />
    );
    await waitFor(() =>
      expect((form.getByLabelText("Destination district") as HTMLSelectElement).value).toBe("millbank")
    );
    fireEvent.click(form.getByRole("button", { name: /resolve operation/i }));
    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({
        operation: "organise",
        choice: expect.objectContaining({
          operation: "organise",
          sourceDistrictId: "harbormouth",
          destinationDistrictId: "millbank"
        })
      })
    }));

    rerender(
      <OperationForm
        {...baseProps}
        decision={{
          ...decision,
          availableOperations: [{ operation: "rally", count: 2 }],
          legalOperations: ["rally"]
        }}
      />
    );
    expect(
      (form.getByRole("radio", { name: /2 R.*Rally/i }) as HTMLInputElement)
        .checked
    ).toBe(true);
    expect(form.queryByRole("radio", { name: /Organise/i })).toBeNull();
  });

  it("disables illegal Organise and Smear parameters", async () => {
    const onCommand = vi.fn(async () => undefined);
    const view = {
      support: {
        harbormouth: { honeycomb: 1, "old-shell": 1 }
      },
      courtSupport: {},
      coalitionTargets: {}
    } as never;
    const { container, rerender } = render(
      <OperationForm
        view={view}
        busy={false}
        decision={{
          id: "decision-1",
          kind: "party_operation",
          contestId: "honeycomb",
          partyId: "honeycomb",
          availableBonusOperations: [],
          availableOperations: [{ operation: "organise", count: 1 }]
        }}
        decisionId="decision-1"
        onCommand={onCommand}
      />
    );
    const form = within(container);
    fireEvent.change(form.getByLabelText("Source district (required)"), {
      target: { value: "harbormouth" }
    });
    const destination = form.getByLabelText(
      "Destination district"
    ) as HTMLSelectElement;
    expect(
      [...destination.options].find((option) => option.value === "northreach")
        ?.disabled
    ).toBe(true);
    expect(
      [...destination.options].find((option) => option.value === "millbank")
        ?.disabled
    ).toBe(false);
    fireEvent.change(destination, { target: { value: "northreach" } });
    expect(
      (form.getByRole("button", { name: /resolve operation/i }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    rerender(
      <OperationForm
        view={view}
        busy={false}
        decision={{
          id: "decision-2",
          kind: "party_operation",
          contestId: "honeycomb",
          partyId: "honeycomb",
          availableBonusOperations: [],
          availableOperations: [{ operation: "smear", count: 1 }]
        }}
        decisionId="decision-2"
        onCommand={onCommand}
      />
    );
    fireEvent.change(form.getByLabelText("District"), {
      target: { value: "northreach" }
    });
    const rival = form.getByLabelText("Rival party") as HTMLSelectElement;
    expect(
      [...rival.options].find((option) => option.value === "old-shell")
        ?.disabled
    ).toBe(true);
    expect(
      (form.getByRole("button", { name: /resolve operation/i }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("rejects immediate bonuses when their extra effect cannot resolve", () => {
    const onCommand = vi.fn(async () => undefined);
    const { container, rerender } = render(
      <OperationForm
        key="honeycomb"
        view={{
          support: {
            harbormouth: { honeycomb: 1 },
            millbank: { foxglove: 3 }
          },
          courtSupport: {},
          coalitionTargets: {}
        } as never}
        busy={false}
        decision={{
          id: "decision-1",
          kind: "party_operation",
          contestId: "honeycomb",
          partyId: "honeycomb",
          availableBonusOperations: ["organise"],
          availableOperations: [{ operation: "organise", count: 1 }]
        }}
        decisionId="decision-1"
        onCommand={onCommand}
      />
    );
    const form = within(container);
    fireEvent.change(form.getByLabelText("Source district (required)"), {
      target: { value: "harbormouth" }
    });
    fireEvent.change(form.getByLabelText("Destination district"), {
      target: { value: "millbank" }
    });
    fireEvent.click(
      form.getByRole("checkbox", { name: /claim waggle route/i })
    );
    expect(
      (form.getByRole("button", { name: /resolve operation/i }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    rerender(
      <OperationForm
        key="old-shell"
        view={{
          support: { harbormouth: { "old-shell": 1, foxglove: 1 } },
          courtSupport: {},
          coalitionTargets: {}
        } as never}
        busy={false}
        decision={{
          id: "decision-2",
          kind: "party_operation",
          contestId: "old-shell",
          partyId: "old-shell",
          availableBonusOperations: ["smear"],
          availableOperations: [{ operation: "smear", count: 1 }]
        }}
        decisionId="decision-2"
        onCommand={onCommand}
      />
    );
    fireEvent.change(form.getByLabelText("District"), {
      target: { value: "harbormouth" }
    });
    fireEvent.change(form.getByLabelText("Rival party"), {
      target: { value: "foxglove" }
    });
    fireEvent.click(form.getByRole("checkbox", { name: /claim stonewall/i }));
    expect(
      (form.getByRole("button", { name: /resolve operation/i }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("limits an immediate bonus district to choices where the bonus resolves", () => {
    const onCommand = vi.fn(async () => undefined);
    const { container } = render(
      <OperationForm
        view={{ support: {}, courtSupport: {}, coalitionTargets: {} } as never}
        busy={false}
        decision={{
          id: "decision-1",
          kind: "party_operation",
          contestId: "riverworks",
          partyId: "riverworks",
          availableBonusOperations: ["rally"],
          availableOperations: [{ operation: "rally", count: 1 }]
        }}
        decisionId="decision-1"
        onCommand={onCommand}
      />
    );
    const form = within(container);
    fireEvent.change(form.getByLabelText("District"), {
      target: { value: "harbormouth" }
    });
    fireEvent.click(
      form.getByRole("checkbox", { name: /claim public works/i })
    );
    const bonusDistrict = form.getByLabelText(
      "Bonus destination district"
    ) as HTMLSelectElement;
    expect(
      [...bonusDistrict.options].find((option) => option.value === "northreach")
        ?.disabled
    ).toBe(true);
    expect(
      [...bonusDistrict.options].find((option) => option.value === "millbank")
        ?.disabled
    ).toBe(false);
    fireEvent.change(bonusDistrict, { target: { value: "northreach" } });
    expect(
      (form.getByRole("button", { name: /resolve operation/i }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("requires every Scatter the Flock destination", () => {
    const onCommand = vi.fn(async () => undefined);
    const { container } = render(
      <OperationForm
        view={{
          support: { harbormouth: { "many-wings": 1 } },
          courtSupport: {},
          coalitionTargets: {}
        } as never}
        busy={false}
        decision={{
          id: "decision-1",
          kind: "party_operation",
          contestId: "many-wings",
          partyId: "many-wings",
          availableBonusOperations: ["rally"],
          availableOperations: [{ operation: "rally", count: 1 }]
        }}
        decisionId="decision-1"
        onCommand={onCommand}
      />
    );
    const form = within(container);
    fireEvent.change(form.getByLabelText("District"), {
      target: { value: "harbormouth" }
    });
    fireEvent.click(
      form.getByRole("checkbox", { name: /claim scatter the flock/i })
    );
    expect(
      (form.getByRole("button", { name: /resolve operation/i }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.click(form.getByRole("checkbox", { name: "Cloverfield" }));
    fireEvent.click(form.getByRole("checkbox", { name: "Millbank" }));
    expect(
      (form.getByRole("button", { name: /resolve operation/i }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it("submits Common Cause source and destination choices", async () => {
    const onCommand = vi.fn(async () => undefined);
    const { container } = render(
      <OperationForm
        view={{
          support: {
            harbormouth: { honeycomb: 1 },
            millbank: { foxglove: 1 }
          },
          courtSupport: {},
          coalitionTargets: {}
        } as never}
        busy={false}
        decision={{
          id: "decision-1",
          kind: "party_operation",
          contestId: "honeycomb",
          partyId: "honeycomb",
          availableBonusOperations: ["court"],
          availableOperations: [{ operation: "court", count: 1 }]
        }}
        decisionId="decision-1"
        onCommand={onCommand}
      />
    );
    const form = within(container);
    fireEvent.change(form.getByLabelText("Court space"), {
      target: { value: "foxglove" }
    });
    fireEvent.click(
      form.getByRole("checkbox", { name: /claim common cause/i })
    );
    fireEvent.change(form.getByLabelText("Bonus source district"), {
      target: { value: "harbormouth" }
    });
    fireEvent.change(form.getByLabelText("Bonus destination district"), {
      target: { value: "millbank" }
    });
    fireEvent.click(form.getByRole("button", { name: /resolve operation/i }));

    await waitFor(() => expect(onCommand).toHaveBeenCalledTimes(1));
    expect(onCommand).toHaveBeenCalledWith({
      type: "game_action",
      action: {
        type: "resolve_party_operation",
        decisionId: "decision-1",
        operation: "court",
        choice: {
          choice: {
            operation: "court",
            targetParty: "foxglove",
            bonusDistrictId: "millbank",
            bonusSourceDistrictId: "harbormouth"
          },
          claimBonus: true
        }
      }
    });
  });

  it("opens Canal Network destinations along supported routes", () => {
    const { container } = render(
      <OperationForm
        view={{
          support: {
            harbormouth: { riverworks: 1 },
            millbank: { riverworks: 1 }
          },
          courtSupport: {},
          coalitionTargets: {}
        } as never}
        busy={false}
        decision={{
          id: "decision-1",
          kind: "party_operation",
          contestId: "riverworks",
          partyId: "riverworks",
          availableBonusOperations: ["organise"],
          availableOperations: [{ operation: "organise", count: 1 }]
        }}
        decisionId="decision-1"
        onCommand={vi.fn(async () => undefined)}
      />
    );
    const form = within(container);
    fireEvent.change(form.getByLabelText("Source district (required)"), {
      target: { value: "harbormouth" }
    });
    const destination = form.getByLabelText(
      "Destination district"
    ) as HTMLSelectElement;
    expect(
      [...destination.options].find((option) => option.value === "reedwater")
        ?.disabled
    ).toBe(true);
    fireEvent.click(
      form.getByRole("checkbox", { name: /claim canal network/i })
    );
    expect(
      [...destination.options].find((option) => option.value === "reedwater")
        ?.disabled
    ).toBe(false);
  });

  it("collects Court-space choices for Whisper Network and Midnight Leak", async () => {
    const onCommand = vi.fn(async () => undefined);
    const { container, rerender } = render(
      <OperationForm
        key="foxglove"
        view={{
          support: {},
          courtSupport: { foxglove: { "old-shell": 1 } },
          coalitionTargets: { foxglove: "old-shell" }
        } as never}
        busy={false}
        decision={{
          id: "decision-1",
          kind: "party_operation",
          contestId: "foxglove",
          partyId: "foxglove",
          availableBonusOperations: ["court"],
          availableOperations: [{ operation: "court", count: 1 }]
        }}
        decisionId="decision-1"
        onCommand={onCommand}
      />
    );
    const form = within(container);
    fireEvent.click(
      form.getByRole("checkbox", { name: /claim whisper network/i })
    );
    const courtSource = form.getByLabelText(
      "Move Court Support from"
    ) as HTMLSelectElement;
    await waitFor(() => expect(courtSource.value).toBe("old-shell"));

    rerender(
      <OperationForm
        key="night"
        view={{
          support: { harbormouth: { "night-parliament": 1, foxglove: 1 } },
          courtSupport: { foxglove: { honeycomb: 1 } },
          coalitionTargets: { foxglove: "honeycomb" }
        } as never}
        busy={false}
        decision={{
          id: "decision-2",
          kind: "party_operation",
          contestId: "night-parliament",
          partyId: "night-parliament",
          availableBonusOperations: ["smear"],
          availableOperations: [{ operation: "smear", count: 1 }]
        }}
        decisionId="decision-2"
        onCommand={onCommand}
      />
    );
    fireEvent.change(form.getByLabelText("District"), {
      target: { value: "harbormouth" }
    });
    fireEvent.change(form.getByLabelText("Rival party"), {
      target: { value: "foxglove" }
    });
    fireEvent.click(
      form.getByRole("checkbox", { name: /claim midnight leak/i })
    );
    const courtTarget = form.getByLabelText(
      "Remove rival Court Support from"
    ) as HTMLSelectElement;
    await waitFor(() => expect(courtTarget.value).toBe("honeycomb"));
  });

  it("limits Night Shift to least-occupied legal Rally districts", () => {
    const { container } = render(
      <OperationForm
        view={{
          support: {
            harbormouth: { "night-parliament": 1, foxglove: 1 },
            millbank: { "night-parliament": 1 }
          },
          courtSupport: {},
          coalitionTargets: {}
        } as never}
        busy={false}
        decision={{
          id: "decision-1",
          kind: "night_delayed_operation",
          contestId: "night-parliament",
          partyId: "night-parliament",
          operation: "rally",
          availableOperations: [{ operation: "rally", count: 1 }]
        }}
        decisionId="decision-1"
        onCommand={vi.fn(async () => undefined)}
      />
    );
    const district = within(container).getByLabelText(
      "District"
    ) as HTMLSelectElement;
    expect(
      [...district.options].find((option) => option.value === "harbormouth")
        ?.disabled
    ).toBe(true);
    expect(
      [...district.options].find((option) => option.value === "millbank")
        ?.disabled
    ).toBe(false);
  });

  it("clears and removes a bonus choice after an earlier bid claims it", async () => {
    const onCommand = vi.fn(async () => undefined);
    const decision = {
      id: "decision-1",
      kind: "party_operation",
      contestId: "honeycomb",
      partyId: "honeycomb",
      legalOperations: ["organise"],
      availableBonusOperations: ["organise"],
      availableOperations: [{ operation: "organise", count: 1 }]
    };
    const baseProps = {
      view: {} as never,
      busy: false,
      decision,
      decisionId: "decision-1",
      onCommand
    };
    const { container, rerender } = render(<OperationForm {...baseProps} />);
    const form = within(container);
    const bonus = form.getByRole("checkbox", { name: /claim waggle route/i });

    fireEvent.click(bonus);
    expect((bonus as HTMLInputElement).checked).toBe(true);

    rerender(
      <OperationForm
        {...baseProps}
        decision={{ ...decision, availableBonusOperations: [] }}
      />
    );

    expect(form.queryByRole("checkbox", { name: /claim waggle route/i })).toBeNull();
    expect(form.getByText(/waggle route has already been claimed/i)).toBeTruthy();
    fireEvent.change(form.getByLabelText("Destination district"), {
      target: { value: "harbormouth" }
    });
    fireEvent.click(form.getByRole("button", { name: /resolve operation/i }));

    await waitFor(() => expect(onCommand).toHaveBeenCalledTimes(1));
    expect(onCommand).toHaveBeenCalledWith({
      type: "game_action",
      action: {
        type: "resolve_party_operation",
        decisionId: "decision-1",
        operation: "organise",
        choice: {
          operation: "organise",
          destinationDistrictId: "harbormouth"
        }
      }
    });
  });

  it("places the resolution desk immediately beneath the map", () => {
    const seat = {
      id: "seat-a",
      displayName: "Ada",
      controller: "human",
      position: 0,
      firmIds: ["one-fell-swoop"],
      points: 10,
      reserve: {
        leverage: 1,
        bluff: 0,
        operations: { organise: 0, rally: 0, smear: 0, court: 0 }
      },
      scoringCardIds: null
    };
    const { container } = render(
      <GameDesk
        view={{
          playerCount: 2,
          round: 1,
          electionNumber: 0,
          phase: "resolution",
          phaseData: {},
          deadlineAt: null,
          nextFirstOpenerSeatId: "seat-a",
          seats: [seat],
          partyOrder: ["honeycomb", "old-shell", "foxglove", "riverworks", "many-wings", "night-parliament"],
          support: {},
          courtSupport: {},
          coalitionTargets: {},
          contests: {},
          bids: [],
          readySeatIds: [],
          pendingDecision: null,
          counterbidSlots: [],
          electionHistory: [],
          chat: []
        } as never}
        ownSeat={seat as never}
        ownSeatId="seat-a"
        spectator={false}
        busy={false}
        onCommand={async () => undefined}
      />
    );
    const map = container.querySelector(".map-desk .district-map");
    const actionDesk = map?.nextElementSibling;

    expect(actionDesk?.classList.contains("action-compose")).toBe(true);
    expect(container.querySelector(".contest-desk .action-compose")).toBeNull();
  });

  it("blocks contest shortcuts until unsaved placed-bid edits are applied or reset", async () => {
    const view = {
      partyOrder: TEST_PARTY_ORDER,
      contests: { honeycomb: {}, "old-shell": {} },
      counterbidSlots: ["bid-1", null],
      bids: [{
        id: "bid-1",
        contestId: "honeycomb",
        leverage: 3,
        bluff: 0,
        operations: { organise: 0, rally: 0, smear: 0, court: 0 }
      }]
    };
    const seat = {
      firmIds: ["one-fell-swoop"],
      reserve: {
        leverage: 2,
        bluff: 0,
        operations: { organise: 0, rally: 0, smear: 0, court: 0 }
      }
    };
    const { container, rerender } = render(
      <CounterbidForm
        view={view as never}
        seat={seat as never}
        busy={false}
        onCommand={async () => undefined}
      />
    );
    const form = within(container);
    const leverage = form.getByLabelText("Hidden Leverage") as HTMLSelectElement;
    await waitFor(() => expect(leverage.value).toBe("3"));
    fireEvent.change(leverage, { target: { value: "4" } });

    rerender(
      <CounterbidForm
        view={view as never}
        seat={seat as never}
        busy={false}
        contestSelection={{ value: "old-shell", revision: 1 }}
        onCommand={async () => undefined}
      />
    );

    expect((form.getByLabelText("Counterbid card") as HTMLSelectElement).value).toBe("0");
    expect(form.getByRole("status").textContent).toMatch(/apply or reset/i);
    fireEvent.click(form.getByRole("button", { name: /reset unsaved edits/i }));
    expect(leverage.value).toBe("3");
  });

  it("keeps placed counterbids unchanged when no unused slot exists", async () => {
    const view = {
      partyOrder: TEST_PARTY_ORDER,
      contests: { honeycomb: {}, "old-shell": {} },
      counterbidSlots: ["bid-1", "bid-2"],
      bids: [
        { id: "bid-1", contestId: "honeycomb", leverage: 1, bluff: 0, operations: { organise: 0, rally: 0, smear: 0, court: 0 } },
        { id: "bid-2", contestId: "old-shell", leverage: 1, bluff: 0, operations: { organise: 0, rally: 0, smear: 0, court: 0 } }
      ]
    };
    const seat = {
      firmIds: ["one-fell-swoop"],
      reserve: { leverage: 2, bluff: 0, operations: { organise: 0, rally: 0, smear: 0, court: 0 } }
    };
    const { container, rerender } = render(
      <CounterbidForm
        view={view as never}
        seat={seat as never}
        busy={false}
        onCommand={async () => undefined}
      />
    );
    const form = within(container);
    await waitFor(() => expect((form.getByLabelText("Hidden Leverage") as HTMLSelectElement).value).toBe("1"));
    rerender(
      <CounterbidForm
        view={view as never}
        seat={seat as never}
        busy={false}
        contestSelection={{ value: "old-shell", revision: 1 }}
        onCommand={async () => undefined}
      />
    );

    expect((form.getByLabelText("Counterbid card") as HTMLSelectElement).value).toBe("0");
    expect((form.getByLabelText("Contest") as HTMLSelectElement).value).toBe("honeycomb");
    expect(form.getByRole("status").textContent).toMatch(/no unused counterbid/i);
  });

  it("renders Court Support as emblems and mutes a one-way target", () => {
    const { container } = render(
      <PartyRail
        view={{
          partyOrder: ["honeycomb"],
          coalitionTargets: { honeycomb: "foxglove" },
          courtSupport: {
            honeycomb: { foxglove: 2, riverworks: 1 }
          }
        } as never}
        interaction={{
          activePartyId: null,
          assignedPartyIds: [],
          onSelect: vi.fn()
        }}
      />
    );

    const courting = screen.getByText("Courting:").parentElement!;
    expect(
      within(courting)
        .getByLabelText("Foxglove Court Support: 2")
        .querySelector("svg")
    ).toBeTruthy();
    expect(
      within(courting)
        .getByLabelText("Riverworks Court Support: 1")
        .querySelector("svg")
    ).toBeTruthy();
    expect(within(courting).queryByText("Foxglove 2")).toBeNull();
    const target = screen.getByLabelText("Target: Foxglove");
    expect(target.classList.contains("coalition-target-prospective")).toBe(true);
    expect(target.querySelector("svg")).toBeTruthy();
    expect(container.querySelector(".party-glyph-primary")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Honeycomb.*Courting:.*Foxglove Court Support: 2.*Riverworks Court Support: 1.*Target: Foxglove/i
      })
    ).toBeTruthy();
  });

  it("labels an empty Court and distinguishes reciprocal coalitions", () => {
    render(
      <PartyRail
        view={{
          partyOrder: ["honeycomb", "foxglove"],
          coalitionTargets: {
            honeycomb: "foxglove",
            foxglove: "honeycomb"
          },
          courtSupport: {}
        } as never}
      />
    );

    expect(within(screen.getAllByText("Courting:")[0]!.parentElement!).getByText("none")).toBeTruthy();
    const coalition = screen.getByLabelText("Coalition with Foxglove");
    expect(coalition.classList.contains("coalition-target-reciprocal")).toBe(
      true
    );
    expect(screen.queryByLabelText("Target: Foxglove")).toBeNull();
  });
});

function activePublicState(
  rulesetVersion: string,
  partyOrder: readonly string[]
) {
  return {
    scope: "public",
    publicState: {
      gameId: "game-1",
      inviteCode: "PRESS42",
      version: 1,
      latestSequence: 1,
      lifecycle: "active",
      configuration: {
        playerCount: 2,
        counterbidTimer: { mode: "off" },
        allowSpectators: false
      },
      seats: [],
      spectators: [],
      publicGame: {
        rulesetVersion,
        round: 1,
        electionNumber: 0,
        nextFirstOpenerSeatId: "seat-a",
        partyOrder: [...partyOrder],
        support: {},
        courtSupport: {},
        coalitionTargets: {},
        contests: {},
        resolvedOperations: [],
        roundHistory: [],
        electionHistory: [],
        chat: [],
        phase: { type: "opening" },
        seats: []
      }
    }
  } as never;
}
