import type {
  CommandAccepted,
  CreateLobbyRequest,
  CreateLobbyResponse,
  GameCommand,
  JoinLobbyRequest,
  JoinLobbyResponse,
  ParticipantSession,
  ReplayResponse,
  ViewerStateEnvelope
} from "@bellweather/protocol";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export async function createLobby(
  request: CreateLobbyRequest
): Promise<CreateLobbyResponse> {
  return requestJson("/api/v1/games", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export async function joinLobby(
  request: JoinLobbyRequest
): Promise<JoinLobbyResponse> {
  return requestJson("/api/v1/games/join", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export async function getState(
  session: ParticipantSession
): Promise<ViewerStateEnvelope> {
  return requestJson(`/api/v1/games/${session.gameId}/state`, {}, session.accessToken);
}

export async function sendCommand(
  session: ParticipantSession,
  command: GameCommand,
  expectedVersion?: number
): Promise<CommandAccepted> {
  return requestJson(
    `/api/v1/games/${session.gameId}/commands`,
    {
      method: "POST",
      body: JSON.stringify({
        gameId: session.gameId,
        idempotencyKey: crypto.randomUUID(),
        ...(expectedVersion === undefined ? {} : { expectedVersion }),
        command
      })
    },
    session.accessToken
  );
}

export async function getReplay(
  session: ParticipantSession
): Promise<ReplayResponse> {
  return requestJson(
    `/api/v1/games/${session.gameId}/replay`,
    {},
    session.accessToken
  );
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  token?: string
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (token !== undefined) {
    headers.set("authorization", `Bearer ${token}`);
  }
  const response = await fetch(path, { ...init, headers });
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "message" in body.error &&
      typeof body.error.message === "string"
        ? body.error.message
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return body as T;
}
