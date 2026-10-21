/** Shapes of the files in the certificate registry repo (see its README). The set-file shapes live in core.ts, shared with the website. */
import type { CertificateSection, PersonEntry, SetFile } from "./core";

export type { CertificateSection, PersonEntry, SetFile };

export interface TemplateField {
  key: string;
  label: string;
  /** "set": the same on every certificate · "recipient": differs per person · "either": set value, overridable per person. */
  scope: "set" | "recipient" | "either";
  default?: string;
  help?: string;
}

export interface TemplateDef {
  file: string;
  label: string;
  description?: string;
  fields: TemplateField[];
}

export interface Manifest {
  templates: TemplateDef[];
}

/** One certificate across all sets, ready for searching and listing. */
export interface CertRow {
  /** Normalized printed ID. */
  key: string;
  /** The ID as printed: SPC-PY26-7W34N. */
  id: string;
  /** The person's id inside the set file: 7W34N. */
  personId: string;
  name: string;
  setCode: string;
  setTitle: string;
  title: string;
  date: string;
  revoked?: { date: string; reason?: string };
  /** Unsaved: the certificate does not exist in the repo yet. */
  isNew: boolean;
  /** Normalized texts the search reads. */
  n: { name: string; title: string; set: string; extra: string; date: string };
  hasNote: boolean;
  fields: Record<string, string>;
}
