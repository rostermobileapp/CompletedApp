import Papa from "papaparse";
import { z } from "zod";
import { eventInput, type ImportPreview, type StaffEventInput } from "../shared/highSchoolStaff";
import { staffName } from "./highSchoolStaffBase";

export const rosterImportRow = z.object({
  firstName: staffName, lastName: staffName, gradYear: z.coerce.number().int().min(2026).max(2040),
  position: z.enum(["F", "D", "G"]), jerseyNumber: z.string().regex(/^\d{0,2}$/).default(""),
}).strict();
export const importText = z.string().min(1).max(200_000);
export function previewCsv<T>(text: string, schema: z.ZodType<T, any, any>, requiredHeaders: string[]): ImportPreview<T> {
  importText.parse(text);
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy",
    transformHeader: h => h.trim(), transform: v => v.trim() });
  const errors = parsed.errors.map(error => ({ row: (error.row ?? 0) + 2, message: error.message }));
  for (const field of requiredHeaders) {
    if (!parsed.meta.fields?.includes(field)) errors.push({ row: 1, message: `Missing column: ${field}` });
  }
  if (parsed.data.length > 200) errors.push({ row: 1, message: "Import at most 200 rows at a time." });
  const rows: T[] = [];
  for (const [index, row] of Array.from(parsed.data.slice(0, 200).entries())) {
    const result = schema.safeParse(row);
    if (result.success) rows.push(result.data);
    else errors.push({ row: index + 2, message: result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") });
  }
  if (!parsed.data.length) errors.push({ row: 1, message: "No data rows found." });
  return { rows, errors };
}
export function previewRoster(text: string) {
  return previewCsv(text, rosterImportRow, ["firstName", "lastName", "gradYear", "position"]);
}
export function previewEvents(format: "csv" | "ical", text: string): ImportPreview<StaffEventInput> {
  if (format === "csv") return previewCsv(text, eventInput, ["title", "startsAt"]);
  importText.parse(text);
  const rows: StaffEventInput[] = [], errors: { row: number; message: string }[] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  let current: Record<string, string> | null = null, start = 0;
  const decode = (value: string) => value.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");
  for (const [index, raw] of Array.from(lines.entries())) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") {
      if (current) errors.push({ row: index + 1, message: "Nested VEVENT is invalid." });
      current = {}; start = index + 1; continue;
    }
    if (line === "END:VEVENT") {
      if (!current) { errors.push({ row: index + 1, message: "Unexpected END:VEVENT." }); continue; }
      // Require explicit UTC to avoid ambiguous rink-local times or silent DST shifts.
      const dt = current.DTSTART ?? "";
      if (!/^\d{8}T\d{6}Z$/.test(dt)) errors.push({ row: start, message: "DTSTART must include UTC time (YYYYMMDDTHHMMSSZ). Export explicit UTC events; all-day/local/TZID events are not imported." });
      else {
        const iso = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}T${dt.slice(9, 11)}:${dt.slice(11, 13)}:${dt.slice(13, 15)}Z`;
        const result = eventInput.safeParse({ title: decode(current.SUMMARY ?? ""), startsAt: iso,
          rink: decode(current.LOCATION ?? ""), address: "", opponent: "" });
        if (result.success && Number.isFinite(Date.parse(iso))) rows.push(result.data);
        else errors.push({ row: start, message: "Event requires a valid SUMMARY, UTC DTSTART and location of at most 160 characters." });
      }
      current = null; continue;
    }
    if (!current) continue;
    const colon = line.indexOf(":");
    if (colon < 1) { errors.push({ row: index + 1, message: "Invalid iCal property." }); continue; }
    const key = line.slice(0, colon);
    if (/^(RRULE|RDATE|EXDATE|RECURRENCE-ID)/.test(key)) errors.push({ row: index + 1, message: "Recurring events are not supported. Expand individual games before importing." });
    if (key.startsWith("DTSTART;")) errors.push({ row: index + 1, message: "Timezone/all-day DTSTART is unsupported; export UTC timed events." });
    if (["SUMMARY", "DTSTART", "LOCATION"].includes(key)) {
      if (key in current) errors.push({ row: index + 1, message: `Duplicate ${key}.` });
      current[key] = line.slice(colon + 1);
    }
  }
  if (current) errors.push({ row: start, message: "Unclosed VEVENT." });
  if (!text.includes("BEGIN:VCALENDAR") || !text.includes("END:VCALENDAR")) errors.push({ row: 1, message: "A complete VCALENDAR file is required." });
  if (!rows.length) errors.push({ row: 1, message: "No valid timed events found." });
  if (rows.length > 200) errors.push({ row: 1, message: "Import at most 200 events at a time." });
  return { rows: rows.slice(0, 200), errors };
}
