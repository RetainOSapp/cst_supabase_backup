#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

if (!process.argv.includes("--execute")) {
  console.error("Refusing temporary Gate C1 identity/membership changes without --execute.");
  process.exit(2);
}

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.supabase_service_role;
if (!url || !anonKey || !serviceKey) throw new Error("Missing Supabase environment.");

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const workspaceUrl = `${url}/functions/v1/manage-pipeline-workspace`;
const configurationUrl = `${url}/functions/v1/manage-company-pipeline`;
const createdUsers = [];
const memberSnapshots = new Map();

async function invoke(endpoint, token, body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

async function snapshotMember(id) {
  if (memberSnapshots.has(id)) return memberSnapshots.get(id);
  const result = await service.from("company_members").select("id,role,status,is_read_only,auth_user_id").eq("id", id).single();
  if (result.error) throw result.error;
  memberSnapshots.set(id, result.data);
  return result.data;
}

async function patchMember(id, patch) {
  await snapshotMember(id);
  const result = await service.from("company_members").update(patch).eq("id", id).select("id").single();
  if (result.error) throw result.error;
}

async function makeActor(label, memberId, memberPatch = {}) {
  const email = `pipeline-gate-c1-${label}-${crypto.randomUUID()}@example.invalid`;
  const password = `GateC1!${crypto.randomUUID()}aA7`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error(`Could not create ${label} actor.`);
  createdUsers.push(created.data.user.id);
  await patchMember(memberId, { ...memberPatch, auth_user_id: created.data.user.id });
  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await auth.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session?.access_token) throw signedIn.error ?? new Error(`Could not sign in ${label}.`);
  return { token: signedIn.data.session.access_token, auth };
}

async function expectStatus(label, call, expected) {
  const result = await call;
  if (!expected.includes(result.status)) {
    throw new Error(`${label}: expected ${expected.join("/")}, got ${result.status} (${result.payload.error ?? "no error"})`);
  }
  return result;
}

function expectDisabledWorkspace(label, result, role) {
  if (
    result.status !== 200 || result.payload.enabled !== false ||
    result.payload.canWrite !== false || result.payload.actorRole !== role ||
    (result.payload.items ?? []).length !== 0 || (result.payload.clients ?? []).length !== 0
  ) {
    throw new Error(`${label}: expected a 200 disabled/empty workspace payload.`);
  }
}

let actors = [];
try {
  const companies = await service.from("companies").select("id,name,legacy_glide_row_id").in("name", ["Ethical Scaling", "Moves Method", "Sales Kick"]);
  if (companies.error) throw companies.error;
  const ethical = companies.data?.find((row) => row.name === "Ethical Scaling");
  const moves = companies.data?.find((row) => row.name === "Moves Method");
  const salesKick = companies.data?.find((row) => row.name === "Sales Kick");
  if (!ethical || !moves || !salesKick) throw new Error("Expected ES, MM, and Sales Kick companies.");
  const settings = await service.from("company_settings").select("company_id,enable_pipeline,enable_pipeline_viewer_access").in("company_id", [ethical.id, moves.id, salesKick.id]);
  if (settings.error) throw settings.error;
  const settingsByCompany = new Map((settings.data ?? []).map((row) => [row.company_id, row]));
  if (
    settingsByCompany.get(ethical.id)?.enable_pipeline !== true ||
    settingsByCompany.get(moves.id)?.enable_pipeline !== true ||
    settingsByCompany.get(salesKick.id)?.enable_pipeline !== false ||
    [...settingsByCompany.values()].some((row) => row.enable_pipeline_viewer_access === true)
  ) {
    throw new Error("Gate F company isolation is not intact.");
  }
  const itemsBefore = await service.from("client_pipeline_items").select("id,company_id,updated_at").in("company_id", [ethical.id, moves.id]).order("id");
  if (itemsBefore.error) throw itemsBefore.error;
  const runsBefore = await service.from("pipeline_automation_runs").select("id,created_at").eq("company_id", ethical.id).order("id");
  if (runsBefore.error) throw runsBefore.error;

  const members = await service.from("company_members").select("id,name,role,status,is_read_only,auth_user_id").eq("company_id", ethical.id);
  if (members.error) throw members.error;
  const movesMembers = await service.from("company_members").select("id,name,role,status,is_read_only,auth_user_id").eq("company_id", moves.id);
  if (movesMembers.error) throw movesMembers.error;
  const exact = (name) => {
    const member = members.data?.find((row) => row.name?.trim() === name);
    if (!member || member.auth_user_id) throw new Error(`${name} is unavailable for temporary role QA.`);
    return member;
  };
  const exactMoves = (name) => {
    const member = movesMembers.data?.find((row) => row.name?.trim() === name);
    if (!member || member.auth_user_id) throw new Error(`${name} is unavailable for temporary MM role QA.`);
    return member;
  };
  const directorMember = exact("Jay Goncalves");
  const csmMember = exactMoves("Marc Meny");
  const supportFixture = exact("Test member 2");
  const viewerFixture = exact("Lauren Perry");
  const readonlyFixture = exact("Adam Molloy");

  const director = await makeActor("director", directorMember.id);
  actors.push(director);
  const directorWorkspace = await expectStatus("Director workspace", invoke(workspaceUrl, director.token, { action: "workspace", companyLegacyId: ethical.legacy_glide_row_id }), [200]);
  const directorConfig = await expectStatus("Director config", invoke(configurationUrl, director.token, { action: "list_configuration", companyLegacyId: ethical.legacy_glide_row_id }), [200]);

  const support = await makeActor("support", supportFixture.id, { role: "support", status: "active", is_read_only: false });
  actors.push(support);
  const supportWorkspace = await expectStatus("Support workspace", invoke(workspaceUrl, support.token, { action: "workspace", companyLegacyId: ethical.legacy_glide_row_id }), [200]);
  await expectStatus("Support config denial", invoke(configurationUrl, support.token, { action: "list_configuration", companyLegacyId: ethical.legacy_glide_row_id }), [403]);

  const csm = await makeActor("csm", csmMember.id);
  actors.push(csm);
  const csmWorkspace = await expectStatus("CSM workspace", invoke(workspaceUrl, csm.token, { action: "workspace", companyLegacyId: moves.legacy_glide_row_id }), [200]);
  const csmItemNames = (csmWorkspace.payload.items ?? []).map((item) => item.client_name_snapshot).sort();
  if (JSON.stringify(csmItemNames) !== JSON.stringify(["Melissa Moore", "Merrilyn Sikorski"])) {
    throw new Error(`CSM scope mismatch: ${JSON.stringify(csmItemNames)}`);
  }
  const unassignedItem = itemsBefore.data?.find((item) => item.id === "80076e6e-dfdf-4276-b632-d3de5e389a0d");
  if (!unassignedItem) throw new Error("The approved Kristin Rega scope-denial fixture is missing.");
  await expectStatus("CSM unassigned write denial", invoke(workspaceUrl, csm.token, {
    action: "update_item", companyLegacyId: moves.legacy_glide_row_id, itemId: unassignedItem.id,
    note: "This denied request must not write.",
  }), [403]);
  await expectStatus("CSM cross-tenant denial", invoke(workspaceUrl, csm.token, { action: "workspace", companyLegacyId: ethical.legacy_glide_row_id }), [403]);

  const viewer = await makeActor("viewer", viewerFixture.id);
  actors.push(viewer);
  await expectStatus("Inactive membership denial", invoke(workspaceUrl, viewer.token, { action: "workspace", companyLegacyId: ethical.legacy_glide_row_id }), [403]);
  await patchMember(viewerFixture.id, { status: "active" });
  const viewerWorkspace = await invoke(workspaceUrl, viewer.token, { action: "workspace", companyLegacyId: ethical.legacy_glide_row_id });
  expectDisabledWorkspace("Viewer-off workspace", viewerWorkspace, "viewer");

  const readonly = await makeActor("readonly", readonlyFixture.id, { role: "director", status: "active", is_read_only: true });
  actors.push(readonly);
  const readonlyWorkspace = await invoke(workspaceUrl, readonly.token, { action: "workspace", companyLegacyId: ethical.legacy_glide_row_id });
  expectDisabledWorkspace("Read-only Director workspace", readonlyWorkspace, "viewer");
  await expectStatus("Read-only Director config denial", invoke(configurationUrl, readonly.token, { action: "list_configuration", companyLegacyId: ethical.legacy_glide_row_id }), [403]);

  const itemsAfter = await service.from("client_pipeline_items").select("id,company_id,updated_at").in("company_id", [ethical.id, moves.id]).order("id");
  if (itemsAfter.error) throw itemsAfter.error;
  if (JSON.stringify(itemsAfter.data) !== JSON.stringify(itemsBefore.data)) {
    throw new Error("Role QA unexpectedly changed Pipeline items.");
  }
  const runsAfter = await service.from("pipeline_automation_runs").select("id,created_at").eq("company_id", ethical.id).order("id");
  if (runsAfter.error || JSON.stringify(runsAfter.data) !== JSON.stringify(runsBefore.data)) {
    throw new Error("Role QA changed the automation run ledger.");
  }

  console.log(JSON.stringify({
    ok: true,
    director: { workspaceItems: directorWorkspace.payload.items?.length ?? 0, pipelines: directorConfig.payload.pipelines?.length ?? 0, configuration: "allowed" },
    support: { workspaceItems: supportWorkspace.payload.items?.length ?? 0, configuration: "denied" },
    csm: { visibleItems: csmItemNames, unassignedWrite: "denied", crossTenant: "denied" },
    viewer: "403 while inactive; active Viewer receives an empty disabled workspace because the Viewer gate is off",
    readOnlyDirector: "empty disabled workspace; configuration denied",
    pipelineWrites: 0,
    automationRunChanges: 0,
  }, null, 2));
} finally {
  for (const actor of actors) await actor.auth.auth.signOut().catch(() => {});
  for (const snapshot of memberSnapshots.values()) {
    const restored = await service.from("company_members").update({
      role: snapshot.role,
      status: snapshot.status,
      is_read_only: snapshot.is_read_only,
      auth_user_id: snapshot.auth_user_id,
    }).eq("id", snapshot.id);
    if (restored.error) console.error(`CRITICAL: member ${snapshot.id} restore failed: ${restored.error.message}`);
  }
  for (const userId of createdUsers) {
    const deleted = await service.auth.admin.deleteUser(userId);
    if (deleted.error) console.error(`CRITICAL: temporary auth cleanup failed for ${userId}: ${deleted.error.message}`);
  }
}
