/**
 * Where the database lives, read from `database.json` at the root of this repo (an identical file sits at
 * the root of the website repo). Fields:
 *
 *   repo    "owner/name" of the database repo on GitHub — the panel reads and commits through its API.
 *   branch  its branch (default "main").
 *   url     where the database is published (its Cloudflare Pages address) — used to show photo previews.
 *           Optional: when empty, previews come straight from GitHub (raw.githubusercontent.com,
 *           public repos only).
 *
 *   certificates  { repo, branch, url } of the certificate registry — its own repo; `url` optional, empty = read
 *           straight from GitHub (see getCertificatesLocation below).
 *
 * The file is bundled into the build, so it also works on Cloudflare Workers (no file system there).
 */
import config from "../../database.json";

export interface DatabaseLocation {
  owner: string;
  name: string;
  branch: string;
  /** Directory the database is published at, always ending with "/". */
  publicBase: string;
}

export function getDatabaseLocation(): DatabaseLocation {
  const repo = String(config.repo ?? "").trim();
  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(repo);
  const owner = match?.[1];
  const name = match?.[2];
  if (!owner || !name) throw new Error(`database.json: "repo" must look like "owner/name", got "${repo}".`);
  const branch = String(config.branch ?? "").trim() || "main";
  const url = String(config.url ?? "").trim();
  const publicBase = url ? (url.endsWith("/") ? url : `${url}/`) : `https://raw.githubusercontent.com/${owner}/${name}/${branch}/`;
  return { owner, name, branch, publicBase };
}

/** The database's own index stores `imageBase` relative to its published address; previews need an absolute URL. */
export function resolveImageBase(imageBase: string): string {
  if (/^(https?:)?\/\//i.test(imageBase)) return imageBase;
  return new URL(imageBase, getDatabaseLocation().publicBase).href;
}

/** Where the certificate registry lives: its own GitHub repo, published as its own site (the website reads it there). */
export function getCertificatesLocation(): DatabaseLocation {
  const c = (config as { certificates?: { repo?: string; branch?: string; url?: string } }).certificates ?? {};
  const repo = String(c.repo ?? "").trim();
  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(repo);
  const owner = match?.[1];
  const name = match?.[2];
  if (!owner || !name) throw new Error(`database.json: "certificates.repo" must look like "owner/name", got "${repo}".`);
  const branch = String(c.branch ?? "").trim() || "main";
  const url = String(c.url ?? "").trim();
  // Like the database, the registry is read straight from GitHub when no address is given.
  return { owner, name, branch, publicBase: url ? (url.endsWith("/") ? url : `${url}/`) : `https://raw.githubusercontent.com/${owner}/${name}/${branch}/` };
}
