import { SECTIONS, type FieldDef } from "./schemas";
import type { DocFile } from "./types";

type Docs = Partial<Record<DocFile, { original: string; draft: unknown }>>;

const parsed = new Map<string, unknown>();
/** JSON.parse of a document's saved text, remembered because it only changes when the document is saved. */
function original(text: string): unknown {
  if (!parsed.has(text)) {
    if (parsed.size > 24) parsed.clear();
    parsed.set(text, JSON.parse(text));
  }
  return parsed.get(text);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function fieldChanged(field: FieldDef, draft: Record<string, unknown> | undefined, saved: Record<string, unknown> | undefined): boolean {
  if (field.kind === "group") {
    const d = (draft?.[field.key] ?? undefined) as Record<string, unknown> | undefined;
    const o = (saved?.[field.key] ?? undefined) as Record<string, unknown> | undefined;
    return field.fields.some((f) => fieldChanged(f, d, o));
  }
  return !same(draft?.[field.key], saved?.[field.key]);
}

/**
 * The admin pages that have unsaved edits. A page counts only when *its own* fields changed — several pages
 * share site.json, and editing one of them must not light up the others.
 */
export function changedSections(docs: Docs): { slug: string; title: string }[] {
  const out: { slug: string; title: string }[] = [];
  for (const section of SECTIONS) {
    const changed = section.parts.some((part) => {
      const doc = docs[part.file];
      if (!doc) return false;
      const saved = original(doc.original) as Record<string, unknown>;
      return part.fields.some((f) => fieldChanged(f, doc.draft as Record<string, unknown>, saved));
    });
    if (changed) out.push({ slug: section.slug, title: section.title });
  }
  return out;
}
