/**
 * Declarative description of every editable JSON file. The generic editor (components/FieldRenderer)
 * renders a form from these definitions — adding a field means editing this file only.
 *
 * A *section* is one page of the admin panel. It is made of one or more *parts*; each part edits one database file.
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
  /** A date: type it (many spellings understood) or pick it from a calendar. Stored as 2026-12-31, or "May 23, 2026" with `format: "long"`. */
  | (Base & { kind: "date"; format?: "iso" | "long"; required?: boolean })
  /** A time of day: type it or pick it from a clock. Stored as "2:30 PM". */
  | (Base & { kind: "time"; required?: boolean })
  | (Base & { kind: "select"; options: Option[]; required?: boolean })
  /** Select whose options are the committee sessions of executives.json. */
  | (Base & { kind: "session-select" })
  /** string[] — one text input per entry. */
  | (Base & { kind: "strings"; placeholder?: string; addLabel?: string })
  /** string[] chosen from a fixed set (a row of check boxes), kept in the order of `options`. */
  | (Base & { kind: "checks"; options: Option[] })
  /** string[] of student IDs, chosen from the members of executives.json (`currentOnly`: the current committee only). */
  | (Base & { kind: "members"; currentOnly?: boolean })
  /** string[] of project ids, chosen from projects.json (searchable). */
  | (Base & { kind: "projects" })
  /** Path relative to photos/ (e.g. "executives/ada.webp"); uploads go to photos/<folder>/. */
  | (Base & { kind: "image"; folder: string })
  /** A value the panel manages itself (an automatically assigned id) — shown, not editable. */
  | (Base & { kind: "readonly" })
  /** A nested object. `bare` leaves out the heading (the page already says what it is). */
  | (Base & { kind: "group"; fields: FieldDef[]; bare?: boolean })
  | (Base & {
      kind: "list";
      itemLabel: string;
      /** Title shown on the collapsed item. */
      title: (item: Record<string, unknown>, index: number) => string;
      /** Small tag next to the title (status, type…). */
      badge?: (item: Record<string, unknown>) => string | undefined;
      fields: FieldDef[];
      /** Creates a new item. `parent` is the object that holds the list, `taken` the ids already in use. */
      create: (ctx: { parent: Record<string, unknown>; taken: string[] }) => Record<string, unknown>;
      /** Key whose value must be unique inside the list (used for ids). */
      uniqueKey?: string;
      /**
       * The panel assigns this key itself (`prefix-xxxxxxxx`) when an item is created or duplicated and
       * fills it in for items that have none. Nobody types an id by hand.
       */
      autoId?: { key: string; prefix: string };
      collapsedByDefault?: boolean;
      /** Marks the item whose `itemKey` equals the parent object's `key` value with a "current" tag (the current committee). */
      currentMarker?: { key: string; itemKey: string };
      /** A new item is put at the top of the list instead of the end (newest first). */
      addAtStart?: boolean;
      /** Items cannot be added or deleted (the list only exists to be edited in place). */
      locked?: boolean;
      /**
       * How the website orders this list.
       *   "manual" (default) — in the order of the file, so the editor lets you drag / move items.
       *   "auto"             — the website sorts or looks items up itself; the order here has no effect,
       *                        so the editor shows no move controls and explains why (`orderNote`).
       */
      order?: "manual" | "auto";
      /** Sentence shown under the list heading that explains how the order is used. */
      orderNote?: string;
    });

export interface SectionPart {
  file: DocFile;
  /** Heading above this part when a section edits more than one file. */
  heading?: string;
  note?: string;
  fields: FieldDef[];
}

export type NavGroup = "pages" | "site";

export interface SectionDef {
  slug: string;
  title: string;
  description: string;
  group: NavGroup;
  /** Name of the icon in components/Icon.tsx. */
  icon: string;
  /** The website page this admin page mirrors (used by "See this page on the website" and the preview). */
  route: string;
  /** Not listed in the sidebar. The page still works at its address. */
  hidden?: boolean;
  /** The page is its own screen (src/app/<slug>/page.tsx), not a generated form; `parts` is empty. */
  custom?: boolean;
  parts: SectionPart[];
}

const SOCIAL_TYPES = ["linkedin", "github", "facebook", "email", "codeforces", "twitter", "instagram", "website"].map(
  (value) => ({ value }),
);

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * A new unique id such as "proj-9f3a1c7e". Random instead of a counter: a counter would hand out the id of a
 * deleted item again, and a project that is still pinned on the home page would silently point at a different one.
 */
export function newId(prefix: string, taken: readonly string[] = []): string {
  for (;;) {
    const bytes = new Uint8Array(4);
    globalThis.crypto.getRandomValues(bytes);
    const id = `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
    if (!taken.includes(id)) return id;
  }
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
  { kind: "text", key: "profile_link", label: "Profile page", mono: true, help: "Optional. Created and edited under Member files." },
  { kind: "text", key: "cv_link", label: "CV page", mono: true, help: "Optional. Created and edited under Member files." },
  socialsField,
];

/** The block heading fields used all over site.json: small label, title, highlighted word. */
const headingFields = (extra: FieldDef[] = []): FieldDef[] => [
  { kind: "text", key: "eyebrow", label: "Small label", required: true, help: "Printed above the heading as “// label”." },
  { kind: "text", key: "title", label: "Heading", required: true },
  { kind: "text", key: "accent", label: "Highlighted part", required: true, help: "Printed after the heading, in the accent colour." },
  ...extra,
];


export const NAV_ICONS: Option[] = ["home", "people", "history", "box", "trophy", "calendar", "info", "book", "badge"].map((value) => ({ value }));

const NAV_PAGES: Option[] = [
  { value: "/", label: "Home" },
  { value: "/exec", label: "Executives" },
  { value: "/alumni", label: "Past executives" },
  { value: "/projects", label: "Projects & publications" },
  { value: "/achievements", label: "Achievements" },
  { value: "/events", label: "Events" },
  { value: "/about", label: "About / contact" },
  { value: "/courses", label: "Courses" },
  { value: "/certificate", label: "Verify certificate" },
];

export const TERMINAL_COMMANDS: Option[] = [
  { value: "about" },
  { value: "stats" },
  { value: "team" },
  { value: "projects" },
  { value: "achievements" },
  { value: "events" },
  { value: "alumni" },
  { value: "verify" },
  { value: "join" },
];

/** The committees list of executives.json: every committee, the current one tagged. The website shows the current one on Executives and the others on Past Executives. */
function committeesField(): FieldDef {
  return {
    kind: "list",
    key: "committees",
    label: "Committees",
    itemLabel: "committee",
    currentMarker: { key: "current_committee", itemKey: "session" },
    addAtStart: true,
    title: (c) => `${str(c.label) || str(c.session) || "New committee"}`,
    uniqueKey: "session",
    orderNote: "The current committee is shown on the Executives page; the others appear on the Past Executives page in this order (newest first).",
    create: () => ({ session: "", label: "", members: [] }),
    fields: [
      { kind: "text", key: "session", label: "Session ID", required: true, mono: true, placeholder: "2027-28", help: "No spaces, e.g. 2027-28." },
      { kind: "text", key: "label", label: "Label", required: true, placeholder: "2027 – 2028" },
      {
        kind: "number",
        key: "total_members",
        label: "Total members",
        help: "Optional. Fill it in and the home page stat reads MEMBERS with this number; leave it empty and the home page counts the executives listed below and reads EXECUTIVES.",
      },
              {
        kind: "list",
        key: "members",
        label: "Members",
        itemLabel: "member",
        title: (m) => [str(m.name) || "New member", str(m.role)].filter(Boolean).join(" — "),
        uniqueKey: "student_id",
        collapsedByDefault: true,
        orderNote: "Cards appear on the website in this order.",
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
  };
}

/** The heading block of a website page (small label, title, highlighted word, description) — it comes first, as on the website. */
function pageHeadingPart(key: string, heading = "Page heading"): SectionPart {
  return {
    file: "site.json",
    heading,
    fields: [
      {
        kind: "group",
        key: "pages",
        label: "Page headings",
        bare: true,
        fields: [{ kind: "group", key, label: "Heading", bare: true, fields: [...headingFields(), { kind: "textarea", key: "description", label: "Description", rows: 2, required: true }] }],
      },
    ],
  };
}

export const SECTIONS: SectionDef[] = [
  // ── Content ────────────────────────────────────────────────────────────────
  {
    slug: "executives",
    title: "Executives",
    description: "All committees and their members. The current committee is shown on the website’s Executives page, the others on Past Executives.",
    group: "pages",
    icon: "people",
    route: "/exec",
    parts: [
      {
        file: "executives.json",
        heading: "Committees",
        note: "Starting a new session? Press “Add committee”, fill in its members, then choose it as the current committee — the previous one moves to Past Executives by itself.",
        fields: [{ kind: "session-select", key: "current_committee", label: "Current committee" }, committeesField()],
      },
      pageHeadingPart("exec", "Executives page heading"),
      pageHeadingPart("alumni", "Past Executives page heading"),
    ],
  },
  {
    slug: "projects",
    title: "Projects & Publications",
    description: "Club projects and publications — the cards on the website’s Projects page.",
    group: "pages",
    icon: "box",
    route: "/projects",
    parts: [
      pageHeadingPart("projects"),
      {
        heading: "Projects",
        file: "projects.json",
        fields: [
          {
            kind: "list",
            key: "projects",
            label: "Projects",
            itemLabel: "project",
            title: (p) => str(p.title) || "New project",
            badge: (p) => str(p.status) || undefined,
            collapsedByDefault: true,
            uniqueKey: "id",
            autoId: { key: "id", prefix: "proj" },
            orderNote: "Featured projects are listed first, then the rest in this order. A project titled “Club Website” is always pinned on top. Which projects appear on the home page is chosen on the Home page.",
            create: ({ taken }) => ({ id: newId("proj", taken), title: "", description: "", status: "active", tags: [], members: [], year: String(new Date().getFullYear()) }),
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
    ],
  },
  {
    slug: "events",
    title: "Events",
    description: "Workshops, contests and meetups — the schedule on the website’s Events page.",
    group: "pages",
    icon: "calendar",
    route: "/events",
    parts: [
      pageHeadingPart("events"),
      {
        heading: "Events",
        file: "events.json",
        fields: [
          { kind: "text", key: "note", label: "Footer note", help: "Shown below the events list." },
          {
            kind: "list",
            key: "events",
            label: "Events",
            itemLabel: "event",
            title: (e) => [str(e.date), str(e.title) || "New event"].filter(Boolean).join(" · "),
            badge: (e) => str(e.type) || undefined,
            uniqueKey: "id",
            autoId: { key: "id", prefix: "ev" },
            collapsedByDefault: true,
            order: "auto",
            orderNote: "The website sorts events by date (soonest first) and hides the ones that are over, so the order here does not matter.",
            create: ({ taken }) => ({ id: newId("ev", taken), title: "", date: "", time: "", location: "", audience: "", type: "workshop" }),
            fields: [
              { kind: "text", key: "title", label: "Title", required: true },
              { kind: "date", key: "date", label: "Date", required: true },
              { kind: "time", key: "time", label: "Time", required: true },
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
    ],
  },
  {
    slug: "achievements",
    title: "Achievements",
    description: "Competition results and recognitions, plus the tally strip at the top of the page.",
    group: "pages",
    icon: "trophy",
    route: "/achievements",
    parts: [
      pageHeadingPart("achievements"),
      {
        heading: "Tally and achievements",
        file: "achievements.json",
        fields: [
          {
            kind: "list",
            key: "tally",
            label: "Tally strip",
            itemLabel: "counter",
            title: (t) => `${str(t.value)} ${str(t.label)}`.trim() || "New counter",
            orderNote: "Shown left to right in this order.",
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
            badge: (a) => str(a.tier) || undefined,
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
    ],
  },

  // ── Website texts ──────────────────────────────────────────────────────────
  {
    slug: "home",
    title: "Home",
    description: "The website’s home page, top to bottom: hero, pinned projects and team, join banner, and the terminal.",
    group: "pages",
    icon: "home",
    route: "/",
    parts: [
      {
        file: "home.json",
        heading: "Pinned on the home page",
        fields: [
          {
            kind: "members",
            key: "pinned_executives",
            label: "Meet the team",
            currentOnly: true,
            help: "Pick members of the current committee. Only these appear on the home page, in this order. Leave empty to hide the block.",
          },
          {
            kind: "projects",
            key: "pinned_projects",
            label: "Top projects",
            help: "Search and pick the projects to show on the home page, in this order. Leave empty to hide the block.",
          },
        ],
      },
      {
        file: "site.json",
        heading: "Hero and sections",
        fields: [
          {
            kind: "group",
            key: "home",
            label: "Hero",
            bare: true,
            fields: [
              { kind: "text", key: "tag", label: "Tag line", required: true, help: "Printed after “Est. <year> ·” above the hero heading." },
              { kind: "strings", key: "title_lines", label: "Heading lines", addLabel: "Add line", help: "Line 1 is plain, line 2 is highlighted, line 3 is dimmed." },
              { kind: "textarea", key: "description", label: "Description", rows: 3, required: true },
              {
                kind: "list",
                key: "pills",
                label: "Focus pills",
                itemLabel: "pill",
                title: (p) => str(p.label) || "New pill",
                create: () => ({ label: "", style: "ml" }),
                orderNote: "Shown left to right in this order.",
                fields: [
                  { kind: "text", key: "label", label: "Text", required: true, placeholder: "🐍 Python", help: "An emoji at the start is fine." },
                  {
                    kind: "select",
                    key: "style",
                    label: "Colour",
                    required: true,
                    options: [
                      { value: "py", label: "Yellow" },
                      { value: "rp", label: "Blue" },
                      { value: "ml", label: "Purple" },
                      { value: "st", label: "Green" },
                    ],
                  },
                ],
              },
              { kind: "group", key: "projects_block", label: "“Top projects” block", fields: headingFields([{ kind: "text", key: "link_label", label: "Link text", required: true }]) },
              { kind: "group", key: "team_block", label: "“Club leadership” block", fields: headingFields([{ kind: "text", key: "link_label", label: "Link text", required: true }]) },
              {
                kind: "group",
                key: "join",
                label: "“Join us” banner",
                fields: headingFields([
                  { kind: "textarea", key: "text", label: "Text", rows: 2, required: true },
                  { kind: "text", key: "button_label", label: "Button text", required: true },
                ]),
              },
            ],
          },
          {
            kind: "group",
            key: "terminal",
            label: "Terminal",
            fields: [
              { kind: "text", key: "title", label: "Window title", required: true },
              { kind: "text", key: "tagline", label: "Tagline (about)", required: true },
              { kind: "text", key: "motto", label: "Motto (about)", required: true, help: "Printed after “# est. <year> —”." },
              { kind: "text", key: "focus", label: "Focus line (about)", required: true },
              { kind: "text", key: "join_text", label: "Join message", required: true },
              {
                kind: "checks",
                key: "commands",
                label: "Command buttons",
                options: TERMINAL_COMMANDS,
                help: "The command buttons shown under the terminal on the home page.",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "about",
    title: "About / Contact",
    description: "The About / Contact page: heading, mission cards, meetup times and the contact banner.",
    group: "pages",
    icon: "info",
    route: "/about",
    parts: [
      {
        file: "site.json",
        fields: [
          {
            kind: "group",
            key: "about",
            label: "About page",
            bare: true,
            fields: [
              ...headingFields([{ kind: "textarea", key: "description", label: "Description", rows: 2, required: true }]),
              {
                kind: "list",
                key: "cards",
                label: "Cards",
                itemLabel: "card",
                title: (c) => str(c.title) || "New card",
                orderNote: "Numbered 01, 02, … automatically, in this order.",
                create: () => ({ title: "", text: "" }),
                fields: [
                  { kind: "text", key: "title", label: "Title", required: true },
                  { kind: "textarea", key: "text", label: "Text", rows: 4, required: true },
                  { kind: "checkbox", key: "wide", label: "Wide card (spans both columns)" },
                ],
              },
              {
                kind: "list",
                key: "meetups",
                label: "Meetups",
                itemLabel: "meetup",
                title: (m) => [str(m.title), str(m.label)].filter(Boolean).join(" — ") || "New meetup",
                orderNote: "Shown left to right in this order.",
                create: () => ({ label: "", title: "", detail: "" }),
                fields: [
                  { kind: "text", key: "label", label: "Label", required: true, placeholder: "WEEKLY MEETUP" },
                  { kind: "text", key: "title", label: "When", required: true, placeholder: "Every Thursday" },
                  { kind: "text", key: "detail", label: "Time and place", required: true, placeholder: "3:00 PM · Room 406" },
                ],
              },
              {
                kind: "group",
                key: "contact",
                label: "Contact banner",
                fields: [
                  { kind: "text", key: "title", label: "Heading", required: true },
                  { kind: "text", key: "accent", label: "Highlighted part", required: true },
                  { kind: "textarea", key: "text", label: "Text", rows: 2, required: true },
                  { kind: "text", key: "button_label", label: "Button text", required: true, help: "The button opens an e-mail to the club address (Club details)." },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "settings",
    title: "Site settings",
    description: "Settings that belong to the whole website, not to one page: the club’s name and contact details, and the sidebar menu.",
    group: "site",
    icon: "gear",
    route: "/",
    parts: [
      {
        file: "site.json",
        heading: "Club details",
        fields: [
          {
            kind: "group",
            key: "club",
            label: "Club",
            bare: true,
            fields: [
              { kind: "text", key: "name", label: "Logo word", required: true, help: "Printed before the dot: “Statistics.”" },
              { kind: "text", key: "subtitle", label: "Logo subtitle", required: true, help: "Printed under the logo as “// subtitle”." },
              { kind: "text", key: "full_name", label: "Full name", required: true },
              { kind: "number", key: "founded", label: "Founded (year)", help: "Drives “Est.” and the Years counter on the home page." },
              { kind: "text", key: "department", label: "Department", required: true },
              { kind: "text", key: "university", label: "University", required: true },
              { kind: "text", key: "email", label: "Contact e-mail", required: true, mono: true, help: "Used in the footer and by the contact button." },
              { kind: "text", key: "browser_title", label: "Browser tab title", required: true },
              { kind: "textarea", key: "description", label: "Search description", rows: 3, required: true, help: "Shown by search engines." },
              { kind: "text", key: "share_description", label: "Share description", required: true, help: "Shown when a link is shared on social networks." },
            ],
          },
        ],
      },
      {
        file: "site.json",
        heading: "Sidebar menu",
        fields: [
          {
            kind: "list",
            key: "nav",
            label: "Menu entries",
            itemLabel: "entry",
            title: (n) => str(n.label) || "New entry",
            uniqueKey: "path",
            orderNote: "Shown top to bottom in this order, in the sidebar and in the mobile menu.",
            create: ({ taken }) => ({ path: NAV_PAGES.find((o) => !taken.includes(o.value))?.value ?? "/", label: "", icon: "info" }),
            fields: [
              { kind: "select", key: "path", label: "Page", required: true, options: NAV_PAGES },
              { kind: "text", key: "label", label: "Label", required: true },
              { kind: "select", key: "icon", label: "Icon", required: true, options: NAV_ICONS },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: "courses",
    title: "Courses",
    description: "Courses and certifications — the cards on the website’s Courses page.",
    group: "pages",
    icon: "book",
    route: "/courses",
    parts: [
      pageHeadingPart("courses"),
      {
        heading: "Courses",
        file: "courses.json",
        fields: [
          {
            kind: "list",
            key: "courses",
            label: "Courses",
            itemLabel: "course",
            title: (c) => str(c.title) || "New course",
            badge: (c) => str(c.type) || undefined,
            uniqueKey: "id",
            autoId: { key: "id", prefix: "c" },
            collapsedByDefault: true,
            orderNote: "The website lists featured courses first, then the newest year first. Drag courses to choose the order among those with the same year.",
            create: ({ taken }) => ({ id: newId("c", taken), title: "", provider: "", description: "", type: "course", year: String(new Date().getFullYear()) }),
            fields: [
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
    ],
  },
  {
    slug: "certificates",
    title: "Certificates",
    description: "Certificates the club issued, checked on the website’s verification page — one file per set, in their own repository.",
    group: "pages",
    icon: "badge",
    route: "/certificate",
    custom: true,
    // The registry is its own screen (src/components/certificates) with its own store and its own repository.
    // Only the verification page's heading is a normal form, and it is edited here:
    parts: [pageHeadingPart("certificate", "Verification page heading")],
  },
];

export function sectionBySlug(slug: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.slug === slug);
}

/** Every (file, fields) pair of the panel — a file can be edited by several sections. */
export function allParts(): SectionPart[] {
  return SECTIONS.flatMap((s) => s.parts);
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
    } else if (field.kind === "group") {
      collectImages(field.fields, value, out);
    }
  }
  return out;
}

/**
 * Gives every item of an `autoId` list an id: items without one get a fresh one, and a second item that reuses
 * an id gets a fresh one too (the first keeps it). Returns the same object when nothing had to change.
 */
export function ensureAutoIds<T>(file: DocFile, doc: T): T {
  let result = doc;
  for (const part of allParts()) {
    if (part.file !== file) continue;
    for (const field of part.fields) {
      if (field.kind !== "list" || !field.autoId) continue;
      const { key: idKey, prefix } = field.autoId;
      const items = (result as Record<string, unknown>)?.[field.key];
      if (!Array.isArray(items)) continue;
      const seen = new Set<string>();
      let changed = false;
      const next = items.map((item: Record<string, unknown>) => {
        const id = typeof item[idKey] === "string" ? (item[idKey] as string) : "";
        if (id && !seen.has(id)) {
          seen.add(id);
          return item;
        }
        changed = true;
        const fresh = newId(prefix, [...seen]);
        seen.add(fresh);
        return { ...item, [idKey]: fresh };
      });
      if (changed) result = { ...(result as object), [field.key]: next } as T;
    }
  }
  return result;
}

/** The admin menu lists the pages in the same order as the website's sidebar. */
const MENU_ORDER = ["home", "executives", "projects", "achievements", "events", "courses", "certificates", "about", "settings"];
SECTIONS.sort((a, b) => MENU_ORDER.indexOf(a.slug) - MENU_ORDER.indexOf(b.slug));
