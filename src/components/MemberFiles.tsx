"use client";

import { useState } from "react";
import { slugify } from "@/lib/paths";
import type { ExecutivesDoc } from "@/lib/types";
import { useContentStore } from "@/store/content-store";

const isExternal = (v: string) => /^https?:\/\//i.test(v) || v.startsWith("/");

/** Minimal starting points — the full formats are in the database repo (.claude/skills/profile-cv-formatter/REFERENCE.md). */
const TEMPLATES = {
  profile: (name: string) => ({
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
  cv: (name: string) => ({
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

/**
 * Raw JSON editors for members/<slug>/profile.json and cv.json. Kept deliberately simple for now
 * (see the website's docs/TODO.md); the formats are described in the database repo's README.
 */
export function MemberFiles() {
  const executives = useContentStore((s) => s.docs["executives.json"]?.draft as ExecutivesDoc | undefined);
  const memberFiles = useContentStore((s) => s.memberFiles);
  const drafts = useContentStore((s) => s.memberDrafts);
  const { loadMemberFile, setMemberDraft, createMemberFile, setField } = useContentStore.getState();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [error, setError] = useState("");

  const members = (executives?.committees ?? []).flatMap((c, ci) => c.members.map((m, mi) => ({ m, ci, mi, committee: c.label || c.session })));

  async function open(path: string) {
    setError("");
    setOpenPath(path);
    try {
      await loadMemberFile(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function create(kind: "profile" | "cv", ci: number, mi: number, name: string, existingLink?: string) {
    const link = existingLink && !isExternal(existingLink) ? existingLink : `members/${slugify(name) || "member"}/${kind}.json`;
    createMemberFile(link, JSON.stringify(TEMPLATES[kind](name), null, 2));
    if (link !== existingLink) setField("executives.json", ["committees", ci, "members", mi, kind === "cv" ? "cv_link" : "profile_link"], link);
    setOpenPath(link);
  }

  const draft = openPath ? drafts[openPath] : undefined;
  let jsonError = "";
  if (draft) {
    try {
      JSON.parse(draft.draft);
    } catch (err) {
      jsonError = (err as Error).message;
    }
  }

  return (
    <>
      <h1>Member files</h1>
      <p className="lead">The optional magazine-style profile and the CV of each member. They are plain JSON files — see the database repo&apos;s README for the format.</p>
      <table className="table">
        <thead>
          <tr><th>Member</th><th>Profile</th><th>CV</th></tr>
        </thead>
        <tbody>
          {members.map(({ m, ci, mi, committee }) => (
            <tr key={m.student_id + committee}>
              <td>{m.name}<br /><small>{committee}</small></td>
              {(["profile", "cv"] as const).map((kind) => {
                const link = kind === "cv" ? m.cv_link : m.profile_link;
                const exists = !!link && (isExternal(link) || memberFiles.includes(link) || !!drafts[link]);
                return (
                  <td key={kind}>
                    {link && isExternal(link) ? (
                      <small>External link</small>
                    ) : link && exists ? (
                      <button className="btn small" onClick={() => void open(link)}>Edit</button>
                    ) : (
                      <button className="btn small ghost" onClick={() => create(kind, ci, mi, m.name, link)}>
                        Create
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {error && <p className="error-text">{error}</p>}
      {openPath && draft && (
        <section className="json-editor">
          <h3><code>{openPath}</code>{draft.original === null && <span className="badge warn">new file</span>}</h3>
          <textarea spellCheck={false} value={draft.draft} onChange={(e) => setMemberDraft(openPath, e.target.value)} rows={24} />
          <div className="json-foot">
            {jsonError ? <span className="error-text">Invalid JSON — {jsonError}</span> : <span className="ok-text">Valid JSON</span>}
            <button
              className="btn small ghost"
              disabled={!!jsonError}
              onClick={() => setMemberDraft(openPath, JSON.stringify(JSON.parse(draft.draft), null, 2))}
            >
              Format
            </button>
          </div>
        </section>
      )}
    </>
  );
}
