import { describe, expect, it } from "vitest";
import {
  hasLegalOperationChoice,
  isOperationChoiceLegal,
  isOperationRequestLegal,
  PARTY_BONUSES,
  PARTIES,
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

  it("moves the Coalition Target only when Court Support has a unique leader", () => {
    let result = resolveOperation(state(), {
      party: "honeycomb",
      choice: { operation: "court", targetParty: "night-parliament" }
    });
    expect(result.state.courtSupport.honeycomb["night-parliament"]).toBe(1);
    expect(result.state.coalitionTargets.honeycomb).toBe("night-parliament");

    result = resolveOperation(result.state, {
      party: "honeycomb",
      choice: { operation: "court", targetParty: "foxglove" }
    });
    expect(result.state.coalitionTargets.honeycomb).toBe("night-parliament");

    result = resolveOperation(result.state, {
      party: "honeycomb",
      choice: { operation: "court", targetParty: "foxglove" }
    });
    expect(result.state.coalitionTargets.honeycomb).toBe("foxglove");

    expect(
      resolveOperation(result.state, {
        party: "honeycomb",
        choice: { operation: "court", targetParty: "honeycomb" }
      }).baselineApplied
    ).toBe(false);
  });

  it("reports current baseline legality without mutating the board", () => {
    const initial = state({
      a: { honeycomb: 1, foxglove: 1 },
      c: { riverworks: 1 }
    });

    expect(
      isOperationChoiceLegal(initial, "honeycomb", {
        operation: "organise",
        sourceDistrictId: "a",
        destinationDistrictId: "b"
      })
    ).toBe(true);
    expect(
      isOperationChoiceLegal(initial, "honeycomb", {
        operation: "organise",
        sourceDistrictId: "a",
        destinationDistrictId: "c"
      })
    ).toBe(false);
    expect(
      isOperationChoiceLegal(
        state({ a: { honeycomb: 1 }, b: { riverworks: 1 }, c: { riverworks: 1 } }),
        "riverworks",
        {
          operation: "organise",
          sourceDistrictId: "c",
          destinationDistrictId: "a"
        },
        { allowCanalNetwork: true }
      )
    ).toBe(true);
    expect(initial.districts.a?.support.honeycomb).toBe(1);
    expect(initial.districts.b?.support.honeycomb).toBeUndefined();
  });

  it("detects whether each operation family has any legal baseline choice", () => {
    const initial = state({
      a: { honeycomb: 5 },
      b: { foxglove: 4 },
      c: { riverworks: 1 },
      d: { "night-parliament": 1, "old-shell": 1 }
    });

    expect(hasLegalOperationChoice(initial, "honeycomb", "organise")).toBe(
      false
    );
    expect(
      hasLegalOperationChoice(
        state({
          a: { honeycomb: 4 },
          b: { riverworks: 1 },
          c: { riverworks: 1 },
          d: { "night-parliament": 1, "old-shell": 1 }
        }),
        "riverworks",
        "organise",
        { allowCanalNetwork: true }
      )
    ).toBe(true);
    expect(hasLegalOperationChoice(initial, "honeycomb", "rally")).toBe(
      false
    );
    expect(hasLegalOperationChoice(initial, "honeycomb", "smear")).toBe(
      true
    );
    expect(hasLegalOperationChoice(initial, "honeycomb", "court")).toBe(
      true
    );

    const emptyMap = state({
      a: { honeycomb: 5 },
      b: { honeycomb: 4 },
      c: { honeycomb: 2 },
      d: { honeycomb: 1 }
    });
    expect(hasLegalOperationChoice(emptyMap, "foxglove", "organise")).toBe(
      false
    );
    expect(hasLegalOperationChoice(emptyMap, "foxglove", "rally")).toBe(
      false
    );
    expect(hasLegalOperationChoice(emptyMap, "foxglove", "smear")).toBe(
      true
    );
  });

  it("reports complete immediate bonus request legality", () => {
    expect(
      isOperationRequestLegal(
        state({ a: { honeycomb: 1 }, b: { foxglove: 3 } }),
        {
        party: "honeycomb",
        choice: {
          operation: "organise",
          sourceDistrictId: "a",
          destinationDistrictId: "b"
        },
        claimBonus: true
        }
      )
    ).toBe(false);
    expect(
      isOperationRequestLegal(
        state({ a: { "old-shell": 1, foxglove: 1 } }),
        {
          party: "old-shell",
          choice: {
            operation: "smear",
            districtId: "a",
            rivalParty: "foxglove"
          },
          claimBonus: true
        }
      )
    ).toBe(false);
    expect(
      isOperationRequestLegal(state({ a: { riverworks: 1 } }), {
        party: "riverworks",
        choice: {
          operation: "rally",
          districtId: "a",
          bonusDistrictId: "c"
        },
        claimBonus: true
      })
    ).toBe(false);
    expect(
      isOperationRequestLegal(state({ a: { "many-wings": 1 } }), {
        party: "many-wings",
        choice: {
          operation: "rally",
          districtId: "a"
        },
        claimBonus: true
      })
    ).toBe(false);
    expect(
      isOperationRequestLegal(state({ a: { "night-parliament": 1 } }), {
        party: "night-parliament",
        choice: {
          operation: "rally",
          districtId: "a",
          bonusDistrictId: "c"
        },
        claimBonus: true
      })
    ).toBe(true);
    expect(
      isOperationRequestLegal(state({ a: { "night-parliament": 1 } }), {
        party: "night-parliament",
        choice: { operation: "rally", districtId: "a" },
        claimBonus: true
      })
    ).toBe(false);
    expect(
      isOperationRequestLegal(state({ a: { "night-parliament": 1 } }), {
        party: "night-parliament",
        choice: {
          operation: "rally",
          districtId: "a",
          bonusDistrictId: "a"
        },
        claimBonus: true
      })
    ).toBe(false);
  });
});

describe("all twelve party bonuses", () => {
  it("defines exactly two bonuses for every party", () => {
    expect(
      PARTIES.flatMap((party) => Object.values(PARTY_BONUSES[party]))
    ).toHaveLength(12);
  });

  it("applies Honeycomb Waggle Route and Common Cause", () => {
    const route = resolveOperation(state({ a: { honeycomb: 1 } }), {
      party: "honeycomb",
      choice: {
        operation: "organise",
        sourceDistrictId: "a",
        destinationDistrictId: "b"
      },
      claimBonus: true
    });
    expect(route.bonusApplied).toBe(true);
    expect(route.state.districts.b?.support.honeycomb).toBe(2);

    const cause = resolveOperation(
      state({ a: { honeycomb: 1 }, c: { foxglove: 1 } }),
      {
        party: "honeycomb",
        choice: {
          operation: "court",
          targetParty: "foxglove",
          bonusSourceDistrictId: "a",
          bonusDistrictId: "c"
        },
        claimBonus: true
      }
    );
    expect(cause.bonusApplied).toBe(true);
    expect(cause.state.districts.a?.support.honeycomb).toBeUndefined();
    expect(cause.state.districts.c?.support.honeycomb).toBe(1);
  });

  it("applies Old Shell Dig In and Stonewall", () => {
    const dugIn = resolveOperation(state({ a: { "old-shell": 1 } }), {
      party: "old-shell",
      choice: {
        operation: "organise",
        sourceDistrictId: "a",
        destinationDistrictId: "b"
      },
      claimBonus: true
    });
    expect(dugIn.state.districts.a?.support["old-shell"]).toBe(1);

    expect(
      resolveOperation(state(), {
        party: "old-shell",
        choice: { operation: "organise", destinationDistrictId: "a" },
        claimBonus: true
      }).bonusApplied
    ).toBe(false);

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
  });

  it("applies Foxglove Spin and Whisper Network", () => {
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

    const court = state();
    court.courtSupport.foxglove["old-shell"] = 1;
    court.coalitionTargets.foxglove = "old-shell";
    const whisper = resolveOperation(court, {
      party: "foxglove",
      choice: {
        operation: "court",
        targetParty: "riverworks",
        bonusCourtSourceParty: "old-shell"
      },
      claimBonus: true
    });
    expect(whisper.state.courtSupport.foxglove).toEqual({ riverworks: 2 });
    expect(whisper.state.coalitionTargets.foxglove).toBe("riverworks");
  });

  it("applies Riverworks Canal Network and Public Works", () => {
    const canal = resolveOperation(
      state({ a: { riverworks: 1 }, b: { riverworks: 1 } }),
      {
        party: "riverworks",
        choice: {
          operation: "organise",
          sourceDistrictId: "a",
          destinationDistrictId: "c"
        },
        claimBonus: true
      }
    );
    expect(canal.baselineApplied).toBe(true);
    expect(canal.state.districts.c?.support.riverworks).toBe(1);
    expect(
      resolveOperation(state(), {
        party: "riverworks",
        choice: { operation: "organise", destinationDistrictId: "a" },
        claimBonus: true
      }).bonusApplied
    ).toBe(false);

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
  });

  it("applies Many Wings Scatter the Flock and Joint Campaign", () => {
    const scatter = resolveOperation(state({ b: { "many-wings": 2 } }), {
      party: "many-wings",
      choice: {
        operation: "rally",
        districtId: "b",
        bonusDistrictIds: ["a", "c"]
      },
      claimBonus: true
    });
    expect(scatter.bonusApplied).toBe(true);
    expect(scatter.state.districts.b?.support["many-wings"]).toBe(1);
    expect(scatter.state.districts.a?.support["many-wings"]).toBe(1);
    expect(scatter.state.districts.c?.support["many-wings"]).toBe(1);

    const campaign = resolveOperation(
      state({ c: { "many-wings": 1 } }),
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
    expect(campaign.state.districts.c?.support.foxglove).toBe(1);
  });

  it("applies immediate Quiet Hours and Midnight Leak", () => {
    const quietHours = resolveOperation(state({ a: { "night-parliament": 1 } }), {
      party: "night-parliament",
      choice: {
        operation: "rally",
        districtId: "a",
        bonusDistrictId: "c"
      },
      claimBonus: true
    });
    expect(quietHours.bonusName).toBe("Quiet Hours");
    expect(quietHours.bonusApplied).toBe(true);
    expect(quietHours.state.districts.a?.support["night-parliament"]).toBe(2);
    expect(quietHours.state.districts.c?.support["night-parliament"]).toBe(1);

    const occupied = state({
      a: { "night-parliament": 1 },
      c: { honeycomb: 1 }
    });
    const failedQuietHours = resolveOperation(occupied, {
      party: "night-parliament",
      choice: {
        operation: "rally",
        districtId: "a",
        bonusDistrictId: "c"
      },
      claimBonus: true
    });
    expect(failedQuietHours.baselineApplied).toBe(false);
    expect(failedQuietHours.bonusFailure).toBe(
      "Quiet Hours requires an otherwise empty district"
    );
    expect(failedQuietHours.state).toEqual(occupied);

    const leakState = state({ a: { "night-parliament": 1, foxglove: 1 } });
    leakState.courtSupport.foxglove = { honeycomb: 2, riverworks: 2 };
    leakState.coalitionTargets.foxglove = "honeycomb";
    const leak = resolveOperation(leakState, {
      party: "night-parliament",
      choice: {
        operation: "smear",
        districtId: "a",
        rivalParty: "foxglove",
        bonusCourtParty: "honeycomb"
      },
      claimBonus: true
    });
    expect(leak.state.courtSupport.foxglove).toEqual({
      honeycomb: 1,
      riverworks: 2
    });
    expect(leak.state.coalitionTargets.foxglove).toBe("riverworks");
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
    courtSupport: {
      honeycomb: {},
      "old-shell": {},
      foxglove: {},
      riverworks: {},
      "many-wings": {},
      "night-parliament": {}
    },
    coalitionTargets: {
      honeycomb: null,
      "old-shell": null,
      foxglove: null,
      riverworks: null,
      "many-wings": null,
      "night-parliament": null
    }
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
