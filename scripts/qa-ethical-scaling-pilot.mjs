import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

function fail(message, details = undefined) {
  console.error(JSON.stringify({ ok: false, message, details }, null, 2));
  process.exit(1);
}

async function main() {
  const { data: sourceCompanies, error: sourceCompanyError } = await supabase
    .from("backup_companies")
    .select("glide_row_id, name")
    .ilike("name", "%ethical scaling%");

  if (sourceCompanyError) throw sourceCompanyError;
  if ((sourceCompanies ?? []).length !== 1) {
    fail("Expected exactly one Ethical Scaling source company.", sourceCompanies);
  }

  const sourceCompany = sourceCompanies[0];

  const { data: pilotCompany, error: pilotCompanyError } = await supabase
    .from("companies")
    .select("id, public_company_id, legacy_glide_row_id, name, migration_status")
    .eq("legacy_glide_row_id", sourceCompany.glide_row_id)
    .maybeSingle();

  if (pilotCompanyError) throw pilotCompanyError;
  if (!pilotCompany) fail("Pilot company row does not exist.");
  if (pilotCompany.migration_status !== "pilot") {
    fail("Pilot company migration_status is not pilot.", pilotCompany);
  }

  const { data: sourceMembers, error: sourceMembersError } = await supabase
    .from("backup_company_team")
    .select("glide_row_id, email, is_archived")
    .eq("company_id", sourceCompany.glide_row_id)
    .not("email", "is", null);

  if (sourceMembersError) throw sourceMembersError;

  const sourceMembersWithEmail = (sourceMembers ?? []).filter((member) =>
    String(member.email ?? "").trim(),
  );
  const sourceMemberIds = new Set(
    sourceMembersWithEmail.map((member) => member.glide_row_id),
  );

  const { data: pilotMembers, error: pilotMembersError } = await supabase
    .from("company_members")
    .select("id, legacy_glide_row_id, email, role, status")
    .eq("company_id", pilotCompany.id);

  if (pilotMembersError) throw pilotMembersError;

  const missingMembers = [...sourceMemberIds].filter(
    (id) => !(pilotMembers ?? []).some((member) => member.legacy_glide_row_id === id),
  );

  if (missingMembers.length > 0) {
    fail("Pilot company_members missing source team rows.", missingMembers);
  }

  const duplicateActiveEmails = Object.entries(
    (pilotMembers ?? [])
      .filter((member) => member.status === "active")
      .reduce((acc, member) => {
        const email = String(member.email ?? "").trim().toLowerCase();
        acc[email] = (acc[email] ?? 0) + 1;
        return acc;
      }, {}),
  ).filter(([, count]) => count > 1);

  if (duplicateActiveEmails.length > 0) {
    fail("Duplicate active emails found in pilot company_members.", duplicateActiveEmails);
  }

  const { data: auditRows, error: auditError } = await supabase
    .from("app_audit_events")
    .select("id, event_type, created_at")
    .eq("company_id", pilotCompany.id)
    .eq("event_type", "pilot_backfill")
    .order("created_at", { ascending: false })
    .limit(1);

  if (auditError) throw auditError;
  if (!auditRows?.length) fail("Pilot backfill audit event was not found.");

  const roleCounts = (pilotMembers ?? []).reduce((acc, member) => {
    acc[member.role] = (acc[member.role] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        ok: true,
        company: pilotCompany,
        sourceMemberCount: sourceMembersWithEmail.length,
        pilotMemberCount: pilotMembers?.length ?? 0,
        roleCounts,
        latestAuditEvent: auditRows[0],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  fail(error.message ?? "QA script failed.", error);
});
