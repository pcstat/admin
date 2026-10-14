/**
 * Checks the drafts before a save — the same rules as the database repo's scripts/validate.mjs,
 * so a commit made by this panel never fails that repo's CI.
 */
import { SECTIONS, type FieldDef } from "./schemas";
import type { DocFile, DocMap } from "./types";

export interface Problem {
  file: string;
  message: string;
}

const isAbsolute = (v: string) => /^https?:\/\//i.test(v) || v.startsWith("/");

function dupes(values: string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const v of values) (seen.has(v) ? out : seen).add(v);
  return [...out];
}

/** Reports every empty field that the schema marks as required, in any (nested) list item. */
function checkRequired(file: string, fields: FieldDef[], value: unknown, where: string, add: (file: string, message: string) => void) {
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  for (const field of fields) {
    const v = obj[field.key];
    if ("required" in field && field.required && (v === undefined || v === null || (typeof v === "string" && v.trim() === ""))) {
      add(file, `${where}: "${field.label}" is required.`);
    }
    if (field.kind === "list" && Array.isArray(v)) {
      v.forEach((item, i) => {
        const title = field.title(item as Record<string, unknown>, i);
        checkRequired(file, field.fields, item, `${where} › ${title}`, add);
      });
    }
  }
}

export function validateDocs(docs: Partial<DocMap>, existingFiles: Set<string>): Problem[] {
  const problems: Problem[] = [];
  const add = (file: string, message: string) => problems.push({ file, message });

  for (const section of SECTIONS) {
    checkRequired(section.file, section.fields, docs[section.file], section.title, add);
  }

  const exec = docs["executives.json"];
  const memberIds = new Set<string>();
  if (exec) {
    const F = "executives.json";
    const sessions = exec.committees.map((c) => c.session);
    for (const d of dupes(sessions)) add(F, `Two committees share the session "${d}".`);
    if (!sessions.includes(exec.current_committee)) add(F, `The current committee ("${exec.current_committee}") is not one of the committees.`);
    const ids: string[] = [];
    for (const c of exec.committees) {
      const where = `Committee ${c.session || "(no session)"}`;
      if (/\s/.test(c.session)) add(F, `${where}: the session ID must not contain spaces.`);
      for (const m of c.members) {
        const who = `${where} / ${m.name || m.student_id || "new member"}`;
        if (m.session && m.session !== c.session) add(F, `${who}: the member's session ("${m.session}") must equal the committee's ("${c.session}").`);
        ids.push(m.student_id);
        memberIds.add(m.student_id);
        if (m.icon_link && !isAbsolute(m.icon_link)) {
          // staged uploads are checked by the store; existing files are checked in the repo's CI
        }
        for (const s of m.socials ?? []) if (!s.url) add(F, `${who}: a social link has no URL.`);
      }
      if (c.members.filter((m) => m.highlight).length > 1) add(F, `${where}: only one member should be highlighted.`);
    }
    for (const d of dupes(ids)) add(F, `The student ID "${d}" is used more than once.`);
  }

  const checkRefs = (file: string, what: string, ids: string[] | undefined) => {
    if (!exec) return;
    for (const id of ids ?? []) if (!memberIds.has(id)) add(file, `${what}: unknown member ID "${id}".`);
  };

  for (const p of docs["projects.json"]?.projects ?? []) {
    checkRefs("projects.json", `Project "${p.title}"`, p.members);
  }
  for (const a of docs["achievements.json"]?.achievements ?? []) {
    checkRefs("achievements.json", `Achievement "${a.title}"`, a.members);
  }
  const events = docs["events.json"]?.events ?? [];
  for (const d of dupes(events.map((e) => e.id))) add("events.json", `The event ID "${d}" is used more than once.`);
  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? "")) add("events.json", `Event "${e.title}": the date must look like 2026-12-31.`);
  }
  const courses = docs["courses.json"]?.courses ?? [];
  for (const d of dupes(courses.map((c) => c.id))) add("courses.json", `The course ID "${d}" is used more than once.`);
  const certs = docs["certificates.json"]?.issued_certificates ?? [];
  for (const d of dupes(certs.map((c) => c.id))) add("certificates.json", `The certificate ID "${d}" is used more than once.`);
  for (const c of certs) {
    if (!c.course && !c.course1) add("certificates.json", `Certificate ${c.id}: fill in either "Course" or "Course (line 1)".`);
  }

  // Links to member files must point to something that exists or will exist.
  if (exec) {
    for (const c of exec.committees)
      for (const m of c.members)
        for (const [key, link] of [["profile_link", m.profile_link], ["cv_link", m.cv_link]] as const) {
          if (link && !isAbsolute(link) && !existingFiles.has(link)) {
            add("executives.json", `${m.name}: ${key} "${link}" does not exist yet — create it under Member files first.`);
          }
        }
  }
  return problems;
}

export type { DocFile };
