export interface DashboardKpiSqlParams {
  companyId: string;
  csmId: string;
  secondaryAssigneeId: string;
  programValue: string;
  clientStartDateFrom: string;
  clientStartDateTo: string;
  dateRangeStart: string;
  dateRangeEnd: string;
}

function sqlQuoted(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlTextLiteral(value: string) {
  return value ? `${sqlQuoted(value)}::text` : "NULL::text";
}

function sqlDateLiteral(value: string) {
  return value ? `${sqlQuoted(value)}::date` : "NULL::date";
}

function buildKpiSql(
  resultAlias: string,
  statusConditionSql: string,
  params: DashboardKpiSqlParams,
) {
  return `WITH params AS (
  SELECT
    ${sqlTextLiteral(params.companyId)} AS company_id,
    ${sqlTextLiteral(params.csmId)} AS csm_id,
    ${sqlTextLiteral(params.secondaryAssigneeId)} AS secondary_assignee_id,
    ${sqlTextLiteral(params.programValue)} AS program_value,
    ${sqlDateLiteral(params.clientStartDateFrom)} AS client_start_date_from,
    ${sqlDateLiteral(params.clientStartDateTo)} AS client_start_date_to,
    ${sqlDateLiteral(params.dateRangeStart)} AS date_range_start,
    ${sqlDateLiteral(params.dateRangeEnd)} AS date_range_end
)
SELECT COUNT(*) AS ${resultAlias}
FROM backup_company_clients c
CROSS JOIN params p
WHERE c.company_id = p.company_id
  AND (p.csm_id IS NULL OR c.csm_team_member_id = p.csm_id)
  AND (
    p.secondary_assignee_id IS NULL
    OR c.csm_secondary_assignee_id = p.secondary_assignee_id
  )
  AND (p.program_value IS NULL OR c.program_status_value = p.program_value)
  AND (
    p.client_start_date_from IS NULL
    OR c.client_age_date_onboarded >= p.client_start_date_from::timestamp
  )
  AND (
    p.client_start_date_to IS NULL
    OR c.client_age_date_onboarded < (p.client_start_date_to::timestamp + INTERVAL '1 day')
  )
  AND (
    p.date_range_end IS NULL
    OR c.client_age_date_onboarded < p.date_range_end::timestamp
  )
  AND ${statusConditionSql};`;
}

export function getActiveClientsSql(params: DashboardKpiSqlParams) {
  return buildKpiSql(
    "active_clients",
    "c.program_status_value IN ('front-end', 'back-end')",
    params,
  );
}

export function getFrontEndClientsSql(params: DashboardKpiSqlParams) {
  return buildKpiSql(
    "front_end_clients",
    "c.program_status_value = 'front-end'",
    params,
  );
}

export function getBackEndClientsSql(params: DashboardKpiSqlParams) {
  return buildKpiSql(
    "back_end_clients",
    "c.program_status_value = 'back-end'",
    params,
  );
}

export function getOffBoardedClientsSql(params: DashboardKpiSqlParams) {
  return `WITH params AS (
  SELECT
    ${sqlTextLiteral(params.companyId)} AS company_id,
    ${sqlTextLiteral(params.csmId)} AS csm_id,
    ${sqlTextLiteral(params.secondaryAssigneeId)} AS secondary_assignee_id,
    ${sqlTextLiteral(params.programValue)} AS program_value,
    ${sqlDateLiteral(params.clientStartDateFrom)} AS client_start_date_from,
    ${sqlDateLiteral(params.clientStartDateTo)} AS client_start_date_to,
    ${sqlDateLiteral(params.dateRangeStart)} AS date_range_start,
    ${sqlDateLiteral(params.dateRangeEnd)} AS date_range_end
),
filtered_clients AS (
  SELECT c.*
  FROM backup_company_clients c
  CROSS JOIN params p
  WHERE c.company_id = p.company_id
    AND (p.csm_id IS NULL OR c.csm_team_member_id = p.csm_id)
    AND (
      p.secondary_assignee_id IS NULL
      OR c.csm_secondary_assignee_id = p.secondary_assignee_id
    )
    AND (p.program_value IS NULL OR c.program_status_value = p.program_value)
    AND (
      p.client_start_date_from IS NULL
      OR c.client_age_date_onboarded >= p.client_start_date_from::timestamp
    )
    AND (
      p.client_start_date_to IS NULL
      OR c.client_age_date_onboarded < (p.client_start_date_to::timestamp + INTERVAL '1 day')
    )
)
SELECT COUNT(*) AS off_boarded_clients
FROM filtered_clients c
CROSS JOIN params p
WHERE c.program_status_value = 'off-boarded'
  AND (
    p.date_range_start IS NULL
    OR c.client_age_date_offboarded_for_filtering >= p.date_range_start::timestamp
  )
  AND (
    p.date_range_end IS NULL
    OR c.client_age_date_offboarded_for_filtering < (p.date_range_end::timestamp + INTERVAL '1 day')
  );`;
}

export function getChurnPercentageSql(params: DashboardKpiSqlParams) {
  return `WITH params AS (
  SELECT
    ${sqlTextLiteral(params.companyId)} AS company_id,
    ${sqlTextLiteral(params.csmId)} AS csm_id,
    ${sqlTextLiteral(params.secondaryAssigneeId)} AS secondary_assignee_id,
    ${sqlTextLiteral(params.programValue)} AS program_value,
    ${sqlDateLiteral(params.clientStartDateFrom)} AS client_start_date_from,
    ${sqlDateLiteral(params.clientStartDateTo)} AS client_start_date_to,
    ${sqlDateLiteral(params.dateRangeStart)} AS date_range_start,
    ${sqlDateLiteral(params.dateRangeEnd)} AS date_range_end
),
base_filtered_clients AS (
  SELECT
    c.*,
    COALESCE(
      c.current_contract_end_date,
      CASE
        WHEN COALESCE(c.current_contract_start_date, c.client_age_date_onboarded) IS NOT NULL
          AND c.current_contract_of_days IS NOT NULL
        THEN COALESCE(c.current_contract_start_date, c.client_age_date_onboarded)
          + (INTERVAL '1 day' * c.current_contract_of_days)
        ELSE NULL
      END
    ) AS calculated_contract_end_date,
    COALESCE(
      c.client_age_date_offboarded,
      c.client_age_date_offboarded_for_filtering,
      COALESCE(
        c.current_contract_end_date,
        CASE
          WHEN COALESCE(c.current_contract_start_date, c.client_age_date_onboarded) IS NOT NULL
            AND c.current_contract_of_days IS NOT NULL
          THEN COALESCE(c.current_contract_start_date, c.client_age_date_onboarded)
            + (INTERVAL '1 day' * c.current_contract_of_days)
          ELSE NULL
        END
      )
    ) AS calculated_offboarded_date
  FROM backup_company_clients c
  CROSS JOIN params p
  WHERE c.company_id = p.company_id
    AND (p.csm_id IS NULL OR c.csm_team_member_id = p.csm_id)
    AND (
      p.secondary_assignee_id IS NULL
      OR c.csm_secondary_assignee_id = p.secondary_assignee_id
    )
    AND (p.program_value IS NULL OR c.program_status_value = p.program_value)
    AND (
      p.client_start_date_from IS NULL
      OR c.client_age_date_onboarded >= p.client_start_date_from::timestamp
    )
    AND (
      p.client_start_date_to IS NULL
      OR c.client_age_date_onboarded < (p.client_start_date_to::timestamp + INTERVAL '1 day')
    )
    AND (
      p.date_range_end IS NULL
      OR c.client_age_date_onboarded < p.date_range_end::timestamp
    )
),
off_boarded_clients AS (
  SELECT c.*
  FROM base_filtered_clients c
  CROSS JOIN params p
  WHERE c.program_status_value = 'off-boarded'
    AND (
      p.date_range_start IS NULL
      OR c.calculated_offboarded_date >= p.date_range_start::timestamp
    )
    AND (
      p.date_range_end IS NULL
      OR c.calculated_offboarded_date < (p.date_range_end::timestamp + INTERVAL '1 day')
    )
),
churned_clients AS (
  SELECT c.*
  FROM off_boarded_clients c
  WHERE c.calculated_offboarded_date IS NOT NULL
    AND c.calculated_contract_end_date IS NOT NULL
    AND c.calculated_offboarded_date < c.calculated_contract_end_date
),
totals AS (
  SELECT
    (SELECT COUNT(*) FROM base_filtered_clients WHERE program_status_value = 'front-end') AS front_end_count,
    (SELECT COUNT(*) FROM base_filtered_clients WHERE program_status_value = 'back-end') AS back_end_count,
    (SELECT COUNT(*) FROM off_boarded_clients) AS off_boarded_count,
    (SELECT COUNT(*) FROM churned_clients) AS churned_count
)
SELECT
  churned_count AS churned_clients,
  (front_end_count + back_end_count + off_boarded_count) AS total_clients,
  CASE
    WHEN (front_end_count + back_end_count + off_boarded_count) = 0 THEN 0
    ELSE ROUND(
      (churned_count::numeric / (front_end_count + back_end_count + off_boarded_count)::numeric) * 100
    )
  END AS churn_percentage
FROM totals;`;
}

export function getRetainedClientsSql(params: DashboardKpiSqlParams) {
  return `WITH params AS (
  SELECT
    ${sqlTextLiteral(params.companyId)} AS company_id,
    ${sqlTextLiteral(params.csmId)} AS csm_id,
    ${sqlTextLiteral(params.secondaryAssigneeId)} AS secondary_assignee_id,
    ${sqlTextLiteral(params.programValue)} AS program_value,
    ${sqlDateLiteral(params.clientStartDateFrom)} AS client_start_date_from,
    ${sqlDateLiteral(params.clientStartDateTo)} AS client_start_date_to,
    ${sqlDateLiteral(params.dateRangeStart)} AS date_range_start,
    ${sqlDateLiteral(params.dateRangeEnd)} AS date_range_end
),
base_filtered_clients AS (
  SELECT c.*
  FROM backup_company_clients c
  CROSS JOIN params p
  WHERE c.company_id = p.company_id
    AND (p.csm_id IS NULL OR c.csm_team_member_id = p.csm_id)
    AND (
      p.secondary_assignee_id IS NULL
      OR c.csm_secondary_assignee_id = p.secondary_assignee_id
    )
    AND (p.program_value IS NULL OR c.program_status_value = p.program_value)
    AND (
      p.client_start_date_from IS NULL
      OR c.client_age_date_onboarded >= p.client_start_date_from::timestamp
    )
    AND (
      p.client_start_date_to IS NULL
      OR c.client_age_date_onboarded < (p.client_start_date_to::timestamp + INTERVAL '1 day')
    )
    AND (
      p.date_range_end IS NULL
      OR c.client_age_date_onboarded < p.date_range_end::timestamp
    )
),
retained_history AS (
  SELECT h.client_id
  FROM backup_company_clients_history h
  JOIN base_filtered_clients c
    ON c.glide_row_id = h.client_id
  CROSS JOIN params p
  WHERE h.change_type_code = 'program-status'
    AND h.value = 'back-end'
    AND h.original_value IN ('front-end', 'back-end')
    AND (
      p.date_range_start IS NULL
      OR h.modified_date >= p.date_range_start::timestamp
    )
    AND (
      p.date_range_end IS NULL
      OR h.modified_date < (p.date_range_end::timestamp + INTERVAL '1 day')
    )
)
SELECT COUNT(DISTINCT client_id) AS retained_clients
FROM retained_history;`;
}

export function getRetentionPercentageSql(params: DashboardKpiSqlParams) {
  return `WITH params AS (
  SELECT
    ${sqlTextLiteral(params.companyId)} AS company_id,
    ${sqlTextLiteral(params.csmId)} AS csm_id,
    ${sqlTextLiteral(params.secondaryAssigneeId)} AS secondary_assignee_id,
    ${sqlTextLiteral(params.programValue)} AS program_value,
    ${sqlDateLiteral(params.clientStartDateFrom)} AS client_start_date_from,
    ${sqlDateLiteral(params.clientStartDateTo)} AS client_start_date_to,
    ${sqlDateLiteral(params.dateRangeStart)} AS date_range_start,
    ${sqlDateLiteral(params.dateRangeEnd)} AS date_range_end
),
base_filtered_clients AS (
  SELECT
    c.*,
    COALESCE(
      c.current_contract_end_date,
      CASE
        WHEN COALESCE(c.current_contract_start_date, c.client_age_date_onboarded) IS NOT NULL
          AND c.current_contract_of_days IS NOT NULL
        THEN COALESCE(c.current_contract_start_date, c.client_age_date_onboarded)
          + (INTERVAL '1 day' * c.current_contract_of_days)
        ELSE NULL
      END
    ) AS calculated_contract_end_date,
    COALESCE(
      c.client_age_date_offboarded,
      c.client_age_date_offboarded_for_filtering,
      COALESCE(
        c.current_contract_end_date,
        CASE
          WHEN COALESCE(c.current_contract_start_date, c.client_age_date_onboarded) IS NOT NULL
            AND c.current_contract_of_days IS NOT NULL
          THEN COALESCE(c.current_contract_start_date, c.client_age_date_onboarded)
            + (INTERVAL '1 day' * c.current_contract_of_days)
          ELSE NULL
        END
      )
    ) AS calculated_offboarded_date
  FROM backup_company_clients c
  CROSS JOIN params p
  WHERE c.company_id = p.company_id
    AND (p.csm_id IS NULL OR c.csm_team_member_id = p.csm_id)
    AND (
      p.secondary_assignee_id IS NULL
      OR c.csm_secondary_assignee_id = p.secondary_assignee_id
    )
    AND (p.program_value IS NULL OR c.program_status_value = p.program_value)
    AND (
      p.client_start_date_from IS NULL
      OR c.client_age_date_onboarded >= p.client_start_date_from::timestamp
    )
    AND (
      p.client_start_date_to IS NULL
      OR c.client_age_date_onboarded < (p.client_start_date_to::timestamp + INTERVAL '1 day')
    )
    AND (
      p.date_range_end IS NULL
      OR c.client_age_date_onboarded < p.date_range_end::timestamp
    )
),
retained_history AS (
  SELECT DISTINCT h.client_id
  FROM backup_company_clients_history h
  JOIN base_filtered_clients c
    ON c.glide_row_id = h.client_id
  CROSS JOIN params p
  WHERE h.change_type_code = 'program-status'
    AND h.value = 'back-end'
    AND h.original_value IN ('front-end', 'back-end')
    AND (
      p.date_range_start IS NULL
      OR h.modified_date >= p.date_range_start::timestamp
    )
    AND (
      p.date_range_end IS NULL
      OR h.modified_date < (p.date_range_end::timestamp + INTERVAL '1 day')
    )
),
renewing_ids AS (
  SELECT c.glide_row_id AS client_id
  FROM base_filtered_clients c
  CROSS JOIN params p
  WHERE c.program_status_value NOT IN ('paused', 'suspended')
    AND NOT (
      c.calculated_offboarded_date IS NOT NULL
      AND c.calculated_contract_end_date IS NOT NULL
      AND c.calculated_offboarded_date < c.calculated_contract_end_date
    )
    AND c.calculated_contract_end_date IS NOT NULL
    AND (
      p.date_range_start IS NULL
      OR c.calculated_contract_end_date >= p.date_range_start::timestamp
    )
    AND (
      p.date_range_end IS NULL
      OR c.calculated_contract_end_date < (p.date_range_end::timestamp + INTERVAL '1 day')
    )
  UNION
  SELECT con.client_id
  FROM backup_company_clients_contracts con
  JOIN base_filtered_clients c
    ON c.glide_row_id = con.client_id
  CROSS JOIN params p
  WHERE c.program_status_value NOT IN ('paused', 'suspended')
    AND NOT (
      c.calculated_offboarded_date IS NOT NULL
      AND c.calculated_contract_end_date IS NOT NULL
      AND c.calculated_offboarded_date < c.calculated_contract_end_date
    )
    AND con.end_date IS NOT NULL
    AND (
      p.date_range_start IS NULL
      OR con.end_date >= p.date_range_start::timestamp
    )
    AND (
      p.date_range_end IS NULL
      OR con.end_date < (p.date_range_end::timestamp + INTERVAL '1 day')
    )
),
totals AS (
  SELECT
    (SELECT COUNT(*) FROM retained_history) AS retained_count,
    (SELECT COUNT(*) FROM renewing_ids) AS renewing_count
)
SELECT
  retained_count AS retained_clients,
  renewing_count AS renewing_clients,
  CASE
    WHEN renewing_count = 0 THEN 0
    ELSE ROUND((retained_count::numeric / renewing_count::numeric) * 100)
  END AS retention_percentage
FROM totals;`;
}

export function getUpForRenewalSql(params: DashboardKpiSqlParams) {
  return `WITH params AS (
  SELECT
    ${sqlTextLiteral(params.companyId)} AS company_id,
    ${sqlTextLiteral(params.csmId)} AS csm_id,
    ${sqlTextLiteral(params.secondaryAssigneeId)} AS secondary_assignee_id,
    ${sqlTextLiteral(params.programValue)} AS program_value,
    ${sqlDateLiteral(params.clientStartDateFrom)} AS client_start_date_from,
    ${sqlDateLiteral(params.clientStartDateTo)} AS client_start_date_to,
    ${sqlDateLiteral(params.dateRangeStart)} AS date_range_start,
    ${sqlDateLiteral(params.dateRangeEnd)} AS date_range_end
),
base_filtered_clients AS (
  SELECT
    c.*,
    COALESCE(
      c.current_contract_end_date,
      CASE
        WHEN COALESCE(c.current_contract_start_date, c.client_age_date_onboarded) IS NOT NULL
          AND c.current_contract_of_days IS NOT NULL
        THEN COALESCE(c.current_contract_start_date, c.client_age_date_onboarded)
          + (INTERVAL '1 day' * c.current_contract_of_days)
        ELSE NULL
      END
    ) AS calculated_contract_end_date,
    COALESCE(
      c.client_age_date_offboarded,
      c.client_age_date_offboarded_for_filtering,
      COALESCE(
        c.current_contract_end_date,
        CASE
          WHEN COALESCE(c.current_contract_start_date, c.client_age_date_onboarded) IS NOT NULL
            AND c.current_contract_of_days IS NOT NULL
          THEN COALESCE(c.current_contract_start_date, c.client_age_date_onboarded)
            + (INTERVAL '1 day' * c.current_contract_of_days)
          ELSE NULL
        END
      )
    ) AS calculated_offboarded_date
  FROM backup_company_clients c
  CROSS JOIN params p
  WHERE c.company_id = p.company_id
    AND (p.csm_id IS NULL OR c.csm_team_member_id = p.csm_id)
    AND (
      p.secondary_assignee_id IS NULL
      OR c.csm_secondary_assignee_id = p.secondary_assignee_id
    )
    AND (p.program_value IS NULL OR c.program_status_value = p.program_value)
    AND (
      p.client_start_date_from IS NULL
      OR c.client_age_date_onboarded >= p.client_start_date_from::timestamp
    )
    AND (
      p.client_start_date_to IS NULL
      OR c.client_age_date_onboarded < (p.client_start_date_to::timestamp + INTERVAL '1 day')
    )
    AND (
      p.date_range_end IS NULL
      OR c.client_age_date_onboarded < p.date_range_end::timestamp
    )
),
retained_ids AS (
  SELECT DISTINCT h.client_id
  FROM backup_company_clients_history h
  JOIN base_filtered_clients c
    ON c.glide_row_id = h.client_id
  CROSS JOIN params p
  WHERE h.change_type_code = 'program-status'
    AND h.value = 'back-end'
    AND h.original_value IN ('front-end', 'back-end')
    AND (
      p.date_range_start IS NULL
      OR h.modified_date >= p.date_range_start::timestamp
    )
    AND (
      p.date_range_end IS NULL
      OR h.modified_date < (p.date_range_end::timestamp + INTERVAL '1 day')
    )
),
renewing_ids AS (
  SELECT c.glide_row_id AS client_id
  FROM base_filtered_clients c
  CROSS JOIN params p
  WHERE c.program_status_value NOT IN ('paused', 'suspended')
    AND NOT (
      c.calculated_offboarded_date IS NOT NULL
      AND c.calculated_contract_end_date IS NOT NULL
      AND c.calculated_offboarded_date < c.calculated_contract_end_date
    )
    AND c.calculated_contract_end_date IS NOT NULL
    AND (
      p.date_range_start IS NULL
      OR c.calculated_contract_end_date >= p.date_range_start::timestamp
    )
    AND (
      p.date_range_end IS NULL
      OR c.calculated_contract_end_date < (p.date_range_end::timestamp + INTERVAL '1 day')
    )
  UNION
  SELECT con.client_id
  FROM backup_company_clients_contracts con
  JOIN base_filtered_clients c
    ON c.glide_row_id = con.client_id
  CROSS JOIN params p
  WHERE c.program_status_value NOT IN ('paused', 'suspended')
    AND NOT (
      c.calculated_offboarded_date IS NOT NULL
      AND c.calculated_contract_end_date IS NOT NULL
      AND c.calculated_offboarded_date < c.calculated_contract_end_date
    )
    AND con.end_date IS NOT NULL
    AND (
      p.date_range_start IS NULL
      OR con.end_date >= p.date_range_start::timestamp
    )
    AND (
      p.date_range_end IS NULL
      OR con.end_date < (p.date_range_end::timestamp + INTERVAL '1 day')
    )
)
SELECT COUNT(*) AS active_renewing_clients
FROM renewing_ids r
JOIN base_filtered_clients c
  ON c.glide_row_id = r.client_id
WHERE c.program_status_value IN ('front-end', 'back-end')
  AND r.client_id NOT IN (SELECT client_id FROM retained_ids);`;
}
