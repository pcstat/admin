/**
 * What the admin panel sends to the website (running in the preview iframe) so it can show the
 * unsaved drafts instead of the published data.
 *
 * Protocol (postMessage; the website only listens when NEXT_PUBLIC_ADMIN_ORIGIN equals this panel's origin):
 *   website → admin   { type: "club-preview:ready" }
 *   admin → website   { type: "club-preview:data", payload: PreviewPayload }
 */
import { DOC_FILES, type DocFile, type DocMap } from "./types";
import { getDatabaseLocation } from "./database-config";
import { parseJson } from "./member-schema";

export const PREVIEW_READY = "club-preview:ready";
export const PREVIEW_DATA = "club-preview:data";

export interface PreviewPayload {
  /** The six database files as drafted (relative links, exactly as they would be saved). */
  docs: { [K in DocFile]?: DocMap[K] };
  /** Drafted member files, keyed by database path ("members/<slug>/profile.json"). */
  files: Record<string, unknown>;
  /** Where the published database lives — relative links resolve against it. */
  root: string;
  /** Absolute photo base. Photos staged but not saved yet are inlined as data: URLs in the docs/files below. */
  imageBase: string;
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml" };

interface Source {
  docs: Partial<Record<DocFile, { draft: unknown }>>;
  memberDrafts: Record<string, { draft: string }>;
  uploads: Record<string, { contentsBase64: string }>;
}

export function buildPreviewPayload(state: Source): PreviewPayload {
  const { publicBase } = getDatabaseLocation();
  const imageBase = `${publicBase}photos/`;
  const image = (rel: unknown): unknown => {
    if (typeof rel !== "string" || !rel || /^(https?:|data:|blob:)/i.test(rel)) return rel;
    const upload = state.uploads[rel];
    if (!upload) return rel; // published photo → the website resolves it against imageBase
    const ext = rel.split(".").pop()?.toLowerCase() ?? "";
    return `data:${MIME[ext] ?? "application/octet-stream"};base64,${upload.contentsBase64}`;
  };

  const docs: PreviewPayload["docs"] = {};
  for (const file of DOC_FILES) {
    const doc = state.docs[file];
    if (doc) (docs as Record<string, unknown>)[file] = doc.draft;
  }
  const exec = docs["executives.json"];
  if (exec) {
    docs["executives.json"] = {
      ...exec,
      committees: exec.committees.map((c) => ({ ...c, members: c.members.map((m) => (m.icon_link ? { ...m, icon_link: image(m.icon_link) as string } : m)) })),
    };
  }

  const files: Record<string, unknown> = {};
  for (const [path, draft] of Object.entries(state.memberDrafts)) {
    const { value } = parseJson(draft.draft);
    if (!value) continue; // invalid JSON: the website keeps showing the published version
    files[path] = typeof value.photo === "string" ? { ...value, photo: image(value.photo) } : value;
  }
  return { docs, files, root: publicBase, imageBase };
}

/** Admin route → the website page that shows the same thing. */
export function websiteRouteFor(pathname: string): string {
  const member = /^\/members\/([^/]+)\/(profile|cv)$/.exec(pathname);
  if (member) return `/${member[2]}?id=${member[1]}`;
  const section = pathname.replace(/^\//, "").split("/")[0];
  switch (section) {
    case "executives":
    case "members":
      return "/exec";
    case "alumni":
      return "/alumni";
    case "projects":
    case "events":
    case "courses":
    case "achievements":
    case "about":
      return `/${section}`;
    case "certificates":
      return "/certificate";
    default:
      return "/";
  }
}
