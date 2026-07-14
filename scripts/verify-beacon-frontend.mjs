#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const api = read("src/lib/beaconApi.ts");
const widget = read("src/components/beacon/BeaconWidget.tsx");
const aiFeatures = read("src/components/beacon/AiFeaturesPanel.tsx");
const appShell = read("src/components/Header.tsx");
const saasClientDetail = read("src/pages/SaasClientDetail.tsx");
const app = read("src/App.tsx");
const packageJson = read("package.json");
const beaconBrowserSource = [api, widget, aiFeatures].join("\n");
const distAssetsUrl = new URL("../dist/assets/", import.meta.url);
const builtJavascript = existsSync(distAssetsUrl)
  ? readdirSync(distAssetsUrl)
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFileSync(new URL(name, distAssetsUrl), "utf8"))
      .join("\n")
  : "";

const allowanceMutationStart = api.indexOf("const allowancePolicies");
const allowanceMutationEnd = api.indexOf(
  "const response = await invokeSignedFunction<unknown>",
  allowanceMutationStart,
);
const allowanceMutation =
  allowanceMutationStart >= 0 && allowanceMutationEnd > allowanceMutationStart
    ? api.slice(allowanceMutationStart, allowanceMutationEnd)
    : "";

const forbiddenCredentialOrProviderPatterns = [
  /@openai\b/i,
  /@anthropic-ai\b/i,
  /api\.openai\.com/i,
  /api\.anthropic\.com/i,
  /OPENAI_API_KEY/,
  /ANTHROPIC_API_KEY/,
  /VITE_[A-Z0-9_]*(?:OPENAI|ANTHROPIC|BEACON)[A-Z0-9_]*KEY/,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /service[_-]?role/i,
];

const checks = [
  [
    "Beacon browser source contains no provider SDK, endpoint, or privileged credential",
    forbiddenCredentialOrProviderPatterns.every(
      (pattern) => !pattern.test(beaconBrowserSource),
    ),
  ],
  [
    "frontend dependencies contain no OpenAI or Anthropic SDK",
    !/"(?:openai|@openai\/[^"/]+|@anthropic-ai\/[^"/]+)"\s*:/i.test(
      packageJson,
    ),
  ],
  [
    "Beacon browser modules perform no raw Supabase table or RPC query",
    !/\.from\s*\(/.test(beaconBrowserSource) &&
      !/\.rpc\s*\(/.test(beaconBrowserSource),
  ],
  [
    "Beacon conversation is memory-only",
    !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(
      beaconBrowserSource,
    ) && widget.includes("useState<DisplayMessage[]>([])") &&
      widget.includes("setMessages([])"),
  ],
  [
    "model answers are plain React text without HTML or Markdown rendering",
    !/dangerouslySetInnerHTML|innerHTML\s*=|ReactMarkdown|marked\s*\(/.test(
      beaconBrowserSource,
    ) &&
      widget.includes('className="whitespace-pre-wrap break-words"') &&
      widget.includes("{message.content}"),
  ],
  [
    "widget enforces the reviewed browser input and history caps",
    widget.includes("const CLIENT_INPUT_LIMIT = 2_000") &&
      widget.includes("const CLIENT_HISTORY_LIMIT = 10") &&
      widget.includes("const CLIENT_HISTORY_CONTENT_LIMIT = 2_000") &&
      widget.includes("maxLength={inputLimit}") &&
      widget.includes("Math.min(access?.limits?.maxInputCharacters") &&
      widget.includes("Math.min(access?.limits?.maxHistoryMessages"),
  ],
  [
    "widget stays hidden without affirmative enabled server access",
    widget.includes("result.allowed &&") &&
      widget.includes("result.enabled &&") &&
      widget.includes('result.featureStatus === "pilot"') &&
      widget.includes('result.featureStatus === "enabled"') &&
      widget.includes("if (!access) return null"),
  ],
  [
    "Viewer is fail-closed before any Beacon visibility request",
    widget.includes('role === "viewer"') &&
      widget.includes("loadBeaconAccess(effectiveCompanyId)"),
  ],
  [
    "company switch and sign-out inputs reset memory-only conversation state",
    widget.includes("setOpen(false)") &&
      widget.includes("setMessages([])") &&
      widget.includes("setInput(\"\")") &&
      widget.includes("[effectiveCompanyId, email, role, status]"),
  ],
  [
    "only signed Supabase Edge calls leave the Beacon browser adapter",
    api.includes("supabase.auth.getSession()") &&
      api.includes("supabase.functions.invoke(functionName") &&
      api.includes("Authorization: `Bearer ${session.access_token}`") &&
      !/fetch\s*\(/.test(api),
  ],
  [
    "frontend uses the frozen separated Edge endpoint names",
    api.includes('"beacon-access"') &&
      api.includes('"beacon-chat"') &&
      api.includes('"manage-ai-feature-entitlement"'),
  ],
  [
    "chat requests contain only company selector, message, and bounded history",
    api.includes("companyId: string;\n  message: string;\n  history: BeaconHistoryMessage[];") &&
      !/sendBeaconMessage[\s\S]{0,350}\b(?:actor|memberId|teamMemberId|model|toolChoice)\b/.test(
        api,
      ),
  ],
  [
    "chat responses are runtime-validated and bounded before rendering",
    api.includes("function parseBeaconChat") &&
      api.includes("boundedString(body.requestId, 200, true)") &&
      api.includes("boundedString(body.answer, 20_000, true)") &&
      api.includes("throw malformedResponse()"),
  ],
  [
    "AI Feature list and update responses are runtime-validated before rendering",
    api.includes("function parseManagedAiFeature") &&
      api.includes("function parseAiFeatureList") &&
      api.includes("function parseAiFeatureUpdate") &&
      api.includes("body.features.map(parseManagedAiFeature)") &&
      !aiFeatures.includes("feature.lastError"),
  ],
  [
    "structured links are restricted to an internal client-detail route",
    widget.includes(String.raw`^\/clients\/[A-Za-z0-9_-]+$`) &&
      widget.includes("(response.links ?? []).filter(safeClientLink)") &&
      widget.includes("<Link") &&
      widget.includes("to={link.path}") &&
      !/https?:\/\//.test(widget),
  ],
  [
    "AppShell owns one route-persistent Beacon widget",
    appShell.includes('import { BeaconWidget } from "./beacon/BeaconWidget.tsx"') &&
      (appShell.match(/<BeaconWidget\s*\/>/g) ?? []).length === 1,
  ],
  [
    "AI Features mount only behind both SuperAdmin route and registry context guards",
    saasClientDetail.includes('mode === "super_admin" && isSuperAdmin') &&
      saasClientDetail.includes("<AiFeaturesPanel") &&
      app.includes('<SaasClientDetail companyIdOverride={effectiveCompanyId} mode="admin" />'),
  ],
  [
    "ordinary Admin Hub cannot mount or fetch AI Features",
    (saasClientDetail.match(/<AiFeaturesPanel/g) ?? []).length === 1 &&
      !app.includes("<AiFeaturesPanel") &&
      aiFeatures.includes("listManagedAiFeatures(companyId)") &&
      !saasClientDetail.includes('mode === "admin" && <AiFeaturesPanel'),
  ],
  [
    "AI Feature mutation excludes metered usage and server-period authority",
    allowanceMutation.length > 0 &&
      allowanceMutation.includes("meterType: allowance.meterType") &&
      allowanceMutation.includes("periodType: allowance.periodType") &&
      allowanceMutation.includes("limitValue: allowance.limitValue") &&
      allowanceMutation.includes("warningThresholds: allowance.warningThresholds") &&
      !/\bid\b|usedValue|periodStartedAt|periodEndsAt/.test(allowanceMutation),
  ],
  [
    "Start and Resume require positive hard allowances in the UI",
    aiFeatures.includes("const canEnable = allowances.length > 0 && allowancesValid") &&
      aiFeatures.includes("allowances.every((allowance) => allowance.limitValue > 0)") &&
      (aiFeatures.match(/disabled=\{saving \|\| !canEnable\}/g) ?? [])
        .length === 2,
  ],
  [
    "Phase 1 Beacon UI permits only its single enforced currency meter",
    aiFeatures.includes('feature.featureKey === "beacon"') &&
      aiFeatures.includes('value === "usd_cents"') &&
      api.includes('featureKey === "beacon"') &&
      api.includes('allowances[0].meterType !== "usd_cents"'),
  ],
  [
    "unreleased AI feature cards cannot be configured or pre-enabled",
    aiFeatures.includes('const isReleased = feature.featureKey === "beacon"') &&
      aiFeatures.includes("Coming soon") &&
      aiFeatures.includes("it cannot be configured or enabled"),
  ],
  [
    "Beacon restores launcher focus after keyboard or button close",
    widget.includes("const launcherRef = useRef<HTMLButtonElement>(null)") &&
      widget.includes("ref={launcherRef}") &&
      (widget.match(/launcherRef\.current\?\.focus\(\)/g) ?? []).length >= 2,
  ],
  [
    "frontend never imports the quarantined prototype",
    !/BEACON_PROTOTYPE_REFERENCE_DO_NOT_COMMIT|src\/lib\/beacon\//.test(
      beaconBrowserSource,
    ),
  ],
  [
    "production bundle includes Beacon and excludes provider credentials and SDK paths",
    builtJavascript.toLowerCase().includes("beacon") &&
      builtJavascript.includes("manage-ai-feature-entitlement") &&
      forbiddenCredentialOrProviderPatterns.every(
        (pattern) => !pattern.test(builtJavascript),
      ),
  ],
];

let failed = 0;
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
  if (!passed) failed += 1;
}

console.log(`\n${checks.length - failed}/${checks.length} Beacon frontend checks passed.`);
if (failed) {
  console.error(`Verifier: ${fileURLToPath(import.meta.url)}`);
  process.exit(1);
}
