import type { ProtocolErrorCode } from "@bellweather/protocol";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}

export function protocolErrorCode(error: AppError): ProtocolErrorCode {
  if (
    error.code === "version_conflict" ||
    error.code === "idempotency_conflict" ||
    error.code === "unsupported_ruleset" ||
    error.code === "phase_closed"
  ) {
    return error.code;
  }
  if (error.status === 400) return "invalid_request";
  if (error.status === 401) return "unauthorized";
  if (error.status === 403) return "forbidden";
  if (error.status === 404) return "not_found";
  if (error.status >= 500) return "internal_error";
  return "illegal_action";
}

export function assertFound<T>(
  value: T | undefined,
  code: string,
  message: string
): T {
  if (value === undefined) {
    throw new AppError(404, code, message);
  }

  return value;
}
