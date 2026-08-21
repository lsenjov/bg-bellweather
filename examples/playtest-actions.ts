import { DISTRICTS, type PartyId } from "@bellweather/content";

export function chooseLobbyAction(
  game: Record<string, unknown>,
  ownSeat: Record<string, unknown>,
  phase: Record<string, unknown>,
  seatId: string
): Record<string, unknown> {
  return (
    chooseRally(game, ownSeat) ??
    chooseClose(game, phase, seatId) ??
    chooseCollect(game, ownSeat) ??
    { type: "pass" }
  );
}

function chooseRally(
  game: Record<string, unknown>,
  ownSeat: Record<string, unknown>
): Record<string, unknown> | null {
  const operations = objectValue(ownSeat["operations"]);
  if (Number(operations["rally"] ?? 0) < 1) {
    return null;
  }
  const parties = objectValue(game["parties"]);
  const support = objectValue(game["support"]);
  for (const [partyValue, partyState] of Object.entries(parties)) {
    const partyId = partyValue as PartyId;
    if (objectValue(partyState)["status"] !== "open") {
      continue;
    }
    const hasSupport = DISTRICTS.some(
      (district) => Number(objectValue(support[district.id])[partyId] ?? 0) > 0
    );
    const district = DISTRICTS.find((candidate) => {
      const districtSupport = objectValue(support[candidate.id]);
      const occupied = Object.values(districtSupport).reduce<number>(
        (total, count) => total + Number(count ?? 0),
        0
      );
      return (
        occupied < candidate.capacity &&
        (!hasSupport || Number(districtSupport[partyId] ?? 0) > 0)
      );
    });
    if (district !== undefined) {
      return {
        type: "operate",
        partyId,
        play: {
          cardType: "operation",
          operation: "rally",
          choice: { operation: "rally", districtId: district.id }
        }
      };
    }
  }
  return null;
}

function chooseClose(
  game: Record<string, unknown>,
  phase: Record<string, unknown>,
  seatId: string
): Record<string, unknown> | null {
  const turnsTaken = objectValue(phase["turnsTaken"]);
  if (Number(turnsTaken[seatId] ?? 0) === 0) {
    return null;
  }
  for (const [partyId, partyValue] of Object.entries(objectValue(game["parties"]))) {
    const party = objectValue(partyValue);
    if (party["ownerSeatId"] === seatId && party["status"] === "open") {
      return { type: "close", partyId };
    }
  }
  return null;
}

function chooseCollect(
  game: Record<string, unknown>,
  ownSeat: Record<string, unknown>
): Record<string, unknown> | null {
  if (Number(ownSeat["collectionCounters"] ?? 0) < 1) {
    return null;
  }
  for (const [partyId, partyValue] of Object.entries(objectValue(game["parties"]))) {
    if (objectValue(partyValue)["status"] === "open") {
      return { type: "collect", partyId };
    }
  }
  return null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
