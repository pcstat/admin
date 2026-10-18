/**
 * Shapes of the JSON files in the database repo (see that repo's README).
 * The editors are driven by `schemas.ts`; these types are used for validation and typing.
 */

export interface DatabaseIndex {
  imageBase: string;
  executives: string;
  projects: string;
  events: string;
  courses: string;
  achievements: string;
  certificates: string;
  home: string;
}

export interface SocialLink {
  type: string;
  label: string;
  url: string;
}

export interface Member {
  student_id: string;
  initial: string;
  role?: string;
  role_display?: string;
  name: string;
  session: string;
  highlight?: boolean;
  bio?: string;
  socials?: SocialLink[];
  icon_link?: string;
  profile_link?: string;
  cv_link?: string;
}

export interface Committee {
  session: string;
  label: string;
  /** Number of club members. Set → the home page says "MEMBERS"; left out → it counts the executives ("EXECUTIVES"). */
  total_members?: number;
  members: Member[];
}

export interface ExecutivesDoc {
  current_committee: string;
  committees: Committee[];
}

export interface Project {
  id: string;
  title: string;
  description: string;
  status: string;
  tags?: string[];
  members?: string[];
  year: string;
  link?: string;
  demo_link?: string;
  featured?: boolean;
}

export interface Achievement {
  title: string;
  event: string;
  category: string;
  year: string;
  tier: string;
  team_label: string;
  members?: string[];
  featured?: boolean;
}

export interface ClubEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  audience: string;
  type: string;
  register_link?: string;
  details_link?: string;
}

export interface Course {
  id: string;
  title: string;
  provider: string;
  description: string;
  type: string;
  year: string;
  link?: string;
  featured?: boolean;
}

export interface IssuedCertificate {
  id: string;
  recipient: string;
  course?: string;
  course1?: string;
  course2?: string;
  date: string;
  status?: string;
  template?: string;
  reason?: string;
  reason2?: string;
  person1?: string;
  post1?: string;
  person2?: string;
  post2?: string;
  modules?: string;
  hours?: string;
  score?: string;
  grade?: string;
}

/** `home.json` — what the home page pins. */
export interface HomeConfig {
  pinned_executives: string[];
  pinned_projects: string[];
}

export interface DocMap {
  "executives.json": ExecutivesDoc;
  "projects.json": { projects: Project[] };
  "events.json": { note?: string; events: ClubEvent[] };
  "courses.json": { courses: Course[] };
  "achievements.json": { tally: { value: string; label: string }[]; achievements: Achievement[] };
  "certificates.json": { issued_certificates: IssuedCertificate[] };
  "home.json": HomeConfig;
}

export type DocFile = keyof DocMap;
export const DOC_FILES: DocFile[] = [
  "executives.json",
  "projects.json",
  "events.json",
  "courses.json",
  "achievements.json",
  "certificates.json",
  "home.json",
];

/** What `/api/data` sends to the browser. */
export interface DataResponse {
  provider: "local-fs" | "github";
  /** Absolute base URL of the photos folder, from database.json (used for previews in GitHub mode). */
  imageBase: string;
  /** Commit the data was read from — sent back on save to detect edits made in the meantime. */
  baseSha: string | null;
  docs: { [K in DocFile]: DocMap[K] };
  /** Existing files under members/ (e.g. "members/elon-musk/cv.json"). */
  memberFiles: string[];
}
