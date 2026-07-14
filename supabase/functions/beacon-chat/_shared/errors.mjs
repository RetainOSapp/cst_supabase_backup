export class BeaconError extends Error {
  constructor(code, status, publicMessage, options = {}) {
    super(code);
    this.name = "BeaconError";
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.category = options.category ?? code;
    // Server-internal accounting signal only. It is never included in public
    // error responses, logs, or browser contracts.
    this.costUncertain = options.costUncertain === true;
  }
}

export function safeErrorResponse(error, requestId) {
  if (error instanceof BeaconError) {
    return {
      status: error.status,
      headers: error.retryAfterSeconds
        ? { "Retry-After": String(error.retryAfterSeconds) }
        : {},
      body: {
        ok: false,
        requestId,
        error: error.publicMessage,
        code: error.code,
        ...(error.retryAfterSeconds
          ? { retryAfterSeconds: error.retryAfterSeconds }
          : {}),
      },
    };
  }

  return {
    status: 500,
    headers: {},
    body: {
      ok: false,
      requestId,
      error: "Beacon is temporarily unavailable.",
      code: "beacon_unavailable",
    },
  };
}

export function logCategory(logger, requestId, category) {
  logger?.({ requestId, category });
}
