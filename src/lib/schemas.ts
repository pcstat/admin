/**
 * Declarative description of every editable JSON file. The generic editor (components/FieldRenderer)
 * renders a form from these definitions — adding a field means editing this file only.
 */
import type { DocFile } from "./types";

export interface Option {
  value: string;
  label?: string;
}

interface Base {
  key: string;
  label: string;
  help?: string;
}

export type FieldDef =
  | (Base & { kind: "text"; placeholder?: string; required?: boolean; mono?: boolean })
  | (Base & { kind: "textarea"; rows?: number; required?: boolean })
  | (Base & { kind: "number" })
  | (Base & { kind: "checkbox" })
  | (Base & { kind: "select"; options: Option[]; required?: boolean })
  /** Select whose options are the committee sessions of executives.json. */
  | (Base & { kind: "session-select" })
  /** string[] — one text input per entry. */
  | (Base & { kind: "strings"; placeholder?: string; addLabel?: string })
  /** string[] of student IDs, chosen from the members of executives.json. */
  | (Base & { kind: "members" })
  /** Path relative to photos/ (e.g. "executives/ada.webp"); uploads go to photos/<folder>/. */
  | (Base & { kind: "image"; folder: string })
  | (Base & {
      kind: "list";
      itemLabel: string;
      /** Title shown on the collapsed item. */
      title: (item: Record<string, unknown>, index: number) => string;
      fields: FieldDef[];
      /** Creates a new item. `parent` is the object that holds the list, `taken` the ids already in use. */
      create: (ctx: { parent: Record<string, unknown>; taken: string[] }) => Record<string, unknown>;
      /** Key whose value must be unique inside the list (used for ids). */
      uniqueKey?: string;
      collapsedByDefault?: boolean;
    });

export interface SectionDef {
  slug: string;
  file: DocFile;
  title: string;
  description: string;
  fields: FieldDef[];
}

const SOCIAL_TYPES = ["linkedin", "github", "facebook", "email", "codeforces", "twitter", "instagram", "website"].map(
  (value) => ({ value }),
);

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** "ev-001", "ev-002", … — the next unused id with the given prefix. */
export function nextId(prefix: string, taken: string[], pad = 3): string {
  let n = taken.length + 1;
  let id = "";
  do {
    id = `${prefix}-${String(n).padStart(pad, "0")}`;
    n += 1;
  } while (taken.includes(id));
  return id;
}

const socialsField: FieldDef = {
  kind: "list",
  key: "socials",
  label: "Social links",
  itemLabel: "link",
  title: (item) => str(item.label) || str(item.type) || "New link",
  create: () => ({ type: "github", label: "GitHub", url: "" }),
  fields: [
    { kind: "select", key: "type", label: "Type", options: SOCIAL_TYPES, required: true },
    { kind: "text", key: "label", label: "Label", required: true },
    { kind: "text", key: "url", label: "URL", required: true, mono: true },
  ],
};

const memberFields: FieldDef[] = [
  { kind: "text", key: "name", label: "Name", required: true },
  { kind: "text", key: "student_id", label: "Student ID", required: true, mono: true, help: "Unique across all committees. Projects and achievements refer to members by this ID." },
  { kind: "text", key: "initial", label: "Initial", required: true, help: "Letter shown when there is no photo." },
  { kind: "text", key: "role", label: "Role", help: "e.g. Vice President" },
  { kind: "text", key: "role_display", label: "Role (display)", help: "e.g. // VICE PRESIDENT" },
  { kind: "text", key: "session", label: "Session", required: true, mono: true, help: "Must equal the committee's session." },
  { kind: "checkbox", key: "highlight", label: "Highlight (wide featured card — one per committee)" },
  { kind: "textarea", key: "bio", label: "Bio", rows: 3 },
  { kind: "image", key: "icon_link", label: "Photo", folder: "executives" },
  { kind: "text", key: "profile_link", label: "Profile file", mono: true, help: "Optional, e.g. members/ada-lovelace/profile.json (edit it under Member files)." },
  { kind: "text", key: "cv_link", label: "CV file", mono: true, help: "Optional, e.g. members/ada-lovelace/cv.json (edit it under Member files)." },
  socialsField,
];

export const SECTIONS: SectionDef[] = [
  {
    slug: "executives",
    file: "executives.json",
    title: "Executives",
    description: "Committees and their members. The current committee appears under Executives, all others under Past Executives.",
    fields: [
      { kind: "session-select", key: "current_committee", label: "Current committee" },
      {
        kind: "list",
        key: "committees",
        label: "Committees",
        itemLabel: "committee",
        title: (c) => `${str(c.label) || str(c.session) || "New committee"}`,
        uniqueKey: "session",
        create: () => ({ session: "", label: "", members: [] }),
        fields: [
          { kind: "text", key: "session", label: "Session ID", required: true, mono: true, placeholder: "2027-28", help: "No spaces, e.g. 2027-28." },
          { kind: "text", key: "label", label: "Label", required: true, placeholder: "2027 – 2028" },
          { kind: "number", key: "total_members", label: "Total members", help: "Optional — used for the home page stat; otherwise the number of listed members." },
          {
            kind: "list",
            key: "members",
            label: "Members",
            itemLabel: "member",
            title: (m) => [str(m.name) || "New member", str(m.role)].filter(Boolean).join(" — "),
            uniqueKey: "student_id",
            collapsedByDefault: true,
            create: ({ parent }) => ({
              student_id: "",
              initial: "",
              role: "",
              role_display: "",
              name: "",
              session: str(parent.session),
              highlight: false,
              bio: "",
              socials: [],
            }),
            fields: memberFields,
          },
        ],
      },
    ],
  },
  {
    slug: "projects",
    file: "projects.json",
    title: "Projects",
    description: "Club projects and publications.",
    fields: [
      {
        kind: "list",
        key: "projects",
        label: "Projects",
        itemLabel: "project",
        title: (p) => str(p.title) || "New project",
        collapsedByDefault: true,
        create: () => ({ title: "", description: "", status: "active", tags: [], members: [], year: String(new Date().getFullYear()) }),
        fields: [
          { kind: "text", key: "title", label: "Title", required: true },
          { kind: "textarea", key: "description", label: "Description", required: true, rows: 3 },
          {
            kind: "select",
            key: "status",
            label: "Status",
            required: true,
            options: [{ value: "active" }, { value: "completed" }, { value: "research" }, { value: "publication" }],
          },
          { kind: "text", key: "year", label: "Year", required: true, mono: true },
          { kind: "strings", key: "tags", label: "Tags", placeholder: "Python", addLabel: "Add tag" },
          { kind: "members", key: "members", label: "Members" },
          { kind: "text", key: "link", label: "Repo link", mono: true },
          { kind: "text", key: "demo_link", label: "Demo / DOI link", mono: true },
          { kind: "checkbox", key: "featured", label: "Featured" },
        ],
      },
    ],
  },
  {
    slug: "events",
    file: "events.json",
    title: "Events",
    description: "Workshops, contests and meetups. The website sorts them by date.",
    fields: [
      { kind: "text", key: "note", label: "Footer note", help: "Shown below the events list." },
      {
        kind: "list",
        key: "events",
        label: "Events",
        itemLabel: "event",
        title: (e) => [str(e.date), str(e.title) || "New event"].filter(Boolean).join(" · "),
        uniqueKey: "id",
        collapsedByDefault: true,
        create: ({ taken }) => ({ id: nextId("ev", taken), title: "", date: "", time: "", location: "", audience: "", type: "workshop" }),
        fields: [
          { kind: "text", key: "id", label: "ID", required: true, mono: true },
          { kind: "text", key: "title", label: "Title", required: true },
          { kind: "text", key: "date", label: "Date", required: true, mono: true, placeholder: "2026-12-31", help: "YYYY-MM-DD" },
          { kind: "text", key: "time", label: "Time", required: true, placeholder: "2:00 PM" },
          { kind: "text", key: "location", label: "Location", required: true },
          { kind: "text", key: "audience", label: "Audience", required: true },
          {
            kind: "select",
            key: "type",
            label: "Type",
            required: true,
            options: [{ value: "upcoming" }, { value: "workshop" }, { value: "contest" }, { value: "seminar" }, { value: "other" }],
          },
          { kind: "text", key: "register_link", label: "Register link", mono: true },
          { kind: "text", key: "details_link", label: "Details link", mono: true },
        ],
      },
    ],
  },
  {
    slug: "courses",
    file: "courses.json",
    title: "Courses",
    description: "Courses and certificates completed by members.",
    fields: [
      {
        kind: "list",
        key: "courses",
        label: "Courses",
        itemLabel: "course",
        title: (c) => str(c.title) || "New course",
        uniqueKey: "id",
        collapsedByDefault: true,
        create: ({ taken }) => ({ id: nextId("c", taken), title: "", provider: "", description: "", type: "course", year: String(new Date().getFullYear()) }),
        fields: [
          { kind: "text", key: "id", label: "ID", required: true, mono: true },
          { kind: "text", key: "title", label: "Title", required: true },
          { kind: "text", key: "provider", label: "Provider", required: true },
          { kind: "textarea", key: "description", label: "Description", required: true, rows: 3 },
          { kind: "select", key: "type", label: "Type", required: true, options: [{ value: "course" }, { value: "certificate" }] },
          { kind: "text", key: "year", label: "Year", required: true, mono: true },
          { kind: "text", key: "link", label: "Link", mono: true },
          { kind: "checkbox", key: "featured", label: "Featured" },
        ],
      },
    ],
  },
  {
    slug: "achievements",
    file: "achievements.json",
    title: "Achievements",
    description: "Competition results and recognitions, plus the tally strip at the top of the page.",
    fields: [
      {
        kind: "list",
        key: "tally",
        label: "Tally strip",
        itemLabel: "counter",
        title: (t) => `${str(t.value)} ${str(t.label)}`.trim() || "New counter",
        create: () => ({ value: "", label: "" }),
        fields: [
          { kind: "text", key: "value", label: "Value", required: true, placeholder: "12" },
          { kind: "text", key: "label", label: "Label", required: true, placeholder: "Gold" },
        ],
      },
      {
        kind: "list",
        key: "achievements",
        label: "Achievements",
        itemLabel: "achievement",
        title: (a) => str(a.title) || "New achievement",
        collapsedByDefault: true,
        create: () => ({ title: "", event: "", category: "", year: String(new Date().getFullYear()), tier: "gold", team_label: "Team", members: [] }),
        fields: [
          { kind: "text", key: "title", label: "Title", required: true },
          { kind: "text", key: "event", label: "Event", required: true },
          { kind: "text", key: "category", label: "Category", required: true, placeholder: "Hackathon" },
          { kind: "text", key: "year", label: "Year", required: true, mono: true },
          {
            kind: "select",
            key: "tier",
            label: "Tier",
            required: true,
            options: [{ value: "gold" }, { value: "silver" }, { value: "bronze" }, { value: "special" }, { value: "community" }],
          },
          { kind: "text", key: "team_label", label: "Team label", required: true, placeholder: "Team", help: "Prefix before the member list: Team, Project, Member, Authors…" },
          { kind: "members", key: "members", label: "Members" },
          { kind: "checkbox", key: "featured", label: "Featured (listed first)" },
        ],
      },
    ],
  },
  {
    slug: "certificates",
    file: "certificates.json",
    title: "Certificates",
    description: "Issued certificates, checked by the website's verification page.",
    fields: [
      {
        kind: "list",
        key: "issued_certificates",
        label: "Issued certificates",
        itemLabel: "certificate",
        title: (c) => [str(c.id), str(c.recipient)].filter(Boolean).join(" · ") || "New certificate",
        uniqueKey: "id",
        collapsedByDefault: true,
        create: ({ taken }) => ({ id: nextId(`SPC-${new Date().getFullYear()}`, taken, 4), recipient: "", course: "", date: "", status: "verified", template: "Certificate_A.svg" }),
        fields: [
          { kind: "text", key: "id", label: "Certificate ID", required: true, mono: true },
          { kind: "text", key: "recipient", label: "Recipient", required: true },
          { kind: "text", key: "course", label: "Course", help: "Use either Course, or Course line 1 + 2 for a two-line title." },
          { kind: "text", key: "course1", label: "Course (line 1)" },
          { kind: "text", key: "course2", label: "Course (line 2)" },
          { kind: "text", key: "date", label: "Date", required: true, placeholder: "May 23, 2026" },
          { kind: "select", key: "template", label: "Template", options: [{ value: "Certificate_A.svg" }, { value: "Certificate_B.svg" }, { value: "Certificate_C.svg" }] },
          { kind: "text", key: "status", label: "Status", placeholder: "verified" },
          { kind: "text", key: "reason", label: "Reason (line 1)" },
          { kind: "text", key: "reason2", label: "Reason (line 2)" },
          { kind: "text", key: "person1", label: "Signatory 1" },
          { kind: "text", key: "post1", label: "Position 1" },
          { kind: "text", key: "person2", label: "Signatory 2" },
          { kind: "text", key: "post2", label: "Position 2" },
          { kind: "text", key: "modules", label: "Modules" },
          { kind: "text", key: "hours", label: "Hours" },
          { kind: "text", key: "score", label: "Score" },
          { kind: "text", key: "grade", label: "Grade" },
        ],
      },
    ],
  },
];

export function sectionBySlug(slug: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.slug === slug);
}

/** Every `image` field value found in `data`, following the schema (relative paths under photos/). */
export function collectImages(fields: FieldDef[], data: unknown, out: Set<string> = new Set()): Set<string> {
  if (!data || typeof data !== "object") return out;
  const obj = data as Record<string, unknown>;
  for (const field of fields) {
    const value = obj[field.key];
    if (field.kind === "image") {
      if (typeof value === "string" && value && !/^(https?:)?\/\//i.test(value) && !value.startsWith("/")) out.add(value);
    } else if (field.kind === "list" && Array.isArray(value)) {
      for (const item of value) collectImages(field.fields, item, out);
    }
  }
  return out;
}
