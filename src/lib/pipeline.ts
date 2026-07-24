import { supabase } from "./supabase.ts";

export type PipelineCategory = "renewal" | "expansion";
export type PipelineStageCategory = "open" | "won" | "lost";
export type PipelineType = PipelineCategory;
export type PipelineStageType = PipelineStageCategory;
export type PipelineValueSource = "current_contract" | "fixed" | "none";
export type PipelineActorRole =
  | "super_admin"
  | "director"
  | "support"
  | "csm"
  | "viewer";

export interface PipelineDefinition {
  id: string;
  name: string;
  pipeline_type: PipelineType;
  is_enabled: boolean;
  value_source: PipelineValueSource;
  default_estimated_value_cents: number | null;
  currency_code: string;
  renewal_lead_days: number | null;
  default_follow_up_days: number | null;
  include_auto_renew: boolean;
  include_month_to_month: boolean;
  auto_create_renewals?: boolean | null;
  entry_stage_id?: string | null;
  catch_up_days?: number | null;
  renewal_generation_enabled?: boolean | null;
  offboard_sync_enabled?: boolean | null;
  stage_task_creation_enabled?: boolean | null;
  automation_paused?: boolean | null;
  archived_at?: string | null;
  display_order?: number | null;
  position?: number | null;
}

export type CompanyPipeline = PipelineDefinition;

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  color: string;
  stage_type: PipelineStageType;
  requires_note?: boolean | null;
  is_enabled?: boolean | null;
  archived_at?: string | null;
  display_order?: number | null;
  position: number;
}

export type CompanyPipelineStage = PipelineStage;

export interface PipelineClient {
  id: string;
  glide_row_id?: string | null;
  client_name: string | null;
  client_business?: string | null;
  client_image?: string | null;
  pathway_id?: string | null;
  pathway_name?: string | null;
  offer_id?: string | null;
  offer_name?: string | null;
  csm_team_member_id?: string | null;
  csm_secondary_assignee_id?: string | null;
  program_status_value?: string | null;
}

export interface PipelineMember {
  id: string;
  legacy_glide_row_id?: string | null;
  name: string | null;
  status?: string | null;
  hide_from_csm_list?: boolean | null;
}

export interface PipelineOffer {
  glide_row_id: string;
  name: string | null;
}

export interface ClientPipelineItem {
  id: string;
  pipeline_id: string;
  stage_id: string;
  client_id: string;
  owner_member_id?: string | null;
  estimated_value_cents?: number | null;
  actual_value_cents?: number | null;
  currency_code?: string | null;
  renewal_at?: string | null;
  follow_up_at?: string | null;
  expected_close_at?: string | null;
  outcome?: string | null;
  loss_reason?: string | null;
  current_note?: string | null;
  target_offer_id?: string | null;
  source_contract_id?: string | null;
  result_contract_id?: string | null;
  client_name_snapshot?: string | null;
  client_business_snapshot?: string | null;
  pathway_id_snapshot?: string | null;
  pathway_name_snapshot?: string | null;
  lifecycle_status?: string | null;
  archived_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PipelineWorkspace {
  enabled: boolean;
  viewerAccess: boolean;
  roleAccess?: {
    director: boolean;
    support: boolean;
    csm: boolean;
    viewer: boolean;
  };
  canWrite: boolean;
  actorRole: PipelineActorRole | null;
  pipelines: CompanyPipeline[];
  stages: CompanyPipelineStage[];
  items: ClientPipelineItem[];
  clients: PipelineClient[];
  members: PipelineMember[];
  offers: PipelineOffer[];
}

export interface PipelineItemDraft {
  pipelineId?: string;
  stageId?: string;
  clientId?: string;
  ownerMemberId?: string | null;
  followUpDate?: string | null;
  expectedCloseDate?: string | null;
  renewalDate?: string | null;
  estimatedValueCents?: number | null;
  currencyCode?: string | null;
  outcome?: string | null;
  note?: string | null;
  targetOfferId?: string | null;
}

export interface PipelineWonDraft {
  startDate: string | null;
  endDate: string | null;
  contractDays: number | null;
  monthlyValue: number | null;
  totalContractValue: number | null;
  autoRenew: boolean;
  note: string | null;
  targetOfferId?: string | null;
  retentionTargetStatus?: "front-end" | "back-end" | null;
  programStatusTransition?: "immediate" | "on_contract_start" | null;
  markSuccess?: boolean;
}

export interface PipelineLostDraft {
  lossReason: string;
  outcome?: string | null;
  note?: string | null;
}

export interface RenewalScanResult {
  createdCount: number;
  skippedCount: number;
  items?: ClientPipelineItem[];
}

export interface RenewalPreviewCandidate {
  contract_id: string;
  client_id: string;
  pipeline_id: string;
  entry_stage_id: string;
  contract_end_at: string | null;
  eligibility_status: "eligible" | "excluded";
  exclusion_reason: string | null;
  estimated_value_cents: number | null;
  currency_code: string | null;
}

export interface RenewalPreviewResult {
  enabled: boolean;
  pipelineId: string;
  asOf: string;
  windowStart: string;
  windowEnd: string;
  leadDays: number;
  catchUpDays: number;
  totalEvaluated: number;
  eligibleCount: number;
  excludedCount: number;
  exclusionCounts: Record<string, number>;
  candidates: RenewalPreviewCandidate[];
}

type WorkspaceAction =
  | "workspace"
  | "create_item"
  | "update_item"
  | "move_stage"
  | "archive_item"
  | "resolve_pipeline_won"
  | "resolve_pipeline_lost"
  | "run_renewal_scan";

async function functionErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    const payload = (await context
      .clone()
      .json()
      .catch(() => null)) as { error?: unknown } | null;
    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function invokePipelineWorkspace<T>(
  action: WorkspaceAction,
  companyLegacyId: string,
  fields: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(
    "manage-pipeline-workspace",
    {
      body: { action, companyLegacyId, ...fields },
    },
  );
  if (error || data?.error) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : await functionErrorMessage(error, "Pipeline request failed.");
    throw new Error(message);
  }
  return data as T;
}

export async function loadPipelineWorkspace(companyLegacyId: string) {
  return invokePipelineWorkspace<PipelineWorkspace>(
    "workspace",
    companyLegacyId,
  );
}

export async function createPipelineItem(
  companyLegacyId: string,
  draft: Required<Pick<PipelineItemDraft, "pipelineId" | "clientId">> &
    PipelineItemDraft,
) {
  return invokePipelineWorkspace<{ item: ClientPipelineItem }>(
    "create_item",
    companyLegacyId,
    { ...draft },
  );
}

export async function updatePipelineItem(
  companyLegacyId: string,
  itemId: string,
  draft: PipelineItemDraft,
) {
  return invokePipelineWorkspace<{ item: ClientPipelineItem }>(
    "update_item",
    companyLegacyId,
    { itemId, ...draft },
  );
}

export async function movePipelineItemStage(
  companyLegacyId: string,
  itemId: string,
  stageId: string,
  note?: string | null,
) {
  return invokePipelineWorkspace<{ item: ClientPipelineItem }>(
    "move_stage",
    companyLegacyId,
    { itemId, stageId, note: note ?? null },
  );
}

export async function archivePipelineItem(
  companyLegacyId: string,
  itemId: string,
) {
  return invokePipelineWorkspace<{ item: ClientPipelineItem }>(
    "archive_item",
    companyLegacyId,
    { itemId },
  );
}

export async function resolvePipelineWon(
  companyLegacyId: string,
  itemId: string,
  draft: PipelineWonDraft,
) {
  return invokePipelineWorkspace<{ item: ClientPipelineItem }>(
    "resolve_pipeline_won",
    companyLegacyId,
    { itemId, ...draft },
  );
}

export async function resolvePipelineLost(
  companyLegacyId: string,
  itemId: string,
  draft: PipelineLostDraft,
) {
  return invokePipelineWorkspace<{ item: ClientPipelineItem }>(
    "resolve_pipeline_lost",
    companyLegacyId,
    { itemId, ...draft },
  );
}

export async function previewPipelineRenewals(
  companyLegacyId: string,
  pipelineId: string,
) {
  const { data, error } = await supabase.functions.invoke(
    "manage-pipeline-automation",
    {
      body: {
        action: "preview_renewals",
        companyLegacyId,
        pipelineId,
      },
    },
  );
  if (error || data?.error) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : await functionErrorMessage(error, "Renewal preview failed.");
    throw new Error(message);
  }
  return data as RenewalPreviewResult;
}

export async function runPipelineRenewalScan(
  companyLegacyId: string,
  pipelineId: string,
) {
  return invokePipelineWorkspace<RenewalScanResult>(
    "run_renewal_scan",
    companyLegacyId,
    { pipelineId },
  );
}
