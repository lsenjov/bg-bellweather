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
