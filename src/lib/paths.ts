import { DOC_FILES } from "./types";

export const MEMBER_FILE_RE = /^members\/[a-z0-9][a-z0-9_-]*\/(profile|cv)\.json$/;
export const PHOTO_FILE_RE = /^photos\/[a-z0-9_-]+\/[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif|avif|svg)$/i;

/** Files the admin panel may write. Anything else is refused by /api/save. */
export function isWritablePath(path: string): boolean {
  return (DOC_FILES as string[]).includes(path) || MEMBER_FILE_RE.test(path) || PHOTO_FILE_RE.test(path);
}

/** Files the admin panel may delete (only photos — never data files). */
export function isDeletablePath(path: string): boolean {
  return PHOTO_FILE_RE.test(path);
}

export function slugify(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
