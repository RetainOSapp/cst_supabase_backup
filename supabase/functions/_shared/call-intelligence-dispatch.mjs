function configuredValue(name, envGet) {
  const value = envGet(name);
  return typeof value === "string" ? value.trim() : "";
}

export function buildCallIntelligenceWorkerRequest(
  runId,
  {
    envGet = (name) => Deno.env.get(name),
  } = {},
) {
  const supabaseUrl = configuredValue("SUPABASE_URL", envGet);
  const serviceRoleKey =
    configuredValue("SUPABASE_SERVICE_ROLE_KEY", envGet) ||
    configuredValue("supabase_service_role", envGet);
  if (!supabaseUrl || !serviceRoleKey || !runId) {
    throw new Error("Call Intelligence worker dispatch is not configured.");
  }
  return {
    url: new URL("/functions/v1/process-call-intelligence", supabaseUrl)
      .toString(),
    init: {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ runId }),
    },
  };
}

export function dispatchCallIntelligenceRun(
  runId,
  {
    fetchImpl = fetch,
    envGet = (name) => Deno.env.get(name),
    waitUntil =
      typeof EdgeRuntime !== "undefined" &&
      typeof EdgeRuntime.waitUntil === "function"
        ? EdgeRuntime.waitUntil.bind(EdgeRuntime)
        : null,
  } = {},
) {
  let request;
  try {
    request = buildCallIntelligenceWorkerRequest(runId, { envGet });
  } catch {
    console.error("Call Intelligence dispatch failed", {
      category: "worker_dispatch_not_configured",
      run_id: runId,
    });
    return false;
  }

  const task = fetchImpl(request.url, request.init)
    .then((response) => {
      if (!response.ok) {
        console.error("Call Intelligence dispatch failed", {
          category: "worker_dispatch_rejected",
          run_id: runId,
          status: response.status,
        });
      }
    })
    .catch(() => {
      console.error("Call Intelligence dispatch failed", {
        category: "worker_dispatch_unavailable",
        run_id: runId,
      });
    });

  if (waitUntil) {
    waitUntil(task);
  } else {
    void task;
  }
  return true;
}
