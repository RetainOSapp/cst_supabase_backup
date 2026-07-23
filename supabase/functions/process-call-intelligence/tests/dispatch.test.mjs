import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCallIntelligenceWorkerRequest,
  dispatchCallIntelligenceRun,
} from "../../_shared/call-intelligence-dispatch.mjs";

const env = new Map([
  ["SUPABASE_URL", "https://example.supabase.co"],
  ["SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-role"],
]);
const envGet = (name) => env.get(name);

test("builds a service-authenticated worker request with only the run ID", () => {
  const request = buildCallIntelligenceWorkerRequest("run-123", { envGet });
  assert.equal(
    request.url,
    "https://example.supabase.co/functions/v1/process-call-intelligence",
  );
  assert.equal(request.init.headers.Authorization, "Bearer synthetic-service-role");
  assert.deepEqual(JSON.parse(request.init.body), { runId: "run-123" });
});

test("dispatches queued work through waitUntil", async () => {
  const pending = [];
  const requests = [];
  const dispatched = dispatchCallIntelligenceRun("run-456", {
    envGet,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(null, { status: 202 });
    },
    waitUntil: (promise) => pending.push(promise),
  });
  assert.equal(dispatched, true);
  assert.equal(pending.length, 1);
  await pending[0];
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0].init.body), { runId: "run-456" });
});
