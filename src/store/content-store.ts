"use client";

import { create } from "zustand";
import { collectImages, SECTIONS } from "@/lib/schemas";
import { validateDocs, type Problem } from "@/lib/validate";
import { fileToBase64, generateImageFilename, utf8ToBase64 } from "@/lib/base64";
import { appendAtPath, moveAtPath, removeAtPath, setAtPath, type PathSegment } from "@/lib/object-path";
import { isDeletablePath, PHOTO_FILE_RE } from "@/lib/paths";
import { DOC_FILES, type DataResponse, type DocFile, type DocMap } from "@/lib/types";

export type FieldPath = PathSegment[];
export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

interface DocState {
  /** Normalised JSON text as last loaded / saved. */
  original: string;
  draft: unknown;
}

interface MemberDraft {
  /** null = the file does not exist in the database yet. */
  original: string | null;
  draft: string;
}

interface Upload {
  rel: string; // relative to photos/, e.g. "executives/173…-ab12cd.webp" — what is written into the JSON
  path: string; // repo path, e.g. "photos/executives/173…-ab12cd.webp"
  contentsBase64: string;
  previewUrl: string;
  committed: boolean;
}

type DocsSnapshot = Partial<Record<DocFile, unknown>>;

interface Store {
  status: "loading" | "ready" | "error";
  loadError: string | null;
  provider: DataResponse["provider"];
  imageBase: string;
  baseSha: string | null;

  docs: Partial<Record<DocFile, DocState>>;
  memberFiles: string[];
  memberDrafts: Record<string, MemberDraft>;
  uploads: Record<string, Upload>;

  past: DocsSnapshot[];
  future: DocsSnapshot[];
  lastEdit: { key: string; at: number } | null;

  dirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;
  problems: Problem[];
  lastCommitUrl: string | null;

  /** Admin chrome: is the left navigation folded away? Is the whole-site preview showing? */
  navCollapsed: boolean;
  previewMode: boolean;
  setNavCollapsed: (collapsed: boolean) => void;
  setPreviewMode: (on: boolean) => void;

  init: (data: DataResponse) => void;
  fail: (message: string) => void;
  setField: (file: DocFile, path: FieldPath, value: unknown) => void;
  addItem: (file: DocFile, path: FieldPath, item: unknown) => void;
  removeItem: (file: DocFile, path: FieldPath, index: number) => void;
  moveItem: (file: DocFile, path: FieldPath, from: number, to: number) => void;
  /** Keeps a chosen image in memory until the next save; returns its path relative to photos/. */
  stageImage: (file: File, folder: string) => Promise<string>;
  loadMemberFile: (path: string) => Promise<void>;
  setMemberDraft: (path: string, text: string) => void;
  createMemberFile: (path: string, text: string) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  save: () => Promise<boolean>;
}

const HISTORY_LIMIT = 100;
const COALESCE_MS = 800;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export const serialize = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";

function normalise(text: string): string {
  return serialize(JSON.parse(text));
}

function isDirty(s: Pick<Store, "docs" | "memberDrafts">): boolean {
  for (const doc of Object.values(s.docs)) if (doc && serialize(doc.draft) !== doc.original) return true;
  for (const m of Object.values(s.memberDrafts)) {
    if (m.original === null) return true; // a file that does not exist yet
    if (m.draft === m.original) continue;
    try {
      if (normalise(m.draft) !== normalise(m.original)) return true;
    } catch {
      return true; // invalid JSON typed in — still an unsaved edit
    }
  }
  return false;
}

function snapshotOf(docs: Store["docs"]): DocsSnapshot {
  const snap: DocsSnapshot = {};
  for (const file of DOC_FILES) snap[file] = docs[file]?.draft;
  return snap;
}

function applySnapshot(docs: Store["docs"], snap: DocsSnapshot): Store["docs"] {
  const next = { ...docs };
  for (const file of DOC_FILES) {
    const current = next[file];
    if (current && file in snap) next[file] = { ...current, draft: snap[file] };
  }
  return next;
}

function imageRefs(docs: Store["docs"], which: "draft" | "original"): Set<string> {
  const refs = new Set<string>();
  for (const section of SECTIONS) {
    const doc = docs[section.file];
    if (!doc) continue;
    collectImages(section.fields, which === "draft" ? doc.draft : JSON.parse(doc.original), refs);
  }
  return refs;
}

export const useContentStore = create<Store>((set, get) => {
  /** Applies an edit to one doc, recording undo history (typing in one field is merged into one step). */
  const edit = (file: DocFile, editKey: string, change: (draft: unknown) => unknown) => {
    const state = get();
    const doc = state.docs[file];
    if (!doc) return;
    const now = Date.now();
    const coalesce = state.lastEdit && state.lastEdit.key === editKey && now - state.lastEdit.at < COALESCE_MS;
    const past = coalesce ? state.past : [...state.past, snapshotOf(state.docs)].slice(-HISTORY_LIMIT);
    const docs = { ...state.docs, [file]: { ...doc, draft: change(doc.draft) } };
    set({
      docs,
      past,
      future: [],
      lastEdit: { key: editKey, at: now },
      dirty: isDirty({ docs, memberDrafts: state.memberDrafts }),
      saveStatus: "unsaved",
      saveError: null,
    });
  };

  const relayout = (docs: Store["docs"], memberDrafts: Store["memberDrafts"]) => ({ docs, memberDrafts, dirty: isDirty({ docs, memberDrafts }) });

  return {
    status: "loading",
    loadError: null,
    provider: "local-fs",
    imageBase: "",
    baseSha: null,
    docs: {},
    memberFiles: [],
    memberDrafts: {},
    uploads: {},
    past: [],
    future: [],
    lastEdit: null,
    dirty: false,
    saveStatus: "saved",
    saveError: null,
    problems: [],
    lastCommitUrl: null,
    navCollapsed: false,
    previewMode: false,
    setNavCollapsed: (collapsed) => {
      set({ navCollapsed: collapsed });
      try {
        window.localStorage.setItem("admin-nav-collapsed", collapsed ? "1" : "0");
      } catch {
        /* private mode — the choice just is not remembered */
      }
    },
    setPreviewMode: (on) => set({ previewMode: on }),

    init: (data) => {
      const docs: Store["docs"] = {};
      for (const file of DOC_FILES) docs[file] = { original: serialize(data.docs[file]), draft: data.docs[file] };
      for (const upload of Object.values(get().uploads)) URL.revokeObjectURL(upload.previewUrl);
      set({
        status: "ready",
        loadError: null,
        provider: data.provider,
        imageBase: data.imageBase,
        baseSha: data.baseSha,
        docs,
        memberFiles: data.memberFiles,
        memberDrafts: {},
        uploads: {},
        past: [],
        future: [],
        lastEdit: null,
        dirty: false,
        saveStatus: "saved",
        saveError: null,
        problems: [],
      });
    },

    fail: (message) => set({ status: "error", loadError: message }),

    setField: (file, path, value) => edit(file, `${file}:${path.join(".")}`, (draft) => setAtPath(draft, path, value)),
    addItem: (file, path, item) => edit(file, `add:${Date.now()}`, (draft) => appendAtPath(draft, path, item)),
    removeItem: (file, path, index) => edit(file, `rm:${Date.now()}`, (draft) => removeAtPath(draft, path, index)),
    moveItem: (file, path, from, to) => edit(file, `mv:${Date.now()}`, (draft) => moveAtPath(draft, path, from, to)),

    stageImage: async (file, folder) => {
      if (!/^image\//.test(file.type)) throw new Error("Please choose an image file (png, jpg, webp, gif, avif or svg).");
      if (file.size > MAX_IMAGE_BYTES) throw new Error("This image is larger than 4 MB. Please resize it first.");
      const rel = `${folder}/${generateImageFilename(file.name)}`;
      const path = `photos/${rel}`;
      if (!PHOTO_FILE_RE.test(path)) throw new Error("Unsupported image type. Use png, jpg, webp, gif, avif or svg.");
      const upload: Upload = { rel, path, contentsBase64: await fileToBase64(file), previewUrl: URL.createObjectURL(file), committed: false };
      set({ uploads: { ...get().uploads, [rel]: upload }, saveStatus: "unsaved" });
      return rel;
    },

    loadMemberFile: async (path) => {
      if (get().memberDrafts[path]) return;
      const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
      if (res.status === 401) {
        window.location.replace("/login");
        return;
      }
      const data = (await res.json()) as { text?: string | null; error?: string };
      if (!res.ok) throw new Error(data.error || `Could not load ${path}`);
      const memberDrafts = { ...get().memberDrafts, [path]: { original: data.text ?? null, draft: data.text ?? "" } };
      set(relayout(get().docs, memberDrafts));
    },

    setMemberDraft: (path, text) => {
      const current = get().memberDrafts[path];
      if (!current) return;
      const memberDrafts = { ...get().memberDrafts, [path]: { ...current, draft: text } };
      set({ ...relayout(get().docs, memberDrafts), saveStatus: "unsaved", saveError: null });
    },

    createMemberFile: (path, text) => {
      const memberDrafts = { ...get().memberDrafts, [path]: { original: null, draft: text } };
      set({ ...relayout(get().docs, memberDrafts), saveStatus: "unsaved", saveError: null });
    },

    undo: () => {
      const { past, future, docs, memberDrafts } = get();
      const snap = past[past.length - 1];
      if (!snap) return;
      const next = applySnapshot(docs, snap);
      set({ ...relayout(next, memberDrafts), past: past.slice(0, -1), future: [snapshotOf(docs), ...future], lastEdit: null, saveStatus: "unsaved" });
    },

    redo: () => {
      const { past, future, docs, memberDrafts } = get();
      const snap = future[0];
      if (!snap) return;
      const next = applySnapshot(docs, snap);
      set({ ...relayout(next, memberDrafts), past: [...past, snapshotOf(docs)], future: future.slice(1), lastEdit: null, saveStatus: "unsaved" });
    },

    reset: () => {
      const { docs, uploads, memberDrafts } = get();
      const restored: Store["docs"] = {};
      for (const file of DOC_FILES) {
        const doc = docs[file];
        if (doc) restored[file] = { original: doc.original, draft: JSON.parse(doc.original) };
      }
      for (const upload of Object.values(uploads)) if (!upload.committed) URL.revokeObjectURL(upload.previewUrl);
      const keptUploads = Object.fromEntries(Object.entries(uploads).filter(([, u]) => u.committed));
      const keptMembers: Store["memberDrafts"] = {};
      for (const [path, m] of Object.entries(memberDrafts)) if (m.original !== null) keptMembers[path] = { original: m.original, draft: m.original };
      set({
        ...relayout(restored, keptMembers),
        uploads: keptUploads,
        past: [],
        future: [],
        lastEdit: null,
        saveStatus: "saved",
        saveError: null,
        problems: [],
      });
    },

    save: async () => {
      const state = get();
      set({ saveStatus: "saving", saveError: null, problems: [] });

      // 1. Validate drafts.
      const drafts: Partial<DocMap> = {};
      for (const file of DOC_FILES) {
        const doc = state.docs[file];
        if (doc) (drafts as Record<string, unknown>)[file] = doc.draft;
      }
      const existing = new Set(state.memberFiles);
      const problems: Problem[] = [];
      const memberFilesToWrite: { path: string; text: string }[] = [];
      for (const [path, m] of Object.entries(state.memberDrafts)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(m.draft);
        } catch (err) {
          problems.push({ file: path, message: `Not valid JSON — ${(err as Error).message}` });
          continue;
        }
        if (!parsed || typeof parsed !== "object" || !("name" in parsed) || !(parsed as { name: unknown }).name) {
          problems.push({ file: path, message: `A "name" field is required.` });
        }
        existing.add(path);
        const text = serialize(parsed);
        if (m.original === null || text !== normalise(m.original)) memberFilesToWrite.push({ path, text });
      }
      problems.push(...validateDocs(drafts, existing));
      if (problems.length) {
        set({ saveStatus: "error", saveError: `Fix ${problems.length} problem${problems.length > 1 ? "s" : ""} before saving.`, problems });
        return false;
      }

      // 2. Work out what changed.
      const files: { path: string; contentsBase64: string }[] = [];
      const changedDocs: DocFile[] = [];
      for (const file of DOC_FILES) {
        const doc = state.docs[file];
        if (doc && serialize(doc.draft) !== doc.original) {
          changedDocs.push(file);
          files.push({ path: file, contentsBase64: utf8ToBase64(serialize(doc.draft)) });
        }
      }
      for (const m of memberFilesToWrite) files.push({ path: m.path, contentsBase64: utf8ToBase64(m.text) });

      const wanted = imageRefs(state.docs, "draft");
      const used: Upload[] = [];
      for (const upload of Object.values(state.uploads)) {
        if (!upload.committed && wanted.has(upload.rel)) {
          used.push(upload);
          files.push({ path: upload.path, contentsBase64: upload.contentsBase64 });
        }
      }
      const before = imageRefs(state.docs, "original");
      const deletions = [...before].filter((rel) => !wanted.has(rel)).map((rel) => `photos/${rel}`).filter(isDeletablePath);

      if (files.length === 0 && deletions.length === 0) {
        set({ saveStatus: "saved" });
        return true;
      }

      // 3. Commit.
      try {
        const res = await fetch("/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Admin panel update — ${new Date().toISOString()}`, files, deletions, baseSha: state.baseSha }),
        });
        if (res.status === 401) {
          window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          return false;
        }
        const result = (await res.json()) as { commitSha?: string; commitUrl?: string; error?: string };
        if (!res.ok) throw new Error(result.error || `Save failed (${res.status}).`);

        const cur = get();
        const docs = { ...cur.docs };
        for (const file of changedDocs) {
          const doc = docs[file];
          if (doc) docs[file] = { original: serialize(doc.draft), draft: doc.draft };
        }
        const memberDrafts = { ...cur.memberDrafts };
        for (const m of memberFilesToWrite) memberDrafts[m.path] = { original: m.text, draft: m.text };
        const uploads = { ...cur.uploads };
        for (const u of used) uploads[u.rel] = { ...u, committed: true };
        set({
          ...relayout(docs, memberDrafts),
          uploads,
          memberFiles: [...new Set([...cur.memberFiles, ...memberFilesToWrite.map((m) => m.path)])].sort(),
          baseSha: result.commitSha ?? cur.baseSha,
          lastCommitUrl: result.commitUrl ?? null,
          saveStatus: "saved",
          saveError: null,
        });
        return true;
      } catch (err) {
        set({ saveStatus: "error", saveError: err instanceof Error ? err.message : String(err) });
        return false;
      }
    },
  };
});

/** URL to show for a photo path relative to photos/ (staged upload → local preview). */
export function photoUrl(rel: string, state: Pick<Store, "uploads" | "provider" | "imageBase">): string {
  const staged = state.uploads[rel];
  if (staged) return staged.previewUrl;
  if (/^(https?:)?\/\//i.test(rel) || rel.startsWith("/")) return rel;
  if (state.provider === "local-fs") return `/api/photo/${rel.split("/").map(encodeURIComponent).join("/")}`;
  return `${state.imageBase}${rel}`;
}

export { PHOTO_FILE_RE };
