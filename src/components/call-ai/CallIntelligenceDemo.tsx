import { useMemo, useState, type ReactNode } from "react";

type Sentiment = "positive" | "neutral" | "negative";
type QueueName = "assigned" | "unassigned";

interface ScoreSection {
  label: string;
  score: number;
  detail: string;
}

interface Signal {
  label: string;
  detail: string;
  timestamp: string;
}

interface DemoCall {
  id: string;
  title: string;
  client: string;
  clientInitials: string;
  teamMember: string | null;
  date: string;
  month: string;
  callType: string;
  duration: string;
  clientSentiment: Sentiment;
  teamSentiment: Sentiment;
  score: number;
  rawScore: number;
  queue: QueueName;
  summary: string;
  archetype: string;
  painPoints: string[];
  scoreSections: ScoreSection[];
  keyMoments: string[];
  redFlags: Signal[];
  greenLights: Signal[];
  emotions: string[];
  nextSteps: string[];
  transcript: string;
}

interface Filters {
  client: string;
  teamMember: string;
  month: string;
  clientSentiment: string;
  teamSentiment: string;
  score: string;
}

const EMPTY_FILTERS: Filters = {
  client: "",
  teamMember: "all",
  month: "all",
  clientSentiment: "all",
  teamSentiment: "all",
  score: "all",
};

const DEMO_CALLS: DemoCall[] = [
  {
    id: "call-renewal-strategy",
    title: "Renewal Strategy",
    client: "Amelia Grant",
    clientInitials: "AG",
    teamMember: "Emily Hawkins",
    date: "22 Jul 2026",
    month: "July 2026",
    callType: "Renewal",
    duration: "47 min",
    clientSentiment: "positive",
    teamSentiment: "positive",
    score: 9.2,
    rawScore: 26,
    queue: "assigned",
    summary:
      "Amelia and Emily aligned on the renewal plan, clarified the next-quarter success outcomes, and agreed to expand reporting support. Amelia is enthusiastic about continuing and asked for a concise implementation timeline before the final renewal review.",
    archetype: "Champion",
    painPoints: [
      "Executive reporting still requires too much manual consolidation.",
      "Ownership of the next-quarter implementation timeline is not yet explicit.",
      "The client wants earlier visibility when delivery dates begin to move.",
    ],
    scoreSections: [
      { label: "Agenda", score: 7, detail: "The three renewal decisions were stated clearly in the opening two minutes." },
      { label: "CSM energy", score: 7, detail: "Emily remained confident, curious, and responsive throughout the discussion." },
      { label: "Story & support", score: 6, detail: "Value was connected to outcomes, with one reporting example still needing evidence." },
      { label: "Action plan", score: 6, detail: "Owners were agreed; the implementation timeline needs a firm delivery date." },
    ],
    keyMoments: [
      "Amelia explicitly described RetainOS as central to the team’s next growth phase.",
      "Expansion interest increased after Emily connected reporting automation to leadership visibility.",
      "The call closed with mutual agreement on the renewal path and one open timeline decision.",
    ],
    redFlags: [
      { label: "Manual reporting load", detail: "Leadership packs still require duplicate spreadsheet work.", timestamp: "14:08" },
      { label: "Timeline ambiguity", detail: "The delivery date for the reporting expansion remains unconfirmed.", timestamp: "38:42" },
    ],
    greenLights: [
      { label: "Renewal commitment", detail: "Amelia confirmed she expects the partnership to continue.", timestamp: "31:16" },
      { label: "Expansion interest", detail: "The client requested a proposal for broader reporting support.", timestamp: "34:51" },
      { label: "Internal advocacy", detail: "Amelia offered to champion the plan with the leadership team.", timestamp: "41:03" },
    ],
    emotions: ["Confident", "Optimistic", "Relieved"],
    nextSteps: [
      "Emily to send the implementation timeline by 24 July.",
      "Amelia to confirm the leadership review date.",
      "Prepare the reporting expansion proposal before the renewal review.",
    ],
    transcript:
      "00:00:06 — Emily Hawkins: I’d love to leave today with clarity on the renewal outcomes, the reporting expansion, and exactly what each of us owns next.\n\n00:02:18 — Amelia Grant: That sounds perfect. The biggest thing for me is making the leadership reporting less manual. The team is seeing the value, but I want the story to be easier to share internally.\n\n00:14:08 — Amelia Grant: Right now we are still pulling pieces into a spreadsheet every month. It works, but it is not how we want to scale.\n\n00:31:16 — Amelia Grant: I fully expect us to continue. I would actually like to understand what the next level of support could look like.\n\n00:41:03 — Amelia Grant: Send me the timeline and I’ll take it into the leadership review. I’m happy to champion it.",
  },
  {
    id: "call-onboarding",
    title: "Onboarding Check-in",
    client: "Noah Williams",
    clientInitials: "NW",
    teamMember: "Emily Hawkins",
    date: "21 Jul 2026",
    month: "July 2026",
    callType: "Onboarding",
    duration: "38 min",
    clientSentiment: "positive",
    teamSentiment: "positive",
    score: 8.8,
    rawScore: 25,
    queue: "assigned",
    summary:
      "Noah is progressing well through onboarding and praised the responsiveness of the team. The remaining friction is concentrated around access to historical reporting and clearer ownership for two setup tasks.",
    archetype: "Explorer",
    painPoints: [
      "Historical reports are not yet available to the client team.",
      "Two onboarding tasks do not have clear owners.",
    ],
    scoreSections: [
      { label: "Agenda", score: 6, detail: "The desired outcomes were clear after a short opening catch-up." },
      { label: "CSM energy", score: 7, detail: "The CSM created a calm and encouraging tone." },
      { label: "Story & support", score: 6, detail: "Progress was reinforced with specific examples." },
      { label: "Action plan", score: 6, detail: "The major actions were captured, with two owners to confirm." },
    ],
    keyMoments: [
      "Noah described the onboarding experience as substantially easier than the previous platform.",
      "Access to historical reporting is the only material blocker.",
    ],
    redFlags: [
      { label: "Access dependency", detail: "Historical reporting access remains unresolved.", timestamp: "18:27" },
    ],
    greenLights: [
      { label: "Fast adoption", detail: "The client team is already using the weekly workflow.", timestamp: "09:42" },
      { label: "Strong service trust", detail: "Noah praised the team’s response time.", timestamp: "26:13" },
    ],
    emotions: ["Encouraged", "Curious", "Motivated"],
    nextSteps: [
      "Confirm access to historical reporting.",
      "Assign owners to the remaining onboarding tasks.",
    ],
    transcript:
      "00:00:04 — Emily Hawkins: Let’s check what is already working and make the remaining setup feel very concrete.\n\n00:09:42 — Noah Williams: The team is already in the weekly workflow. Honestly, adoption has been faster than I expected.\n\n00:18:27 — Noah Williams: The only blocker is historical reporting. Once we can see that, we are in very good shape.",
  },
  {
    id: "call-quarterly-review",
    title: "Quarterly Business Review",
    client: "Priya Desai",
    clientInitials: "PD",
    teamMember: "Marcus Chen",
    date: "18 Jul 2026",
    month: "July 2026",
    callType: "QBR",
    duration: "54 min",
    clientSentiment: "positive",
    teamSentiment: "neutral",
    score: 8.1,
    rawScore: 23,
    queue: "assigned",
    summary:
      "The review validated strong progress and surfaced an opportunity to simplify adoption across Priya’s regional teams. The client remains positive, while the action plan needs tighter sequencing.",
    archetype: "Strategist",
    painPoints: [
      "Regional teams are adopting the process at different speeds.",
      "The enablement plan contains too many simultaneous initiatives.",
    ],
    scoreSections: [
      { label: "Agenda", score: 6, detail: "The review followed a clear sequence." },
      { label: "CSM energy", score: 5, detail: "The tone was thoughtful but occasionally too reserved." },
      { label: "Story & support", score: 7, detail: "Progress was supported with relevant metrics and examples." },
      { label: "Action plan", score: 5, detail: "The priorities need a clearer order and owner." },
    ],
    keyMoments: [
      "Priya tied the program directly to improved leadership visibility.",
      "Regional inconsistency emerged as the next adoption challenge.",
    ],
    redFlags: [
      { label: "Uneven adoption", detail: "Two regional teams are lagging behind the primary cohort.", timestamp: "22:14" },
    ],
    greenLights: [
      { label: "Measured value", detail: "Priya highlighted improved leadership visibility.", timestamp: "12:05" },
      { label: "Executive sponsorship", detail: "The program remains part of the quarterly operating plan.", timestamp: "43:30" },
    ],
    emotions: ["Focused", "Cautious", "Optimistic"],
    nextSteps: [
      "Prioritize one regional enablement initiative.",
      "Assign an owner to the adoption plan.",
    ],
    transcript:
      "00:12:05 — Priya Desai: Leadership can finally see the progress without asking three people for an update.\n\n00:22:14 — Priya Desai: The regions are not all moving at the same speed. We need a simpler rollout for the two teams that are behind.",
  },
  {
    id: "call-adoption-risk",
    title: "Adoption Check-in",
    client: "Sofia Martinez",
    clientInitials: "SM",
    teamMember: "Marcus Chen",
    date: "16 Jul 2026",
    month: "July 2026",
    callType: "Check-in",
    duration: "31 min",
    clientSentiment: "neutral",
    teamSentiment: "positive",
    score: 7.4,
    rawScore: 21,
    queue: "assigned",
    summary:
      "Sofia sees the value of the program but her team’s weekly usage has become inconsistent. Marcus identified the adoption barrier and proposed a focused reset with team leads.",
    archetype: "Pragmatist",
    painPoints: [
      "Weekly usage has dropped across two team leads.",
      "The current workflow feels too detailed for quick updates.",
    ],
    scoreSections: [
      { label: "Agenda", score: 5, detail: "The adoption objective emerged after the opening discussion." },
      { label: "CSM energy", score: 6, detail: "Marcus remained constructive and avoided defensiveness." },
      { label: "Story & support", score: 5, detail: "The recommendation was useful but lacked a before-and-after example." },
      { label: "Action plan", score: 5, detail: "A reset was proposed without a confirmed date." },
    ],
    keyMoments: [
      "Sofia clarified that the issue is workflow friction rather than perceived value.",
      "A smaller weekly update format received immediate interest.",
    ],
    redFlags: [
      { label: "Usage decline", detail: "Two team leads have stopped completing weekly updates.", timestamp: "08:44" },
      { label: "Workflow friction", detail: "The update flow feels too detailed for the current cadence.", timestamp: "12:19" },
    ],
    greenLights: [
      { label: "Value remains clear", detail: "Sofia still sees the program as important.", timestamp: "18:37" },
    ],
    emotions: ["Overwhelmed", "Receptive", "Hopeful"],
    nextSteps: [
      "Schedule a 30-minute adoption reset with the team leads.",
      "Share the simplified weekly update workflow.",
    ],
    transcript:
      "00:08:44 — Sofia Martinez: The value is there, but two of the leads have stopped doing the weekly update.\n\n00:12:19 — Sofia Martinez: It feels like too much detail when they only have five minutes.\n\n00:18:37 — Sofia Martinez: If we can make that step lighter, I think they will come back quickly.",
  },
  {
    id: "call-escalation",
    title: "Delivery Escalation",
    client: "Liam Thompson",
    clientInitials: "LT",
    teamMember: "Ava Patel",
    date: "11 Jul 2026",
    month: "July 2026",
    callType: "Escalation",
    duration: "43 min",
    clientSentiment: "negative",
    teamSentiment: "neutral",
    score: 5.9,
    rawScore: 17,
    queue: "assigned",
    summary:
      "Liam raised a serious concern about repeated delivery-date changes and limited proactive communication. Ava acknowledged the impact and secured agreement on an immediate recovery plan, but confidence remains fragile.",
    archetype: "Skeptic",
    painPoints: [
      "Two delivery dates changed without proactive notice.",
      "The client had to request status updates repeatedly.",
      "Confidence in the current delivery plan is low.",
    ],
    scoreSections: [
      { label: "Agenda", score: 4, detail: "The call opened reactively without naming the recovery decisions." },
      { label: "CSM energy", score: 5, detail: "Ava stayed composed and empathetic under pressure." },
      { label: "Story & support", score: 4, detail: "The explanation lacked enough concrete delivery evidence." },
      { label: "Action plan", score: 4, detail: "Immediate steps were agreed, but escalation ownership remains unclear." },
    ],
    keyMoments: [
      "Liam stated that another uncommunicated delay would affect renewal confidence.",
      "A daily recovery update temporarily restored forward momentum.",
    ],
    redFlags: [
      { label: "Renewal risk", detail: "Future delays may directly affect the renewal decision.", timestamp: "17:32" },
      { label: "Trust erosion", detail: "The client has repeatedly chased status updates.", timestamp: "05:18" },
    ],
    greenLights: [
      { label: "Recovery accepted", detail: "Liam accepted the proposed daily update cadence.", timestamp: "35:42" },
    ],
    emotions: ["Frustrated", "Disappointed", "Cautiously hopeful"],
    nextSteps: [
      "Send daily recovery updates through completion.",
      "Confirm one accountable escalation owner.",
      "Schedule an executive confidence check-in.",
    ],
    transcript:
      "00:05:18 — Liam Thompson: I should not have to chase for the status every time a date moves.\n\n00:17:32 — Liam Thompson: If this happens again without warning, it will absolutely affect how we think about renewal.\n\n00:35:42 — Liam Thompson: A daily update is fair. Let’s do that until we are back on plan.",
  },
  {
    id: "call-success-planning",
    title: "Success Planning",
    client: "Olivia Brooks",
    clientInitials: "OB",
    teamMember: "Ava Patel",
    date: "28 Jun 2026",
    month: "June 2026",
    callType: "Planning",
    duration: "35 min",
    clientSentiment: "positive",
    teamSentiment: "positive",
    score: 8.6,
    rawScore: 24,
    queue: "assigned",
    summary:
      "Olivia and Ava translated the client’s growth goal into three measurable outcomes. The conversation produced a focused ninety-day plan and strong mutual confidence.",
    archetype: "Builder",
    painPoints: [
      "The existing success plan contains too many loosely defined measures.",
    ],
    scoreSections: [
      { label: "Agenda", score: 6, detail: "The planning objective was explicit." },
      { label: "CSM energy", score: 6, detail: "Ava brought positive, measured energy." },
      { label: "Story & support", score: 6, detail: "The outcomes were connected to the client’s growth objective." },
      { label: "Action plan", score: 6, detail: "Three actions have owners and dates." },
    ],
    keyMoments: [
      "Olivia selected three outcomes as the definition of success.",
      "The ninety-day plan was approved without unresolved dependencies.",
    ],
    redFlags: [],
    greenLights: [
      { label: "Clear outcomes", detail: "The client approved three measurable success outcomes.", timestamp: "21:08" },
      { label: "Shared plan", detail: "Owners and dates were confirmed before close.", timestamp: "31:14" },
    ],
    emotions: ["Energized", "Clear", "Committed"],
    nextSteps: [
      "Publish the ninety-day success plan.",
      "Book the first outcome review.",
    ],
    transcript:
      "00:21:08 — Olivia Brooks: Those three outcomes are exactly how I want us to define success.\n\n00:31:14 — Ava Patel: Great, we have an owner and a date for each one. I’ll publish this today.",
  },
  {
    id: "call-unassigned-kickoff",
    title: "New Client Kickoff",
    client: "Ethan Walker",
    clientInitials: "EW",
    teamMember: null,
    date: "23 Jul 2026",
    month: "July 2026",
    callType: "Onboarding",
    duration: "42 min",
    clientSentiment: "positive",
    teamSentiment: "positive",
    score: 8.3,
    rawScore: 23,
    queue: "unassigned",
    summary:
      "The kickoff established strong alignment around the first thirty days. The call matched the client automatically and is waiting for a RetainOS team-member assignment.",
    archetype: "Explorer",
    painPoints: [
      "The client’s internal reporting owner has not been confirmed.",
    ],
    scoreSections: [
      { label: "Agenda", score: 6, detail: "The kickoff outcomes were clear." },
      { label: "CSM energy", score: 6, detail: "The facilitator created momentum." },
      { label: "Story & support", score: 6, detail: "The first-month journey was easy to understand." },
      { label: "Action plan", score: 5, detail: "One client-side owner remains open." },
    ],
    keyMoments: [
      "Ethan described the first-month plan as clearer than expected.",
    ],
    redFlags: [],
    greenLights: [
      { label: "Fast alignment", detail: "The client approved the first-month journey.", timestamp: "27:06" },
    ],
    emotions: ["Excited", "Curious", "Confident"],
    nextSteps: [
      "Assign the call to a RetainOS team member.",
      "Confirm the client-side reporting owner.",
    ],
    transcript:
      "00:27:06 — Ethan Walker: This is much clearer than I expected. I know exactly what the first month should look like.",
  },
  {
    id: "call-unassigned-review",
    title: "Monthly Review",
    client: "Maya Johnson",
    clientInitials: "MJ",
    teamMember: null,
    date: "20 Jul 2026",
    month: "July 2026",
    callType: "Review",
    duration: "29 min",
    clientSentiment: "neutral",
    teamSentiment: "positive",
    score: 7.8,
    rawScore: 22,
    queue: "unassigned",
    summary:
      "Maya is satisfied with progress but wants more concise monthly reporting. The call is matched to the client and awaiting team-member assignment.",
    archetype: "Pragmatist",
    painPoints: [
      "Monthly reports are longer than the leadership team needs.",
    ],
    scoreSections: [
      { label: "Agenda", score: 5, detail: "The review topics were clear." },
      { label: "CSM energy", score: 6, detail: "The tone was supportive." },
      { label: "Story & support", score: 6, detail: "Progress was explained with useful context." },
      { label: "Action plan", score: 5, detail: "The reporting revision needs an owner." },
    ],
    keyMoments: [
      "Maya requested a one-page leadership summary.",
    ],
    redFlags: [
      { label: "Reporting friction", detail: "The current report is too long for leadership.", timestamp: "13:20" },
    ],
    greenLights: [
      { label: "Healthy progress", detail: "The client remains satisfied with delivery.", timestamp: "07:44" },
    ],
    emotions: ["Satisfied", "Impatient", "Practical"],
    nextSteps: [
      "Assign the call to a team member.",
      "Create a one-page leadership summary.",
    ],
    transcript:
      "00:07:44 — Maya Johnson: Delivery is going well. The only thing I would change is the report.\n\n00:13:20 — Maya Johnson: Leadership wants the one-page version, not twelve slides.",
  },
  {
    id: "call-unassigned-escalation",
    title: "Urgent Support Review",
    client: "Daniel Kim",
    clientInitials: "DK",
    teamMember: null,
    date: "15 Jul 2026",
    month: "July 2026",
    callType: "Escalation",
    duration: "24 min",
    clientSentiment: "negative",
    teamSentiment: "neutral",
    score: 6.2,
    rawScore: 18,
    queue: "unassigned",
    summary:
      "Daniel reported a time-sensitive access issue. The conversation created a short-term workaround but requires assignment and follow-through.",
    archetype: "Skeptic",
    painPoints: [
      "Three users cannot access the reporting workspace.",
      "The support owner is unclear.",
    ],
    scoreSections: [
      { label: "Agenda", score: 5, detail: "The immediate problem was identified quickly." },
      { label: "CSM energy", score: 5, detail: "The facilitator remained calm." },
      { label: "Story & support", score: 4, detail: "The workaround was explained without a root-cause timeline." },
      { label: "Action plan", score: 4, detail: "Ownership and final resolution time are open." },
    ],
    keyMoments: [
      "A workaround restored access for the primary user.",
    ],
    redFlags: [
      { label: "Access interruption", detail: "Three users remain unable to access reporting.", timestamp: "03:11" },
    ],
    greenLights: [
      { label: "Workaround accepted", detail: "The primary user can continue essential work.", timestamp: "19:48" },
    ],
    emotions: ["Frustrated", "Urgent", "Cautious"],
    nextSteps: [
      "Assign an accountable support owner.",
      "Resolve access for the remaining users.",
    ],
    transcript:
      "00:03:11 — Daniel Kim: Three people still cannot get into reporting and we need this for tomorrow.\n\n00:19:48 — Daniel Kim: The workaround gets the main user moving. I still need an owner for the full fix.",
  },
];

const TEAM_MEMBERS = ["Emily Hawkins", "Marcus Chen", "Ava Patel"];
const MONTHS = ["July 2026", "June 2026"];

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name:
    | "arrow-left"
    | "bolt"
    | "calendar"
    | "call"
    | "check"
    | "chevron"
    | "clock"
    | "filter"
    | "flag"
    | "insights"
    | "more"
    | "people"
    | "plus"
    | "refresh"
    | "search"
    | "sparkles"
    | "star"
    | "upload"
    | "x";
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "arrow-left") return <svg {...common}><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></svg>;
  if (name === "bolt") return <svg {...common}><path d="m13 2-9 12h8l-1 8 9-12h-8z" /></svg>;
  if (name === "calendar") return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>;
  if (name === "call") return <svg {...common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z" /></svg>;
  if (name === "check") return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
  if (name === "chevron") return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
  if (name === "clock") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  if (name === "filter") return <svg {...common}><path d="M4 5h16M7 12h10M10 19h4" /></svg>;
  if (name === "flag") return <svg {...common}><path d="M5 22V4M5 4h12l-2 4 2 4H5" /></svg>;
  if (name === "insights") return <svg {...common}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>;
  if (name === "more") return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
  if (name === "people") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "refresh") return <svg {...common}><path d="M20 7h-5V2M4 17h5v5" /><path d="M5.1 9A8 8 0 0 1 18 5l2 2M18.9 15A8 8 0 0 1 6 19l-2-2" /></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
  if (name === "sparkles") return <svg {...common}><path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4zM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8zM19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8z" /></svg>;
  if (name === "star") return <svg {...common}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" /></svg>;
  if (name === "upload") return <svg {...common}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>;
  return <svg {...common}><path d="M6 6l12 12M18 6 6 18" /></svg>;
}

function SentimentPill({ sentiment }: { sentiment: Sentiment }) {
  const styles = {
    positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
    neutral: "border-amber-200 bg-amber-50 text-amber-700",
    negative: "border-red-200 bg-red-50 text-red-700",
  };
  const dots = {
    positive: "bg-emerald-500",
    neutral: "bg-amber-400",
    negative: "bg-red-500",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${styles[sentiment]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[sentiment]}`} />
      {sentiment}
    </span>
  );
}

function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#b9dcf8] bg-[#eaf4fe] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#2b79c4]">
      <Icon name="sparkles" className="h-3.5 w-3.5" />
      Product preview · Sample data
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#667085]">
        {label}
      </span>
      {children}
    </label>
  );
}

function MetricCard({
  icon,
  label,
  children,
  accent = "blue",
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  accent?: "blue" | "gold" | "green" | "purple";
}) {
  const accents = {
    blue: "bg-[#eaf4fe] text-[#2b79c4]",
    gold: "bg-amber-50 text-amber-600",
    green: "bg-emerald-50 text-emerald-600",
    purple: "bg-violet-50 text-violet-600",
  };
  return (
    <article className="rounded-xl border border-[#e4e9f0] bg-white p-4 shadow-[0_1px_2px_rgba(16,27,41,.04)]">
      <div className="flex items-center gap-2.5">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${accents[accent]}`}>{icon}</span>
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#667085]">{label}</p>
      </div>
      <div className="mt-3">{children}</div>
    </article>
  );
}

function TranscriptModal({ onClose }: { onClose: () => void }) {
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#0e1b29]/55 px-4 py-8">
      <div className="max-h-full w-full max-w-xl overflow-y-auto rounded-2xl border border-[#e4e9f0] bg-white shadow-[0_28px_80px_rgba(14,27,41,.28)]">
        <div className="flex items-center justify-between border-b border-[#e4e9f0] px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-[#162b3e]">Add meeting transcript</h2>
            <p className="mt-1 text-xs text-[#667085]">Create a sample call for this product preview.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-[#667085] hover:bg-[#f1f4f9]">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        {submitted ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <Icon name="check" className="h-7 w-7" />
            </span>
            <h3 className="mt-4 text-lg font-bold text-[#162b3e]">Transcript queued</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#667085]">
              In the live product, RetainOS will match the client and process the call securely in the background.
            </p>
            <button type="button" onClick={onClose} className="retainos-button-primary mt-6 px-5 py-2.5">
              Done
            </button>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
            }}
          >
            <div className="space-y-4 px-5 py-5 sm:px-6">
              <Field label="Meeting title">
                <input required defaultValue="Weekly Success Check-in" className="retainos-input" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Client">
                  <select required defaultValue="Amelia Grant" className="retainos-input">
                    <option>Amelia Grant</option>
                    <option>Noah Williams</option>
                    <option>Priya Desai</option>
                  </select>
                </Field>
                <Field label="Team member">
                  <select required defaultValue="Emily Hawkins" className="retainos-input">
                    {TEAM_MEMBERS.map((member) => <option key={member}>{member}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Transcript">
                <textarea
                  required
                  rows={7}
                  defaultValue="00:00:05 — Amelia: We are seeing strong progress this month..."
                  className="retainos-input resize-y leading-6"
                />
              </Field>
              <div className="rounded-lg border border-[#d6eafb] bg-[#f7fbff] p-3 text-xs leading-5 text-[#586273]">
                <span className="font-semibold text-[#162b3e]">Preview behavior:</span>{" "}
                no information is saved or sent to an AI provider from this mockup.
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-[#e4e9f0] bg-[#f9fafc] px-5 py-4 sm:px-6">
              <button type="button" onClick={onClose} className="retainos-button-secondary px-4 py-2">Cancel</button>
              <button type="submit" className="retainos-button-primary gap-2 px-5 py-2">
                <Icon name="sparkles" className="h-4 w-4" />
                Process sample call
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function CallDetail({
  call,
  onBack,
}: {
  call: DemoCall;
  onBack: () => void;
}) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptResult, setPromptResult] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  return (
    <div className="space-y-5">
      {toast ? (
        <div className="fixed right-5 top-20 z-[80] flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 shadow-xl">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-50">
            <Icon name="check" className="h-4 w-4" />
          </span>
          {toast}
        </div>
      ) : null}

      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#2b79c4] hover:text-[#162b3e]">
        <Icon name="arrow-left" className="h-4 w-4" />
        Back to Call Intelligence
      </button>

      <section className="overflow-visible rounded-2xl border border-[#dbe4ee] bg-[#162b3e] px-5 py-5 text-white shadow-[0_10px_28px_rgba(14,27,41,.13)] sm:px-7 sm:py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#b9dcf8]">{call.callType}</span>
              <span className="rounded-full bg-[#59abf0]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#8cc8f8]">AI analysis complete</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold sm:text-3xl">{call.client} · {call.title}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#c7d5e3]">
              <span className="inline-flex items-center gap-1.5"><Icon name="calendar" className="h-4 w-4" />{call.date}</span>
              <span className="inline-flex items-center gap-1.5"><Icon name="clock" className="h-4 w-4" />{call.duration}</span>
              <span className="inline-flex items-center gap-1.5"><Icon name="people" className="h-4 w-4" />{call.teamMember ?? "Awaiting assignment"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => showToast("Reprocessing queued for this sample call")}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/20 bg-white/8 px-4 text-xs font-semibold text-white hover:bg-white/14"
            >
              <Icon name="refresh" className="h-4 w-4" />
              Reprocess
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setPromptOpen((open) => !open)}
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#59abf0] px-4 text-xs font-bold text-[#162b3e] hover:bg-[#78bcf3]"
              >
                <Icon name="sparkles" className="h-4 w-4" />
                Add-on analysis
              </button>
              {promptOpen ? (
                <div className="absolute right-0 top-12 z-20 w-64 overflow-hidden rounded-xl border border-[#e4e9f0] bg-white py-1.5 text-[#162b3e] shadow-xl">
                  {["Renewal readiness", "Client pain points", "Expansion opportunities", "Executive summary"].map((prompt) => (
                    <button
                      type="button"
                      key={prompt}
                      onClick={() => {
                        setPromptResult(prompt);
                        setPromptOpen(false);
                        showToast(`${prompt} added`);
                      }}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold hover:bg-[#f1f6fb]"
                    >
                      {prompt}
                      <Icon name="chevron" className="h-4 w-4 text-[#98a2b3]" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Icon name="people" className="h-4 w-4" />} label="Client sentiment" accent="green">
          <SentimentPill sentiment={call.clientSentiment} />
        </MetricCard>
        <MetricCard icon={<Icon name="call" className="h-4 w-4" />} label="Team sentiment" accent="purple">
          <SentimentPill sentiment={call.teamSentiment} />
        </MetricCard>
        <MetricCard icon={<Icon name="star" className="h-4 w-4" />} label="Call score" accent="gold">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[#162b3e]">{call.score}</span>
            <span className="text-sm font-semibold text-[#98a2b3]">/ 10</span>
          </div>
        </MetricCard>
        <MetricCard icon={<Icon name="sparkles" className="h-4 w-4" />} label="Client archetype">
          <p className="text-lg font-bold text-[#162b3e]">{call.archetype}</p>
        </MetricCard>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.08fr_.92fr]">
        <article className="rounded-xl border border-[#e4e9f0] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#eaf4fe] text-[#2b79c4]"><Icon name="sparkles" className="h-5 w-5" /></span>
            <h2 className="text-lg font-bold text-[#162b3e]">Summary</h2>
          </div>
          <p className="mt-4 text-sm leading-7 text-[#475467]">{call.summary}</p>
          <div className="mt-5 border-t border-[#edf0f4] pt-5">
            <h3 className="text-sm font-bold text-[#162b3e]">Client pain points</h3>
            <ul className="mt-3 space-y-2.5">
              {call.painPoints.map((point) => (
                <li key={point} className="flex gap-2.5 text-sm leading-6 text-[#475467]">
                  <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#59abf0]" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="rounded-xl border border-[#e4e9f0] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 text-amber-600"><Icon name="insights" className="h-5 w-5" /></span>
              <div>
                <h2 className="text-lg font-bold text-[#162b3e]">Quality rubric</h2>
                <p className="mt-0.5 text-xs text-[#667085]">Four coaching dimensions · 7 points each</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-[#162b3e]">{call.rawScore}<span className="text-sm text-[#98a2b3]">/28</span></p>
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {call.scoreSections.map((section) => (
              <div key={section.label}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#344054]">{section.label}</span>
                  <span className="text-xs font-bold text-[#2b79c4]">{section.score}/7</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#eaf0f6]">
                  <div className="h-full rounded-full bg-[#59abf0]" style={{ width: `${(section.score / 7) * 100}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] leading-5 text-[#667085]">{section.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      {promptResult ? (
        <section className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-violet-100 text-violet-700"><Icon name="sparkles" className="h-5 w-5" /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-[#162b3e]">{promptResult}</h2>
                <span className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-violet-700">On-demand</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-[#475467]">
                Strong signal: the client’s language indicates clear belief in the partnership and willingness to advocate internally. The immediate opportunity is to convert that confidence into a dated decision plan with one executive-facing proof point.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-xl border border-red-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-600"><Icon name="flag" className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-bold text-[#162b3e]">Red flags</h2>
              <p className="mt-0.5 text-xs text-[#667085]">{call.redFlags.length} moments require attention</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {call.redFlags.length ? call.redFlags.map((signal) => (
              <div key={`${signal.label}-${signal.timestamp}`} className="rounded-lg border border-red-100 bg-red-50/45 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold text-[#344054]">{signal.label}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-red-600">{signal.timestamp}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#667085]">{signal.detail}</p>
              </div>
            )) : (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4 text-sm text-emerald-700">No material red flags detected.</div>
            )}
          </div>
        </article>

        <article className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Icon name="check" className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-bold text-[#162b3e]">Green lights</h2>
              <p className="mt-0.5 text-xs text-[#667085]">{call.greenLights.length} positive buying or success signals</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {call.greenLights.map((signal) => (
              <div key={`${signal.label}-${signal.timestamp}`} className="rounded-lg border border-emerald-100 bg-emerald-50/45 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold text-[#344054]">{signal.label}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-600">{signal.timestamp}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#667085]">{signal.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_.9fr]">
        <article className="rounded-xl border border-[#e4e9f0] bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold text-[#162b3e]">Key moments</h2>
          <ol className="mt-4 space-y-3">
            {call.keyMoments.map((moment, index) => (
              <li key={moment} className="flex gap-3 text-sm leading-6 text-[#475467]">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[#eaf4fe] text-[10px] font-bold text-[#2b79c4]">{index + 1}</span>
                {moment}
              </li>
            ))}
          </ol>
          <div className="mt-5 border-t border-[#edf0f4] pt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#667085]">Emotional signals</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {call.emotions.map((emotion) => (
                <span key={emotion} className="rounded-full border border-[#d6eafb] bg-[#f7fbff] px-3 py-1 text-xs font-semibold text-[#2b79c4]">{emotion}</span>
              ))}
            </div>
          </div>
        </article>
        <article className="rounded-xl border border-[#e4e9f0] bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold text-[#162b3e]">Recommended next steps</h2>
          <ul className="mt-4 space-y-3">
            {call.nextSteps.map((step) => (
              <li key={step} className="flex gap-3 rounded-lg bg-[#f7f9fc] px-3.5 py-3 text-sm leading-6 text-[#475467]">
                <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-[#59abf0] text-[#162b3e]"><Icon name="check" className="h-3 w-3" /></span>
                {step}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#e4e9f0] bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setTranscriptOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[#fbfcfe] sm:px-6"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f1f4f9] text-[#586273]"><Icon name="call" className="h-5 w-5" /></span>
            <div>
              <h2 className="text-base font-bold text-[#162b3e]">Call transcript</h2>
              <p className="mt-0.5 text-xs text-[#667085]">Fathom recording · Speaker-separated transcript</p>
            </div>
          </div>
          <span className={`text-[#667085] transition-transform ${transcriptOpen ? "rotate-90" : ""}`}><Icon name="chevron" className="h-5 w-5" /></span>
        </button>
        {transcriptOpen ? (
          <div className="border-t border-[#e4e9f0] bg-[#fbfcfe] px-5 py-5 sm:px-6">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-[#475467]">{call.transcript}</pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function CallIntelligenceDemo({
  onShowReconciliation,
}: {
  onShowReconciliation: () => void;
}) {
  const [queue, setQueue] = useState<QueueName>("assigned");
  const [selectedCall, setSelectedCall] = useState<DemoCall | null>(null);
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [modalOpen, setModalOpen] = useState(false);

  const filteredCalls = useMemo(() => {
    return DEMO_CALLS.filter((call) => {
      if (call.queue !== queue) return false;
      if (filters.client && !call.client.toLowerCase().includes(filters.client.toLowerCase())) return false;
      if (filters.teamMember !== "all" && call.teamMember !== filters.teamMember) return false;
      if (filters.month !== "all" && call.month !== filters.month) return false;
      if (filters.clientSentiment !== "all" && call.clientSentiment !== filters.clientSentiment) return false;
      if (filters.teamSentiment !== "all" && call.teamSentiment !== filters.teamSentiment) return false;
      if (filters.score === "high" && call.score < 8) return false;
      if (filters.score === "medium" && (call.score < 6.5 || call.score >= 8)) return false;
      if (filters.score === "low" && call.score >= 6.5) return false;
      return true;
    });
  }, [filters, queue]);

  if (selectedCall) {
    return <CallDetail call={selectedCall} onBack={() => setSelectedCall(null)} />;
  }

  const assignedCount = DEMO_CALLS.filter((call) => call.queue === "assigned").length;
  const unassignedCount = DEMO_CALLS.filter((call) => call.queue === "unassigned").length;

  return (
    <div className="space-y-5">
      {modalOpen ? <TranscriptModal onClose={() => setModalOpen(false)} /> : null}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#2b79c4]">Conversation intelligence</p>
            <DemoBadge />
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#162b3e]">Call AI</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
            Understand client health, coach stronger conversations, and turn every call into a clear next action.
          </p>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className="retainos-button-primary w-fit gap-2 px-5 py-2.5 shadow-sm">
          <Icon name="plus" className="h-4 w-4" />
          Add meeting transcript
        </button>
      </div>

      <div className="border-b border-[#dfe5ec]">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Call AI sections">
          <button type="button" className="whitespace-nowrap border-b-2 border-[#59abf0] px-1 pb-3 text-sm font-bold text-[#162b3e]">
            Call Intelligence
          </button>
          <button type="button" onClick={onShowReconciliation} className="whitespace-nowrap border-b-2 border-transparent px-1 pb-3 text-sm font-semibold text-[#667085] hover:border-[#cbd2dc] hover:text-[#162b3e]">
            Reconciliation
          </button>
        </nav>
      </div>

      <section className="rounded-xl border border-[#e4e9f0] bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-xs font-bold text-[#344054]">
          <Icon name="filter" className="h-4 w-4 text-[#2b79c4]" />
          Explore your calls
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Field label="Client name">
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
              <input
                type="search"
                value={draftFilters.client}
                onChange={(event) => setDraftFilters((current) => ({ ...current, client: event.target.value }))}
                placeholder="Search clients"
                className="retainos-input pl-9"
              />
            </div>
          </Field>
          <Field label="Team member">
            <select value={draftFilters.teamMember} onChange={(event) => setDraftFilters((current) => ({ ...current, teamMember: event.target.value }))} className="retainos-input">
              <option value="all">All team members</option>
              {TEAM_MEMBERS.map((member) => <option key={member} value={member}>{member}</option>)}
            </select>
          </Field>
          <Field label="Month of call">
            <select value={draftFilters.month} onChange={(event) => setDraftFilters((current) => ({ ...current, month: event.target.value }))} className="retainos-input">
              <option value="all">All months</option>
              {MONTHS.map((month) => <option key={month} value={month}>{month}</option>)}
            </select>
          </Field>
          <Field label="Client sentiment">
            <select value={draftFilters.clientSentiment} onChange={(event) => setDraftFilters((current) => ({ ...current, clientSentiment: event.target.value }))} className="retainos-input">
              <option value="all">All sentiments</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </Field>
          <Field label="Team sentiment">
            <select value={draftFilters.teamSentiment} onChange={(event) => setDraftFilters((current) => ({ ...current, teamSentiment: event.target.value }))} className="retainos-input">
              <option value="all">All sentiments</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </Field>
          <Field label="Call score">
            <select value={draftFilters.score} onChange={(event) => setDraftFilters((current) => ({ ...current, score: event.target.value }))} className="retainos-input">
              <option value="all">All scores</option>
              <option value="high">8.0–10 · Strong</option>
              <option value="medium">6.5–7.9 · Watch</option>
              <option value="low">Below 6.5 · At risk</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-[#edf0f4] pt-4">
          <button
            type="button"
            onClick={() => {
              setDraftFilters(EMPTY_FILTERS);
              setFilters(EMPTY_FILTERS);
            }}
            className="px-2 py-2 text-xs font-semibold text-[#667085] hover:text-[#162b3e]"
          >
            Clear all filters
          </button>
          <button type="button" onClick={() => setFilters(draftFilters)} className="retainos-button-primary gap-2 px-5 py-2">
            <Icon name="filter" className="h-4 w-4" />
            Apply filters
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Icon name="call" className="h-4 w-4" />} label="Total calls reviewed">
          <div className="flex items-end justify-between gap-3">
            <span className="text-3xl font-bold text-[#162b3e]">128</span>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">+18 this month</span>
          </div>
        </MetricCard>
        <MetricCard icon={<Icon name="star" className="h-4 w-4" />} label="Average call score" accent="gold">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-[#162b3e]">8.4</span>
            <span className="text-sm font-semibold text-[#98a2b3]">/ 10</span>
          </div>
        </MetricCard>
        <MetricCard icon={<Icon name="people" className="h-4 w-4" />} label="Client sentiment" accent="green">
          <div className="grid grid-cols-3 gap-2">
            <div><p className="text-2xl font-bold text-emerald-600">92</p><p className="mt-0.5 text-[10px] font-semibold text-[#667085]">Positive</p></div>
            <div><p className="text-2xl font-bold text-amber-500">24</p><p className="mt-0.5 text-[10px] font-semibold text-[#667085]">Neutral</p></div>
            <div><p className="text-2xl font-bold text-red-500">12</p><p className="mt-0.5 text-[10px] font-semibold text-[#667085]">Negative</p></div>
          </div>
        </MetricCard>
        <MetricCard icon={<Icon name="insights" className="h-4 w-4" />} label="Team sentiment" accent="purple">
          <div className="grid grid-cols-3 gap-2">
            <div><p className="text-2xl font-bold text-emerald-600">104</p><p className="mt-0.5 text-[10px] font-semibold text-[#667085]">Positive</p></div>
            <div><p className="text-2xl font-bold text-amber-500">18</p><p className="mt-0.5 text-[10px] font-semibold text-[#667085]">Neutral</p></div>
            <div><p className="text-2xl font-bold text-red-500">6</p><p className="mt-0.5 text-[10px] font-semibold text-[#667085]">Negative</p></div>
          </div>
        </MetricCard>
      </section>

      <section>
        <div className="flex flex-col gap-3 border-b border-[#dfe5ec] sm:flex-row sm:items-end sm:justify-between">
          <div className="-mb-px flex gap-6">
            <button
              type="button"
              onClick={() => setQueue("assigned")}
              className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-bold ${queue === "assigned" ? "border-[#59abf0] text-[#162b3e]" : "border-transparent text-[#667085]"}`}
            >
              Assigned calls
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${queue === "assigned" ? "bg-[#eaf4fe] text-[#2b79c4]" : "bg-[#edf0f4] text-[#667085]"}`}>{assignedCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setQueue("unassigned")}
              className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-bold ${queue === "unassigned" ? "border-[#59abf0] text-[#162b3e]" : "border-transparent text-[#667085]"}`}
            >
              To be assigned
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${queue === "unassigned" ? "bg-[#eaf4fe] text-[#2b79c4]" : "bg-[#edf0f4] text-[#667085]"}`}>{unassignedCount}</span>
            </button>
          </div>
          <p className="pb-3 text-xs text-[#667085]">Showing {filteredCalls.length} sample call{filteredCalls.length === 1 ? "" : "s"}</p>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-[#e4e9f0] bg-white shadow-sm">
          {filteredCalls.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#f1f4f9] text-[#667085]"><Icon name="search" className="h-5 w-5" /></span>
              <h3 className="mt-3 text-sm font-bold text-[#162b3e]">No sample calls match those filters</h3>
              <button
                type="button"
                onClick={() => {
                  setDraftFilters(EMPTY_FILTERS);
                  setFilters(EMPTY_FILTERS);
                }}
                className="mt-3 text-xs font-semibold text-[#2b79c4]"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[1.35fr_1.15fr_1.05fr_.8fr_.8fr_.55fr_32px] gap-4 border-b border-[#e4e9f0] bg-[#fbfcfe] px-5 py-3 text-[9px] font-bold uppercase tracking-[0.08em] text-[#667085] lg:grid">
                <span>Call</span><span>Client</span><span>Team member</span><span>Client sentiment</span><span>Team sentiment</span><span>Score</span><span />
              </div>
              <div className="divide-y divide-[#edf0f4]">
                {filteredCalls.map((call) => (
                  <button
                    type="button"
                    key={call.id}
                    onClick={() => setSelectedCall(call)}
                    className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-[#f7fbff] lg:grid-cols-[1.35fr_1.15fr_1.05fr_.8fr_.8fr_.55fr_32px] lg:items-center lg:gap-4 lg:px-5"
                  >
                    <div>
                      <p className="text-sm font-bold text-[#162b3e]">{call.title}</p>
                      <p className="mt-1 flex items-center gap-2 text-[10px] text-[#667085]">
                        <span>{call.date}</span><span>·</span><span>{call.duration}</span><span>·</span><span>{call.callType}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[#eaf0f6] text-[10px] font-bold text-[#586273]">{call.clientInitials}</span>
                      <span className="text-xs font-semibold text-[#344054]">{call.client}</span>
                    </div>
                    <div className="text-xs text-[#475467]">
                      {call.teamMember ?? <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Awaiting assignment</span>}
                    </div>
                    <div><SentimentPill sentiment={call.clientSentiment} /></div>
                    <div><SentimentPill sentiment={call.teamSentiment} /></div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-base font-bold text-[#162b3e]">{call.score}</span>
                      <span className="text-[10px] font-semibold text-[#98a2b3]">/10</span>
                    </div>
                    <span className="text-[#98a2b3]"><Icon name="chevron" className="h-4 w-4" /></span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
