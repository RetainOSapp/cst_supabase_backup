const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

function parseCalendarDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  const match = text.match(CALENDAR_DATE_PATTERN);
  if (match) {
    const [, year, month, day] = match;
    return new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function calendarDateKey(value: unknown) {
  const date = parseCalendarDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

export function formatCalendarDate(
  value: unknown,
  locale?: string | string[],
  options: Intl.DateTimeFormatOptions = {},
) {
  const date = parseCalendarDate(value);
  if (!date) return "--";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
    timeZone: "UTC",
  }).format(date);
}
