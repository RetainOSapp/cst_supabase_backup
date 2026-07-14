const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  "https://app.retainos.ai",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

export function allowedOriginsFromEnv(getEnv) {
  const configured =
    getEnv("RETAINOS_ALLOWED_ORIGINS") ??
    getEnv("APP_ALLOWED_ORIGINS") ??
    "";
  const values = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(values.length > 0 ? values : DEFAULT_ALLOWED_ORIGINS);
}

export function isAllowedRequestOrigin(req, getEnv) {
  const origin = req.headers.get("Origin");
  if (!origin) return true;
  return allowedOriginsFromEnv(getEnv).has(origin);
}
