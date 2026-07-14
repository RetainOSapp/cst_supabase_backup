import assert from "node:assert/strict";
import test from "node:test";

import { handleBeaconAccess } from "../../beacon-access/handler.mjs";
import { handleManageAiFeature } from "../../manage-ai-feature-entitlement/handler.mjs";
import { SQL_CONTRACT } from "../_shared/contracts.mjs";
import { ProviderError } from "../_shared/provider.mjs";
import { handleBeaconChat } from "../handler.mjs";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const RESERVATION = "44444444-4444-4444-8444-444444444444";

function serviceClient({
  role = "director",
  globalStatus = "active",
  featureStatus = "pilot",
  allowanceStatus = "active",
  csmLedgerReady = true,
  limits = { remaining_requests: 49, remaining_budget_cents: 2_400 },
  onRpc = () => {},
  featureData = [],
  toolData = [],
  toolError = null,
  finalized = true,
} = {}) {
  return {
    rpc: async (name, args) => {
      onRpc(name, args);
      if (name === SQL_CONTRACT.serviceRpcs.resolveAccessContext) {
        return {
          data: {
            company_id: COMPANY,
            company_legacy_id: "legacy-company",
            role,
            member_id: role === "super_admin" ? null : MEMBER,
            membership_active: true,
            csm_assignment_ledger_ready: csmLedgerReady,
          },
          error: null,
        };
      }
      if (name === SQL_CONTRACT.serviceRpcs.featureGate) {
        return {
          data: {
            global_status: globalStatus,
            feature_status: featureStatus,
            allowance_status: allowanceStatus,
            limits,
          },
          error: null,
        };
      }
      if (name === SQL_CONTRACT.serviceRpcs.reserveUsage) {
        return { data: { accepted: true, reservation_id: RESERVATION }, error: null };
      }
      if (name === SQL_CONTRACT.serviceRpcs.finalizeUsage) {
        return { data: { finalized }, error: null };
      }
      if (name === SQL_CONTRACT.serviceRpcs.adminListFeatures) {
        return { data: featureData, error: null };
      }
      if (name === SQL_CONTRACT.serviceRpcs.adminUpdateFeature) {
        return { data: featureData[0], error: null };
      }
      if (Object.values(SQL_CONTRACT.userRpcs).includes(name)) {
        return { data: toolData, error: toolError };
      }
      throw new Error(`Unexpected mock RPC: ${name}`);
    },
  };
}

const authenticate = async () => ({ id: ACTOR, email: "actor@example.com" });
const notSuperAdmin = async () => false;

test("authorization-denied access omits entitlement and budget metadata", async () => {
  let featureGateCalls = 0;
  const result = await handleBeaconAccess({
    body: { companyId: COMPANY },
    token: "jwt",
    serviceClient: serviceClient({
      role: "viewer",
      onRpc: (name) => {
        if (name === SQL_CONTRACT.serviceRpcs.featureGate) featureGateCalls += 1;
      },
    }),
    authenticate,
    checkRegisteredSuperAdmin: notSuperAdmin,
  });
  assert.deepEqual(Object.keys(result).sort(), [
    "allowed",
    "enabled",
    "featureStatus",
    "reasonCode",
    "role",
  ]);
  assert.equal(result.allowed, false);
  assert.equal(result.enabled, false);
  assert.equal(result.featureStatus, "disabled");
  assert.equal(result.reasonCode, "role_not_allowed");
  assert.equal(result.role, "viewer");
  assert.equal("companyId" in result, false);
  assert.equal("limits" in result, false);
  assert.equal(featureGateCalls, 0);
});

test("all entitlement and authorization denials stop before quota and provider", async () => {
  const cases = [
    { role: "viewer", expected: "role_not_allowed" },
    { role: "csm", csmLedgerReady: false, expected: "assignment_ledger_unavailable" },
    { globalStatus: "paused", expected: "global_unavailable" },
    { featureStatus: "disabled", expected: "feature_disabled" },
    { featureStatus: "paused", expected: "feature_paused" },
    { allowanceStatus: "missing", expected: "allowance_missing" },
    { allowanceStatus: "paused", expected: "allowance_paused" },
    { allowanceStatus: "exhausted", expected: "allowance_exhausted" },
  ];

  for (const item of cases) {
    let providerCalls = 0;
    let reserveCalls = 0;
    const client = serviceClient({
      ...item,
      onRpc: (name) => {
        if (name === SQL_CONTRACT.serviceRpcs.reserveUsage) reserveCalls += 1;
      },
    });
    await assert.rejects(
      () => handleBeaconChat({
        body: { companyId: COMPANY, message: "Hello", history: [] },
        token: "jwt",
        requestId: "request-denied",
        serviceClient: client,
        authenticate,
        checkRegisteredSuperAdmin: notSuperAdmin,
        providerFactory: () => {
          providerCalls += 1;
          return { createResponse: async () => ({ output: [] }) };
        },
        now: () => 1,
      }),
      (error) => error.code === item.expected,
      item.expected,
    );
    assert.equal(providerCalls, 0, item.expected);
    assert.equal(reserveCalls, 0, item.expected);
  }
});

test("chat reserves fixed quota before provider and finalizes metadata on success", async () => {
  const calls = [];
  const result = await handleBeaconChat({
    body: { companyId: COMPANY, message: "Summarize", history: [] },
    token: "jwt",
    requestId: "request-success",
    serviceClient: serviceClient({ onRpc: (name, args) => calls.push({ name, args }) }),
    authenticate,
    checkRegisteredSuperAdmin: notSuperAdmin,
    providerFactory: () => ({
      createResponse: async () => ({
        id: "resp_safe",
        output: [{ type: "message", content: [{ type: "output_text", text: "Safe answer" }] }],
        usage: { input_tokens: 20, output_tokens: 5 },
      }),
    }),
    now: () => 1,
  });
  const reserve = calls.find((entry) => entry.name === SQL_CONTRACT.serviceRpcs.reserveUsage);
  const finalize = calls.find((entry) => entry.name === SQL_CONTRACT.serviceRpcs.finalizeUsage);
  assert.ok(reserve);
  assert.equal(reserve.args.p_reserved_cost_micros, 500_000);
  assert.ok(finalize);
  assert.equal(finalize.args.p_outcome, "success");
  assert.equal(finalize.args.p_input_tokens, 20);
  assert.equal(finalize.args.p_output_tokens, 5);
  assert.equal(finalize.args.p_cost_uncertain, false);
  assert.equal("prompt" in finalize.args, false);
  assert.equal("answer" in finalize.args, false);
  assert.deepEqual(result, {
    requestId: "request-success",
    answer: "Safe answer",
    toolActivity: [],
  });
});

test("fabricated model paths never become structured links", async () => {
  const result = await handleBeaconChat({
    body: { companyId: COMPANY, message: "Link to a client", history: [] },
    token: "jwt",
    requestId: "request-fabricated-link",
    serviceClient: serviceClient(),
    authenticate,
    checkRegisteredSuperAdmin: notSuperAdmin,
    providerFactory: () => ({
      createResponse: async () => ({
        output: [{
          type: "message",
          content: [{ type: "output_text", text: "[Fabricated](/clients/not-authorized)" }],
        }],
      }),
    }),
    now: () => 1,
  });
  assert.equal(result.answer, "Fabricated");
  assert.equal("links" in result, false);
});

test("chat finalizes a reservation after a provider failure", async () => {
  const calls = [];
  await assert.rejects(
    () => handleBeaconChat({
      body: { companyId: COMPANY, message: "Summarize", history: [] },
      token: "jwt",
      requestId: "request-provider-failure",
      serviceClient: serviceClient({ onRpc: (name, args) => calls.push({ name, args }) }),
      authenticate,
      checkRegisteredSuperAdmin: notSuperAdmin,
      providerFactory: () => ({
        createResponse: async () => { throw new ProviderError("provider_unavailable", 500); },
      }),
      now: () => 1,
    }),
    (error) => error.code === "provider_unavailable",
  );
  const finalize = calls.find((entry) => entry.name === SQL_CONTRACT.serviceRpcs.finalizeUsage);
  assert.ok(finalize);
  assert.equal(finalize.args.p_outcome, "provider_unavailable_500");
  assert.equal(finalize.args.p_input_tokens, 0);
  assert.equal(finalize.args.p_cost_uncertain, false);
});

test("ambiguous dispatched provider work consumes the conservative reservation", async () => {
  const calls = [];
  await assert.rejects(
    () => handleBeaconChat({
      body: { companyId: COMPANY, message: "Summarize", history: [] },
      token: "jwt",
      requestId: "request-provider-ambiguous",
      serviceClient: serviceClient({ onRpc: (name, args) => calls.push({ name, args }) }),
      authenticate,
      checkRegisteredSuperAdmin: notSuperAdmin,
      providerFactory: () => ({
        createResponse: async () => {
          throw new ProviderError(
            "provider_network_error",
            0,
            { costUncertain: true },
          );
        },
      }),
      now: () => 1,
    }),
    (error) => error.code === "provider_unavailable" && error.costUncertain === true,
  );
  const finalize = calls.find((entry) => entry.name === SQL_CONTRACT.serviceRpcs.finalizeUsage);
  assert.ok(finalize);
  assert.equal(finalize.args.p_outcome, "provider_network_error");
  assert.equal(finalize.args.p_estimated_cost_micros, 0);
  assert.equal(finalize.args.p_cost_uncertain, true);
});

test("chat fails closed when usage finalization reports an invariant anomaly", async () => {
  await assert.rejects(
    () => handleBeaconChat({
      body: { companyId: COMPANY, message: "Summarize", history: [] },
      token: "jwt",
      requestId: "request-finalize-anomaly",
      serviceClient: serviceClient({ finalized: false }),
      authenticate,
      checkRegisteredSuperAdmin: notSuperAdmin,
      providerFactory: () => ({
        createResponse: async () => ({
          output: [{
            type: "message",
            content: [{ type: "output_text", text: "Do not return this answer" }],
          }],
          usage: { input_tokens: 20, output_tokens: 5 },
        }),
      }),
      now: () => 1,
    }),
    (error) => error.code === "usage_finalize_failed" && error.status === 503,
  );
});

test("chat maps a truncated successful tool call to the public limited status", async () => {
  let providerCall = 0;
  const data = Array.from({ length: 51 }, (_, index) => ({
    client_id: `client-${index}`,
    client_name: `Client ${index}`,
    internal_path: `/clients/client-${index}`,
  }));
  const result = await handleBeaconChat({
    body: { companyId: COMPANY, message: "Contract gaps", history: [] },
    token: "jwt",
    requestId: "request-tool",
    serviceClient: serviceClient({ toolData: data }),
    authenticate,
    checkRegisteredSuperAdmin: notSuperAdmin,
    providerFactory: () => ({
      createResponse: async () => {
        providerCall += 1;
        return providerCall === 1
          ? {
              output: [{
                type: "function_call",
                call_id: "call_1",
                name: "list_contract_gaps",
                arguments: JSON.stringify({ limit: 50 }),
              }],
              usage: { input_tokens: 10, output_tokens: 2 },
            }
          : {
              output: [{ type: "message", content: [{ type: "output_text", text: "Found gaps" }] }],
              usage: { input_tokens: 10, output_tokens: 2 },
            };
      },
    }),
    now: () => 1,
  });
  assert.deepEqual(result.toolActivity, [{ tool: "list_contract_gaps", status: "limited" }]);
  assert.equal(result.links.length, 8);
  assert.deepEqual(result.links[0], { label: "Client 0", path: "/clients/client-0" });
  assert.equal(result.truncated, true);
});

test("chat maps an unavailable tool RPC to failed without exposing its error", async () => {
  let providerCall = 0;
  const result = await handleBeaconChat({
    body: { companyId: COMPANY, message: "Contract gaps", history: [] },
    token: "jwt",
    requestId: "request-tool-error",
    serviceClient: serviceClient({
      toolError: { message: "sensitive SQL detail" },
    }),
    authenticate,
    checkRegisteredSuperAdmin: notSuperAdmin,
    providerFactory: () => ({
      createResponse: async () => {
        providerCall += 1;
        return providerCall === 1
          ? {
              output: [{
                type: "function_call",
                call_id: "call_1",
                name: "list_contract_gaps",
                arguments: JSON.stringify({ limit: 25 }),
              }],
            }
          : {
              output: [{ type: "message", content: [{ type: "output_text", text: "Unavailable" }] }],
            };
      },
    }),
    now: () => 1,
  });
  assert.deepEqual(result.toolActivity, [{ tool: "list_contract_gaps", status: "failed" }]);
  assert.doesNotMatch(JSON.stringify(result), /sensitive SQL detail/);
});

function featureCard(overrides = {}) {
  return {
    feature_key: "beacon",
    status: "pilot",
    allowances: [{
      id: "55555555-5555-4555-8555-555555555555",
      meter_type: "usd_cents",
      period_type: "one_time",
      limit_value: 2_500,
      used_value: 125,
      warning_thresholds: [75, 90],
      period_started_at: "2026-07-13T00:00:00Z",
      period_ends_at: "infinity",
      database_secret: "remove me",
    }],
    enabled_at: "2026-07-13T00:00:00Z",
    paused_at: null,
    updated_at: "2026-07-13T00:00:00Z",
    database_secret: "remove me",
    ...overrides,
  };
}

test("management returns exact camelCase sanitized cards after UUID SuperAdmin validation", async () => {
  let superAdminChecks = 0;
  const result = await handleManageAiFeature({
    body: { action: "list", companyId: COMPANY },
    token: "jwt",
    serviceClient: serviceClient({ role: "super_admin", featureData: [featureCard()] }),
    authenticateSuperAdmin: async () => {
      superAdminChecks += 1;
      return { id: ACTOR, email: "super@example.com" };
    },
  });
  assert.equal(superAdminChecks, 1);
  assert.deepEqual(Object.keys(result), ["features"]);
  assert.equal(result.features[0].featureKey, "beacon");
  assert.deepEqual(result.features[0].allowances[0].warningThresholds, [75, 90]);
  assert.equal(result.features[0].allowances[0].usedValue, 125);
  assert.equal(result.features[0].allowances[0].periodEndsAt, null);
  assert.doesNotMatch(JSON.stringify(result), /database_secret|remove me/);
});

test("management update returns only the updated camelCase feature", async () => {
  const result = await handleManageAiFeature({
    body: {
      action: "update",
      companyId: COMPANY,
      featureKey: "beacon",
      status: "pilot",
      allowances: [{
        meterType: "usd_cents",
        periodType: "one_time",
        limitValue: 2_500,
        warningThresholds: [75, 90],
      }],
    },
    token: "jwt",
    serviceClient: serviceClient({ role: "super_admin", featureData: [featureCard()] }),
    authenticateSuperAdmin: async () => ({ id: ACTOR, email: "super@example.com" }),
  });
  assert.deepEqual(Object.keys(result), ["feature"]);
  assert.equal(result.feature.featureKey, "beacon");
});
