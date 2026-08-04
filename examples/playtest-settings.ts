import {
  MAX_PLAYER_COUNT,
  MIN_PLAYER_COUNT
} from "@bellweather/protocol";

export function parsePlayerTarget(value: string | undefined): number {
  const playerTarget = Number(value ?? MIN_PLAYER_COUNT);
  if (
    !Number.isInteger(playerTarget) ||
    playerTarget < MIN_PLAYER_COUNT ||
    playerTarget > MAX_PLAYER_COUNT
  ) {
    throw new Error(
      `BELLWEATHER_PLAYERS must be an integer from ${MIN_PLAYER_COUNT} to ${MAX_PLAYER_COUNT}`
    );
  }
  return playerTarget;
}
