import assert from "node:assert/strict";
import test from "node:test";

import { OPENAI_TOOLS } from "../_shared/contracts.mjs";
import { reserveUsage } from "../_shared/database.mjs";
import { safeErrorResponse, BeaconError } from "../_shared/errors.mjs";
import { isAllowedRequestOrigin } from "../_shared/origin.mjs";
import {
  MAX_JSON_BODY_BYTES,
  readJsonBody,
  withDeadline,
} from "../_shared/request.mjs";
import { parseChatBody, parseManageBody } from "../_shared/validation.mjs";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";

function deniedReservation(reason_code) {
  return reserveUsage({
    serviceClient: {
      rpc: async () => ({
        data: [{ accepted: false, reservation_id: null, reason_code }],
        error: null,
      }),
    },
    requestId: "33333333-3333-4333-8333-333333333333",
    actor: { id: ACTOR },
    context: { companyId: COMPANY, memberId: null, role: "super_admin" },
    inputChars: 12,
  });
}

test("reserve denials distinguish authorization, quota, and invariant failures", async () => {
  await assert.rejects(
    deniedReservation("role_not_allowed"),
    (error) => error.code === "access_denied" && error.status === 403,
  );
  await assert.rejects(
    deniedReservation("actor_minute_limited"),
    (error) => error.code === "actor_minute_limited" && error.status === 429,
  );
  await assert.rejects(
    deniedReservation("unexpected_internal_state"),
    (error) => error.code === "quota_unavailable" && error.status === 503,
  );
});

test("Responses tools use strict closed schemas with every property required", () => {
  assert.equal(OPENAI_TOOLS.length, 8);
  for (const tool of OPENAI_TOOLS) {
    assert.equal(tool.type, "function");
    assert.equal(tool.strict, true);
    assert.equal(tool.parameters.type, "object");
    assert.equal(tool.parameters.additionalProperties, false);
    assert.deepEqual(
      [...tool.parameters.required].sort(),
      Object.keys(tool.parameters.properties).sort(),
    );
  }
});

test("chat validation rejects caller-controlled model, role, actor, and tool fields", () => {
  for (const extra of ["model", "role", "actorId", "tool", "memberId"]) {
    assert.throws(
      () => parseChatBody({ companyId: COMPANY, message: "Hello", history: [], [extra]: "x" }),
      (error) => error.code === "invalid_request" && error.status === 400,
    );
  }
});

test("chat history is bounded to the latest ten messages", () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message-${index}`,
  }));
  const parsed = parseChatBody({ companyId: COMPANY, message: "Hello", history });
  assert.equal(parsed.history.length, 10);
  assert.equal(parsed.history[0].content, "message-2");
  assert.equal(parsed.historyTruncated, true);
});

test("management accepts configurable warnings below the implicit 100% hard stop", () => {
  const parsed = parseManageBody({
    action: "update",
    companyId: COMPANY,
    featureKey: "beacon",
    status: "pilot",
    allowances: [{
      meterType: "usd_cents",
      limitValue: 2_500,
      periodType: "one_time",
      warningThresholds: [25, 75, 90, 99],
    }],
  });
  assert.deepEqual(parsed.allowances[0].warningThresholds, [25, 75, 90, 99]);
});

test("management rejects 100 warning entries, duplicates, usage fields, and missing enabled allowance", () => {
  const base = {
    action: "update",
    companyId: COMPANY,
    featureKey: "beacon",
    status: "pilot",
  };
  const allowance = {
    meterType: "usd_cents",
    limitValue: 2_500,
    periodType: "one_time",
    warningThresholds: [75, 90],
  };
  assert.throws(
    () => parseManageBody({ ...base, allowances: [{ ...allowance, warningThresholds: [75, 100] }] }),
    (error) => error.code === "invalid_request",
  );
  assert.throws(
    () => parseManageBody({ ...base, allowances: [{ ...allowance, warningThresholds: ["75", 90] }] }),
    (error) => error.code === "invalid_request",
  );
  assert.throws(
    () => parseManageBody({ ...base, allowances: [allowance, { ...allowance }] }),
    (error) => error.code === "invalid_request",
  );
  assert.throws(
    () => parseManageBody({
      ...base,
      allowances: [{ ...allowance, meterType: "request_count" }],
    }),
    (error) => error.code === "invalid_request",
  );
  assert.throws(
    () => parseManageBody({
      ...base,
      allowances: [allowance, { ...allowance, meterType: "request_count" }],
    }),
    (error) => error.code === "invalid_request",
  );
  assert.throws(
    () => parseManageBody({ ...base, allowances: [{ ...allowance, usedValue: 1 }] }),
    (error) => error.code === "invalid_request",
  );
  assert.throws(
    () => parseManageBody({ ...base, allowances: [] }),
    (error) => error.code === "allowance_required",
  );
});

test("future non-Beacon features retain generic meter configuration", () => {
  const parsed = parseManageBody({
    action: "update",
    companyId: COMPANY,
    featureKey: "call_analysis",
    status: "pilot",
    allowances: [{
      meterType: "analysis_count",
      limitValue: 100,
      periodType: "monthly",
      warningThresholds: [75, 90],
    }],
  });
  assert.equal(parsed.allowances[0].meterType, "analysis_count");
});

test("request body cap rejects declared, misleading, and missing Content-Length overages", async () => {
  const oversized = `"${"é".repeat(MAX_JSON_BODY_BYTES)}"`;
  const request = (length) => ({
    headers: new Headers(length == null ? {} : { "Content-Length": String(length) }),
    text: async () => oversized,
  });
  await assert.rejects(
    () => readJsonBody(request(MAX_JSON_BODY_BYTES + 1)),
    (error) => error.code === "request_too_large" && error.status === 413,
  );
  await assert.rejects(
    () => readJsonBody(request(10)),
    (error) => error.code === "request_too_large" && error.status === 413,
  );
  await assert.rejects(
    () => readJsonBody(request(null)),
    (error) => error.code === "request_too_large" && error.status === 413,
  );
});

test("request body parser returns generic malformed JSON error", async () => {
  await assert.rejects(
    () => readJsonBody({
      headers: new Headers(),
      text: async () => "{secret parser details",
    }),
    (error) => error.code === "invalid_request" && error.status === 400,
  );
});

test("external-operation deadline fails closed with a generic timeout", async () => {
  await assert.rejects(
    () => withDeadline(new Promise(() => {}), 1, () => 1),
    (error) => error.code === "request_timeout" && error.status === 504,
  );
});

test("origin policy accepts originless server calls and exact configured origins only", () => {
  const env = (name) => name === "RETAINOS_ALLOWED_ORIGINS"
    ? "https://one.example,https://two.example"
    : undefined;
  assert.equal(isAllowedRequestOrigin({ headers: new Headers() }, env), true);
  assert.equal(
    isAllowedRequestOrigin({ headers: new Headers({ Origin: "https://one.example" }) }, env),
    true,
  );
  assert.equal(
    isAllowedRequestOrigin({ headers: new Headers({ Origin: "https://one.example.evil" }) }, env),
    false,
  );
});

test("public errors use the frontend-compatible flat safe contract", () => {
  const result = safeErrorResponse(
    new BeaconError("rate_limited", 429, "Please try later.", { retryAfterSeconds: 30 }),
    "request-1",
  );
  assert.deepEqual(result.body, {
    ok: false,
    requestId: "request-1",
    error: "Please try later.",
    code: "rate_limited",
    retryAfterSeconds: 30,
  });
  assert.equal(result.headers["Retry-After"], "30");
});
