export const CLIENT_CSV_COLUMNS = [
  "client_name",
  "client_email",
  "client_business",
  "client_phone",
  "program_status",
  "date_onboarded",
  "csm_id",
  "csm_name",
  "csm_email",
  "offer_id",
  "offer_name",
  "contract_start_date",
  "contract_end_date",
  "contract_monthly_value",
  "contract_notes",
  "client_archetype",
  "north_star",
  "next_steps",
  "director_notes",
  "notes",
  "customfield1",
  "customfield2",
  "customfield3",
  "customfield4",
  "customfield5",
  "customfield6",
  "customfield7",
] as const;

export type ClientCsvColumn = (typeof CLIENT_CSV_COLUMNS)[number];
export type ClientCsvRecord = Record<ClientCsvColumn, string>;

export interface ClientCsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

export interface ClientCsvValidationContext {
  programChoices: { value: string; label: string }[];
  teamMembers: { id: string; name: string; email?: string | null }[];
  offers: { id: string; name: string }[];
  assignedTeamMemberId?: string;
}

export interface ClientCsvPreviewRow {
  rowNumber: number;
  source: Record<string, string>;
  payload: {
    clientName: string;
    clientBusiness: string;
    clientEmail: string;
    clientArchetype: string;
    northStar: string;
    dateOnboarded: string;
    programStatusValue: string;
    csmTeamMemberId: string;
    offerId: string;
    contractStartDate: string;
    contractEndDate: string;
  };
  errors: string[];
  warnings: string[];
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeLookup(value: string) {
  return value.trim().toLowerCase();
}

function cellValue(row: Record<string, string>, names: string[]) {
  for (const name of names) {
    const value = row[normalizeHeader(name)];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function parseDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function parseClientCsv(text: string): ClientCsvParseResult {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current);
  rows.push(row);

  const nonEmptyRows = rows.filter((cells) =>
    cells.some((cell) => cell.trim() !== ""),
  );
  const rawHeaders = nonEmptyRows[0] ?? [];
  const headers = rawHeaders.map(normalizeHeader);

  return {
    headers,
    rows: nonEmptyRows.slice(1).map((cells) =>
      headers.reduce<Record<string, string>>((record, header, index) => {
        if (header) record[header] = cells[index]?.trim() ?? "";
        return record;
      }, {}),
    ),
  };
}

export function escapeCsvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function buildClientCsv(rows: Record<string, unknown>[]) {
  return [
    CLIENT_CSV_COLUMNS.join(","),
    ...rows.map((row) =>
      CLIENT_CSV_COLUMNS.map((column) => escapeCsvCell(row[column])).join(","),
    ),
  ].join("\n");
}

export function buildClientCsvTemplate() {
  return `${CLIENT_CSV_COLUMNS.join(",")}\n`;
}

export function validateClientCsvRows(
  rows: Record<string, string>[],
  context: ClientCsvValidationContext,
): ClientCsvPreviewRow[] {
  const programsByValue = new Map(
    context.programChoices.map((choice) => [
      normalizeLookup(choice.value),
      choice.value,
    ]),
  );
  const programsByLabel = new Map(
    context.programChoices.map((choice) => [
      normalizeLookup(choice.label),
      choice.value,
    ]),
  );
  const membersById = new Map(
    context.teamMembers.map((member) => [normalizeLookup(member.id), member.id]),
  );
  const membersByName = new Map(
    context.teamMembers.map((member) => [
      normalizeLookup(member.name),
      member.id,
    ]),
  );
  const membersByEmail = new Map(
    context.teamMembers
      .filter((member) => member.email)
      .map((member) => [normalizeLookup(member.email ?? ""), member.id]),
  );
  const offersById = new Map(
    context.offers.map((offer) => [normalizeLookup(offer.id), offer.id]),
  );
  const offersByName = new Map(
    context.offers.map((offer) => [normalizeLookup(offer.name), offer.id]),
  );

  return rows.map((row, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const clientName = cellValue(row, ["client_name", "name"]);
    const programRaw = cellValue(row, ["program_status", "status", "program"]);
    const csmRaw =
      cellValue(row, ["csm_id", "primary_csm_id"]) ||
      cellValue(row, ["csm_email", "primary_csm_email"]) ||
      cellValue(row, ["csm_name", "primary_csm"]);
    const offerRaw =
      cellValue(row, ["offer_id", "pathway_id"]) ||
      cellValue(row, ["offer_name", "pathway", "offer"]);
    const onboardedRaw = cellValue(row, ["date_onboarded", "onboarded"]);
    const contractStartRaw = cellValue(row, ["contract_start_date"]);
    const contractEndRaw = cellValue(row, [
      "contract_end_date",
      "renewal_date",
      "next_renewal_date",
    ]);
    const dateOnboarded = parseDate(onboardedRaw);
    const contractStartDate = parseDate(contractStartRaw);
    const contractEndDate = parseDate(contractEndRaw);

    if (!clientName) errors.push("Client name is required.");
    if (dateOnboarded === null) errors.push("Date onboarded is not a valid date.");
    if (contractStartDate === null)
      errors.push("Contract start date is not a valid date.");
    if (contractEndDate === null)
      errors.push("Contract end date is not a valid date.");

    let programStatusValue = "front-end";
    if (programRaw) {
      const normalized = normalizeLookup(programRaw);
      const matchedProgram =
        programsByValue.get(normalized) ?? programsByLabel.get(normalized);
      if (matchedProgram) {
        programStatusValue = matchedProgram;
      } else {
        errors.push(`Unknown program/status "${programRaw}".`);
      }
    }

    let csmTeamMemberId = "";
    if (context.assignedTeamMemberId) {
      csmTeamMemberId = context.assignedTeamMemberId;
      if (csmRaw) warnings.push("CSM column ignored for assigned-CSM users.");
    } else if (csmRaw) {
      const normalized = normalizeLookup(csmRaw);
      csmTeamMemberId =
        membersById.get(normalized) ??
        membersByEmail.get(normalized) ??
        membersByName.get(normalized) ??
        "";
      if (!csmTeamMemberId) errors.push(`Unknown CSM "${csmRaw}".`);
    }

    let offerId = "";
    if (offerRaw) {
      const normalized = normalizeLookup(offerRaw);
      offerId = offersById.get(normalized) ?? offersByName.get(normalized) ?? "";
      if (!offerId) errors.push(`Unknown offer/pathway "${offerRaw}".`);
    }

    if (cellValue(row, ["contract_monthly_value"])) {
      warnings.push("Contract monthly value is previewed/exported but not imported yet.");
    }
    if (cellValue(row, ["contract_notes"])) {
      warnings.push("Contract notes are previewed/exported but not imported yet.");
    }
    if (cellValue(row, ["client_phone", "phone"])) {
      warnings.push("Phone is previewed/exported but not imported yet.");
    }
    if (cellValue(row, ["next_steps"])) {
      warnings.push("Next steps are previewed/exported but not imported yet.");
    }
    if (cellValue(row, ["director_notes"])) {
      warnings.push("Director notes are previewed/exported but not imported yet.");
    }
    if (CLIENT_CSV_COLUMNS.some((column) => column.startsWith("customfield") && row[column])) {
      warnings.push("Custom field values are previewed/exported but not imported yet.");
    }

    return {
      rowNumber: index + 2,
      source: row,
      payload: {
        clientName,
        clientBusiness: cellValue(row, ["client_business", "business", "business_name"]),
        clientEmail: cellValue(row, ["client_email", "email"]),
        clientArchetype: cellValue(row, ["client_archetype", "archetype"]),
        northStar: cellValue(row, ["north_star", "northstar"]),
        dateOnboarded: dateOnboarded ?? "",
        programStatusValue,
        csmTeamMemberId,
        offerId,
        contractStartDate: contractStartDate ?? "",
        contractEndDate: contractEndDate ?? "",
      },
      errors,
      warnings,
    };
  });
}
