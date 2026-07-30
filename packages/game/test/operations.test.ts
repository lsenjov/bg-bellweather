import { describe, expect, it } from "vitest";
import {
  PARTY_BONUSES,
  PARTIES,
  resolveNightDelayedOperations,
  resolveOperation,
  supportCount,
  type OperationState,
  type Party
} from "../src/operations.js";

describe("operation baselines", () => {
  it("resolves Organise movement and supportless recovery without mutating input", () => {
    const initial = state({ a: { honeycomb: 1 } });
    const moved = resolveOperation(initial, {
      party: "honeycomb",
      choice: {
        operation: "organise",
        sourceDistrictId: "a",
        destinationDistrictId: "b"
      }
    });
    expect(moved.baselineApplied).toBe(true);
    expect(moved.state.districts.a?.support.honeycomb).toBeUndefined();
    expect(moved.state.districts.b?.support.honeycomb).toBe(1);
    expect(initial.districts.a?.support.honeycomb).toBe(1);

    const recovered = resolveOperation(state(), {
      party: "honeycomb",
      choice: { operation: "organise", destinationDistrictId: "c" }
    });
    expect(recovered.state.districts.c?.support.honeycomb).toBe(1);
  });

  it("enforces Rally presence, Smear range, and district capacity", () => {
    const initial = state({
      a: { riverworks: 1 },
      b: { foxglove: 1 },
      c: { honeycomb: 2 }
    });
    expect(
      resolveOperation(initial, {
        party: "riverworks",
        choice: { operation: "rally", districtId: "a" }
      }).state.districts.a?.support.riverworks
    ).toBe(2);
    expect(
      resolveOperation(initial, {
        party: "riverworks",
        choice: {
          operation: "smear",
          districtId: "b",
          rivalParty: "foxglove"
        }
      }).baselineApplied
    ).toBe(true);
    expect(
      resolveOperation(initial, {
        party: "riverworks",
        choice: { operation: "rally", districtId: "c" }
      }).baselineApplied
    ).toBe(false);
    expect(
      resolveOperation(initial, {
        party: "riverworks",
        choice: {
          operation: "smear",
          districtId: "d",
          rivalParty: "night-parliament"
        }
      }).baselineApplied
    ).toBe(false);
  });

  it("redirects Court and rejects Binding Pact atomically when protection blocks it", () => {
    const redirected = resolveOperation(state(), {
      party: "honeycomb",
      choice: { operation: "court", targetParty: "night-parliament" }
    });
    expect(redirected.state.overtures.honeycomb).toBe("night-parliament");

    const protectedState = state();
    protectedState.overtures["old-shell"] = "night-parliament";
    protectedState.oldShellReinforced = true;
    const protectedResult = resolveOperation(protectedState, {
      party: "old-shell",
      choice: { operation: "court", targetParty: "foxglove" },
      claimBonus: true
    });
    expect(protectedResult.state.overtures["old-shell"]).toBe("night-parliament");
    expect(protectedResult.state.oldShellReinforced).toBe(true);
    expect(protectedResult.baselineApplied).toBe(false);
    expect(protectedResult.bonusApplied).toBe(false);
  });
});

describe("all twelve party bonuses", () => {
  it("defines exactly two bonuses for every party", () => {
    expect(
      PARTIES.flatMap((party) => Object.values(PARTY_BONUSES[party]))
    ).toHaveLength(12);
  });

  it("applies Honeycomb Leave a Cell Behind and Swarm within capacity", () => {
    const moved = resolveOperation(state({ a: { honeycomb: 1 } }), {
      party: "honeycomb",
      choice: {
        operation: "organise",
        sourceDistrictId: "a",
        destinationDistrictId: "b"
      },
      claimBonus: true
    });
    expect(moved.bonusApplied).toBe(true);
    expect(moved.state.districts.a?.support.honeycomb).toBe(1);

    const recovered = resolveOperation(state(), {
      party: "honeycomb",
      choice: { operation: "organise", destinationDistrictId: "b" },
      claimBonus: true
    });
    expect(recovered.state.districts.b?.support.honeycomb).toBe(2);

    const swarm = resolveOperation(state({ a: { honeycomb: 1 } }), {
      party: "honeycomb",
      choice: { operation: "rally", districtId: "a" },
      claimBonus: true
    });
    expect(swarm.state.districts.a?.support.honeycomb).toBe(3);

    const noRoomForBonus = resolveOperation(
      state({ a: { honeycomb: 4 } }),
      {
        party: "honeycomb",
        choice: { operation: "rally", districtId: "a" },
        claimBonus: true
      }
    );
    expect(noRoomForBonus.baselineApplied).toBe(false);
    expect(noRoomForBonus.bonusApplied).toBe(false);
    expect(noRoomForBonus.state.districts.a?.support.honeycomb).toBe(4);
  });

  it("applies Old Shell Stonewall and Binding Pact", () => {
    const stonewall = resolveOperation(
      state({ a: { "old-shell": 1, foxglove: 2 } }),
      {
        party: "old-shell",
        choice: {
          operation: "smear",
          districtId: "a",
          rivalParty: "foxglove"
        },
        claimBonus: true
      }
    );
    expect(stonewall.state.districts.a?.support.foxglove).toBeUndefined();

    const pact = resolveOperation(state(), {
      party: "old-shell",
      choice: { operation: "court", targetParty: "night-parliament" },
      claimBonus: true
    });
    expect(pact.state.overtures["old-shell"]).toBe("night-parliament");
    expect(pact.state.oldShellReinforced).toBe(true);
  });

  it("applies Foxglove Slip Away and Spin", () => {
    const slip = resolveOperation(state({ a: { foxglove: 1 } }), {
      party: "foxglove",
      choice: {
        operation: "organise",
        sourceDistrictId: "a",
        destinationDistrictId: "c"
      },
      claimBonus: true
    });
    expect(slip.baselineApplied).toBe(true);
    expect(slip.state.districts.c?.support.foxglove).toBe(1);

    const spin = resolveOperation(
      state({ a: { foxglove: 1, honeycomb: 1 } }),
      {
        party: "foxglove",
        choice: {
          operation: "smear",
          districtId: "a",
          rivalParty: "honeycomb"
        },
        claimBonus: true
      }
    );
    expect(spin.state.districts.a?.support.foxglove).toBe(2);
  });

  it("applies Riverworks Public Works and Undermine beyond normal Smear range", () => {
    const works = resolveOperation(state({ a: { riverworks: 1 } }), {
      party: "riverworks",
      choice: {
        operation: "rally",
        districtId: "a",
        bonusDistrictId: "b"
      },
      claimBonus: true
    });
    expect(works.state.districts.b?.support.riverworks).toBe(1);

    const undermine = resolveOperation(
      state({
        a: { riverworks: 1, foxglove: 1 },
        b: { foxglove: 1 }
      }),
      {
        party: "riverworks",
        choice: {
          operation: "smear",
          districtId: "a",
          rivalParty: "foxglove",
          bonusDistrictId: "b"
        },
        claimBonus: true
      }
    );
    expect(undermine.state.districts.a?.support.foxglove).toBeUndefined();
    expect(undermine.state.districts.b?.support.foxglove).toBeUndefined();
  });

  it("applies Many Wings Murmuration against updated state and Local Chapters", () => {
    const murmuration = resolveOperation(state(), {
      party: "many-wings",
      choice: { operation: "organise", destinationDistrictId: "a" },
      repeatChoice: {
        operation: "organise",
        sourceDistrictId: "a",
        destinationDistrictId: "b"
      },
      claimBonus: true
    });
    expect(murmuration.bonusApplied).toBe(true);
    expect(murmuration.state.districts.a?.support["many-wings"]).toBeUndefined();
    expect(murmuration.state.districts.b?.support["many-wings"]).toBe(1);

    const chapters = resolveOperation(
      state({ c: { foxglove: 1 } }),
      {
        party: "many-wings",
        choice: {
          operation: "court",
          targetParty: "foxglove",
          bonusDistrictId: "c"
        },
        claimBonus: true
      }
    );
    expect(chapters.state.districts.c?.support["many-wings"]).toBe(1);
  });

  it("claims and resolves Night bonuses later in bid-rank order with current choices", () => {
    const rallyClaim = resolveOperation(state(), {
      party: "night-parliament",
      choice: { operation: "rally", districtId: "d" },
      claimBonus: true,
      nightClaim: { id: "low", ownerId: "p2", bidRank: 2, order: 0 }
    }).delayedClaim!;
    const courtClaim = resolveOperation(state(), {
      party: "night-parliament",
      choice: { operation: "court", targetParty: "foxglove" },
      claimBonus: true,
      nightClaim: { id: "high", ownerId: "p1", bidRank: 0, order: 0 }
    }).delayedClaim!;
    const beforeDelay = state({
      a: { "night-parliament": 1 },
      b: { "night-parliament": 1 }
    });
    const delayed = resolveNightDelayedOperations(
      beforeDelay,
      [rallyClaim, courtClaim],
      {
        high: { operation: "court", targetParty: "riverworks" },
        low: { operation: "rally", districtId: "b" }
      }
    );
    expect(delayed.resolutions.map(({ claim }) => claim.id)).toEqual([
      "high",
      "low"
    ]);
    expect(delayed.state.overtures["night-parliament"]).toBe("riverworks");
    expect(delayed.state.districts.b?.support["night-parliament"]).toBe(2);
  });

  it("uses unlimited reserves while respecting printed capacity", () => {
    let current = state({ a: { honeycomb: 1 } });
    for (let count = 0; count < 4; count += 1) {
      current = resolveOperation(current, {
        party: "honeycomb",
        choice: { operation: "rally", districtId: "a" }
      }).state;
    }
    expect(supportCount(current, "honeycomb")).toBe(5);
    expect(
      resolveOperation(current, {
        party: "honeycomb",
        choice: { operation: "rally", districtId: "a" }
      }).baselineApplied
    ).toBe(false);
  });
});

function state(
  support: Partial<Record<string, Partial<Record<Party, number>>>> = {}
): OperationState {
  return {
    districts: {
      a: district("a", 5, ["b"], support.a),
      b: district("b", 4, ["a", "c"], support.b),
      c: district("c", 2, ["b", "d"], support.c),
      d: district("d", 2, ["c"], {
        "night-parliament": 1,
        ...support.d
      })
    },
    overtures: {
      honeycomb: null,
      "old-shell": null,
      foxglove: null,
      riverworks: null,
      "many-wings": null,
      "night-parliament": null
    },
    oldShellReinforced: false
  };
}

function district(
  id: string,
  capacity: number,
  neighbors: readonly string[],
  support: Partial<Record<Party, number>> = {}
) {
  return { id, capacity, neighbors, support };
}
