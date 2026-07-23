export const validSingleClientCall = {
  schema_version: "call_intelligence.v1",
  provider: "fathom",
  company_id: "company_demo_001",
  external_call_id: "fathom_demo_1001",
  title: "Synthetic Renewal Call",
  occurred_at: "2026-07-23T12:00:00.000Z",
  duration_seconds: 1800,
  recording_url: "https://fathom.example.test/calls/demo-1001",
  share_url: "https://fathom.example.test/share/demo-1001",
  host: {
    name: "Taylor Team",
    email: "taylor@company.example.test",
  },
  participants: [
    {
      name: "Taylor Team",
      email: "taylor@company.example.test",
      is_external: false,
    },
    {
      name: "Casey Client",
      email: "casey@client-one.example.test",
      is_external: true,
    },
    {
      name: "Morgan Team",
      email: "morgan@company.example.test",
      is_external: false,
    },
  ],
  transcript:
    "00:00:00 - Taylor Team: This is invented test content.\n" +
    "00:00:05 - Casey Client: The renewal plan is clear.",
};

export const clients = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    client_email: "casey@client-one.example.test",
    client_email_secondary: "finance@client-one.example.test",
    client_email_tertiary: null,
    program_status_value: "front-end",
    archived_at: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    client_email: "riley@client-two.example.test",
    client_email_secondary: null,
    client_email_tertiary: null,
    program_status_value: "back-end",
    archived_at: null,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    client_email: "archived@client-three.example.test",
    client_email_secondary: null,
    client_email_tertiary: null,
    program_status_value: "front-end",
    archived_at: "2026-01-01T00:00:00.000Z",
  },
];

export const members = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    email: "taylor@company.example.test",
    status: "active",
    archived_at: null,
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    email: "morgan@company.example.test",
    status: "active",
    archived_at: null,
  },
];
