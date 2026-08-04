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

afterEach(cleanup);

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
          rulesetVersion: "10",
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
          contests: {}
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
          scoringCardIds: ["SC-01", "SC-02"],
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
        publicGame: { phase: "lobby", rulesetVersion: "10" }
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
        inviteCode="PRESS42"
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
        inviteCode="PRESS42"
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

  it("shows both low-player agendas in the private folio", () => {
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
      scoringCardIds: ["SC-01", "SC-02"]
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
    expect(screen.getByText(/grand-market · Honeycomb/i)).toBeTruthy();
    expect(screen.getByText(/ironwood · Old Shell/i)).toBeTruthy();
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
          onSelect
        }}
      />
    );

    const source = screen.getByRole("button", {
      name: /Harbormouth.*selected as source.*choose as destination/i
    });
    expect(source.classList.contains("district-selected-source")).toBe(true);
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
      view: {} as never,
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
      expect((form.getByLabelText("Source district (optional)") as HTMLSelectElement).value).toBe("harbormouth")
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
    const bonus = form.getByRole("checkbox", { name: /claim leave a cell behind/i });

    fireEvent.click(bonus);
    expect((bonus as HTMLInputElement).checked).toBe(true);

    rerender(
      <OperationForm
        {...baseProps}
        decision={{ ...decision, availableBonusOperations: [] }}
      />
    );

    expect(form.queryByRole("checkbox", { name: /claim leave a cell behind/i })).toBeNull();
    expect(form.getByText(/leave a cell behind has already been claimed/i)).toBeTruthy();
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

  it("renders public Court Support beside the persistent Coalition Target", () => {
    render(
      <PartyRail
        view={{
          partyOrder: ["honeycomb"],
          coalitionTargets: { honeycomb: "foxglove" },
          courtSupport: {
            honeycomb: { foxglove: 2, riverworks: 1 }
          }
        } as never}
      />
    );

    expect(
      screen.getByText(/Targets Foxglove · Court Foxglove 2, Riverworks 1/i)
    ).toBeTruthy();
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
        electionHistory: [],
        chat: [],
        phase: { type: "opening" },
        seats: []
      }
    }
  } as never;
}
