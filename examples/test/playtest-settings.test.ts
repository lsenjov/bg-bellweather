import { describe, expect, it } from "vitest";
import { parsePlayerTarget } from "../playtest-settings.js";

describe("playtest agent settings", () => {
  it("defaults to two players and accepts every supported target", () => {
    expect(parsePlayerTarget(undefined)).toBe(2);
    expect([2, 3, 4, 5, 6].map((count) => parsePlayerTarget(String(count)))).toEqual([
      2, 3, 4, 5, 6
    ]);
  });

  it.each(["1", "7", "2.5", "players"])(
    "rejects unsupported target %s",
    (target) => {
      expect(() => parsePlayerTarget(target)).toThrow(
        "BELLWEATHER_PLAYERS must be an integer from 2 to 6"
      );
    }
  );
});
