"use client";

/**
 * State of the certificate registry (its own repository, not part of the database documents).
 *
 * The registry can hold thousands of certificates, so it is NOT kept in content-store.ts (which re-serialises every
 * document on each keystroke). Here a set is one file; the store knows which sets changed, saves only those, and an
 * edit rebuilds only the set it touches.
 */
import { create } from "zustand";
import { generatePersonId } from "@/lib/certificates/core";
import { setPath } from "@/lib/certificates/paths";
import type { CertificateSection, Manifest, PersonEntry, SetFile } from "@/lib/certificates/types";
import { validateSets, type CertProblem } from "@/lib/certificates/validate";
import { utf8ToBase64 } from "@/lib/base64";
import { useContentStore } from "./content-store";

export type CertSaveStatus = "saved" | "unsaved" | "saving" | "error";

interface SetState {
  /** Normalised JSON text as last loaded / saved; null = the file does not exist in the registry yet. */
  original: string | null;
  draft: SetFile;
  /** Person ids that are in the saved file (to tell new certificates from old ones). */
  savedIds: Set<string>;
}

interface Store {
  status: "idle" | "loading" | "ready" | "error";
  loadError: string | null;
  progress: { done: number; total: number };
  provider: "local-fs" | "github";
  baseSha: string | null;
  publicBase: string;
  manifest: Manifest | null;
  /** SVG text of the templates, loaded when first needed. */
  templates: Record<string, string>;
  sets: Record<string, SetState>;
  dirty: Record<string, boolean>;
  saveStatus: CertSaveStatus;
  saveError: string | null;
  problems: CertProblem[];
  lastCommitUrl: string | null;
  pendingPublish: boolean;
  publishStatus: "idle" | "busy" | "done" | "error";
  publishMessage: string | null;

  load: () => Promise<void>;
  loadTemplate: (file: string) => Promise<void>;
  createSet: (init: { code: string; certificate: CertificateSection }) => string | null;
  /** Changes the part every certificate of the set shares (title, date, design, signatories …). */
  updateCertificate: (code: string, patch: Partial<CertificateSection>) => void;
  /** Adds people; each gets a new person id that is unique inside this set's file. Returns the printed-form-independent person ids. */
  addPeople: (code: string, rows: { name: string; fields?: Record<string, string>; note?: string }[]) => string[];
  updatePerson: (code: string, personId: string, patch: Partial<Omit<PersonEntry, "revoked">>) => void;
  /** Revokes (reason given) or restores (`revoked` undefined) certificates. */
  setRevoked: (changes: { code: string; personId: string }[], revoked: { date: string; reason?: string } | undefined) => void;
  /** Takes back certificates that were added in this session and not saved yet. */
  removePerson: (code: string, personId: string) => void;
  discard: () => void;
  save: () => Promise<boolean>;
  publish: () => Promise<boolean>;
}

export const serializeSet = (set: SetFile): string => JSON.stringify(set, null, 2) + "\n";

const CONCURRENCY = 6;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) {
    window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new Error("Signing in again…");
  }
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

const readFile = async (path: string) => (await getJson<{ text: string | null }>(`/api/certs/file?path=${encodeURIComponent(path)}`)).text;

export const useCertificatesStore = create<Store>((set, get) => {
  /** Replaces one set's draft, keeping the rest untouched. */
  const editSet = (code: string, change: (draft: SetFile) => SetFile) => {
    const state = get();
    const current = state.sets[code];
    if (!current) return;
    const draft = change(current.draft);
    const sets = { ...state.sets, [code]: { ...current, draft } };
    const changed = current.original === null || serializeSet(draft) !== current.original;
    set({ sets, dirty: { ...state.dirty, [code]: changed }, saveStatus: "unsaved", saveError: null });
  };

  return {
    status: "idle",
    loadError: null,
    progress: { done: 0, total: 0 },
    provider: "local-fs",
    baseSha: null,
    publicBase: "",
    manifest: null,
    templates: {},
    sets: {},
    dirty: {},
    saveStatus: "saved",
    saveError: null,
    problems: [],
    lastCommitUrl: null,
    pendingPublish: false,
    publishStatus: "idle",
    publishMessage: null,

    load: async () => {
      if (get().status === "loading" || get().status === "ready") return;
      set({ status: "loading", loadError: null, progress: { done: 0, total: 0 } });
      try {
        const list = await getJson<{ provider: Store["provider"]; baseSha: string | null; sets: string[]; publicBase: string }>("/api/certs/list");
        const manifestText = await readFile("templates/manifest.json");
        if (!manifestText) throw new Error("templates/manifest.json was not found in the certificate registry.");
        set({ provider: list.provider, baseSha: list.baseSha, publicBase: list.publicBase, manifest: JSON.parse(manifestText) as Manifest, progress: { done: 0, total: list.sets.length } });

        // The sets are read one request each, a few at a time (a single request that read them all would hit the
        // limit of subrequests a Cloudflare Worker may make). They appear on screen as they arrive.
        const queue = [...list.sets];
        let done = 0;
        let pending: Record<string, SetState> = {};
        const flush = () => {
          if (Object.keys(pending).length === 0) return;
          const next = { ...get().sets, ...pending };
          pending = {};
          set({ sets: next, progress: { done, total: list.sets.length } });
        };
        const worker = async () => {
          while (queue.length) {
            const path = queue.shift()!;
            const text = await readFile(path);
            done += 1;
            if (text) {
              const draft = JSON.parse(text) as SetFile;
              pending[draft.code] = { original: serializeSet(draft), draft, savedIds: new Set(Object.keys(draft.people)) };
            }
            if (done % 5 === 0) flush();
          }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
        flush();
        set({ status: "ready", progress: { done, total: list.sets.length } });
      } catch (err) {
        set({ status: "error", loadError: err instanceof Error ? err.message : String(err) });
      }
    },

    loadTemplate: async (file) => {
      if (get().templates[file] !== undefined) return;
      const text = await readFile(`templates/${file}`);
      if (text) set({ templates: { ...get().templates, [file]: text } });
    },

    createSet: (init) => {
      const state = get();
      if (state.sets[init.code]) return `A set with the code ${init.code} already exists.`;
      const draft: SetFile = { code: init.code, certificate: init.certificate, people: {} };
      set({
        sets: { ...state.sets, [init.code]: { original: null, draft, savedIds: new Set() } },
        dirty: { ...state.dirty, [init.code]: true },
        saveStatus: "unsaved",
        saveError: null,
      });
      return null;
    },

    updateCertificate: (code, patch) => editSet(code, (d) => ({ ...d, certificate: { ...d.certificate, ...patch } })),

    addPeople: (code, rows) => {
      const state = get();
      const current = state.sets[code];
      if (!current) return [];
      // Person ids only have to be unique inside this one file, so only this file's ids are avoided.
      const taken = new Set(Object.keys(current.draft.people));
      const added: Record<string, PersonEntry> = {};
      for (const row of rows) {
        const pid = generatePersonId(taken);
        taken.add(pid);
        const person: PersonEntry = { name: row.name };
        if (row.fields && Object.keys(row.fields).length) person.fields = row.fields;
        if (row.note) person.note = row.note;
        added[pid] = person;
      }
      editSet(code, (d) => ({ ...d, people: { ...d.people, ...added } }));
      return Object.keys(added);
    },

    updatePerson: (code, personId, patch) =>
      editSet(code, (d) => {
        const person = d.people[personId];
        if (!person) return d;
        const next: PersonEntry = { ...person, ...patch };
        if (next.fields && Object.keys(next.fields).length === 0) delete next.fields;
        if (!next.note) delete next.note;
        return { ...d, people: { ...d.people, [personId]: next } };
      }),

    setRevoked: (changes, revoked) => {
      const byCode = new Map<string, Set<string>>();
      for (const c of changes) byCode.set(c.code, (byCode.get(c.code) ?? new Set()).add(c.personId));
      for (const [code, ids] of byCode) {
        editSet(code, (d) => {
          const people = { ...d.people };
          for (const pid of ids) {
            const person = people[pid];
            if (!person) continue;
            const next: PersonEntry = { ...person };
            if (revoked) next.revoked = revoked.reason ? { date: revoked.date, reason: revoked.reason } : { date: revoked.date };
            else delete next.revoked;
            people[pid] = next;
          }
          return { ...d, people };
        });
      }
    },

    removePerson: (code, personId) => {
      const current = get().sets[code];
      if (!current || current.savedIds.has(personId)) return; // an issued certificate is revoked, never deleted
      editSet(code, (d) => {
        const people = { ...d.people };
        delete people[personId];
        return { ...d, people };
      });
    },

    discard: () => {
      const sets: Record<string, SetState> = {};
      for (const [code, s] of Object.entries(get().sets)) {
        if (s.original === null) continue; // a set that was only created in this session
        sets[code] = { ...s, draft: JSON.parse(s.original) as SetFile };
      }
      set({ sets, dirty: {}, saveStatus: "saved", saveError: null, problems: [] });
    },

    save: async () => {
      const state = get();
      const changed = Object.keys(state.dirty).filter((c) => state.dirty[c] && state.sets[c]);
      if (changed.length === 0) return true;
      set({ saveStatus: "saving", saveError: null, problems: [] });

      const problems = validateSets(Object.values(state.sets).map((s) => s.draft), new Set(changed), state.manifest);
      if (problems.length) {
        set({ saveStatus: "error", saveError: `Fix ${problems.length} problem${problems.length > 1 ? "s" : ""} before saving.`, problems });
        return false;
      }

      // One switch for the whole panel: "Publish on save" in the save bar decides for the database and the registry alike.
      const publishOnSave = useContentStore.getState().publishOnSave;
      const files = changed.map((code) => ({ path: setPath(code), contentsBase64: utf8ToBase64(serializeSet(state.sets[code]!.draft)) }));
      const added = changed.reduce((n, c) => n + Object.keys(state.sets[c]!.draft.people).filter((pid) => !state.sets[c]!.savedIds.has(pid)).length, 0);
      const message = changed.length === 1 ? `Certificates: ${added ? `issue ${added} in ` : "update "}${state.sets[changed[0]!]!.draft.certificate.title}` : `Certificates: update ${changed.length} sets`;
      try {
        const res = await fetch("/api/certs/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, files, baseSha: state.baseSha, skipCi: !publishOnSave }),
        });
        if (res.status === 401) {
          window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          return false;
        }
        const result = (await res.json()) as { commitSha?: string; commitUrl?: string; error?: string };
        if (!res.ok) throw new Error(result.error || `Save failed (${res.status}).`);
        const cur = get();
        const sets = { ...cur.sets };
        const dirty = { ...cur.dirty };
        for (const code of changed) {
          const s = sets[code];
          if (!s) continue;
          sets[code] = { original: serializeSet(s.draft), draft: s.draft, savedIds: new Set(Object.keys(s.draft.people)) };
          dirty[code] = false;
        }
        set({ sets, dirty, baseSha: result.commitSha ?? cur.baseSha, lastCommitUrl: result.commitUrl ?? null, pendingPublish: !publishOnSave, publishStatus: "idle", saveStatus: "saved", saveError: null });
        return true;
      } catch (err) {
        set({ saveStatus: "error", saveError: err instanceof Error ? err.message : String(err) });
        return false;
      }
    },

    publish: async () => {
      set({ publishStatus: "busy", publishMessage: null });
      try {
        const res = await fetch("/api/certs/publish", { method: "POST" });
        const result = (await res.json()) as { runsUrl?: string; error?: string };
        if (!res.ok) throw new Error(result.error || `Publishing failed (${res.status}).`);
        set({ publishStatus: "done", publishMessage: result.runsUrl ?? null, pendingPublish: false });
        return true;
      } catch (err) {
        set({ publishStatus: "error", publishMessage: err instanceof Error ? err.message : String(err) });
        return false;
      }
    },
  };
});

export const dirtyCodes = (s: Pick<Store, "dirty">) => Object.keys(s.dirty).filter((c) => s.dirty[c]);
