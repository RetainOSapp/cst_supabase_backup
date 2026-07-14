import {
  LIMITS,
  SQL_CONTRACT,
  TOOL_RESULT_FIELDS,
} from "./contracts.mjs";
import { BeaconError } from "./errors.mjs";
import { withDeadline } from "./request.mjs";
import { assertNoUnexpectedKeys, isUuid } from "./validation.mjs";

const PROGRAM_STATUSES = ["front-end", "back-end", "paused", "suspended", "off-boarded"];
const HEALTH_DIMENSIONS = ["success", "progress", "buy_in"];
const HEALTH_STATES = ["green", "yellow", "red"];
const CLIENT_SORTS = ["name_asc", "renewal_asc", "last_contact_asc", "health_risk_first"];

function nullableEnum(value, allowed, label) {
  if (value === null) return null;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.", {
      category: `invalid_${label}`,
    });
  }
  return value;
}

function limit(value) {
  if (!Number.isInteger(value) || value < 1 || value > LIMITS.maxToolRows) {
    throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
  }
  return value;
}

function nullableUuid(value) {
  if (value === null) return null;
  if (!isUuid(value)) {
    throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
  }
  return value;
}

function nullableName(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 80) {
    throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
  }
  return value.trim();
}

function nullableExactName(value, label) {
  if (value === null) return null;
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 120) {
    throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.", {
      category: `invalid_${label}`,
    });
  }
  return value.trim();
}

function nullableDays(value) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 365) {
    throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
  }
  return value;
}

function nullableRiskStates(value) {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
  }
  const unique = [...new Set(value)];
  if (unique.length !== value.length || unique.some((state) => !["red", "yellow"].includes(state))) {
    throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
  }
  return unique;
}

function actorBoundArgs(context) {
  if (
    !isUuid(context.companyId) ||
    !isUuid(context.actorAuthUserId) ||
    (context.role !== "super_admin" && !isUuid(context.memberId)) ||
    (context.role === "super_admin" && context.memberId !== null)
  ) {
    throw new BeaconError(
      "tool_authorization_unavailable",
      503,
      "Beacon could not complete that request.",
    );
  }
  return {
    p_company_id: context.companyId,
    p_actor_auth_user_id: context.actorAuthUserId,
    p_actor_member_id: context.memberId,
  };
}

export const TOOL_DISPATCH = Object.freeze({
  company_metrics: Object.freeze({
    rpc: SQL_CONTRACT.userRpcs.company_metrics,
    validate(args) {
      assertNoUnexpectedKeys(args, []);
      return {};
    },
    rpcArgs(context) {
      return actorBoundArgs(context);
    },
  }),
  list_clients: Object.freeze({
    rpc: SQL_CONTRACT.userRpcs.list_clients,
    validate(args) {
      const keys = [
        "programStatus",
        "activeOnly",
        "healthDimension",
        "healthState",
        "csmMemberId",
        "csmName",
        "csmAssignment",
        "nameFragment",
        "nextContactDays",
        "riskStates",
        "sort",
        "limit",
      ];
      assertNoUnexpectedKeys(args, keys);
      if (keys.some((key) => !(key in args))) {
        throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
      }
      const healthDimension = nullableEnum(args.healthDimension, HEALTH_DIMENSIONS, "health_dimension");
      const healthState = nullableEnum(args.healthState, HEALTH_STATES, "health_state");
      if ((healthDimension === null) !== (healthState === null)) {
        throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
      }
      const riskStates = nullableRiskStates(args.riskStates);
      if (riskStates !== null && healthDimension !== null) {
        throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
      }
      if (args.csmMemberId !== null && args.csmName !== null) {
        throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
      }
      if (typeof args.activeOnly !== "boolean" || (args.activeOnly && args.programStatus !== null)) {
        throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
      }
      const csmAssignment = nullableEnum(args.csmAssignment, ["primary", "any"], "csm_assignment");
      if (csmAssignment !== null && args.csmName === null) {
        throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
      }
      const sort = nullableEnum(args.sort, CLIENT_SORTS, "sort");
      if (sort === null) {
        throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
      }
      return {
        programStatus: nullableEnum(args.programStatus, PROGRAM_STATUSES, "program_status"),
        activeOnly: args.activeOnly,
        healthDimension,
        healthState,
        csmMemberId: nullableUuid(args.csmMemberId),
        csmName: nullableExactName(args.csmName, "csm_name"),
        csmAssignment,
        nameFragment: nullableName(args.nameFragment),
        nextContactDays: nullableDays(args.nextContactDays),
        riskStates,
        sort,
        limit: limit(args.limit),
      };
    },
    rpcArgs(context, args) {
      return {
        ...actorBoundArgs(context),
        p_program_status: args.programStatus,
        p_active_only: args.activeOnly,
        p_health_dimension: args.healthDimension,
        p_health_state: args.healthState,
        p_csm_member_id: args.csmMemberId,
        p_csm_name: args.csmName,
        p_csm_assignment: args.csmAssignment,
        p_name_fragment: args.nameFragment,
        p_next_contact_days: args.nextContactDays,
        p_risk_states: args.riskStates,
        p_sort: args.sort,
        p_limit: args.limit,
      };
    },
  }),
  list_renewals: Object.freeze({
    rpc: SQL_CONTRACT.userRpcs.list_renewals,
    validate(args) {
      assertNoUnexpectedKeys(args, ["days", "limit"]);
      if (!Number.isInteger(args.days) || args.days < 0 || args.days > 365) {
        throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
      }
      return { days: args.days, limit: limit(args.limit) };
    },
    rpcArgs(context, args) {
      return { ...actorBoundArgs(context), p_days: args.days, p_limit: args.limit };
    },
  }),
  list_contract_gaps: Object.freeze({
    rpc: SQL_CONTRACT.userRpcs.list_contract_gaps,
    validate(args) {
      assertNoUnexpectedKeys(args, ["limit"]);
      return { limit: limit(args.limit) };
    },
    rpcArgs(context, args) {
      return { ...actorBoundArgs(context), p_limit: args.limit };
    },
  }),
  list_health_signals: Object.freeze({
    rpc: SQL_CONTRACT.userRpcs.list_health_signals,
    validate(args) {
      assertNoUnexpectedKeys(args, ["dimension", "state", "limit"]);
      const dimension = nullableEnum(args.dimension, HEALTH_DIMENSIONS, "health_dimension");
      const state = nullableEnum(args.state, HEALTH_STATES, "health_state");
      if (dimension === null || state === null) {
        throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
      }
      return {
        dimension,
        state,
        limit: limit(args.limit),
      };
    },
    rpcArgs(context, args) {
      return {
        ...actorBoundArgs(context),
        p_dimension: args.dimension,
        p_state: args.state,
        p_limit: args.limit,
      };
    },
  }),
  list_referral_ready: Object.freeze({
    rpc: SQL_CONTRACT.userRpcs.list_referral_ready,
    validate(args) {
      assertNoUnexpectedKeys(args, ["limit"]);
      return { limit: limit(args.limit) };
    },
    rpcArgs(context, args) {
      return { ...actorBoundArgs(context), p_limit: args.limit };
    },
  }),
  list_csm_books: Object.freeze({
    rpc: SQL_CONTRACT.userRpcs.list_csm_books,
    validate(args) {
      assertNoUnexpectedKeys(args, ["csmMemberId", "limit"]);
      return {
        csmMemberId: nullableUuid(args.csmMemberId),
        limit: limit(args.limit),
      };
    },
    rpcArgs(context, args) {
      return {
        ...actorBoundArgs(context),
        p_csm_member_id: args.csmMemberId,
        p_limit: args.limit,
      };
    },
  }),
  get_client_brief: Object.freeze({
    rpc: SQL_CONTRACT.userRpcs.get_client_brief,
    validate(args) {
      assertNoUnexpectedKeys(args, ["clientId", "clientName", "programStatus", "csmName", "csmAssignment"]);
      if (["clientId", "clientName", "programStatus", "csmName", "csmAssignment"].some((key) => !(key in args))) {
        throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
      }
      const clientId = nullableUuid(args.clientId);
      const clientName = nullableName(args.clientName);
      const programStatus = nullableEnum(args.programStatus, PROGRAM_STATUSES, "program_status");
      const csmName = nullableExactName(args.csmName, "csm_name");
      const csmAssignment = nullableEnum(args.csmAssignment, ["primary", "any"], "csm_assignment");
      if (
        (clientId === null) === (clientName === null) ||
        (clientId !== null && (programStatus !== null || csmName !== null || csmAssignment !== null)) ||
        (csmAssignment !== null && csmName === null)
      ) {
        throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
      }
      return { clientId, clientName, programStatus, csmName, csmAssignment };
    },
    rpcArgs(context, args) {
      return {
        ...actorBoundArgs(context),
        p_client_id: args.clientId,
        p_client_name: args.clientName,
        p_program_status: args.programStatus,
        p_csm_name: args.csmName,
        p_csm_assignment: args.csmAssignment,
      };
    },
  }),
});

function scalar(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function sanitizeRow(toolName, row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const output = {};
  for (const field of TOOL_RESULT_FIELDS[toolName]) {
    if (!(field in row)) continue;
    const value = scalar(row[field]);
    if (value !== null || row[field] === null) output[field] = value;
  }
  return output;
}

function serializedWithinLimit(value) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= LIMITS.maxToolResultChars) {
    return { value, serialized, truncated: false };
  }
  if (!Array.isArray(value)) {
    return {
      value: { truncated: true },
      serialized: JSON.stringify({ truncated: true }),
      truncated: true,
    };
  }
  const retained = [];
  for (const row of value) {
    const candidate = [...retained, row];
    if (JSON.stringify(candidate).length > LIMITS.maxToolResultChars) break;
    retained.push(row);
  }
  const capped = { rows: retained, truncated: true };
  return { value: capped, serialized: JSON.stringify(capped), truncated: true };
}

function authorizedLinks(rows) {
  const links = [];
  for (const row of rows) {
    if (
      typeof row?.client_name !== "string" ||
      row.client_name.trim().length < 1 ||
      row.client_name.trim().length > 120 ||
      typeof row.internal_path !== "string" ||
      !/^\/clients\/[A-Za-z0-9_-]+$/.test(row.internal_path)
    ) {
      continue;
    }
    links.push({ label: row.client_name.trim(), path: row.internal_path });
  }
  return links;
}

export async function executeTool({
  serviceClient,
  context,
  toolName,
  rawArguments,
  deadlineMs = Number.POSITIVE_INFINITY,
  now = () => Date.now(),
}) {
  const definition = TOOL_DISPATCH[toolName];
  if (!definition) {
    throw new BeaconError("tool_not_allowed", 502, "Beacon could not complete that request.");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    throw new BeaconError("tool_schema_denied", 502, "Beacon could not complete that request.");
  }
  const args = definition.validate(parsed);
  const { data, error } = await withDeadline(
    serviceClient.rpc(definition.rpc, definition.rpcArgs(context, args)),
    deadlineMs,
    now,
  );
  if (error) {
    return {
      tool: toolName,
      status: "error",
      rowCount: 0,
      output: JSON.stringify({ ok: false, code: "tool_unavailable" }),
      truncated: false,
      links: [],
    };
  }

  const rows = (Array.isArray(data) ? data : data ? [data] : [])
    .slice(0, LIMITS.maxToolRows)
    .map((row) => sanitizeRow(toolName, row))
    .filter(Boolean);
  const result = serializedWithinLimit(rows);
  const visibleRows = Array.isArray(result.value)
    ? result.value
    : Array.isArray(result.value.rows)
      ? result.value.rows
      : [];
  return {
    tool: toolName,
    status: "success",
    rowCount: Array.isArray(result.value) ? result.value.length : result.value.rows?.length ?? 0,
    output: result.serialized,
    truncated: result.truncated || (Array.isArray(data) && data.length > LIMITS.maxToolRows),
    links: authorizedLinks(visibleRows),
  };
}
