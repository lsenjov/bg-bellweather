/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  App,
  ContestCard,
  CounterbidForm,
  DistrictMap,
  OpeningForm,
  PartyRail
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
    render(
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
            firmId: "one-fell-swoop",
            kind: "counterbid",
            slotIndex: 2,
            status: "active",
            leverage: 3,
            bluff: 1,
            operations: { organise: 1, rally: 0, smear: 1, court: 0 }
          }
        ]}
      />
    );

    expect(screen.getByText(/3 Leverage/i)).toBeTruthy();
    expect(screen.getByText(/1 organise.*1 smear/i)).toBeTruthy();
    expect(screen.getByText(/One Fell Swoop Public Affairs/i)).toBeTruthy();
    expect(screen.getByText(/counterbid · identity card · active/i)).toBeTruthy();
  });

  it("limits simultaneous opening selects to cards not used in other drafts", () => {
    const { container } = render(
      <OpeningForm
        view={{ contests: {} } as never}
        seat={{
          firmIds: ["one-fell-swoop", "pairliament"],
          reserve: {
            leverage: 3,
            bluff: 2,
            operations: { organise: 2, rally: 0, smear: 0, court: 0 }
          }
        } as never}
        busy={false}
        onCommand={async () => undefined}
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
  });

  it("returns the selected counterbid stack to its available select limits", async () => {
    const { container } = render(
      <CounterbidForm
        view={{
          contests: { honeycomb: {} },
          counterbidSlots: ["bid-1", null],
          bids: [{
            id: "bid-1",
            contestId: "honeycomb",
            leverage: 3,
            bluff: 1,
            operations: { organise: 1, rally: 0, smear: 0, court: 0 }
          }]
        } as never}
        seat={{
          firmIds: ["one-fell-swoop"],
          reserve: {
            leverage: 2,
            bluff: 2,
            operations: { organise: 2, rally: 0, smear: 0, court: 0 }
          }
        } as never}
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
