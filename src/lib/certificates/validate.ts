/**
 * Checks the drafted sets before a save — the same rules as the registry repo's scripts/validate.mjs, so a commit made
 * by this panel never fails that repo's CI (which would leave the commit unpublished).
 */
import { PERSON_ID_RE, SET_CODE_RE, isIsoDate } from "./core";
import type { Manifest, SetFile } from "./types";

export interface CertProblem {
  /** Set code the problem is in. */
  set: string;
  message: string;
}

const nonEmpty = (v: unknown) => typeof v === "string" && v.trim() !== "";

/** `check`: codes of the sets to report on (the changed ones). Person ids only have to be unique inside their own file. */
export function validateSets(sets: SetFile[], check: Set<string>, manifest: Manifest | null): CertProblem[] {
  const problems: CertProblem[] = [];
  const add = (set: string, message: string) => problems.push({ set, message });
  const codes = new Set<string>();

  for (const set of sets) {
    if (codes.has(set.code)) add(set.code, `Two sets use the code "${set.code}".`);
    codes.add(set.code);
    if (!check.has(set.code)) continue;
    const cert = set.certificate;
    const where = cert.title || set.code;
    if (!SET_CODE_RE.test(set.code)) add(set.code, `${where}: the code must be 2–12 capital letters or digits, starting with a letter.`);
    if (!nonEmpty(cert.title)) add(set.code, `${set.code}: say what the certificates are for (the title).`);
    if (!isIsoDate(cert.date)) add(set.code, `${where}: the date is required.`);
    const tpl = manifest?.templates.find((t) => t.file === cert.template);
    if (manifest && !tpl) add(set.code, `${where}: choose a design.`);
    const allowed = (scopes: string[]) => new Set((tpl?.fields ?? []).filter((f) => scopes.includes(f.scope)).map((f) => f.key));
    const forSet = allowed(["set", "either"]);
    const forPerson = allowed(["recipient", "either"]);
    if (tpl) for (const k of Object.keys(cert.fields ?? {})) if (!forSet.has(k)) add(set.code, `${where}: "${k}" is not a field of the set on this design.`);

    for (const [pid, p] of Object.entries(set.people)) {
      const who = `${where} › ${p.name || pid}`;
      if (!PERSON_ID_RE.test(pid)) add(set.code, `${who}: "${pid}" is not a valid person id.`);
      if (!nonEmpty(p.name)) add(set.code, `${where}: person ${pid} has no name.`);
      if (tpl) for (const k of Object.keys(p.fields ?? {})) if (!forPerson.has(k)) add(set.code, `${who}: "${k}" is not a per-person field on this design.`);
      if (p.revoked && !isIsoDate(p.revoked.date)) add(set.code, `${who}: the revocation date is invalid.`);
    }
  }
  return problems;
}
