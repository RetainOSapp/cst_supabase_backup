import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const apply = process.argv.includes("--apply");
const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

function roleFromBackup(member) {
  if (member.role_read_only_user === true) return "viewer";
  if (member.role_id === 1 || member.role_is_saa_s_admin === true) return "director";
  if (member.role_id === 2) return "support";
  if (member.role_id === 3) return "csm";
  if (member.role_hide_from_csm_list === true) return "support";
  return "csm";
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function activeStatus(isArchived) {
  return isArchived === true ? "archived" : "active";
}

async function main() {
  const { data: companies, error: companyError } = await supabase
    .from("backup_companies")
    .select(
      "glide_row_id, name, archived, view_override, enable_secondary_assignee, enable_call_ai_for_csms",
    )
    .ilike("name", "%ethical scaling%");

  if (companyError) throw companyError;

  const matches = companies ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one Ethical Scaling company, found ${matches.length}. Matching IDs: ${matches
        .map((company) => `${company.name}:${company.glide_row_id}`)
        .join(", ")}`,
    );
  }

  const sourceCompany = matches[0];
  const companyPayload = {
    legacy_glide_row_id: sourceCompany.glide_row_id,
    name: sourceCompany.name ?? "Ethical Scaling",
    status: sourceCompany.archived === true ? "archived" : "active",
    migration_status: "pilot",
    enable_secondary_assignee: sourceCompany.enable_secondary_assignee === true,
    enable_call_ai_for_csms: sourceCompany.enable_call_ai_for_csms === true,
    view_override: sourceCompany.view_override ?? null,
    metadata: {
      pilot_backfill: true,
      source_table: "backup_companies",
    },
  };

  const { data: members, error: membersError } = await supabase
    .from("backup_company_team")
    .select(
      "glide_row_id, company_id, email, name, photo, role_id, role_is_saa_s_admin, role_hide_from_csm_list, role_read_only_user, capacity_number, is_archived",
    )
    .eq("company_id", sourceCompany.glide_row_id);

  if (membersError) throw membersError;

  const memberPayloads = (members ?? [])
    .filter((member) => normalizeEmail(member.email))
    .map((member) => ({
      legacy_glide_row_id: member.glide_row_id,
      email: normalizeEmail(member.email),
      name: member.name ?? null,
      photo_url: member.photo ?? null,
      role: roleFromBackup(member),
      is_read_only: member.role_read_only_user === true,
      hide_from_csm_list: member.role_hide_from_csm_list === true,
      capacity_number: member.capacity_number ?? null,
      status: activeStatus(member.is_archived),
      archived_at: member.is_archived === true ? new Date().toISOString() : null,
      metadata: {
        pilot_backfill: true,
        source_table: "backup_company_team",
        source_company_id: member.company_id,
      },
    }));

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        company: companyPayload,
        memberCount: memberPayloads.length,
        membersByRole: memberPayloads.reduce((acc, member) => {
          acc[member.role] = (acc[member.role] ?? 0) + 1;
          return acc;
        }, {}),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write pilot rows.");
    return;
  }

  const { data: upsertedCompany, error: upsertCompanyError } = await supabase
    .from("companies")
    .upsert(companyPayload, { onConflict: "legacy_glide_row_id" })
    .select("id, public_company_id, legacy_glide_row_id, name, migration_status")
    .single();

  if (upsertCompanyError) throw upsertCompanyError;

  const companyMembers = memberPayloads.map((member) => ({
    ...member,
    company_id: upsertedCompany.id,
  }));

  const { error: upsertMembersError } = await supabase
    .from("company_members")
    .upsert(companyMembers, { onConflict: "legacy_glide_row_id" });

  if (upsertMembersError) throw upsertMembersError;

  const { error: auditError } = await supabase.from("app_audit_events").insert({
    company_id: upsertedCompany.id,
    event_type: "pilot_backfill",
    source: "script",
    entity_table: "companies",
    entity_id: upsertedCompany.id,
    legacy_glide_row_id: upsertedCompany.legacy_glide_row_id,
    title: "Ethical Scaling pilot backfill",
    summary:
      "Backfilled Ethical Scaling company and company members from Glide mirror tables.",
    after_data: {
      company: upsertedCompany,
      member_count: companyMembers.length,
    },
  });

  if (auditError) throw auditError;

  console.log(
    JSON.stringify(
      {
        applied: true,
        company: upsertedCompany,
        memberCount: companyMembers.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
