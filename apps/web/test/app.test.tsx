/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActionDesk,
  App,
  ContestCard,
  CounterbidForm,
  DistrictMap,
  OpeningForm,
  PartyRail,
  PlayerLedger
} from "../src/App.js";

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

describe("browser play surface", () => {
  it("renders the human table creator with a configurable optional timer", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /every whisper leaves a mark/i })
    ).toBeTruthy();
    expect(
      screen.getByLabelText(/counterbid seconds/i).getAttribute("min")
    ).toBe("5");
    expect(screen.getByLabelText(/disable timer/i)).toBeTruthy();
    expect(screen.getByText(/unlimited support/i)).toBeTruthy();
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
            scoringCardId: null
          },
          {
            id: "seat-b",
            displayName: "Bert",
            controller: "human",
            position: 1,
            firmIds: ["pairliament"],
            points: 7,
            reserve: null,
            scoringCardId: null
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
            scoringCardId: null
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
      />
    );

    const filing = within(container).getByRole("listitem");
    expect(filing.querySelector(".filing-cards")).toBeNull();
    expect(filing.querySelector(".filing-total")).toBeNull();
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
  });

  it("uses one digital firm for both low-player openings and shared card limits", () => {
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
    const leverage = form.getAllByLabelText("Leverage") as HTMLSelectElement[];
    expect([...leverage[0]!.options].map((option) => option.value)).toEqual(["1", "2"]);
    fireEvent.change(leverage[0]!, { target: { value: "2" } });
    expect([...leverage[1]!.options].map((option) => option.value)).toEqual(["1"]);

    const bluff = form.getAllByLabelText("Face-down Bluff") as HTMLSelectElement[];
    fireEvent.change(bluff[0]!, { target: { value: "2" } });
    expect([...bluff[1]!.options].map((option) => option.value)).toEqual(["0"]);
    expect(form.getByText(/as One Fell Swoop Public Affairs/i)).toBeTruthy();
    expect(form.queryByText(/Pairliament Partners/i)).toBeNull();

    fireEvent.click(form.getByRole("button", { name: /file opening bids/i }));
    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({
        openings: expect.arrayContaining([
          expect.objectContaining({ firmId: "one-fell-swoop" }),
          expect.objectContaining({ firmId: "one-fell-swoop" })
        ])
      })
    }));
  });

  it("applies party shortcuts only to the active opening draft", async () => {
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
    const parties = form.getAllByLabelText("Party") as HTMLSelectElement[];
    rerender(
      <OpeningForm
        view={view as never}
        seat={seat as never}
        busy={false}
        partySelection={{ value: "riverworks", revision: 1 }}
        onCommand={async () => undefined}
      />
    );
    await waitFor(() => expect(parties[0]!.value).toBe("riverworks"));
    fireEvent.click(form.getByRole("button", { name: /edit opening 2/i }));
    rerender(
      <OpeningForm
        view={view as never}
        seat={seat as never}
        busy={false}
        partySelection={{ value: "foxglove", revision: 2 }}
        onCommand={async () => undefined}
      />
    );
    await waitFor(() => expect(parties[1]!.value).toBe("foxglove"));
    expect(parties[0]!.value).toBe("riverworks");
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
          contests: { honeycomb: {} },
          counterbidSlots: [null, null, null, null],
          bids: []
        } as never}
        seat={{
          firmIds: ["one-fell-swoop"],
          reserve: {
            leverage: 20,
            bluff: 8,
            operations: { organise: 4, rally: 8, smear: 4, court: 2 }
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
        operations: { organise: 4, rally: 8, smear: 4, court: 2 }
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

  it("blocks contest shortcuts until unsaved placed-bid edits are applied or reset", async () => {
    const view = {
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
