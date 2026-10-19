/**
 * The matching engine shared by every search box in the panel (list filters, the pin pickers, Member files).
 *
 * It searches what a person can *read* in the editor — the values of the fields — and never the technical parts
 * of the data (keys, automatically assigned ids, image paths, on/off switches). References are followed: a project
 * stores its members as student IDs, but the person sees names, so the search sees names too.
 */
import type { FieldDef } from "./schemas";
import { dateWords } from "./datetime";

export interface SearchField {
  label: string;
  text: string;
}

/** Lower-case, no accents, single spaces. */
export const norm = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Edit distance, giving up above `max`. */
export function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = cur[0]!;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** "exact" when the word is in the (normalised) text, "fuzzy" when a word of the text is a typo away, otherwise null. */
export function wordIn(hay: string, word: string, typos = true): "exact" | "fuzzy" | null {
  if (hay.includes(word)) return "exact";
  if (!typos || word.length < 4 || word.includes(" ")) return null;
  const max = word.length >= 8 ? 2 : 1;
  for (const token of hay.split(/[^a-z0-9]+/)) {
    if (token.length >= 3 && distance(token, word, max) <= max) return "fuzzy";
  }
  return null;
}

/** Split what the person typed into normalised words; "quoted phrases" stay together. */
export function queryWords(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.match(/"[^"]*"|\S+/g) ?? []) {
    const w = norm(raw.replace(/^"|"$/g, ""));
    if (w) out.push(w);
  }
  return out;
}

export interface FieldMatch {
  /** Every word was found somewhere. */
  matched: boolean;
  /** The fields that contain a word (exact matches first). */
  hits: SearchField[];
  /** Number of words found with a typo rather than exactly. */
  fuzzy: number;
}

/** Every word has to be found in at least one field. */
export function matchFields(fields: SearchField[], words: string[]): FieldMatch {
  if (words.length === 0) return { matched: true, hits: [], fuzzy: 0 };
  const normed = fields.map((f) => ({ f, n: norm(f.text) }));
  const exact = new Set<SearchField>();
  const near = new Set<SearchField>();
  let fuzzy = 0;
  for (const w of words) {
    let found: "exact" | "fuzzy" | null = null;
    for (const { f, n } of normed) {
      const r = wordIn(n, w);
      if (r === "exact") {
        exact.add(f);
        found = "exact";
      } else if (r === "fuzzy") {
        near.add(f);
        found ??= "fuzzy";
      }
    }
    if (!found) return { matched: false, hits: [], fuzzy: 0 };
    if (found === "fuzzy") fuzzy++;
  }
  return { matched: true, hits: [...exact, ...[...near].filter((f) => !exact.has(f))], fuzzy };
}

/** A short piece of `text` around the first word that appears in it, split into plain / highlighted parts. */
export function snippetParts(text: string, words: string[], radius = 45): { text: string; mark: boolean }[] {
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
  const start = Math.max(0, first - radius);
  const end = Math.min(text.length, first + radius * 2 + 20);
  const parts: { text: string; mark: boolean }[] = [];
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
  return parts;
}

/** Names behind the ids stored in the data — what the person sees in the editor. */
export interface ResolveCtx {
  memberName: (id: string) => string | undefined;
  projectTitle: (id: string) => string | undefined;
  committeeLabel: (session: string) => string | undefined;
}

type Obj = Record<string, unknown>;

/**
 * The readable texts of one item (a project, an event…), following its form definition: only fields the person
 * can see are searched, ids are turned into names, and technical values are left out.
 */
export function itemSearchFields(fields: FieldDef[], item: Obj, ctx: ResolveCtx, out: SearchField[] = []): SearchField[] {
  for (const field of fields) {
    const value = item?.[field.key];
    switch (field.kind) {
      case "text":
      case "textarea":
        if (typeof value === "string" && value.trim()) out.push({ label: field.label, text: value });
        break;
      case "number":
        if (typeof value === "number") out.push({ label: field.label, text: String(value) });
        break;
      case "select": {
        if (typeof value === "string" && value) out.push({ label: field.label, text: field.options.find((o) => o.value === value)?.label ?? value });
        break;
      }
      case "session-select":
        if (typeof value === "string" && value) out.push({ label: field.label, text: ctx.committeeLabel(value) ?? value });
        break;
      case "checkbox":
        // "Featured" is a word the person sees next to the tick box, so a ticked box can be found by it.
        if (value === true) out.push({ label: field.label, text: field.label });
        break;
      case "strings":
        for (const v of Array.isArray(value) ? value : []) if (typeof v === "string" && v.trim()) out.push({ label: field.label, text: v });
        break;
      case "checks":
        for (const v of Array.isArray(value) ? value : []) if (typeof v === "string") out.push({ label: field.label, text: field.options.find((o) => o.value === v)?.label ?? v });
        break;
      case "members":
        for (const id of Array.isArray(value) ? (value as string[]) : []) out.push({ label: field.label, text: ctx.memberName(id) ?? "" });
        break;
      case "projects":
        for (const id of Array.isArray(value) ? (value as string[]) : []) out.push({ label: field.label, text: ctx.projectTitle(id) ?? "" });
        break;
      case "date":
        if (typeof value === "string" && value) out.push({ label: field.label, text: `${value} ${dateWords(value)}` });
        break;
      case "time":
        if (typeof value === "string" && value) out.push({ label: field.label, text: value });
        break;
      case "group":
        itemSearchFields(field.fields, (value ?? {}) as Obj, ctx, out);
        break;
      case "list":
        for (const sub of Array.isArray(value) ? (value as Obj[]) : []) itemSearchFields(field.fields, sub, ctx, out);
        break;
      // image paths and automatically assigned ids are never searched
      case "image":
      case "readonly":
        break;
    }
  }
  return out.filter((f) => f.text.trim() !== "");
}
