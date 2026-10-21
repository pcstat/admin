/**
 * Smart search over every certificate of every set. Pure functions, no React.
 *
 * What it understands:
 *  - several words: every word has to match (name, ID, course, set, date…); words are typo-tolerant (4+ letters) and ignore accents;
 *  - parts of an ID: "k7m4" finds it, dashes / case / look-alike characters (O/0, I/1) do not matter;
 *  - dates: "2026", "june", "2026-06", "june 2026";
 *  - "quoted phrases";
 *  - operators: set:py26  course:python  year:2026  status:revoked  is:revoked  is:new  id:k7m4  has:note  has:score  no:grade
 * Results are ranked: an ID match first, then names that start with the word, then the rest.
 */
import { distance, norm, queryWords, wordIn } from "../smart-search";
import { dateWords } from "../datetime";
import { foldLookalikes, formatId, normalizeId } from "./core";
import type { CertRow, SetFile } from "./types";

const rowCache = new WeakMap<SetFile, { saved: Set<string>; rows: CertRow[] }>();

/** The rows of one set. Cached per set object — editing one set rebuilds only that set's rows. `saved`: person ids already in the repo. */
export function rowsOf(set: SetFile, saved: Set<string>): CertRow[] {
  const hit = rowCache.get(set);
  if (hit && hit.saved === saved) return hit.rows;
  const cert = set.certificate;
  const rows = Object.entries(set.people).map(([personId, p]): CertRow => {
    const fields = { ...(cert.fields ?? {}), ...(p.fields ?? {}) };
    const id = formatId(set.code, personId);
    return {
      key: normalizeId(id),
      id,
      personId,
      name: p.name,
      setCode: set.code,
      setTitle: cert.title,
      title: cert.title,
      date: cert.date,
      revoked: p.revoked,
      isNew: !saved.has(personId),
      n: {
        name: norm(p.name),
        title: norm(cert.title),
        set: norm(`${set.code} ${cert.title}`),
        extra: norm(`${Object.values(fields).join(" ")} ${p.note ?? ""}`),
        date: norm(`${cert.date} ${dateWords(cert.date)}`),
      },
      hasNote: Boolean(p.note?.trim()),
      fields,
    };
  });
  rowCache.set(set, { saved, rows });
  return rows;
}

export interface ParsedQuery {
  words: string[];
  set: string[];
  course: string[];
  year: string[];
  status: string[];
  id: string[];
  has: string[];
  no: string[];
  is: string[];
}

const OPERATORS = ["set", "course", "year", "status", "id", "has", "no", "is"] as const;

export function parseQuery(input: string): ParsedQuery {
  const q: ParsedQuery = { words: [], set: [], course: [], year: [], status: [], id: [], has: [], no: [], is: [] };
  for (const raw of input.match(/(?:[^\s":]+:)?"[^"]*"|\S+/g) ?? []) {
    const m = /^([a-z]+):(.*)$/i.exec(raw);
    const op = m ? (m[1]!.toLowerCase() as (typeof OPERATORS)[number]) : undefined;
    if (m && op && (OPERATORS as readonly string[]).includes(op) && m[2]) {
      const value = norm(m[2].replace(/^"|"$/g, ""));
      if (value) q[op].push(value);
      continue;
    }
    q.words.push(...queryWords(raw));
  }
  return q;
}

export const hasQuery = (q: ParsedQuery) => Object.values(q).some((v) => v.length > 0);

/** A typed piece of an ID matches anywhere in it, however it was typed (case, dashes, O for 0, I/L for 1). */
function idMatches(row: CertRow, typed: string): boolean {
  const part = normalizeId(typed);
  return part !== "" && (row.key.includes(part) || row.key.includes(foldLookalikes(part)));
}

/** -1 when the row does not match, otherwise a score (higher = better). */
function score(row: CertRow, q: ParsedQuery): number {
  for (const v of q.set) if (!row.n.set.includes(v)) return -1;
  for (const v of q.course) if (!row.n.title.includes(v)) return -1;
  for (const v of q.year) if (!row.date.startsWith(v)) return -1;
  for (const v of q.id) if (!idMatches(row, v)) return -1;
  for (const v of [...q.status, ...q.is]) {
    if (v === "revoked" && !row.revoked) return -1;
    if ((v === "valid" || v === "active") && row.revoked) return -1;
    if (v === "new" && !row.isNew) return -1;
  }
  for (const v of q.has) {
    if (v === "note" && !row.hasNote) return -1;
    if (v !== "note" && !row.fields[v]) return -1;
  }
  for (const v of q.no) {
    if (v === "note" && row.hasNote) return -1;
    if (v !== "note" && row.fields[v]) return -1;
  }

  let total = 0;
  for (const w of q.words) {
    let best = 0;
    if (w.replace(/[^a-z0-9]/gi, "").length >= 3 && idMatches(row, w)) best = 8;
    else if (row.n.name === w || row.n.name.split(" ").some((t) => t.startsWith(w))) best = 6;
    else if (wordIn(row.n.name, w, false) === "exact") best = 5;
    else if (row.n.title.includes(w) || row.n.set.includes(w)) best = 4;
    else if (row.n.date.includes(w)) best = 3;
    else if (row.n.extra.includes(w)) best = 2;
    else if (wordIn(row.n.name, w) === "fuzzy" || wordIn(row.n.title, w) === "fuzzy") best = 1;
    if (!best) return -1;
    total += best;
  }
  return total + 1;
}

export interface SearchResult {
  rows: CertRow[];
  /** Total matches (rows is limited). */
  total: number;
}

export function searchRows(all: CertRow[], q: ParsedQuery, limit = Infinity): SearchResult {
  if (!hasQuery(q)) return { rows: all.slice(0, limit), total: all.length };
  const scored: [number, CertRow][] = [];
  for (const row of all) {
    const s = score(row, q);
    if (s >= 0) scored.push([s, row]);
  }
  scored.sort((a, b) => b[0] - a[0] || b[1].date.localeCompare(a[1].date) || a[1].name.localeCompare(b[1].name));
  return { rows: scored.slice(0, limit).map(([, r]) => r), total: scored.length };
}

/** Closest names, offered when nothing matched ("Did you mean …"). */
export function suggestNames(all: CertRow[], words: string[], max = 3): string[] {
  const word = words[0];
  if (!word || word.length < 3) return [];
  const found: [number, string][] = [];
  for (const row of all) {
    for (const token of row.n.name.split(" ")) {
      const d = distance(token, word, 3);
      if (d <= 3 && token.length >= 3) found.push([d, row.name]);
    }
  }
  return [...new Set(found.sort((a, b) => a[0] - b[0]).map(([, n]) => n))].slice(0, max);
}

