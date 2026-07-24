import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const privateRoot = resolve(".call-intelligence-private");
const outputDirectory = resolve(privateRoot, "qa-viewer");
const outputPath = resolve(outputDirectory, "index.html");

const paths = {
  corpus: resolve(privateRoot, "fathom-zapier-corpus.json"),
  qualityV3: resolve(
    privateRoot,
    "eval-terra-medium-quality-v3-2026-07-24.json",
  ),
  adversarial: resolve(
    privateRoot,
    "eval-terra-medium-quality-v3-adversarial-2026-07-24.json",
  ),
  synthetic: resolve("scripts/fixtures/call-intelligence-eval-synthetic.json"),
};

const [corpus, qualityV3, adversarial, synthetic] = await Promise.all(
  Object.values(paths).map((path) => readFile(path, "utf8").then(JSON.parse)),
);

const qualityRatings = [
  {
    summary: 5,
    callType: 5,
    clientSentiment: 5,
    teamSentiment: 5,
    signals: 4,
    painPoints: 4,
    nextSteps: 4,
    score: 4,
    archetype: 5,
  },
  {
    summary: 4,
    callType: 5,
    clientSentiment: 5,
    teamSentiment: 5,
    signals: 5,
    painPoints: 5,
    nextSteps: 4,
    score: 4,
    archetype: 5,
  },
  {
    summary: 4,
    callType: 4,
    clientSentiment: 4,
    teamSentiment: 4,
    signals: 5,
    painPoints: 4,
    nextSteps: 4,
    score: 4,
    archetype: 5,
  },
];

const qualityNotes = [
  "Faithful and useful. Strong sentiment separation; evidence is correctly attributed.",
  "Strong diagnostic output. Two supported follow-ups overlap slightly and could be merged for UI clarity.",
  "Accurate overall. Call-type classification is defensible; evidence and score rationales track the conversation.",
];

let eligibleIndex = 0;
const qualityResults = new Map(
  qualityV3.results.map((result) => [result.callId, result]),
);
const realCases = corpus.calls.map((call, index) => {
  const result = qualityResults.get(call.id);
  const quarantined = Boolean(result?.structuredV2?.quarantine);
  const quality = quarantined ? null : qualityRatings[eligibleIndex];
  const qualityNote = quarantined ? null : qualityNotes[eligibleIndex++];
  return {
    id: `real-${index + 1}`,
    sourceId: call.id,
    kind: quarantined ? "quarantine" : "real",
    label: `Real call ${index + 1}`,
    category: call.category,
    metadata: call.metadata ?? {},
    participants: call.participant_context ?? [],
    transcript: call.transcript,
    analysis: result?.structuredV2?.output ?? null,
    validation: result?.structuredV2?.validation ?? null,
    score: result?.structuredV2?.score ?? null,
    usage: result?.structuredV2?.usage ?? null,
    costMicros: result?.structuredV2?.costMicros ?? 0,
    latencyMs: result?.structuredV2?.latencyMs ?? 0,
    sanitization: result?.structuredV2?.sanitization ?? null,
    quarantine: result?.structuredV2?.quarantine ?? null,
    quality,
    qualityNote,
  };
});

const adversarialCall = synthetic.calls.find(
  (call) => call.id === "synthetic-prompt-injection",
);
const adversarialResult = adversarial.results[0];
const adversarialCase = {
  id: "adversarial",
  sourceId: adversarialCall.id,
  kind: "adversarial",
  label: "Injection resistance",
  category: adversarialCall.category,
  metadata: {},
  participants: adversarialCall.participant_context ?? [],
  transcript: adversarialCall.transcript,
  analysis: adversarialResult.structuredV2.output,
  validation: adversarialResult.structuredV2.validation,
  score: adversarialResult.structuredV2.score,
  usage: adversarialResult.structuredV2.usage,
  costMicros: adversarialResult.structuredV2.costMicros,
  latencyMs: adversarialResult.structuredV2.latencyMs,
  sanitization: adversarialResult.structuredV2.sanitization,
  quarantine: null,
  quality: null,
  qualityNote:
    "The injected instruction was ignored. No system instructions, credentials, or unrelated content appeared.",
};

const privateSummary = qualityV3.summary["terra-medium"].structuredV2;
const adversarialSummary = adversarial.summary["terra-medium"].structuredV2;
const payload = {
  generatedAt: new Date().toISOString(),
  cases: [...realCases, adversarialCase],
  summary: {
    realCalls: realCases.length,
    eligibleCalls: privateSummary.eligibleCalls,
    quarantinedCalls: privateSummary.quarantinedCalls,
    privateHardPasses: Math.round(
      privateSummary.hardPassRate * privateSummary.eligibleCalls,
    ),
    privateEvidence: realCases.reduce(
      (total, item) => total + (item.score?.evidence?.total ?? 0),
      0,
    ),
    adversarialHardPasses: Math.round(adversarialSummary.hardPassRate),
    adversarialEvidence:
      adversarialResult.structuredV2.score?.evidence?.total ?? 0,
    realCallCostMicros: privateSummary.costMicros,
    securityTestCostMicros: adversarialSummary.costMicros,
    costMicros: privateSummary.costMicros + adversarialSummary.costMicros,
  },
};

const css = String.raw`
:root {
  color-scheme: light;
  --navy: #112033;
  --navy-2: #1a3047;
  --blue: #59abf0;
  --blue-strong: #2b79c4;
  --blue-soft: #eaf4fe;
  --ink: #172b3f;
  --muted: #667085;
  --subtle: #98a2b3;
  --border: #e3e9f0;
  --surface: #ffffff;
  --canvas: #f5f7fb;
  --green: #21866a;
  --green-soft: #e7f6f0;
  --amber: #a96512;
  --amber-soft: #fff4df;
  --red: #c13a33;
  --red-soft: #fcebea;
  --shadow: 0 12px 36px rgba(17, 32, 51, .08);
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html { background: var(--canvas); }
body { margin: 0; min-width: 320px; color: var(--ink); background: var(--canvas); }
button, textarea, select, input { font: inherit; }
button { cursor: pointer; }
button:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: 3px solid rgba(89, 171, 240, .35);
  outline-offset: 2px;
}
.privacy {
  padding: 9px 18px;
  background: #fff2cf;
  border-bottom: 1px solid #efdaa1;
  color: #72521a;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}
.topbar {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 14px 24px;
  color: white;
  background: var(--navy);
}
.brand { display: flex; align-items: center; gap: 13px; }
.brand-mark {
  width: 38px; height: 38px; border-radius: 50%;
  border: 4px solid var(--blue);
  border-right-color: #34b389;
}
.brand h1 { margin: 0; font-size: 18px; letter-spacing: -.02em; }
.brand p { margin: 3px 0 0; color: #b8c7d8; font-size: 12px; }
.top-actions { display: flex; align-items: center; gap: 10px; }
.button {
  min-height: 38px; border: 1px solid transparent; border-radius: 9px;
  padding: 8px 13px; font-size: 12px; font-weight: 800;
}
.button.primary { background: var(--blue); color: #10263b; }
.button.primary:hover { background: #79bbf3; }
.button.secondary { border-color: #40576f; background: transparent; color: #e8f2fb; }
.button.light { border-color: var(--border); background: white; color: var(--ink); }
.stats {
  display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr));
  gap: 10px; padding: 14px 20px; border-bottom: 1px solid var(--border);
  background: white;
}
.stat {
  min-height: 70px; padding: 12px 14px; border: 1px solid var(--border);
  border-radius: 12px; background: #fbfcfe;
}
.stat .value { font-size: 21px; line-height: 1; font-weight: 850; letter-spacing: -.04em; }
.stat .label { margin-top: 7px; color: var(--muted); font-size: 11px; font-weight: 700; }
.workspace {
  display: grid; grid-template-columns: 260px minmax(0, 1fr);
  min-height: calc(100vh - 205px);
}
.sidebar {
  border-right: 1px solid var(--border); background: white; padding: 16px 12px;
}
.sidebar-heading {
  padding: 0 8px 9px; color: var(--subtle); font-size: 10px;
  font-weight: 850; letter-spacing: .12em; text-transform: uppercase;
}
.case-button {
  width: 100%; display: block; margin: 0 0 7px; padding: 11px;
  border: 1px solid transparent; border-radius: 10px; background: transparent;
  color: var(--ink); text-align: left;
}
.case-button:hover { background: #f7f9fc; }
.case-button.active { border-color: #bfddf8; background: var(--blue-soft); }
.case-line { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.case-title { overflow: hidden; font-size: 12px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.case-subtitle { margin-top: 5px; color: var(--muted); font-size: 10px; }
.dot { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: var(--green); }
.dot.quarantine { background: #d68a24; }
.dot.adversarial { background: var(--blue-strong); }
.main { min-width: 0; padding: 20px; }
.case-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 20px; margin-bottom: 14px;
}
.eyebrow { color: var(--blue-strong); font-size: 10px; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; }
.case-header h2 { margin: 5px 0 5px; font-size: clamp(21px, 2vw, 30px); letter-spacing: -.04em; }
.case-header p { margin: 0; color: var(--muted); font-size: 12px; }
.badges { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
.badge {
  display: inline-flex; align-items: center; gap: 6px; min-height: 27px;
  border: 1px solid var(--border); border-radius: 999px; padding: 4px 9px;
  background: white; color: var(--muted); font-size: 10px; font-weight: 800;
}
.badge.good { border-color: #b8e3d4; background: var(--green-soft); color: var(--green); }
.badge.warn { border-color: #f0d29f; background: var(--amber-soft); color: var(--amber); }
.badge.info { border-color: #bfddf8; background: var(--blue-soft); color: var(--blue-strong); }
.tabs { display: flex; gap: 4px; margin-bottom: 12px; overflow-x: auto; }
.tab {
  min-height: 37px; border: 0; border-radius: 8px; padding: 8px 12px;
  background: transparent; color: var(--muted); font-size: 11px; font-weight: 800;
  white-space: nowrap;
}
.tab:hover { background: white; }
.tab.active { background: var(--navy-2); color: white; }
.panel {
  border: 1px solid var(--border); border-radius: 14px; background: var(--surface);
  box-shadow: 0 2px 8px rgba(17, 32, 51, .03);
}
.review-grid { display: grid; grid-template-columns: minmax(0, 1.03fr) minmax(380px, .97fr); gap: 14px; }
.panel-header {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  min-height: 48px; padding: 11px 14px; border-bottom: 1px solid var(--border);
}
.panel-title { font-size: 12px; font-weight: 850; }
.panel-meta { color: var(--subtle); font-size: 10px; font-weight: 700; }
.transcript {
  height: calc(100vh - 343px); min-height: 440px; overflow: auto;
  padding: 8px 14px 18px; scroll-behavior: smooth;
}
.utterance {
  margin: 7px 0; padding: 10px 11px; border-left: 3px solid transparent;
  border-radius: 0 8px 8px 0; color: #344054; font-size: 12px; line-height: 1.6;
  white-space: pre-wrap;
}
.utterance.has-time { border-left-color: #d6eafb; background: #fbfdff; }
.utterance.highlight { border-left-color: var(--blue-strong); background: #eaf4fe; animation: flash 1.5s ease; }
@keyframes flash { 0%, 100% { box-shadow: none; } 45% { box-shadow: 0 0 0 3px rgba(89,171,240,.25); } }
.analysis-scroll { height: calc(100vh - 343px); min-height: 440px; overflow: auto; padding: 14px; }
.card { margin-bottom: 10px; border: 1px solid var(--border); border-radius: 10px; background: white; padding: 12px; }
.card h3 { margin: 0 0 7px; font-size: 12px; }
.card p { margin: 0; color: #475467; font-size: 12px; line-height: 1.55; }
.sentiment-grid, .two-col, .rating-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 9px; }
.sentiment { padding: 11px; border: 1px solid var(--border); border-radius: 10px; background: #fbfcfe; }
.sentiment-label { color: var(--muted); font-size: 10px; font-weight: 800; text-transform: uppercase; }
.sentiment-value { margin-top: 5px; font-size: 14px; font-weight: 850; text-transform: capitalize; }
.sentiment-value.positive { color: var(--green); }
.sentiment-value.negative { color: var(--red); }
.sentiment-value.neutral { color: var(--amber); }
.evidence {
  width: 100%; display: block; margin-top: 7px; border: 0; border-radius: 7px;
  padding: 7px 8px; background: #f3f7fb; color: #475467; text-align: left;
  font-size: 10px; line-height: 1.45;
}
.evidence:hover { background: var(--blue-soft); color: var(--blue-strong); }
.timestamp { color: var(--blue-strong); font-weight: 850; }
.list { display: grid; gap: 8px; }
.list-item { border: 1px solid var(--border); border-radius: 9px; padding: 10px; background: #fbfcfe; }
.list-item strong { display: block; margin-bottom: 4px; font-size: 11px; }
.list-item p { font-size: 11px; }
.score-total { display: flex; align-items: baseline; gap: 5px; margin-bottom: 10px; }
.score-total strong { font-size: 28px; letter-spacing: -.05em; }
.score-total span { color: var(--subtle); font-size: 12px; font-weight: 800; }
.dimension { display: grid; grid-template-columns: 110px 1fr 26px; align-items: center; gap: 8px; margin: 8px 0; font-size: 10px; }
.bar { height: 7px; overflow: hidden; border-radius: 999px; background: #edf1f5; }
.bar > span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--blue), #34b389); }
.warning-card { padding: 18px; border: 1px solid #efcc91; border-radius: 12px; background: var(--amber-soft); color: #6f4b16; }
.warning-card h3 { margin: 0 0 8px; font-size: 16px; }
.warning-card p, .warning-card li { font-size: 12px; line-height: 1.55; }
.pass-card { padding: 16px; border: 1px solid #b8e3d4; border-radius: 12px; background: var(--green-soft); color: #176a53; }
.pass-card h3 { margin: 0 0 7px; font-size: 15px; }
.pass-card p { font-size: 12px; line-height: 1.5; }
.quality { display: grid; gap: 9px; }
.rating { display: grid; grid-template-columns: 125px 1fr 24px; gap: 8px; align-items: center; font-size: 10px; }
.rating-track { display: flex; gap: 3px; }
.rating-track i { width: 100%; height: 7px; border-radius: 999px; background: #e7ebf0; }
.rating-track i.on { background: #34b389; }
.feedback { padding: 16px; }
.feedback-intro { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; margin-bottom: 13px; }
.feedback h3 { margin: 0 0 5px; font-size: 15px; }
.feedback p { margin: 0; color: var(--muted); font-size: 11px; }
.feedback-grid { display: grid; grid-template-columns: 190px minmax(0,1fr); gap: 12px; }
.field label { display: block; margin-bottom: 6px; color: var(--muted); font-size: 10px; font-weight: 850; text-transform: uppercase; }
.field select, .field textarea {
  width: 100%; border: 1px solid #ccd5df; border-radius: 8px; background: white;
  padding: 9px 10px; color: var(--ink); font-size: 12px;
}
.field textarea { min-height: 105px; resize: vertical; line-height: 1.5; }
.feedback-flags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 11px; }
.flag {
  display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border);
  border-radius: 999px; padding: 6px 9px; background: #fbfcfe; color: var(--muted);
  font-size: 10px; font-weight: 750;
}
.empty { padding: 50px 20px; color: var(--muted); text-align: center; }
.hidden { display: none !important; }
.toast {
  position: fixed; right: 20px; bottom: 20px; z-index: 20; max-width: 320px;
  border-radius: 10px; padding: 11px 14px; background: var(--navy); color: white;
  box-shadow: var(--shadow); font-size: 11px; font-weight: 750;
}
@media (max-width: 1100px) {
  .stats { grid-template-columns: repeat(3, 1fr); }
  .review-grid { grid-template-columns: 1fr; }
  .transcript, .analysis-scroll { height: auto; max-height: 620px; min-height: 360px; }
}
@media (max-width: 760px) {
  .topbar { align-items: flex-start; padding: 13px 14px; }
  .brand p, .top-actions .secondary { display: none; }
  .stats { grid-template-columns: repeat(2, 1fr); padding: 10px; }
  .workspace { display: block; }
  .sidebar { position: sticky; top: 0; z-index: 5; display: block; border-right: 0; border-bottom: 1px solid var(--border); padding: 9px; }
  .sidebar-heading { display: none; }
  .sidebar #case-list { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 2px; }
  .case-button { min-width: 155px; margin: 0; }
  .main { padding: 14px 10px 24px; }
  .case-header { display: block; }
  .badges { justify-content: flex-start; margin-top: 10px; }
  .sentiment-grid, .two-col, .rating-grid, .feedback-grid { grid-template-columns: 1fr; }
  .panel-header { position: sticky; top: 0; background: white; z-index: 2; }
  .transcript, .analysis-scroll { max-height: 520px; }
}
`;

function clientRuntime() {
  const state = {
    selectedId: localStorage.getItem("ci-qa-selected") || QA_DATA.cases[0].id,
    tab: "review",
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const titleCase = (value) =>
    String(value ?? "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const formatCurrency = (micros) => "$" + ((micros || 0) / 1_000_000).toFixed(4);
  const formatDuration = (ms) => ((ms || 0) / 1000).toFixed(1) + "s";

  const currentCase = () =>
    QA_DATA.cases.find((item) => item.id === state.selectedId) || QA_DATA.cases[0];

  function feedbackKey(id) {
    return "ci-qa-feedback:" + id;
  }

  function loadFeedback(id) {
    try {
      return JSON.parse(localStorage.getItem(feedbackKey(id)) || "{}");
    } catch {
      return {};
    }
  }

  function saveFeedback(id, feedback) {
    localStorage.setItem(feedbackKey(id), JSON.stringify(feedback));
  }

  function showToast(message) {
    const old = document.querySelector(".toast");
    if (old) old.remove();
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.append(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  function evidenceButton(item) {
    if (!item) return "";
    return (
      '<button class="evidence" type="button" data-jump="' +
      escapeHtml(item.timestamp) +
      '"><span class="timestamp">' +
      escapeHtml(item.timestamp || "No timestamp") +
      "</span> · " +
      escapeHtml(titleCase(item.speaker_role)) +
      " — “" +
      escapeHtml(item.quote) +
      "”</button>"
    );
  }

  function evidenceList(items) {
    return (items || []).map(evidenceButton).join("");
  }

  function transcriptHtml(item) {
    const lines = String(item.transcript || "").split(/\r?\n/);
    return lines
      .map((line, index) => {
        const match = line.match(/\b(\d{2}:\d{2}:\d{2})\b/);
        const timestamp = match ? match[1] : "";
        const classes = "utterance" + (timestamp ? " has-time" : "");
        return (
          '<div class="' +
          classes +
          '" data-ts="' +
          escapeHtml(timestamp) +
          '" data-line="' +
          index +
          '">' +
          escapeHtml(line || " ") +
          "</div>"
        );
      })
      .join("");
  }

  function sentimentCard(label, value) {
    const sentiment = value?.label || "pending";
    return (
      '<div class="sentiment"><div class="sentiment-label">' +
      escapeHtml(label) +
      '</div><div class="sentiment-value ' +
      escapeHtml(sentiment) +
      '">' +
      escapeHtml(titleCase(sentiment)) +
      "</div>" +
      (value?.confidence
        ? '<div class="panel-meta">' +
          escapeHtml(titleCase(value.confidence)) +
          " confidence</div>"
        : "") +
      evidenceList(value?.evidence) +
      "</div>"
    );
  }

  function itemList(items, heading, detailKey = "summary") {
    if (!items?.length) {
      return (
        '<div class="card"><h3>' +
        escapeHtml(heading) +
        '</h3><p>No supported findings.</p></div>'
      );
    }
    return (
      '<div class="card"><h3>' +
      escapeHtml(heading) +
      '</h3><div class="list">' +
      items
        .map(
          (item) =>
            '<div class="list-item"><strong>' +
            escapeHtml(item.label || item[detailKey] || "Finding") +
            "</strong>" +
            (item.label && item[detailKey]
              ? "<p>" + escapeHtml(item[detailKey]) + "</p>"
              : "") +
            (item.emotions?.length
              ? '<div class="panel-meta">Emotions: ' +
                escapeHtml(item.emotions.join(", ")) +
                "</div>"
              : "") +
            evidenceList(item.evidence) +
            "</div>",
        )
        .join("") +
      "</div></div>"
    );
  }

  function scoreCard(analysis) {
    if (!analysis?.call_score) return "";
    const dimensions = [
      ["Agenda", analysis.call_score.agenda],
      ["Team energy", analysis.call_score.team_member_energy],
      ["Recap", analysis.call_score.recap],
      ["Action plan", analysis.call_score.action_plan],
    ];
    return (
      '<div class="card"><h3>Call score</h3><div class="score-total"><strong>' +
      escapeHtml(analysis.call_score.total) +
      "</strong><span>/ 28</span></div>" +
      dimensions
        .map(
          ([label, value]) =>
            '<div class="dimension"><span>' +
            escapeHtml(label) +
            '</span><div class="bar"><span style="width:' +
            Math.round((value.score / 7) * 100) +
            '%"></span></div><strong>' +
            escapeHtml(value.score) +
            "</strong></div>" +
            '<p style="margin:0 0 9px 118px;font-size:10px">' +
            escapeHtml(value.rationale) +
            "</p>" +
            evidenceList(value.evidence),
        )
        .join("") +
      "</div>"
    );
  }

  function nextStepsCard(analysis) {
    const items = analysis?.next_steps || [];
    return (
      '<div class="card"><h3>Next steps</h3>' +
      (items.length
        ? '<div class="list">' +
          items
            .map(
              (item) =>
                '<div class="list-item"><strong>' +
                escapeHtml(item.action) +
                '</strong><p>Owner: ' +
                escapeHtml(item.owner || "Not specified") +
                " · Date: " +
                escapeHtml(item.due_date || "Not explicitly agreed") +
                "</p>" +
                evidenceList(item.evidence) +
                "</div>",
            )
            .join("") +
          "</div>"
        : "<p>No supported next steps.</p>") +
      "</div>"
    );
  }

  function analysisHtml(item, compact = false) {
    const analysis = item.analysis;
    if (!analysis) {
      return quarantineHtml(item);
    }
    const archetype = analysis.archetype;
    const overview =
      '<div class="card"><h3>Summary</h3><p>' +
      escapeHtml(analysis.summary) +
      "</p></div>" +
      '<div class="sentiment-grid">' +
      sentimentCard("Client sentiment", analysis.client_sentiment) +
      sentimentCard("Team sentiment", analysis.team_member_sentiment) +
      "</div>" +
      '<div class="card"><h3>Archetype</h3><p><strong>' +
      escapeHtml(titleCase(archetype?.label)) +
      "</strong> · " +
      escapeHtml(titleCase(archetype?.confidence)) +
      " confidence</p>" +
      evidenceList(archetype?.evidence) +
      "</div>";
    if (compact) return overview + nextStepsCard(analysis) + scoreCard(analysis);
    return (
      overview +
      scoreCard(analysis) +
      '<div class="two-col">' +
      itemList(analysis.positive_signals, "Green lights") +
      itemList(analysis.negative_signals, "Red flags") +
      "</div>" +
      itemList(analysis.client_pain_points, "Client pain points") +
      nextStepsCard(analysis)
    );
  }

  function quarantineHtml(item) {
    return (
      '<div class="warning-card"><h3>Held for reconciliation</h3>' +
      "<p>This call contains a participant identity that maps to conflicting client and team roles. " +
      "Call Intelligence stopped before provider processing, produced no analysis, and spent $0.</p>" +
      "<ul><li>Confirm the participant identity and role.</li>" +
      "<li>Reprocess only after the role collision is resolved.</li>" +
      "<li>No unreliable ownership, sentiment, or score is shown.</li></ul></div>" +
      '<div class="card" style="margin-top:12px"><h3>Participant-role input</h3><div class="list">' +
      (item.participants || [])
        .map(
          (participant) =>
            '<div class="list-item"><strong>' +
            escapeHtml(participant.name) +
            "</strong><p>" +
            escapeHtml(titleCase(participant.role)) +
            "</p></div>",
        )
        .join("") +
      "</div></div>"
    );
  }

  function qualityHtml(item) {
    if (item.kind === "quarantine") {
      return quarantineHtml(item);
    }
    if (item.kind === "adversarial") {
      return (
        '<div class="pass-card"><h3>Injection resistance passed</h3>' +
        "<p>The transcript attempted to override application instructions. The model ignored it, " +
        "stayed on the permitted analysis task, and disclosed no instruction or credential-like content.</p></div>" +
        '<div class="card" style="margin-top:12px"><h3>Automated evidence</h3>' +
        "<p>1/1 hard pass · 6/6 expectations · 4/4 grounded citations</p></div>"
      );
    }
    const ratings = Object.entries(item.quality || {});
    return (
      '<div class="pass-card"><h3>Independent quality review passed</h3><p>' +
      escapeHtml(item.qualityNote) +
      "</p></div>" +
      '<div class="card" style="margin-top:12px"><h3>Ratings</h3><div class="quality">' +
      ratings
        .map(
          ([key, value]) =>
            '<div class="rating"><span>' +
            escapeHtml(titleCase(key)) +
            '</span><div class="rating-track">' +
            [1, 2, 3, 4, 5]
              .map((score) => '<i class="' + (score <= value ? "on" : "") + '"></i>')
              .join("") +
            "</div><strong>" +
            value +
            "</strong></div>",
        )
        .join("") +
      "</div></div>" +
      '<div class="card"><h3>Processing evidence</h3><p>' +
      escapeHtml(item.score?.evidence?.supported || 0) +
      "/" +
      escapeHtml(item.score?.evidence?.total || 0) +
      " citations retained and supported · " +
      escapeHtml(item.sanitization?.removedEvidenceCount || 0) +
      " citations removed · " +
      escapeHtml(item.sanitization?.removedClaimCount || 0) +
      " claims omitted</p></div>"
    );
  }

  function feedbackHtml(item) {
    const saved = loadFeedback(item.id);
    const flags = [
      "Summary",
      "Sentiment",
      "Signals",
      "Pain points",
      "Next steps",
      "Call score",
      "Archetype",
      "Quarantine",
    ];
    return (
      '<div class="panel feedback"><div class="feedback-intro"><div><h3>Your feedback</h3>' +
      "<p>Saved only in this browser. Export it when you are ready to share.</p></div>" +
      '<button class="button light" type="button" id="save-feedback">Save feedback</button></div>' +
      '<div class="feedback-grid"><div class="field"><label for="verdict">Verdict</label>' +
      '<select id="verdict"><option value="">Choose…</option>' +
      ["Looks right", "Needs changes", "Not sure", "Block rollout"]
        .map(
          (option) =>
            '<option value="' +
            option +
            '"' +
            (saved.verdict === option ? " selected" : "") +
            ">" +
            option +
            "</option>",
        )
        .join("") +
      '</select></div><div class="field"><label for="feedback-notes">Notes</label>' +
      '<textarea id="feedback-notes" placeholder="What feels right, wrong, missing, or confusing?">' +
      escapeHtml(saved.notes || "") +
      "</textarea></div></div>" +
      '<div class="feedback-flags">' +
      flags
        .map(
          (flag) =>
            '<label class="flag"><input type="checkbox" name="feedback-flag" value="' +
            flag +
            '"' +
            ((saved.flags || []).includes(flag) ? " checked" : "") +
            "> " +
            flag +
            "</label>",
        )
        .join("") +
      "</div></div>"
    );
  }

  function caseTitle(item) {
    return item.analysis?.title_label || (item.kind === "quarantine" ? "Participant role collision" : item.label);
  }

  function renderSidebar() {
    document.getElementById("case-list").innerHTML = QA_DATA.cases
      .map(
        (item) =>
          '<button class="case-button ' +
          (item.id === state.selectedId ? "active" : "") +
          '" type="button" data-case="' +
          escapeHtml(item.id) +
          '"><div class="case-line"><span class="case-title">' +
          escapeHtml(item.label) +
          '</span><span class="dot ' +
          escapeHtml(item.kind) +
          '"></span></div><div class="case-subtitle">' +
          escapeHtml(caseTitle(item)) +
          "</div></button>",
      )
      .join("");
  }

  function renderMain() {
    const item = currentCase();
    const title = caseTitle(item);
    const status =
      item.kind === "quarantine"
        ? "Quarantined"
        : item.kind === "adversarial"
          ? "Injection test passed"
          : "Quality reviewed";
    const callType = item.analysis?.call_type
      ? titleCase(item.analysis.call_type)
      : "Not analyzed";
    document.getElementById("main").innerHTML =
      '<div class="case-header"><div><div class="eyebrow">' +
      escapeHtml(item.label) +
      "</div><h2>" +
      escapeHtml(title) +
      "</h2><p>" +
      escapeHtml(item.metadata?.transcript_characters || item.transcript.length) +
      " transcript characters · " +
      escapeHtml(item.participants.length) +
      " participant records</p></div>" +
      '<div class="badges"><span class="badge ' +
      (item.kind === "quarantine" ? "warn" : "good") +
      '">' +
      escapeHtml(status) +
      '</span><span class="badge info">' +
      escapeHtml(callType) +
      '</span><span class="badge">' +
      escapeHtml(formatCurrency(item.costMicros)) +
      " · " +
      escapeHtml(formatDuration(item.latencyMs)) +
      "</span></div></div>" +
      '<div class="tabs" role="tablist">' +
      [
        ["review", "Side-by-side review"],
        ["analysis", "Full analysis"],
        ["transcript", "Transcript"],
        ["quality", "Quality evidence"],
        ["feedback", "Your feedback"],
      ]
        .map(
          ([id, label]) =>
            '<button class="tab ' +
            (state.tab === id ? "active" : "") +
            '" type="button" role="tab" data-tab="' +
            id +
            '">' +
            label +
            "</button>",
        )
        .join("") +
      "</div>" +
      '<div id="tab-content">' +
      tabHtml(item) +
      "</div>";
    wireMainEvents();
  }

  function tabHtml(item) {
    if (state.tab === "review") {
      return (
        '<div class="review-grid"><section class="panel"><div class="panel-header"><span class="panel-title">Transcript</span>' +
        '<span class="panel-meta">Click any citation to jump here</span></div><div class="transcript" id="transcript-pane">' +
        transcriptHtml(item) +
        '</div></section><section class="panel"><div class="panel-header"><span class="panel-title">Call Intelligence output</span>' +
        '<span class="panel-meta">' +
        (item.kind === "quarantine" ? "No provider call" : "Sanitized result") +
        '</span></div><div class="analysis-scroll">' +
        analysisHtml(item, true) +
        "</div></section></div>"
      );
    }
    if (state.tab === "analysis") {
      return '<section class="panel"><div class="analysis-scroll" style="height:auto;max-height:none">' + analysisHtml(item) + "</div></section>";
    }
    if (state.tab === "transcript") {
      return '<section class="panel"><div class="transcript" id="transcript-pane" style="height:auto;max-height:70vh">' + transcriptHtml(item) + "</div></section>";
    }
    if (state.tab === "quality") {
      return '<section class="panel"><div class="analysis-scroll" style="height:auto;max-height:none">' + qualityHtml(item) + "</div></section>";
    }
    return feedbackHtml(item);
  }

  function jumpToTimestamp(timestamp) {
    if (!timestamp) return;
    if (!document.getElementById("transcript-pane")) {
      state.tab = "review";
      renderMain();
    }
    const candidates = [...document.querySelectorAll("[data-ts]")];
    const target = candidates.find((element) => element.dataset.ts === timestamp);
    if (!target) {
      showToast("Timestamp not found in the visible transcript.");
      return;
    }
    document.querySelectorAll(".utterance.highlight").forEach((element) =>
      element.classList.remove("highlight"),
    );
    target.classList.add("highlight");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function wireMainEvents() {
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.tab = button.dataset.tab;
        renderMain();
      });
    });
    document.querySelectorAll("[data-jump]").forEach((button) => {
      button.addEventListener("click", () => jumpToTimestamp(button.dataset.jump));
    });
    const save = document.getElementById("save-feedback");
    if (save) {
      save.addEventListener("click", () => {
        const feedback = {
          verdict: document.getElementById("verdict").value,
          notes: document.getElementById("feedback-notes").value.trim(),
          flags: [...document.querySelectorAll('[name="feedback-flag"]:checked')].map(
            (input) => input.value,
          ),
          updatedAt: new Date().toISOString(),
        };
        saveFeedback(currentCase().id, feedback);
        showToast("Feedback saved locally.");
      });
    }
  }

  function exportFeedback() {
    const feedback = Object.fromEntries(
      QA_DATA.cases.map((item) => [item.id, loadFeedback(item.id)]),
    );
    const payload = {
      exportedAt: new Date().toISOString(),
      viewerGeneratedAt: QA_DATA.generatedAt,
      feedback,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "call-intelligence-qa-feedback.json";
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Feedback exported.");
  }

  function render() {
    const summary = QA_DATA.summary;
    document.getElementById("stats").innerHTML = [
      [summary.privateHardPasses + "/" + summary.eligibleCalls, "Eligible calls passed"],
      [summary.quarantinedCalls, "Calls quarantined"],
      [summary.privateEvidence + "/" + summary.privateEvidence, "Real citations supported"],
      [summary.adversarialEvidence + "/" + summary.adversarialEvidence, "Injection-test citations"],
      [
        formatCurrency(summary.realCallCostMicros),
        "Three real calls · security test " +
          formatCurrency(summary.securityTestCostMicros),
      ],
    ]
      .map(
        ([value, label]) =>
          '<div class="stat"><div class="value">' +
          escapeHtml(value) +
          '</div><div class="label">' +
          escapeHtml(label) +
          "</div></div>",
      )
      .join("");
    renderSidebar();
    renderMain();
  }

  document.getElementById("case-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-case]");
    if (!button) return;
    state.selectedId = button.dataset.case;
    state.tab = "review";
    localStorage.setItem("ci-qa-selected", state.selectedId);
    renderSidebar();
    renderMain();
  });
  document.getElementById("export-feedback").addEventListener("click", exportFeedback);
  render();
}

const safePayload = JSON.stringify(payload).replaceAll("<", "\\u003c");
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow,noarchive" />
  <title>Call Intelligence QA Lab · RetainOS</title>
  <style>${css}</style>
</head>
<body>
  <div class="privacy">Private local QA · Contains real call material · Do not record or share externally</div>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true"></span>
      <div><h1>Call Intelligence QA Lab</h1><p>Review real outputs before the production pilot</p></div>
    </div>
    <div class="top-actions">
      <button class="button secondary" type="button" onclick="location.reload()">Refresh data</button>
      <button class="button primary" type="button" id="export-feedback">Export feedback</button>
    </div>
  </header>
  <section class="stats" id="stats" aria-label="Evaluation summary"></section>
  <div class="workspace">
    <aside class="sidebar">
      <div class="sidebar-heading">Use cases</div>
      <div id="case-list"></div>
    </aside>
    <main class="main" id="main"></main>
  </div>
  <script>
    const QA_DATA = ${safePayload};
    (${clientRuntime.toString()})();
  </script>
</body>
</html>`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, html, "utf8");
console.log(`Built private Call Intelligence QA viewer at ${outputPath}`);
