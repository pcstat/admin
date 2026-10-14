"use client";

import { sectionBySlug } from "@/lib/schemas";
import { useContentStore } from "@/store/content-store";
import { FieldGroup } from "./FieldRenderer";

export function SectionEditor({ slug }: { slug: string }) {
  const section = sectionBySlug(slug);
  const doc = useContentStore((s) => (section ? s.docs[section.file] : undefined));
  if (!section || !doc) return null;
  return (
    <>
      <h1>{section.title}</h1>
      <p className="lead">{section.description}</p>
      <p className="file-note">Edits <code>{section.file}</code></p>
      <FieldGroup file={section.file} fields={section.fields} value={doc.draft as Record<string, unknown>} path={[]} />
    </>
  );
}
