/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { App, ContestCard, DistrictMap } from "../src/App.js";

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
            clout: 3,
            bluff: 1,
            operations: { organise: 1, rally: 0, smear: 1, court: 0 }
          }
        ]}
      />
    );

    expect(screen.getByText(/3 Clout/i)).toBeTruthy();
    expect(screen.getByText(/1 organise.*1 smear/i)).toBeTruthy();
    expect(screen.getByText(/One Fell Swoop Public Affairs/i)).toBeTruthy();
    expect(screen.getByText(/counterbid · cover A · active/i)).toBeTruthy();
  });
});
