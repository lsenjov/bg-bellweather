import { describe, expect, it } from "vitest";
import {
  hasLegalOperationChoice,
  isOperationChoiceLegal,
  isOperationRequestLegal,
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
        initial,
        "honeycomb",
        {
          operation: "organise",
          sourceDistrictId: "a",
          destinationDistrictId: "c"
        },
        { ignoreOrganiseAdjacency: true }
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
      hasLegalOperationChoice(initial, "honeycomb", "organise", {
        ignoreOrganiseAdjacency: true
      })
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

  it("reports complete immediate and delayed bonus request legality", () => {
    expect(
      isOperationRequestLegal(state({ a: { honeycomb: 4 } }), {
        party: "honeycomb",
        choice: { operation: "rally", districtId: "a" },
        claimBonus: true
      })
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
          operation: "organise",
          sourceDistrictId: "a",
          destinationDistrictId: "b"
        },
        repeatChoice: {
          operation: "organise",
          sourceDistrictId: "b",
          destinationDistrictId: "d"
        },
        claimBonus: true
      })
    ).toBe(false);
    expect(
      isOperationRequestLegal(state(), {
        party: "night-parliament",
        choice: { operation: "court", targetParty: "foxglove" },
        claimBonus: true
      })
    ).toBe(true);
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
    expect(pact.state.coalitionTargets["old-shell"]).toBe("night-parliament");
    expect(pact.state.courtSupport["old-shell"]["night-parliament"]).toBe(2);
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

    const tied = state({ c: { riverworks: 1 } });
    tied.coalitionTargets["many-wings"] = "foxglove";
    tied.courtSupport["many-wings"] = {
      foxglove: 1,
      riverworks: 1
    };
    const chaptersForCurrentTarget = resolveOperation(tied, {
      party: "many-wings",
      choice: {
        operation: "court",
        targetParty: "riverworks",
        bonusDistrictId: "c"
      },
      claimBonus: true
    });
    expect(chaptersForCurrentTarget.state.coalitionTargets["many-wings"]).toBe(
      "riverworks"
    );
    expect(chaptersForCurrentTarget.state.districts.c?.support["many-wings"]).toBe(
      1
    );
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
    expect(delayed.state.coalitionTargets["night-parliament"]).toBe("riverworks");
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
