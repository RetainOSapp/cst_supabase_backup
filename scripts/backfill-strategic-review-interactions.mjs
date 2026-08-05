import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const apply = process.argv.includes("--apply");

function readArg(name) {
  return process.argv
    .find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

const companyName = readArg("company");
const companyId = readArg("company-id");
const legacyCompanyId = readArg("legacy-company-id");

function fail(message, details) {
  console.error(JSON.stringify({ ok: false, message, details }, null, 2));
  process.exit(1);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function queryAll(label, queryBuilder, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryBuilder().range(from, from + pageSize - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function resolveCompany(supabase) {
  if (!companyName && !companyId && !legacyCompanyId) {
    fail("Choose exactly one company before previewing the backfill.", {
      usage:
        "npm run pilot:backfill:strategic-reviews -- --company=\"Company Name\" [--apply]",
    });
  }
  let query = supabase
    .from("companies")
    .select("id, legacy_glide_row_id, name, migration_status");
  if (companyId) query = query.eq("id", companyId);
  else if (legacyCompanyId) query = query.eq("legacy_glide_row_id", legacyCompanyId);
  else query = query.ilike("name", companyName);
  const { data, error } = await query;
  if (error) throw error;
  if (data?.length !== 1) {
    fail("The company selector must resolve to exactly one app-owned company.", {
      matches: data ?? [],
    });
  }
  return data[0];
}

async function main() {
  const { url, serviceRoleKey } = getSupabaseEnv();
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const company = await resolveCompany(supabase);

  const [completions, interactions, members] = await Promise.all([
    queryAll("strategic review completions", () =>
      supabase
        .from("client_timed_checkpoint_completions")
        .select("*")
        .eq("company_id", company.id)
        .eq("checkpoint_type", "strategic_review")
        .is("archived_at", null)
        .order("completed_at", { ascending: true }),
    ),
    queryAll("client interactions", () =>
      supabase
        .from("client_call_attendance_events")
        .select("*")
        .eq("company_id", company.id)
        .order("occurred_at", { ascending: true }),
    ),
    queryAll("company members", () =>
      supabase
        .from("company_members")
        .select("id, legacy_glide_row_id, name")
        .eq("company_id", company.id)),
  ]);

  const interactionById = new Map(interactions.map((row) => [row.id, row]));
  const interactionByCompletion = new Map();
  for (const interaction of interactions) {
    const completionId = objectValue(interaction.metadata).checkpoint_completion_id;
    if (completionId) interactionByCompletion.set(String(completionId), interaction);
  }
  const memberById = new Map(members.map((member) => [member.id, member]));

  const planned = completions.map((completion) => {
    const metadata = objectValue(completion.metadata);
    const linkedById = metadata.interaction_event_id
      ? interactionById.get(String(metadata.interaction_event_id))
      : null;
    const linked = linkedById ?? interactionByCompletion.get(completion.id) ?? null;
    return {
      completion,
      linked,
      action: linked
        ? objectValue(linked.metadata).interaction_type_key === "strategic_review" &&
          metadata.interaction_event_id === linked.id
          ? "already_linked"
          : "repair_link"
        : "create_interaction",
    };
  });

  const counts = planned.reduce((result, row) => {
    result[row.action] = (result[row.action] ?? 0) + 1;
    return result;
  }, {});
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: apply ? "apply" : "preview",
        company,
        completionCount: completions.length,
        counts,
        sample: planned
          .filter((row) => row.action !== "already_linked")
          .slice(0, 20)
          .map((row) => ({
            completionId: row.completion.id,
            clientLegacyId: row.completion.legacy_client_id,
            completedAt: row.completion.completed_at,
            action: row.action,
            interactionId: row.linked?.id ?? null,
          })),
        safety:
          "This repair only creates/labels client interactions and links completion metadata. It never moves Pipeline items.",
      },
      null,
      2,
    ),
  );

  if (!apply) return;

  for (const row of planned) {
    if (row.action === "already_linked") continue;
    const completion = row.completion;
    const completionMetadata = objectValue(completion.metadata);
    let interaction = row.linked;
    if (interaction) {
      const { data, error } = await supabase
        .from("client_call_attendance_events")
        .update({
          metadata: {
            ...objectValue(interaction.metadata),
            checkpoint_completion_id: completion.id,
            interaction_type_key: "strategic_review",
            interaction_type_label: "Strategic Review",
            repaired_by: "backfill-strategic-review-interactions",
          },
        })
        .eq("id", interaction.id)
        .eq("company_id", company.id)
        .select("*")
        .single();
      if (error) throw error;
      interaction = data;
    } else {
      const member = memberById.get(completion.completed_by_member_id);
      const { data, error } = await supabase
        .from("client_call_attendance_events")
        .insert({
          company_id: company.id,
          client_id: completion.client_id,
          client_legacy_id: completion.legacy_client_id,
          company_legacy_id: company.legacy_glide_row_id,
          attendance_status: "attended",
          occurred_at: completion.completed_at,
          source: "daily_pulse",
          notes: completion.notes,
          actor_member_id: completion.completed_by_member_id,
          actor_member_legacy_id: member?.legacy_glide_row_id ?? null,
          metadata: {
            checkpoint_completion_id: completion.id,
            interaction_type_key: "strategic_review",
            interaction_type_label: "Strategic Review",
            backfilled_by: "backfill-strategic-review-interactions",
          },
        })
        .select("*")
        .single();
      if (error) throw error;
      interaction = data;
    }
    const { error: completionError } = await supabase
      .from("client_timed_checkpoint_completions")
      .update({
        metadata: {
          ...completionMetadata,
          interaction_event_id: interaction.id,
          interaction_backfilled_at: new Date().toISOString(),
        },
      })
      .eq("id", completion.id)
      .eq("company_id", company.id);
    if (completionError) throw completionError;
  }

  console.log(
    JSON.stringify({
      ok: true,
      mode: "apply_complete",
      changed: planned.filter((row) => row.action !== "already_linked").length,
    }),
  );
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.message
      : String(error?.message ?? error ?? "Unexpected backfill error."),
    error && typeof error === "object"
      ? { name: error.name ?? null, code: error.code ?? null }
      : undefined,
  );
});
