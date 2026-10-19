"use client";

import { sectionBySlug } from "@/lib/schemas";
import { useContentStore } from "@/store/content-store";
import { FieldGroup } from "./FieldRenderer";
import { WEBSITE_URL } from "@/lib/site-config";
import { Icon } from "./Icon";

export function SectionEditor({ slug }: { slug: string }) {
  const section = sectionBySlug(slug);
  const docs = useContentStore((s) => s.docs);
  if (!section || section.parts.some((p) => !docs[p.file])) return null;
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">{"// "}{section.group === "site" ? "SITE-WIDE" : "WEBSITE PAGE"}</p>
        <h1><Title text={section.title} /></h1>
        <p className="lead">{section.description}</p>
        {WEBSITE_URL && !section.hidden && (
          <p className="file-note">
            <a className="see-site" href={`${WEBSITE_URL}${section.route}`} target="_blank" rel="noreferrer">
              See this page on the website <Icon name="external" size={13} />
            </a>
          </p>
        )}
      </div>
      {section.parts.map((part, i) => (
        <div key={`${part.file}-${i}`} className="part">
          {part.heading && <h2 className="part-title">{part.heading}</h2>}
          {part.note && <p className="notice">{part.note}</p>}
          <FieldGroup file={part.file} fields={part.fields} value={docs[part.file]!.draft as Record<string, unknown>} path={[]} />
        </div>
      ))}
    </>
  );
}

/** The website's heading style: the last word is highlighted ("Past <span>Executives</span>"). */
export function Title({ text }: { text: string }) {
  const parts = text.split(" ");
  if (parts.length === 1) return <span>{text}</span>;
  return (
    <>
      {parts.slice(0, -1).join(" ")} <span>{parts[parts.length - 1]}</span>
    </>
  );
}
