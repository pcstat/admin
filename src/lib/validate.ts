/**
 * Checks the drafts before a save — the same rules as the database repo's scripts/validate.mjs,
 * so a commit made by this panel never fails that repo's CI.
 */
import { SECTIONS, TERMINAL_COMMANDS, type FieldDef } from "./schemas";
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
    if (field.kind === "group") checkRequired(file, field.fields, v, `${where} › ${field.label}`, add);
  }
}

export function validateDocs(docs: Partial<DocMap>, existingFiles: Set<string>): Problem[] {
  const problems: Problem[] = [];
  const add = (file: string, message: string) => problems.push({ file, message });

  for (const section of SECTIONS) {
    for (const part of section.parts) checkRequired(part.file, part.fields, docs[part.file], section.title, add);
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

  const currentIds = new Set(exec?.committees.find((c) => c.session === exec.current_committee)?.members.map((m) => m.student_id) ?? []);

  const checkRefs = (file: string, what: string, ids: string[] | undefined) => {
    if (!exec) return;
    for (const id of ids ?? []) if (!memberIds.has(id)) add(file, `${what}: unknown member ID "${id}".`);
  };

  const projectList = docs["projects.json"]?.projects ?? [];
  for (const d of dupes(projectList.map((p) => p.id))) add("projects.json", `The project ID "${d}" is used more than once.`);
  for (const p of projectList) {
    if (p.id && /\s/.test(p.id)) add("projects.json", `Project "${p.title}": the ID must not contain spaces.`);
    checkRefs("projects.json", `Project "${p.title}"`, p.members);
  }

  const home = docs["home.json"];
  if (home) {
    const projectIds = new Set(projectList.map((p) => p.id));
    for (const d of dupes(home.pinned_executives ?? [])) add("home.json", `The executive "${d}" is pinned twice.`);
    for (const d of dupes(home.pinned_projects ?? [])) add("home.json", `The project "${d}" is pinned twice.`);
    for (const id of home.pinned_executives ?? []) {
      if (!memberIds.has(id)) add("home.json", `Pinned executive "${id}" is not a known student ID.`);
      else if (!currentIds.has(id)) add("home.json", `Pinned executive "${id}" is not in the current committee — unpin them or change the current committee.`);
    }
    for (const id of home.pinned_projects ?? []) {
      if (!projectIds.has(id)) add("home.json", `Pinned project "${id}" does not exist (was it deleted or its ID changed?).`);
    }
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

  const site = docs["site.json"];
  if (site) {
    const F = "site.json";
    for (const d of dupes((site.nav ?? []).map((n) => n.path))) add(F, `The menu lists the page “${d}” twice.`);
    if (!(site.nav ?? []).length) add(F, "The menu needs at least one entry.");
    const founded = site.club?.founded;
    if (!(Number.isInteger(founded) && (founded as number) > 1900 && (founded as number) <= new Date().getFullYear())) add(F, "Site settings › Founded must be a year such as 2022.");
    const lines = (site.home?.title_lines ?? []) as unknown[];
    if (!Array.isArray(lines) || lines.length === 0 || lines.some((l) => typeof l !== "string" || !l.trim())) add(F, "Home › Heading lines: every line needs text.");
    const known = TERMINAL_COMMANDS.map((c) => c.value);
    for (const c of site.terminal?.commands ?? []) if (!known.includes(c)) add(F, `Terminal: “${c}” is not a known command.`);
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
