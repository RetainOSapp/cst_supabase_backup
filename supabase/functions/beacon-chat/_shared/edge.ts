import { AuthError } from "../../_shared/auth.ts";
import {
  jsonResponse,
  optionsResponse,
} from "../../_shared/http.ts";
import { BeaconError, logCategory, safeErrorResponse } from "./errors.mjs";
import { isAllowedRequestOrigin } from "./origin.mjs";
export { MAX_JSON_BODY_BYTES, readJsonBody, withDeadline } from "./request.mjs";

const getEnv = (name: string) => Deno.env.get(name);

export function requestId() {
  return crypto.randomUUID();
}

export function rejectUntrustedOrigin(req: Request, id: string) {
  if (isAllowedRequestOrigin(req, getEnv)) return null;
  return jsonResponse(
    req,
    {
      ok: false,
      error: "This request origin is not allowed.",
      code: "origin_not_allowed",
      requestId: id,
    },
    403,
  );
}

export function earlyProtocolResponse(req: Request, id: string) {
  if (req.method === "OPTIONS") return optionsResponse(req);
  if (req.method !== "POST") {
    return jsonResponse(
      req,
      {
        ok: false,
        error: "Only POST requests are supported.",
        code: "method_not_allowed",
        requestId: id,
      },
      405,
      { Allow: "POST, OPTIONS" },
    );
  }
  const contentType = req.headers.get("Content-Type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return jsonResponse(
      req,
      {
        ok: false,
        error: "Send a JSON request body.",
        code: "unsupported_media_type",
        requestId: id,
      },
      415,
    );
  }
  return null;
}

function normalizeError(error: unknown) {
  if (error instanceof BeaconError) return error;
  if (error instanceof AuthError) {
    if (error.status === 401) {
      return new BeaconError(
        "unauthenticated",
        401,
        "Your session has ended. Sign in again to continue.",
      );
    }
    return new BeaconError(
      "access_denied",
      403,
      "You do not have access to this action.",
    );
  }
  return error;
}

export function publicErrorResponse(req: Request, error: unknown, id: string) {
  const normalized = normalizeError(error);
  const result = safeErrorResponse(normalized, id);
  const category = normalized instanceof BeaconError
    ? normalized.category
    : "unhandled_error";
  logCategory(
    (entry) => console.warn(JSON.stringify(entry)),
    id,
    category,
  );
  return jsonResponse(req, result.body, result.status, result.headers);
}
