/**
 * The shapes of members/<slug>/profile.json and cv.json, as the website reads them
 * (website: src/app/profile/DynamicProfile.tsx and src/app/cv/page.tsx).
 *
 * Used by the JSON editor for warnings ("expected text, found a number") and key auto-completion.
 * These are *warnings*: the website is forgiving, so the panel never blocks a save over them — only
 * invalid JSON blocks a save.
 */
import type { PathSegment } from "./object-path";

export type MemberKind = "profile" | "cv";

export type Shape =
  | { t: "string" }
  | { t: "number" }
  | { t: "boolean" }
  | { t: "array"; of: Shape }
  | { t: "object"; fields: Record<string, Shape>; required?: string[]; /** Shape of any other key (free-form maps / CV sections). */ extra?: Shape }
  | { t: "union"; of: Shape[] };

const str: Shape = { t: "string" };
const bool: Shape = { t: "boolean" };
const arr = (of: Shape): Shape => ({ t: "array", of });
const obj = (fields: Record<string, Shape>, required?: string[], extra?: Shape): Shape => ({ t: "object", fields, required, extra });
const union = (...of: Shape[]): Shape => ({ t: "union", of });
const strings = arr(str);

const links: Shape = obj({}, undefined, str);

const PROFILE: Shape = obj(
  {
    name: str,
    tagline: str,
    role: str,
    subtitle: str,
    photo: str,
    bio: str,
    location: str,
    email: str,
    github: str,
    session: str,
    cv_link: str,
    socials: arr(obj({ type: str, label: str, url: str }, ["label", "url"])),
    stats: arr(obj({ value: str, label: str }, ["value", "label"])),
    focus_areas: strings,
    skills: arr(obj({ category: str, icon: str, items: strings }, ["category", "items"])),
    timeline: arr(
      obj({ role: str, start: str, end: str, company: str, type: str, description: str, short_desc: str, tags: strings }, ["role", "start", "end"]),
    ),
    projects: arr(obj({ title: str, description: str, tags: strings, featured: bool, links }, ["title", "description"])),
    publications: arr(obj({ title: str, venue: str, tags: strings, featured: bool, links }, ["title", "venue"])),
    achievements: arr(obj({ title: str, event: str, year: str }, ["title", "event", "year"])),
  },
  ["name"],
);

const bullet: Shape = union(str, obj({ text: str, children: strings }, ["text"]));
const entry: Shape = obj({ title: str, subtitle: str, dates: str, bullets: arr(bullet), commas: arr(union(str, obj({ text: str }, ["text"]))) }, ["title"]);

const CV: Shape = obj(
  {
    name: str,
    role: str,
    location: str,
    email: str,
    github: str,
    languages: strings,
    education: arr(obj({ degree: str, institution: str, year: str, cgpa: str, rank: str }, ["degree", "institution"])),
    certifications: arr(union(str, obj({ title: str, link: str }, ["title"]))),
    experience: arr(entry),
  },
  ["name"],
  arr(entry), // every other list becomes its own section on the page ("// Technical Skills", …)
);

export const SHAPES: Record<MemberKind, Shape> = { profile: PROFILE, cv: CV };

/** Section keys the CV page understands besides the fixed ones — offered by auto-completion. */
export const COMMON_CV_SECTIONS = ["projects", "activities", "technical_skills", "publications", "workshops_conducted"];

export const CV_FIXED_KEYS = ["name", "role", "location", "email", "github", "education", "certifications", "languages", "experience"];

/** Minimal starting points for a new file. */
export const TEMPLATES: Record<MemberKind, (name: string) => Record<string, unknown>> = {
  profile: (name) => ({
    name,
    tagline: "",
    role: "",
    subtitle: "",
    photo: "",
    bio: "",
    location: "",
    session: "",
    socials: [],
    stats: [],
    focus_areas: [],
    skills: [],
    timeline: [],
    projects: [],
    publications: [],
    achievements: [],
  }),
  cv: (name) => ({
    name,
    role: "",
    location: "",
    email: "",
    github: "",
    languages: [],
    education: [],
    certifications: [],
    experience: [],
    projects: [],
    activities: [],
    technical_skills: [],
    publications: [],
    workshops_conducted: [],
  }),
};

// ── checking ─────────────────────────────────────────────────────────────────

export interface Issue {
  path: PathSegment[];
  /** "key" = the property name itself (unknown field), "value" = the value. */
  where: "key" | "value";
  severity: "error" | "warning";
  message: string;
}

const typeName = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "a list" : typeof v === "object" ? "an object" : typeof v === "string" ? "text" : typeof v === "number" ? "a number" : "true/false");

function matches(value: unknown, shape: Shape): boolean {
  switch (shape.t) {
    case "string":
    case "number":
    case "boolean":
      return typeof value === shape.t;
    case "array":
      return Array.isArray(value);
    case "object":
      return !!value && typeof value === "object" && !Array.isArray(value);
    case "union":
      return shape.of.some((s) => matches(value, s));
  }
}

const expected = (shape: Shape): string =>
  shape.t === "string" ? "text" : shape.t === "number" ? "a number" : shape.t === "boolean" ? "true or false" : shape.t === "array" ? "a list" : shape.t === "object" ? "an object" : shape.of.map(expected).join(" or ");

export function checkMember(value: unknown, kind: MemberKind): Issue[] {
  const issues: Issue[] = [];
  const walk = (v: unknown, shape: Shape, path: PathSegment[]) => {
    if (!matches(v, shape)) {
      issues.push({ path, where: "value", severity: "warning", message: `Expected ${expected(shape)}, found ${typeName(v)}.` });
      return;
    }
    if (shape.t === "array") {
      (v as unknown[]).forEach((item, i) => walk(item, shape.of, [...path, i]));
    } else if (shape.t === "object") {
      const o = v as Record<string, unknown>;
      for (const key of shape.required ?? []) {
        if (o[key] === undefined || o[key] === "") {
          issues.push({ path, where: "value", severity: path.length === 0 ? "error" : "warning", message: `Missing "${key}".` });
        }
      }
      for (const [key, child] of Object.entries(o)) {
        const sub = shape.fields[key] ?? shape.extra;
        if (!sub) {
          issues.push({ path: [...path, key], where: "key", severity: "warning", message: `Unknown field "${key}" — the website ignores it.` });
        } else if (!shape.fields[key] && shape.extra && !matches(child, shape.extra)) {
          issues.push({ path: [...path, key], where: "key", severity: "warning", message: `"${key}" is not a list, so the website does not show it.` });
        } else walk(child, sub, [...path, key]);
      }
    } else if (shape.t === "union") {
      const hit = shape.of.find((s) => matches(v, s));
      if (hit) walk(v, hit, path);
    }
  };
  walk(value, SHAPES[kind], []);
  return issues;
}

/** The shape found at `path` (arrays and unions are transparent), for auto-completion. */
export function shapeAt(kind: MemberKind, path: PathSegment[]): Shape | null {
  const objectOf = (shape: Shape): Shape => (shape.t === "union" ? (shape.of.find((s) => s.t === "object") ?? shape.of[0] ?? shape) : shape);
  let shape: Shape | null = SHAPES[kind];
  for (const seg of path) {
    if (!shape) return null;
    const current: Shape = objectOf(shape);
    if (current.t === "array") shape = typeof seg === "number" ? current.of : null;
    else if (current.t === "object") shape = current.fields[String(seg)] ?? current.extra ?? null;
    else shape = null;
  }
  return shape ? objectOf(shape) : null;
}

// ── data helpers shared by the UI editors ────────────────────────────────────

export type Json = Record<string, unknown>;

export function parseJson(text: string): { value: Json | null; error: string } {
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return { value: null, error: "The file must contain a JSON object ({ … })." };
    return { value: value as Json, error: "" };
  } catch (err) {
    return { value: null, error: (err as Error).message };
  }
}

export const stringify = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";
