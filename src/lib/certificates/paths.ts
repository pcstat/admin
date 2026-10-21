import { setFileName, SET_CODE_RE } from "./core";

/** A set file of the certificate registry: sets/<code in lower case>.json — the only files the panel writes there. */
export const SET_FILE_RE = /^sets\/[0-9a-z]{2,12}\.json$/;
/** Files of the registry the panel may read besides the sets. */
export const TEMPLATE_FILE_RE = /^templates\/(manifest\.json|[A-Za-z0-9_.-]+\.svg)$/;

export const isReadableCertPath = (path: string) => SET_FILE_RE.test(path) || TEMPLATE_FILE_RE.test(path);
export const isWritableCertPath = (path: string) => SET_FILE_RE.test(path);

/** Repo path of a set: "PY26" → "sets/py26.json". */
export function setPath(code: string): string {
  if (!SET_CODE_RE.test(code)) throw new Error(`"${code}" is not a valid set code.`);
  return `sets/${setFileName(code)}`;
}
