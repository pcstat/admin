/**
 * Search for the Member files page. Pure functions, no React.
 *
 * What it understands:
 *  - several words: every word has to match (name, role, ID, committee, bio, links, or — when loaded — the text of the profile / CV files);
 *  - "quoted phrases" that must appear exactly;
 *  - typos: words of 4+ letters also match words that are one (or, for long words, two) letters off, and accents are ignored;
 *  - operators: committee:2025  role:president  id:2020  has:cv  no:profile  is:current  is:past  is:edited
 * Results come in two groups: the member's own title (name / role / ID / committee) and the details (everything else).
 */
import { distance, norm, wordIn, type SearchField } from "./smart-search";

export type { SearchField };

export interface SearchRecord {
  key: string;
  name: string;
  /** Name, role, ID and committee — "the title" of a member. */
  title: string;
  titleFields: SearchField[];
  /** Everything else that can be searched (bio, links, file contents…). */
  details: SearchField[];
  committee: string;
  role: string;
  id: string;
  isCurrent: boolean;
  hasProfile: boolean;
  hasCv: boolean;
  edited: boolean;
}

export interface ParsedQuery {
  words: string[];
  committee: string[];
  role: string[];
  id: string[];
  has: string[];
  no: string[];
  is: string[];
}

export interface Snippet {
  label: string;
  text: string;
  /** Segments of `text`; `mark` ones matched the search. */
  parts: { text: string; mark: boolean }[];
  fuzzy: boolean;
}

export interface SearchResult {
  record: SearchRecord;
  score: number;
  snippet?: Snippet;
}

export interface SearchOutcome {
  title: SearchResult[];
  details: SearchResult[];
  /** Closest names, when nothing matched. */
  suggestions: string[];
}

const OPERATORS = ["committee", "session", "role", "id", "has", "no", "is"] as const;

export function parseQuery(input: string): ParsedQuery {
  const q: ParsedQuery = { words: [], committee: [], role: [], id: [], has: [], no: [], is: [] };
  const tokens = input.match(/(?:[^\s"]+:)?"[^"]*"|\S+/g) ?? [];
  for (const raw of tokens) {
    const m = /^([a-z]+):(.*)$/i.exec(raw);
    const op = m ? (m[1]!.toLowerCase() as (typeof OPERATORS)[number]) : undefined;
    if (m && op && (OPERATORS as readonly string[]).includes(op) && m[2]) {
      const value = norm(m[2].replace(/^"|"$/g, ""));
      if (!value) continue;
      if (op === "session") q.committee.push(value);
      else q[op].push(value);
      continue;
    }
    const word = norm(raw.replace(/^"|"$/g, ""));
    if (word) q.words.push(word);
  }
  return q;
}

export const hasQuery = (q: ParsedQuery) => q.words.length + q.committee.length + q.role.length + q.id.length + q.has.length + q.no.length + q.is.length > 0;

function passesOperators(r: SearchRecord, q: ParsedQuery): boolean {
  if (q.committee.some((v) => !norm(r.committee).includes(v))) return false;
  if (q.role.some((v) => !norm(r.role).includes(v))) return false;
  if (q.id.some((v) => !norm(r.id).includes(v))) return false;
  for (const v of q.has) {
    if (v === "profile" && !r.hasProfile) return false;
    if (v === "cv" && !r.hasCv) return false;
  }
  for (const v of q.no) {
    if (v === "profile" && r.hasProfile) return false;
    if (v === "cv" && r.hasCv) return false;
  }
  for (const v of q.is) {
    if (v === "current" && !r.isCurrent) return false;
    if (v === "past" && r.isCurrent) return false;
    if (v === "edited" && !r.edited) return false;
  }
  return true;
}

function makeSnippet(field: SearchField, words: string[], fuzzy: boolean): Snippet {
  const text = field.text;
  const lower = text.toLowerCase();
  const hits: [number, number][] = [];
  for (const w of words) {
    let from = 0;
    for (;;) {
      const i = lower.indexOf(w, from);
      if (i < 0) break;
      hits.push([i, i + w.length]);
      from = i + w.length;
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  const first = hits[0]?.[0] ?? 0;
  const start = Math.max(0, first - 45);
  const end = Math.min(text.length, first + 110);
  const parts: Snippet["parts"] = [];
  let cursor = start;
  for (const [a, b] of hits) {
    if (b <= cursor || a >= end) continue;
    const from = Math.max(a, cursor);
    if (from > cursor) parts.push({ text: text.slice(cursor, from), mark: false });
    parts.push({ text: text.slice(from, Math.min(b, end)), mark: true });
    cursor = Math.min(b, end);
  }
  if (cursor < end) parts.push({ text: text.slice(cursor, end), mark: false });
  if (start > 0) parts.unshift({ text: "…", mark: false });
  if (end < text.length) parts.push({ text: "…", mark: false });
  return { label: field.label, text, parts, fuzzy };
}

export function search(records: SearchRecord[], q: ParsedQuery): SearchOutcome {
  const title: SearchResult[] = [];
  const details: SearchResult[] = [];

  for (const r of records) {
    if (!passesOperators(r, q)) continue;
    if (q.words.length === 0) {
      title.push({ record: r, score: 0 });
      continue;
    }
    const titleHay = norm(r.title);
    let inTitle = 0;
    let exactTitle = 0;
    let anyMatch = 0;
    const detailWords: string[] = [];
    let usedFuzzy = false;
    for (const w of q.words) {
      const t = wordIn(titleHay, w, true);
      if (t) {
        inTitle++;
        anyMatch++;
        if (t === "exact") exactTitle++;
        else usedFuzzy = true;
        continue;
      }
      const hit = r.details.some((d) => wordIn(norm(d.text), w, true));
      if (hit) {
        anyMatch++;
        detailWords.push(w);
      }
    }
    if (anyMatch < q.words.length) continue;

    if (inTitle === q.words.length) {
      const nameN = norm(r.name);
      const bonus = q.words.reduce((n, w) => n + (nameN.startsWith(w) ? 3 : nameN.split(" ").some((p) => p.startsWith(w)) ? 2 : 0), 0);
      title.push({ record: r, score: exactTitle * 2 + bonus - (usedFuzzy ? 1 : 0) });
      continue;
    }
    // Some words only appear in the details: show where.
    const wordsForSnippet = detailWords.length ? detailWords : q.words;
    let snippet: Snippet | undefined;
    let exactSnippet = false;
    for (const f of r.details) {
      const n = norm(f.text);
      const exact = wordsForSnippet.some((w) => n.includes(w));
      if (exact || (!snippet && wordsForSnippet.some((w) => wordIn(n, w, true)))) {
        snippet = makeSnippet(f, wordsForSnippet, !exact);
        exactSnippet = exact;
        if (exact) break;
      }
    }
    details.push({ record: r, score: (exactSnippet ? 2 : 0) + inTitle, snippet });
  }

  const byScore = (a: SearchResult, b: SearchResult) => b.score - a.score || a.record.name.localeCompare(b.record.name);
  title.sort(byScore);
  details.sort(byScore);

  const suggestions: string[] = [];
  if (title.length + details.length === 0 && q.words.length) {
    const scored: [number, string][] = [];
    for (const r of records) {
      const parts = norm(r.name).split(" ");
      let best = 99;
      for (const w of q.words) for (const p of parts) best = Math.min(best, p.startsWith(w.slice(0, 2)) ? distance(p, w, 3) : 99);
      if (best <= 3) scored.push([best, r.name]);
    }
    scored.sort((a, b) => a[0] - b[0]);
    suggestions.push(...scored.slice(0, 3).map((s) => s[1]));
  }
  return { title, details, suggestions };
}

// Values of these keys are technical (a colour, an icon name, an image path…): the person never reads them, so they are never searched.
const HIDDEN_KEYS = /^(id|type|kind|style|theme|variant|icon|color|colour|layout|slug|key|order|photo|image|avatar|path|featured|template)$/i;
const NOT_TEXT = /^(#[0-9a-f]{3,8}|.*\.(png|jpe?g|webp|svg|gif|ico))$/i;

/** The readable texts of a member file (profile.json / cv.json) — only what appears on the page, never the keys. */
export function fileFields(kind: "Profile" | "CV", text: string | undefined): SearchField[] {
  if (!text) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [{ label: kind, text }];
  }
  const out: SearchField[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      if (value.trim() && !NOT_TEXT.test(value.trim())) out.push({ label: kind, text: value });
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (!HIDDEN_KEYS.test(k)) walk(v);
    }
  };
  walk(data);
  return out.slice(0, 400);
}

/** The whole text split into plain and matching parts (for highlighting a name or role). */
export function highlightParts(text: string, words: string[]): { text: string; mark: boolean }[] {
  if (!words.length) return [{ text, mark: false }];
  const lower = text.toLowerCase();
  const hits: [number, number][] = [];
  for (const w of words) {
    let from = 0;
    for (;;) {
      const i = lower.indexOf(w, from);
      if (i < 0) break;
      hits.push([i, i + w.length]);
      from = i + w.length;
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  const parts: { text: string; mark: boolean }[] = [];
  let cursor = 0;
  for (const [a, b] of hits) {
    if (b <= cursor) continue;
    const from = Math.max(a, cursor);
    if (from > cursor) parts.push({ text: text.slice(cursor, from), mark: false });
    parts.push({ text: text.slice(from, b), mark: true });
    cursor = b;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), mark: false });
  return parts;
}
