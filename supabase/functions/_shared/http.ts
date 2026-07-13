const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://app.retainos.ai",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function parseAllowedOrigins() {
  const configured =
    Deno.env.get("RETAINOS_ALLOWED_ORIGINS") ??
    Deno.env.get("APP_ALLOWED_ORIGINS") ??
    "";
  return new Set(
    configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function corsHeaders(
  req: Request,
  allowedHeaders =
    "authorization, x-client-info, apikey, content-type",
  methods = "POST, OPTIONS",
) {
  const origin = req.headers.get("Origin") ?? "";
  const configuredOrigins = parseAllowedOrigins();
  const allowedOrigins =
    configuredOrigins.size > 0 ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Allow-Methods": methods,
    "Vary": "Origin",
  };

  if (
    origin &&
    allowedOrigins.has(origin)
  ) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      ...extraHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function optionsResponse(req: Request, allowedHeaders?: string) {
  return new Response("ok", { headers: corsHeaders(req, allowedHeaders) });
}
