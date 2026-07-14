import {
  FEATURE_KEYS,
  FEATURE_STATUSES,
  LIMITS,
  METER_TYPES,
  PERIOD_TYPES,
} from "./contracts.mjs";
import { BeaconError } from "./errors.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPANY_SELECTOR_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, keys, label) {
  if (!isPlainObject(value)) {
    throw new BeaconError("invalid_request", 400, `Invalid ${label}.`);
  }
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new BeaconError("invalid_request", 400, `Invalid ${label}.`);
  }
}

export function parseCompanySelector(value) {
  if (typeof value !== "string") {
    throw new BeaconError("invalid_request", 400, "Choose a valid company.");
  }
  const selector = value.trim();
  if (!selector || (!UUID_PATTERN.test(selector) && !COMPANY_SELECTOR_PATTERN.test(selector))) {
    throw new BeaconError("invalid_request", 400, "Choose a valid company.");
  }
  return selector;
}

function cleanDisplayText(value, maxChars, label) {
  if (typeof value !== "string") {
    throw new BeaconError("invalid_request", 400, `Invalid ${label}.`);
  }
  const text = value.trim();
  if (!text || text.length > maxChars || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
    throw new BeaconError("invalid_request", 400, `Invalid ${label}.`);
  }
  return text;
}

export function screenInput(message) {
  const urlCount = (message.match(/https?:\/\//gi) ?? []).length;
  const repeatedRun = /(.)\1{199,}/u.test(message);
  const secretOrQueryProbe = /(OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|reveal\s+(the\s+)?system\s+prompt|execute\s+sql|select\s+.+\s+from\s+)/i.test(message);
  if (urlCount > 4 || repeatedRun || secretOrQueryProbe) {
    throw new BeaconError(
      "input_not_allowed",
      400,
      "That request is outside Beacon's supported operational scope.",
    );
  }
}

export function parseAccessBody(raw) {
  assertExactKeys(raw, ["companyId"], "access request");
  return { companyId: parseCompanySelector(raw.companyId) };
}

export function parseChatBody(raw) {
  assertExactKeys(raw, ["companyId", "message", "history"], "chat request");
  const companyId = parseCompanySelector(raw.companyId);
  const message = cleanDisplayText(raw.message, LIMITS.maxUserMessageChars, "message");
  screenInput(message);
  if (!Array.isArray(raw.history)) {
    throw new BeaconError("invalid_request", 400, "Invalid conversation history.");
  }

  const accepted = [];
  let retainedChars = 0;
  const candidates = raw.history.slice(-LIMITS.maxHistoryItems).reverse();
  for (const item of candidates) {
    assertExactKeys(item, ["role", "content"], "conversation history");
    if (item.role !== "user" && item.role !== "assistant") {
      throw new BeaconError("invalid_request", 400, "Invalid conversation history.");
    }
    const content = cleanDisplayText(
      item.content,
      LIMITS.maxHistoryItemChars,
      "conversation history",
    );
    screenInput(content);
    if (retainedChars + content.length > LIMITS.maxHistoryChars) break;
    retainedChars += content.length;
    accepted.push({ role: item.role, content });
  }

  return {
    companyId,
    message,
    history: accepted.reverse(),
    historyTruncated:
      accepted.length < raw.history.length || retainedChars >= LIMITS.maxHistoryChars,
  };
}

function parseWarningThresholds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    throw new BeaconError("invalid_request", 400, "Invalid allowance thresholds.");
  }
  const thresholds = [...value];
  if (
    thresholds.some(
      (entry) => typeof entry !== "number" || !Number.isInteger(entry) || entry < 1 || entry > 99,
    ) ||
    thresholds.some((entry, index) => index > 0 && entry <= thresholds[index - 1])
  ) {
    throw new BeaconError("invalid_request", 400, "Invalid allowance thresholds.");
  }
  return thresholds;
}

function parseAllowance(raw) {
  assertExactKeys(
    raw,
    ["meterType", "limitValue", "periodType", "warningThresholds"],
    "allowance",
  );
  if (!METER_TYPES.includes(raw.meterType) || !PERIOD_TYPES.includes(raw.periodType)) {
    throw new BeaconError("invalid_request", 400, "Invalid allowance.");
  }
  if (
    !Number.isSafeInteger(raw.limitValue) ||
    raw.limitValue <= 0 ||
    raw.limitValue > 1_000_000_000
  ) {
    throw new BeaconError("invalid_request", 400, "Invalid allowance limit.");
  }
  return {
    meterType: raw.meterType,
    limitValue: raw.limitValue,
    periodType: raw.periodType,
    warningThresholds: parseWarningThresholds(raw.warningThresholds),
  };
}

export function parseManageBody(raw) {
  if (!isPlainObject(raw) || (raw.action !== "list" && raw.action !== "update")) {
    throw new BeaconError("invalid_request", 400, "Choose a valid AI feature action.");
  }

  if (raw.action === "list") {
    assertExactKeys(raw, ["action", "companyId"], "AI feature request");
    return {
      action: "list",
      companyId: parseCompanySelector(raw.companyId),
    };
  }

  assertExactKeys(
    raw,
    ["action", "companyId", "featureKey", "status", "allowances"],
    "AI feature request",
  );
  if (!FEATURE_KEYS.includes(raw.featureKey) || !FEATURE_STATUSES.includes(raw.status)) {
    throw new BeaconError("invalid_request", 400, "Choose a valid AI feature and status.");
  }
  if (!Array.isArray(raw.allowances)) {
    throw new BeaconError("invalid_request", 400, "Allowances are required.");
  }
  if (raw.allowances.length > METER_TYPES.length) {
    throw new BeaconError("invalid_request", 400, "Too many allowance policies.");
  }
  const allowances = raw.allowances.map(parseAllowance);
  const meterTypes = allowances.map((allowance) => allowance.meterType);
  if (new Set(meterTypes).size !== meterTypes.length) {
    throw new BeaconError("invalid_request", 400, "Duplicate allowance meters are not allowed.");
  }
  if (
    raw.featureKey === "beacon" &&
    allowances.length > 0 &&
    (allowances.length !== 1 || allowances[0].meterType !== "usd_cents")
  ) {
    throw new BeaconError(
      "invalid_request",
      400,
      "Beacon currently requires one currency-spend allowance.",
    );
  }
  if ((raw.status === "pilot" || raw.status === "enabled") && allowances.length === 0) {
    throw new BeaconError(
      "allowance_required",
      400,
      "Set an allowance before enabling this paid AI feature.",
    );
  }

  return {
    action: "update",
    companyId: parseCompanySelector(raw.companyId),
    featureKey: raw.featureKey,
    status: raw.status,
    allowances,
  };
}

export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function assertNoUnexpectedKeys(value, allowedKeys, label = "arguments") {
  assertExactKeys(value, allowedKeys, label);
}
