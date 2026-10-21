"use client";

import { useEffect, useMemo } from "react";
import { renderTemplate, resolveCertificate, templatePlaceholders, templateValues } from "@/lib/certificates/core";
import type { PersonEntry, SetFile } from "@/lib/certificates/types";
import { useCertificatesStore } from "@/store/certificates-store";

/**
 * The certificate exactly as it will be printed: the registry's SVG design filled in with the same functions the
 * website uses (the set's part and the person's part are merged by resolveCertificate; values are escaped, so a name
 * with “&” or “<” cannot break the design). Placeholders that have no value are listed, because they print nothing.
 */
export function CertPreview({ set, personId, person }: { set: SetFile; personId: string; person: PersonEntry }) {
  const svg = useCertificatesStore((s) => s.templates[set.certificate.template]);
  const loadTemplate = useCertificatesStore((s) => s.loadTemplate);
  useEffect(() => {
    void loadTemplate(set.certificate.template);
  }, [loadTemplate, set.certificate.template]);

  const { html, missing } = useMemo(() => {
    if (!svg) return { html: "", missing: [] as string[] };
    const shown: PersonEntry = { ...person, name: person.name || "Recipient name" };
    const record = resolveCertificate({ code: set.code, certificate: set.certificate, people: { [personId]: shown } }, personId);
    if (!record) return { html: "", missing: [] as string[] };
    const values = templateValues(record);
    const empty = templatePlaceholders(svg).filter((k) => k !== "course1" && !(values[k] ?? "").trim());
    return { html: renderTemplate(svg, values), missing: empty };
  }, [svg, set, personId, person]);

  if (!svg) return <p className="hint">Loading the design…</p>;
  return (
    <div className="cert-preview">
      <div className="cert-preview-art" dangerouslySetInnerHTML={{ __html: html }} />
      {missing.length > 0 && <p className="hint cert-warn">Nothing is printed for: {missing.map((k) => `{{${k}}}`).join(", ")}</p>}
    </div>
  );
}
