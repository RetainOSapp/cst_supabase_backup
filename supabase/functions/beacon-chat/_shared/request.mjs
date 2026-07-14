import { BeaconError } from "./errors.mjs";

export const MAX_JSON_BODY_BYTES = 32 * 1024;

export async function withDeadline(
  operation,
  deadlineMs,
  now = () => Date.now(),
) {
  if (!Number.isFinite(deadlineMs)) return operation;
  const remainingMs = Math.floor(deadlineMs - now());
  if (remainingMs <= 0) {
    throw new BeaconError(
      "request_timeout",
      504,
      "Beacon took too long to respond.",
    );
  }
  let timeoutId;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new BeaconError(
          "request_timeout",
          504,
          "Beacon took too long to respond.",
        )), remainingMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function readJsonBody(req) {
  const declaredLength = Number(req.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    throw new BeaconError(
      "request_too_large",
      413,
      "The request body is too large.",
    );
  }

  let bodyText;
  try {
    bodyText = await req.text();
  } catch {
    throw new BeaconError("invalid_request", 400, "Send a valid JSON request body.");
  }
  if (new TextEncoder().encode(bodyText).byteLength > MAX_JSON_BODY_BYTES) {
    throw new BeaconError(
      "request_too_large",
      413,
      "The request body is too large.",
    );
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    throw new BeaconError("invalid_request", 400, "Send a valid JSON request body.");
  }
}
