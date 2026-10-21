/**
 * Pasting and importing recipients, and exporting certificates. Pure functions.
 *
 * Accepted input (pasted or from a .csv / .tsv file):
 *   - one name per line:                          Alexandra Fontaine
 *   - a table with a header row (comma, semicolon or tab separated; any column order; unknown columns are reported):
 *         name, score, grade, note
 *   - a table without a header: tab separated, name first, then the template's per-person fields in their order
 *     (that is what copying cells from a spreadsheet gives).
 * Names containing a comma are safe in the one-name-per-line form and inside "quotes" in a table.
 */
import type { CertRow, TemplateField } from "./types";

export interface ParsedRecipient {
  /** 1-based line of the input, for messages. */
  line: number;
  name: string;
  fields: Record<string, string>;
  note: string;
}

export interface ParseResult {
  rows: ParsedRecipient[];
  /** Things the person should look at; none of them stops the import. */
  warnings: string[];
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      out.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

const tidy = (name: string) => name.replace(/\s+/g, " ").trim();

/** `fields`: the template's per-person fields (scope "recipient" or "either"). */
export function parseRecipients(text: string, fields: TemplateField[]): ParseResult {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((l, i) => ({ text: l, line: i + 1 })).filter((l) => l.text.trim() !== "");
  const warnings: string[] = [];
  if (lines.length === 0) return { rows: [], warnings };

  const first = lines[0]!.text;
  const delimiter = first.includes("\t") ? "\t" : first.includes(";") ? ";" : first.includes(",") ? "," : "";
  const headerCells = delimiter ? splitLine(first, delimiter).map((c) => c.toLowerCase()) : [first.trim().toLowerCase()];
  const hasHeader = headerCells.some((c) => c === "name" || c === "recipient" || c === "full name");

  const columnFor = (cell: string): { kind: "name" | "note" | "field" | "skip"; key?: string } => {
    if (["name", "recipient", "full name"].includes(cell)) return { kind: "name" };
    if (["note", "notes", "email", "e-mail", "roll", "student id", "id"].includes(cell)) return { kind: "note" };
    const f = fields.find((x) => x.key.toLowerCase() === cell || x.label.toLowerCase() === cell);
    return f ? { kind: "field", key: f.key } : { kind: "skip" };
  };

  const rows: ParsedRecipient[] = [];
  if (hasHeader) {
    const columns = headerCells.map(columnFor);
    columns.forEach((c, i) => c.kind === "skip" && warnings.push(`Column “${headerCells[i]}” is not used (the template has no such per-person field).`));
    for (const { text: raw, line } of lines.slice(1)) {
      const cells = splitLine(raw, delimiter);
      const row: ParsedRecipient = { line, name: "", fields: {}, note: "" };
      columns.forEach((c, i) => {
        const v = cells[i] ?? "";
        if (c.kind === "name") row.name = tidy(v);
        else if (c.kind === "note") row.note = [row.note, v].filter(Boolean).join(" · ");
        else if (c.kind === "field" && v) row.fields[c.key!] = v;
      });
      rows.push(row);
    }
  } else if (lines.some((l) => l.text.includes("\t"))) {
    for (const { text: raw, line } of lines) {
      const cells = splitLine(raw, "\t");
      const row: ParsedRecipient = { line, name: tidy(cells[0] ?? ""), fields: {}, note: "" };
      fields.forEach((f, i) => cells[i + 1] && (row.fields[f.key] = cells[i + 1]!));
      rows.push(row);
    }
  } else {
    for (const { text: raw, line } of lines) rows.push({ line, name: tidy(raw), fields: {}, note: "" });
  }

  const seen = new Map<string, number>();
  const kept: ParsedRecipient[] = [];
  for (const row of rows) {
    if (!row.name) {
      warnings.push(`Line ${row.line}: no name — skipped.`);
      continue;
    }
    const k = row.name.toLowerCase();
    if (seen.has(k)) warnings.push(`Line ${row.line}: “${row.name}” is also on line ${seen.get(k)} — a duplicate?`);
    else seen.set(k, row.line);
    kept.push(row);
  }
  return { rows: kept, warnings };
}

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV of certificates, with the verification link of each (`verifyBase` = the website's address, may be empty). */
export function certificatesToCsv(rows: CertRow[], verifyBase: string): string {
  const head = ["id", "name", "certificate", "date", "set", "status", "verify_link"];
  const lines = [head.join(",")];
  for (const r of rows) {
    const link = verifyBase ? `${verifyBase.replace(/\/+$/, "")}/c/${r.id}` : "";
    lines.push([r.id, r.name, r.title, r.date, r.setCode, r.revoked ? "revoked" : "valid", link].map(cell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
