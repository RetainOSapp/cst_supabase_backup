import {
  CallIntelligence,
  type CallIntelligenceDevelopmentFixture,
} from "./CallIntelligence.tsx";

const baseAnalysis = {
  schemaVersion: "call_intelligence_v2",
  callType: "quarterly_review",
  titleLabel: "Quarterly success review",
  summary:
    "Alex is positive about retention gains, while flagging that onboarding documentation still needs attention. Jordan aligned on a concrete documentation review and owner.",
  clientSentiment: "positive" as const,
  teamMemberSentiment: "positive" as const,
  callScore: 20,
};

const baseCall = {
  id: "dev-call-renewal",
  client_id: "dev-client-1",
  assigned_member_id: "dev-member-1",
  provider: "fathom",
  title: "Quarterly success review",
  occurred_at: "2026-07-21T14:00:00.000Z",
  duration_seconds: 3180,
  recording_url: "https://fathom.video/",
  share_url: "https://fathom.video/",
  match_status: "matched",
  processing_status: "completed",
  match_reason: "exact_participant_email",
  last_error_category: null,
  client: {
    id: "dev-client-1",
    client_name: "Alex Morgan",
    client_business: "Northstar Growth",
    client_email: "aron@example.invalid",
  },
  assignedMember: {
    id: "dev-member-1",
    name: "Jordan Lee",
    email: "jay@example.invalid",
  },
  analysis: baseAnalysis,
};

const evidence = {
  timestamp: "00:18:42",
  speaker_role: "client",
  quote: "The main issue is that onboarding documentation is still scattered.",
};

const fixture = {
  calls: [
    baseCall,
    {
      ...baseCall,
      id: "dev-call-check-in",
      title: "Operations check-in",
      occurred_at: "2026-07-16T09:30:00.000Z",
      duration_seconds: 2460,
      analysis: {
        ...baseAnalysis,
        titleLabel: "Operations check-in",
        clientSentiment: "neutral" as const,
        callScore: 19,
      },
    },
    {
      ...baseCall,
      id: "dev-call-escalation",
      client_id: "dev-client-2",
      title: "Delivery escalation",
      occurred_at: "2026-07-10T16:00:00.000Z",
      duration_seconds: 2040,
      client: {
        id: "dev-client-2",
        client_name: "Riley Chen",
        client_business: "Atlas Advisory",
        client_email: "vanessa@example.invalid",
      },
      analysis: {
        ...baseAnalysis,
        callType: "escalation",
        titleLabel: "Delivery escalation",
        clientSentiment: "negative" as const,
        teamMemberSentiment: "neutral" as const,
        callScore: 14,
      },
    },
  ],
  metrics: {
    totalCalls: 128,
    averageScore: 17.7,
    clientSentiment: {
      positive: 92,
      neutral: 24,
      negative: 12,
      insufficient_evidence: 0,
    },
    teamMemberSentiment: {
      positive: 104,
      neutral: 18,
      negative: 6,
      insufficient_evidence: 0,
    },
    needsReconciliation: 3,
  },
  access: {
    role: "Director",
    canReconcile: true,
    canUpload: true,
    canRun: true,
  },
  uploadOptions: {
    clients: [
      {
        id: "00000000-0000-4000-8000-000000000101",
        client_name: "Alex Morgan",
        client_business: "Northstar Growth",
        client_email: "alex@example.invalid",
        program_status_value: "front-end",
      },
      {
        id: "00000000-0000-4000-8000-000000000102",
        client_name: "Riley Chen",
        client_business: "Atlas Advisory",
        client_email: "riley@example.invalid",
        program_status_value: "back-end",
      },
    ],
    members: [
      {
        id: "00000000-0000-4000-8000-000000000201",
        name: "Jordan Lee",
        email: "jordan@example.invalid",
        role: "director",
      },
    ],
  },
  details: {
    "dev-call-renewal": {
      call: baseCall,
      transcript: {
        source_format: "plain_text",
        character_count: 642,
        transcript_text:
          "00:02:14 Alex: Retention has improved and the team feels more confident.\n00:18:42 Alex: The main issue is that onboarding documentation is still scattered.\n00:36:10 Jordan: I will consolidate the SOP and send it for review by Friday.\n00:49:05 Jordan: To recap, I own the first draft and you will confirm the delivery checklist.",
      },
      participants: [
        {
          id: "dev-participant-1",
          name: "Alex Morgan",
          email_normalized: "aron@example.invalid",
          participant_kind: "client",
          provider_role: "attendee",
        },
        {
          id: "dev-participant-2",
          name: "Jordan Lee",
          email_normalized: "jay@example.invalid",
          participant_kind: "company_member",
          provider_role: "host",
        },
      ],
      runs: [
        {
          id: "dev-run-1",
          prompt_definition_id: "dev-prompt-v2",
          prompt_version: "v2",
          run_kind: "automatic",
          status: "succeeded",
          model: "gpt-5.6-terra",
          result_schema_version: "call_intelligence_v2",
          result_text: null,
          error_category: null,
          created_at: "2026-07-21T14:55:00.000Z",
          completed_at: "2026-07-21T14:56:00.000Z",
          result_json: {
            schema_version: "call_intelligence_v2",
            call_type: "quarterly_review",
            title_label: "Quarterly success review",
            summary: baseAnalysis.summary,
            client_sentiment: {
              label: "positive",
              confidence: "high",
              evidence: [
                {
                  timestamp: "00:02:14",
                  speaker_role: "client",
                  quote: "Retention has improved and the team feels more confident.",
                },
              ],
            },
            team_member_sentiment: {
              label: "positive",
              confidence: "high",
              evidence: [
                {
                  timestamp: "00:36:10",
                  speaker_role: "team_member",
                  quote: "I will consolidate the SOP and send it for review by Friday.",
                },
              ],
            },
            negative_signals: [
              {
                label: "Onboarding documentation gap",
                summary: "The client still finds onboarding material scattered.",
                emotions: ["frustration"],
                evidence: [evidence],
              },
            ],
            positive_signals: [
              {
                label: "Retention momentum",
                summary: "The client reports improved retention and team confidence.",
                emotions: ["confidence"],
                evidence: [
                  {
                    timestamp: "00:02:14",
                    speaker_role: "client",
                    quote: "Retention has improved and the team feels more confident.",
                  },
                ],
              },
            ],
            client_pain_points: [
              {
                summary: "Onboarding documentation remains fragmented.",
                evidence: [evidence],
              },
            ],
            next_steps: [
              {
                owner: "Jordan",
                action: "Consolidate the onboarding SOP and send it for review.",
                due_date: "Friday",
                evidence: [
                  {
                    timestamp: "00:36:10",
                    speaker_role: "team_member",
                    quote: "I will consolidate the SOP and send it for review by Friday.",
                  },
                ],
              },
            ],
            call_score: {
              total: 20,
              agenda: {
                score: 5,
                rationale: "The purpose was clear but not framed as a formal agenda.",
                evidence: [],
              },
              team_member_energy: {
                score: 5,
                rationale: "The team member was engaged and ownership-oriented.",
                evidence: [],
              },
              recap: {
                score: 5,
                rationale: "The call ended with a concise ownership recap.",
                evidence: [],
              },
              action_plan: {
                score: 5,
                rationale: "A named owner and due date were agreed.",
                evidence: [],
              },
            },
            archetype: {
              label: "Growth-minded operator",
              confidence: "medium",
              evidence: [
                {
                  timestamp: "00:02:14",
                  speaker_role: "client",
                  quote: "Retention has improved and the team feels more confident.",
                },
              ],
            },
          },
        },
      ],
      onDemandPrompts: [
        {
          id: "dev-on-demand-1",
          prompt_key: "client_pain_points",
          name: "Client pain points",
          version: "v1",
          scope: "company",
        },
        {
          id: "dev-on-demand-2",
          prompt_key: "renewal",
          name: "Renewal",
          version: "v1",
          scope: "company",
        },
      ],
    },
  },
} satisfies CallIntelligenceDevelopmentFixture;

export function CallIntelligenceDevelopmentPreview() {
  return (
    <main className="min-h-screen bg-[#f4f6fa] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1600px]">
        <CallIntelligence
          companyId="development-fixture"
          developmentFixture={fixture}
          onShowReconciliation={() => undefined}
        />
      </div>
    </main>
  );
}
