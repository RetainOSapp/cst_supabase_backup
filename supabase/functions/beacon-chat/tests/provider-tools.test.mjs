import assert from "node:assert/strict";
import test from "node:test";

import { LIMITS, OPENAI_MODEL } from "../_shared/contracts.mjs";
import { runBeaconTurn, sanitizeAnswer } from "../_shared/orchestrator.mjs";
import { createOpenAIResponsesProvider } from "../_shared/provider.mjs";
import { executeTool } from "../_shared/tools.mjs";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const CONTEXT = {
  companyId: COMPANY,
  actorAuthUserId: ACTOR,
  role: "director",
  memberId: MEMBER,
};

test("OpenAI adapter pins model and safety controls without previous_response_id", async () => {
  let outbound;
  const provider = createOpenAIResponsesProvider({
    apiKey: "test-only",
    fetchImpl: async (url, options) => {
      outbound = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        id: "resp_1",
        output: [{ type: "message", content: [{ type: "output_text", text: "Done" }] }],
        usage: { input_tokens: 3, output_tokens: 1 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
    now: () => 1,
  });
  await provider.createResponse({
    input: [{ role: "user", content: "hello" }],
    instructions: "fixed",
    tools: [],
    safetyIdentifier: "safe_hash",
    deadlineMs: 10_000,
  });
  assert.equal(outbound.url, "https://api.openai.com/v1/responses");
  assert.equal(outbound.body.model, OPENAI_MODEL);
  assert.deepEqual(outbound.body.reasoning, { effort: "none" });
  assert.equal(outbound.body.store, false);
  assert.equal(outbound.body.parallel_tool_calls, false);
  assert.equal(outbound.body.max_output_tokens, LIMITS.maxOutputTokens);
  assert.equal(outbound.body.safety_identifier, "safe_hash");
  assert.equal("previous_response_id" in outbound.body, false);
  assert.equal(outbound.options.headers.Authorization, "Bearer test-only");
});

test("OpenAI adapter retries once for retryable status without parsing provider error bodies", async () => {
  let calls = 0;
  let errorBodyRead = false;
  const provider = createOpenAIResponsesProvider({
    apiKey: "test-only",
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 500,
          json: async () => {
            errorBodyRead = true;
            return { secret: "must-not-read" };
          },
        };
      }
      return new Response(JSON.stringify({
        output: [],
        output_text: "Done",
        usage: { input_tokens: 3, output_tokens: 1 },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    now: () => 1,
    sleepImpl: async () => {},
    random: () => 0,
  });
  await provider.createResponse({
    input: [],
    instructions: "fixed",
    tools: [],
    safetyIdentifier: "safe_hash",
    deadlineMs: 10_000,
  });
  assert.equal(calls, 2);
  assert.equal(errorBodyRead, false);
});

test("OpenAI adapter retains only bounded rejection code and parameter", async () => {
  const provider = createOpenAIResponsesProvider({
    apiKey: "test-only",
    fetchImpl: async () => new Response(JSON.stringify({
      error: {
        message: "sensitive provider detail must never be propagated",
        type: "invalid_request_error",
        code: "unsupported_parameter",
        param: "reasoning.effort",
        extra: { secret: "discarded" },
      },
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }),
    now: () => 1,
  });

  await assert.rejects(
    () => provider.createResponse({
      input: [],
      instructions: "fixed",
      tools: [],
      safetyIdentifier: "safe_hash",
      deadlineMs: 10_000,
    }),
    (error) =>
      error.category ===
        "provider_rejected.unsupported_parameter.reasoning.effort" &&
      !error.message.includes("sensitive") &&
      !error.message.includes("discarded"),
  );
});

test("OpenAI adapter does not retry an ambiguous network failure", async () => {
  let calls = 0;
  const provider = createOpenAIResponsesProvider({
    apiKey: "test-only",
    fetchImpl: async () => {
      calls += 1;
      throw new TypeError("ambiguous network failure");
    },
    now: () => 1,
    sleepImpl: async () => {},
  });
  await assert.rejects(
    () => provider.createResponse({
      input: [],
      instructions: "fixed",
      tools: [],
      safetyIdentifier: "safe_hash",
      deadlineMs: 10_000,
    }),
    (error) =>
      error.category === "provider_network_error" &&
      error.costUncertain === true,
  );
  assert.equal(calls, 1);
});

test("OpenAI adapter treats malformed successful usage as uncertain billed work", async () => {
  const provider = createOpenAIResponsesProvider({
    apiKey: "test-only",
    fetchImpl: async () => new Response(JSON.stringify({
      id: "resp_malformed",
      output: [{ type: "message", content: [{ type: "output_text", text: "Done" }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }),
    now: () => 1,
  });
  await assert.rejects(
    () => provider.createResponse({
      input: [],
      instructions: "fixed",
      tools: [],
      safetyIdentifier: "safe_hash",
      deadlineMs: 10_000,
    }),
    (error) =>
      error.category === "provider_malformed_response" &&
      error.costUncertain === true,
  );
});

test("OpenAI adapter treats a dispatched timeout as uncertain billed work", async () => {
  const provider = createOpenAIResponsesProvider({
    apiKey: "test-only",
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      }, { once: true });
    }),
    now: () => Date.now(),
  });
  await assert.rejects(
    () => provider.createResponse({
      input: [],
      instructions: "fixed",
      tools: [],
      safetyIdentifier: "safe_hash",
      deadlineMs: Date.now() + 15,
    }),
    (error) =>
      error.category === "provider_timeout" &&
      error.costUncertain === true,
  );
});

test("tool dispatcher denies invented tools and extra arguments before RPC", async () => {
  let rpcCalls = 0;
  const serviceClient = { rpc: async () => { rpcCalls += 1; return { data: [], error: null }; } };
  await assert.rejects(
    () => executeTool({
      serviceClient,
      context: CONTEXT,
      toolName: "run_sql",
      rawArguments: JSON.stringify({ query: "select * from clients" }),
    }),
    (error) => error.code === "tool_not_allowed",
  );
  await assert.rejects(
    () => executeTool({
      serviceClient,
      context: CONTEXT,
      toolName: "list_contract_gaps",
      rawArguments: JSON.stringify({ limit: 25, table: "clients" }),
    }),
    (error) => error.code === "invalid_request",
  );
  assert.equal(rpcCalls, 0);
});

test("tool results contain only allow-listed fields and a server-fixed company scope", async () => {
  let called;
  const result = await executeTool({
    serviceClient: {
      rpc: async (name, args) => {
        called = { name, args };
        return {
          data: [{
            client_id: "22222222-2222-4222-8222-222222222222",
            client_name: "Approved",
            internal_path: "/clients/approved",
            director_notes: "secret",
            raw_transcript: "secret",
          }],
          error: null,
        };
      },
    },
    context: CONTEXT,
    toolName: "list_contract_gaps",
    rawArguments: JSON.stringify({ limit: 25 }),
  });
  assert.equal(called.name, "beacon_list_contract_gaps");
  assert.deepEqual(called.args, {
    p_company_id: COMPANY,
    p_actor_auth_user_id: ACTOR,
    p_actor_member_id: MEMBER,
    p_limit: 25,
  });
  assert.deepEqual(JSON.parse(result.output), [{
    client_id: "22222222-2222-4222-8222-222222222222",
    client_name: "Approved",
    internal_path: "/clients/approved",
  }]);
  assert.deepEqual(result.links, [{ label: "Approved", path: "/clients/approved" }]);
});

test("orchestrator permits at most three sequential tool executions", async () => {
  let providerCalls = 0;
  let rpcCalls = 0;
  const seenInputs = [];
  const provider = {
    createResponse: async ({ input }) => {
      providerCalls += 1;
      seenInputs.push(structuredClone(input));
      if (providerCalls <= 3) {
        return {
          id: `resp_${providerCalls}`,
          output: [{
            type: "function_call",
            call_id: `call_${providerCalls}`,
            name: "company_metrics",
            arguments: "{}",
          }],
          usage: { input_tokens: 10, output_tokens: 2 },
        };
      }
      return {
        id: "resp_final",
        output: [{ type: "message", content: [{ type: "output_text", text: "All done" }] }],
        usage: { input_tokens: 10, output_tokens: 2 },
      };
    },
  };
  const result = await runBeaconTurn({
    provider,
    serviceClient: { rpc: async () => { rpcCalls += 1; return { data: [], error: null }; } },
    context: CONTEXT,
    history: [],
    message: "metrics",
    safetyIdentifier: "safe",
    deadlineMs: 10_000,
    now: () => 1,
  });
  assert.equal(providerCalls, 4);
  assert.equal(rpcCalls, 3);
  assert.equal(result.answer, "All done");
  assert.equal(result.toolActivity.length, 3);
  assert.equal(seenInputs[1].at(-1).type, "function_call_output");
  assert.equal(seenInputs[1].at(-2).type, "function_call");
});

test("a fourth requested tool execution fails closed", async () => {
  let rpcCalls = 0;
  let call = 0;
  await assert.rejects(
    () => runBeaconTurn({
      provider: {
        createResponse: async () => ({
          output: [{
            type: "function_call",
            call_id: `call_${++call}`,
            name: "company_metrics",
            arguments: "{}",
          }],
        }),
      },
      serviceClient: { rpc: async () => { rpcCalls += 1; return { data: [], error: null }; } },
      context: CONTEXT,
      history: [],
      message: "metrics",
      safetyIdentifier: "safe",
      deadlineMs: 10_000,
      now: () => 1,
    }),
    (error) => error.code === "tool_round_limit",
  );
  assert.equal(rpcCalls, 3);
});

test("answer sanitizer makes all model-created Markdown paths non-clickable", () => {
  const value = sanitizeAnswer(
    "[Client](/clients/abc) [Bad](https://evil.example/x) javascript:alert(1)",
  );
  assert.match(value.answer, /^Client Bad/);
  assert.doesNotMatch(value.answer, /\]\(|\/clients\/abc/);
  assert.doesNotMatch(value.answer, /evil\.example|javascript:/);
});

test("answer sanitizer removes unsupported bold markers from plain text", () => {
  const result = sanitizeAnswer("You have **14** active clients and __2__ renewals.");
  assert.equal(result.answer, "You have 14 active clients and 2 renewals.");
});
