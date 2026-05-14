export interface ProgramChoice {
  program_value: string | null;
  program_label: string | null;
  program_emoji: string | null;
}

function titleize(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function getProgramStatusDisplay(
  value: string | null | undefined,
  choices: ProgramChoice[] = [],
) {
  const choice = choices.find((item) => item.program_value === value);
  const fallbackLabel = value ? titleize(value) : "Unknown";
  const label = choice?.program_label ?? fallbackLabel;
  const text = choice?.program_emoji ? `${choice.program_emoji} ${label}` : label;
  const color =
    value === "front-end"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : value === "back-end"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : value === "off-boarded"
          ? "bg-slate-50 text-slate-700 border-slate-200"
          : value === "paused" || value === "suspended"
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-gray-50 text-gray-600 border-gray-200";

  return { text, color };
}

export function ProgramStatusPill({
  value,
  choices = [],
}: {
  value: string | null | undefined;
  choices?: ProgramChoice[];
}) {
  const status = getProgramStatusDisplay(value, choices);

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${status.color}`}
    >
      {status.text}
    </span>
  );
}
