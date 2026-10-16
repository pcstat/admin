"use client";

import { useState } from "react";
import {
  checkGithubSource,
  classifyLink,
  DEFAULT_GITHUB,
  githubRawUrl,
  githubSourceFromLinks,
  normalizeJsonLink,
  type GithubSource,
  type SourceKind,
} from "@/lib/member-source";
import { stringify, TEMPLATES } from "@/lib/member-schema";
import { slugify } from "@/lib/paths";
import { useContentStore } from "@/store/content-store";
import type { Found } from "./MemberEditor";

type Check = { state: "idle" | "busy" | "ok" | "bad"; message: string };
const IDLE: Check = { state: "idle", message: "" };

async function testLink(url: string): Promise<Check> {
  try {
    const res = await fetch(`/api/external?url=${encodeURIComponent(url)}`, { cache: "no-store" });
    const data = (await res.json()) as { text?: string; error?: string };
    if (!res.ok) return { state: "bad", message: data.error || `Failed (${res.status})` };
    const parsed = JSON.parse(data.text ?? "null") as unknown;
    const name = parsed && typeof parsed === "object" ? (parsed as { name?: unknown }).name : undefined;
    return { state: "ok", message: typeof name === "string" && name ? `Found — “${name}”` : "Found — valid JSON" };
  } catch (err) {
    return { state: "bad", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Where does this member's profile and CV live? Writes `profile_link` / `cv_link` in executives.json. */
export function SourceDialog({ open, onClose, found }: { open: boolean; onClose: () => void; found: Found }) {
  if (!open) return null;
  return <DialogBody onClose={onClose} found={found} />;
}

function DialogBody({ onClose, found }: { onClose: () => void; found: Found }) {
  const { member, ci, mi } = found;
  const initialKind = (): SourceKind => (classifyLink(member.profile_link) === "club" ? classifyLink(member.cv_link) : classifyLink(member.profile_link));
  const [kind, setKind] = useState<SourceKind>(initialKind);
  const [gh, setGh] = useState<GithubSource>(() => githubSourceFromLinks(member.profile_link, member.cv_link) ?? DEFAULT_GITHUB);
  const [useProfile, setUseProfile] = useState(true);
  const [useCv, setUseCv] = useState(true);
  const [customProfile, setCustomProfile] = useState(classifyLink(member.profile_link) === "custom" ? (member.profile_link ?? "") : "");
  const [customCv, setCustomCv] = useState(classifyLink(member.cv_link) === "custom" ? (member.cv_link ?? "") : "");
  const [checks, setChecks] = useState<{ profile: Check; cv: Check }>({ profile: IDLE, cv: IDLE });

  const ghError = kind === "github" ? checkGithubSource(gh) : "";
  const urls = {
    profile: kind === "github" ? (!ghError && useProfile ? githubRawUrl(gh, gh.profileFile.trim()) : "") : kind === "custom" ? (normalizeJsonLink(customProfile) ?? "") : "",
    cv: kind === "github" ? (!ghError && useCv ? githubRawUrl(gh, gh.cvFile.trim()) : "") : kind === "custom" ? (normalizeJsonLink(customCv) ?? "") : "",
  };
  const customInvalid = kind === "custom" && ((customProfile.trim() && !urls.profile) || (customCv.trim() && !urls.cv));
  const nothing = kind !== "club" && !urls.profile && !urls.cv;
  const canApply = kind === "club" || (!ghError && !customInvalid && !nothing);

  async function test() {
    setChecks({ profile: urls.profile ? { state: "busy", message: "Checking…" } : IDLE, cv: urls.cv ? { state: "busy", message: "Checking…" } : IDLE });
    const [profile, cv] = await Promise.all([urls.profile ? testLink(urls.profile) : IDLE, urls.cv ? testLink(urls.cv) : IDLE]);
    setChecks({ profile, cv });
  }

  function apply() {
    const { setField, createMemberFile, memberDrafts, memberFiles } = useContentStore.getState();
    const at = (key: "profile_link" | "cv_link") => ["committees", ci, "members", mi, key] as (string | number)[];
    if (kind === "club") {
      const slug = slugify(member.name) || "member";
      for (const k of ["profile", "cv"] as const) {
        const current = k === "cv" ? member.cv_link : member.profile_link;
        if (current && classifyLink(current) === "club") continue; // already a club file
        const path = `members/${slug}/${k}.json`;
        if (!memberFiles.includes(path) && !memberDrafts[path]) createMemberFile(path, stringify(TEMPLATES[k](member.name)));
        setField("executives.json", at(k === "cv" ? "cv_link" : "profile_link"), path);
      }
    } else {
      // Only the files the member provides are switched; the other keeps its current link.
      if (urls.profile) setField("executives.json", at("profile_link"), urls.profile);
      if (urls.cv) setField("executives.json", at("cv_link"), urls.cv);
    }
    onClose();
  }

  const field = (label: string, key: keyof GithubSource, placeholder: string, hint?: string) => (
    <label className="field">
      <span>{label}</span>
      <input value={gh[key]} placeholder={placeholder} onChange={(e) => setGh({ ...gh, [key]: e.target.value })} spellCheck={false} />
      {hint && <small>{hint}</small>}
    </label>
  );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Where do the profile and CV live?">
        <h2>Where do {member.name}’s profile and CV live?</h2>
        <div className="seg">
          {([["club", "Club database"], ["github", "Member’s GitHub repo"], ["custom", "Other links"]] as const).map(([id, label]) => (
            <button key={id} type="button" className={`seg-btn${kind === id ? " active" : ""}`} onClick={() => { setKind(id); setChecks({ profile: IDLE, cv: IDLE }); }}>{label}</button>
          ))}
        </div>

        {kind === "club" && <p className="lead">The files are kept in the club database (<code>members/{slugify(member.name) || "member"}/…</code>) and edited with this panel. Missing files are created from a template.</p>}

        {kind === "github" && (
          <>
            <p className="lead">The member keeps <code>{gh.profileFile || "profile.json"}</code> and <code>{gh.cvFile || "cv.json"}</code> in a <strong>public</strong> repository and edits them there. The panel and the website read the latest version — no rebuild needed.</p>
            <div className="fields">
              {field("GitHub username", "user", "octocat")}
              {field("Repository name", "repo", "my-club-profile")}
              {field("Branch (optional)", "ref", "HEAD", "HEAD = the repository’s default branch")}
              {field("Folder (optional)", "dir", "", "Leave empty when the files are in the repository root")}
              {field("Profile file", "profileFile", "profile.json")}
              {field("CV file", "cvFile", "cv.json")}
            </div>
            <div className="row-actions">
              <label className="check"><input type="checkbox" checked={useProfile} onChange={(e) => setUseProfile(e.target.checked)} /> Use for the profile</label>
              <label className="check"><input type="checkbox" checked={useCv} onChange={(e) => setUseCv(e.target.checked)} /> Use for the CV</label>
            </div>
            {ghError && (gh.user || gh.repo) && <p className="error-text">{ghError}</p>}
          </>
        )}

        {kind === "custom" && (
          <>
            <p className="lead">Paste links to the JSON files. GitHub “blob” links and raw links both work; any public https link to a JSON file is fine. Leave a field empty to keep the current one.</p>
            <label className="field"><span>Profile JSON link</span><input value={customProfile} onChange={(e) => setCustomProfile(e.target.value)} placeholder="https://github.com/user/repo/blob/main/profile.json" spellCheck={false} /></label>
            <label className="field"><span>CV JSON link</span><input value={customCv} onChange={(e) => setCustomCv(e.target.value)} placeholder="https://raw.githubusercontent.com/user/repo/main/cv.json" spellCheck={false} /></label>
            {customInvalid && <p className="error-text">One of the links is not a valid http(s) address.</p>}
          </>
        )}

        {kind !== "club" && (urls.profile || urls.cv) && (
          <div className="resolved">
            {urls.profile && (
              <p><small>Profile →</small> <code>{urls.profile}</code> <span className={`chk ${checks.profile.state}`}>{checks.profile.message}</span></p>
            )}
            {urls.cv && (
              <p><small>CV →</small> <code>{urls.cv}</code> <span className={`chk ${checks.cv.state}`}>{checks.cv.message}</span></p>
            )}
          </div>
        )}

        <div className="modal-actions">
          {kind !== "club" && <button type="button" className="btn" disabled={!canApply} onClick={() => void test()}>Test the links</button>}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!canApply} onClick={apply}>Use this source</button>
        </div>
        <p className="modal-foot"><small>This changes the member’s entry in <code>executives.json</code>; it is published with the next Save.</small></p>
      </div>
    </div>
  );
}
