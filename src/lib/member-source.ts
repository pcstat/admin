/**
 * Where a member's profile / CV JSON lives.
 *
 *  - "club"   → inside the club database: members/<slug>/profile.json (the link is a relative path)
 *  - "github" → in a repository owned by the member, e.g. https://raw.githubusercontent.com/<user>/<repo>/HEAD/profile.json
 *  - "custom" → any other public https link to a JSON file
 *
 * The website needs no special support: it already loads absolute links, so the admin simply stores the
 * computed raw URL in `profile_link` / `cv_link`.
 */

export type SourceKind = "club" | "github" | "custom";

export interface GithubSource {
  user: string;
  repo: string;
  /** Branch, tag or commit. "HEAD" = the repository's default branch. */
  ref: string;
  /** Folder inside the repo ("" = repo root). */
  dir: string;
  profileFile: string;
  cvFile: string;
}

export const DEFAULT_GITHUB: GithubSource = { user: "", repo: "", ref: "HEAD", dir: "", profileFile: "profile.json", cvFile: "cv.json" };

const NAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const RAW_HOST = "raw.githubusercontent.com";

export const isExternalLink = (link: string | undefined): link is string => !!link && /^https?:\/\//i.test(link);

const trimSlashes = (s: string) => s.replace(/^\/+|\/+$/g, "");

/** Builds the raw URL of one file in a member's repository. */
export function githubRawUrl(s: GithubSource, file: string): string {
  const dir = trimSlashes(s.dir);
  const path = [dir, trimSlashes(file)].filter(Boolean).map((p) => p.split("/").map(encodeURIComponent).join("/")).join("/");
  return `https://${RAW_HOST}/${encodeURIComponent(s.user)}/${encodeURIComponent(s.repo)}/${encodeURIComponent(s.ref || "HEAD")}/${path}`;
}

/** Returns an error message, or "" when the repo details are usable. */
export function checkGithubSource(s: GithubSource): string {
  if (!NAME_RE.test(s.user.trim())) return "Enter the GitHub username (letters, digits and hyphens).";
  if (!REPO_RE.test(s.repo.trim())) return "Enter the repository name.";
  if (!/^[\w./-]+$/.test(s.ref.trim() || "HEAD")) return "The branch name contains characters that are not allowed.";
  if (/(^|\/)\.\.(\/|$)/.test(s.dir)) return "The folder must not contain “..”.";
  for (const f of [s.profileFile, s.cvFile]) if (!f.trim() || !/\.json$/i.test(f.trim())) return "File names must end with .json.";
  return "";
}

/**
 * Turns whatever a member pasted into a raw, fetchable URL:
 *   https://github.com/u/r/blob/main/cv.json  →  https://raw.githubusercontent.com/u/r/main/cv.json
 *   https://raw.githubusercontent.com/…       →  unchanged
 *   any other https link                      →  unchanged
 * Returns null when it is not an http(s) URL.
 */
export function normalizeJsonLink(input: string): string | null {
  const text = input.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname === "github.com" || url.hostname === "www.github.com") {
    const m = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(url.pathname);
    if (m) return `https://${RAW_HOST}/${m[1]}/${m[2]}/${m[3]}`;
  }
  return url.href;
}

/** Recognises a raw.githubusercontent.com URL so the dialog can be pre-filled. */
export function parseGithubRawUrl(link: string): { user: string; repo: string; ref: string; path: string } | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.hostname !== RAW_HOST) return null;
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [user, repo, ref, ...rest] = parts;
  if (!user || !repo || !ref || rest.length === 0) return null;
  return { user, repo, ref, path: rest.join("/") };
}

export function classifyLink(link: string | undefined): SourceKind {
  if (!link) return "club";
  if (!isExternalLink(link)) return "club";
  return parseGithubRawUrl(link) ? "github" : "custom";
}

/** Rebuilds the dialog's GitHub fields from the two stored links (when both come from the same repo). */
export function githubSourceFromLinks(profile?: string, cv?: string): GithubSource | null {
  const a = profile ? parseGithubRawUrl(profile) : null;
  const b = cv ? parseGithubRawUrl(cv) : null;
  const base = a ?? b;
  if (!base) return null;
  if (a && b && (a.user !== b.user || a.repo !== b.repo || a.ref !== b.ref)) return null;
  const split = (p: string | undefined) => {
    if (!p) return null;
    const i = p.lastIndexOf("/");
    return { dir: i < 0 ? "" : p.slice(0, i), file: i < 0 ? p : p.slice(i + 1) };
  };
  const pa = split(a?.path);
  const pb = split(b?.path);
  if (pa && pb && pa.dir !== pb.dir) return null;
  return {
    user: base.user,
    repo: base.repo,
    ref: base.ref,
    dir: (pa ?? pb)?.dir ?? "",
    profileFile: pa?.file ?? DEFAULT_GITHUB.profileFile,
    cvFile: pb?.file ?? DEFAULT_GITHUB.cvFile,
  };
}

/** Short label for a link, e.g. "github.com/user/repo" — shown next to external files. */
export function describeLink(link: string): string {
  const gh = parseGithubRawUrl(link);
  if (gh) return `github.com/${gh.user}/${gh.repo}`;
  try {
    return new URL(link).host;
  } catch {
    return link;
  }
}
