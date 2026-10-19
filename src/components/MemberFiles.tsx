"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SourceDialog } from "@/components/member/SourceDialog";
import type { Found } from "@/components/member/MemberEditor";
import { fileFields, hasQuery, highlightParts, parseQuery, search, type ParsedQuery, type SearchRecord, type SearchResult } from "@/lib/member-search";
import { classifyLink, describeLink, isExternalLink } from "@/lib/member-source";
import { stringify, TEMPLATES, type MemberKind } from "@/lib/member-schema";
import { slugify } from "@/lib/paths";
import type { Achievement, ExecutivesDoc, Project } from "@/lib/types";
import { useContentStore } from "@/store/content-store";
import { Icon } from "./Icon";

type Chip = "all" | "current" | "past" | "noProfile" | "noCv" | "edited";
type Sort = "name" | "committee";

const CHIPS: { id: Chip; label: string }[] = [
  { id: "all", label: "All" },
  { id: "current", label: "Current committee" },
  { id: "past", label: "Past committees" },
  { id: "noProfile", label: "No profile yet" },
  { id: "noCv", label: "No CV yet" },
  { id: "edited", label: "Edited" },
];

function Marked({ parts }: { parts: { text: string; mark: boolean }[] }) {
  return <>{parts.map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}

/** Overview of every member's profile and CV — each opens in the three-mode editor. */
export function MemberFiles() {
  const router = useRouter();
  const executives = useContentStore((s) => s.docs["executives.json"]?.draft as ExecutivesDoc | undefined);
  const drafts = useContentStore((s) => s.memberDrafts);
  const projects = useContentStore((s) => (s.docs["projects.json"]?.draft as { projects?: Project[] } | undefined)?.projects ?? []);
  const achievements = useContentStore((s) => (s.docs["achievements.json"]?.draft as { achievements?: Achievement[] } | undefined)?.achievements ?? []);
  const [source, setSource] = useState<Found | null>(null);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [deep, setDeep] = useState(false);
  const [failed, setFailed] = useState(0);
  const box = useRef<HTMLInputElement>(null);

  const rows: Found[] = useMemo(
    () => (executives?.committees ?? []).flatMap((c, ci) => c.members.map((member, mi) => ({ member, ci, mi, committeeLabel: c.label || c.session, isCurrent: c.session === executives?.current_committee }))),
    [executives],
  );

  // "/" jumps to the search box, like on most sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        box.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // "Search inside the files" reads every member file once (four at a time) so their text can be searched.
  const localLinks = useMemo(() => rows.flatMap((f) => [f.member.profile_link, f.member.cv_link]).filter((l): l is string => Boolean(l) && !isExternalLink(l as string)), [rows]);
  useEffect(() => {
    if (!deep) return;
    let cancelled = false;
    const queue = localLinks.filter((l) => !useContentStore.getState().memberDrafts[l]);
    const worker = async () => {
      while (queue.length && !cancelled) {
        const link = queue.shift()!;
        try {
          await useContentStore.getState().loadMemberFile(link);
        } catch {
          setFailed((n) => n + 1);
        }
      }
    };
    void Promise.all([worker(), worker(), worker(), worker()]);
    return () => {
      cancelled = true;
    };
  }, [deep, localLinks]);
  const loaded = localLinks.filter((l) => drafts[l]).length;
  const reading = deep && loaded + failed < localLinks.length;

  const records: SearchRecord[] = useMemo(
    () =>
      rows.map((f) => {
        const m = f.member;
        const profile = m.profile_link ?? "";
        const cv = m.cv_link ?? "";
        const changed = (l: string) => Boolean(l) && Boolean(drafts[l]) && drafts[l]!.draft !== drafts[l]!.original;
        const titleFields = [
          { label: "Name", text: m.name },
          { label: "Role", text: [m.role, m.role_display].filter(Boolean).join(" ") },
          { label: "ID", text: m.student_id },
          { label: "Committee", text: f.committeeLabel },
        ];
        return {
          key: `${f.committeeLabel}-${m.student_id}`,
          name: m.name,
          title: titleFields.map((x) => x.text).join(" "),
          titleFields,
          details: [
            { label: "Bio", text: m.bio ?? "" },
            { label: "Session", text: m.session ?? "" },
            ...(m.socials ?? []).map((s) => ({ label: s.label || s.type, text: `${s.label || s.type} ${s.url}` })),
            { label: "Profile page", text: profile },
            { label: "CV page", text: cv },
            // what the member took part in: the projects and achievements that list them
            ...projects.filter((p) => p.members?.includes(m.student_id)).map((p) => ({ label: "Project", text: p.title })),
            ...achievements.filter((a) => a.members?.includes(m.student_id)).map((a) => ({ label: "Achievement", text: `${a.title} ${a.event}` })),
            ...(deep ? [...fileFields("Profile", drafts[profile]?.draft), ...fileFields("CV", drafts[cv]?.draft)] : []),
          ].filter((d) => d.text.trim()),
          committee: `${f.committeeLabel} ${m.session ?? ""}`,
          role: [m.role, m.role_display].filter(Boolean).join(" "),
          id: m.student_id,
          isCurrent: f.isCurrent,
          hasProfile: Boolean(profile),
          hasCv: Boolean(cv),
          edited: changed(profile) || changed(cv),
        };
      }),
    [rows, drafts, deep, projects, achievements],
  );
  const foundByKey = useMemo(() => new Map(rows.map((f) => [`${f.committeeLabel}-${f.member.student_id}`, f])), [rows]);

  const parsed: ParsedQuery = useMemo(() => {
    const q = parseQuery(query);
    if (chip === "current") q.is.push("current");
    if (chip === "past") q.is.push("past");
    if (chip === "edited") q.is.push("edited");
    if (chip === "noProfile") q.no.push("profile");
    if (chip === "noCv") q.no.push("cv");
    return q;
  }, [query, chip]);
  const outcome = useMemo(() => search(records, parsed), [records, parsed]);
  const sorted = useMemo(() => {
    if (query.trim() || sort === "name") return outcome.title;
    const order = new Map(rows.map((f, i) => [`${f.committeeLabel}-${f.member.student_id}`, i]));
    return [...outcome.title].sort((a, b) => (order.get(a.record.key) ?? 0) - (order.get(b.record.key) ?? 0));
  }, [outcome.title, sort, rows, query]);
  const total = outcome.title.length + outcome.details.length;
  const searching = hasQuery(parsed) && (query.trim() !== "" || chip !== "all");

  function create(found: Found, kind: MemberKind) {
    const { createMemberFile, setField } = useContentStore.getState();
    const path = `members/${slugify(found.member.name) || "member"}/${kind}.json`;
    createMemberFile(path, stringify(TEMPLATES[kind](found.member.name)));
    setField("executives.json", ["committees", found.ci, "members", found.mi, kind === "cv" ? "cv_link" : "profile_link"], path);
    router.push(`/members/${encodeURIComponent(found.member.student_id)}/${kind}`);
  }

  const cell = (found: Found, kind: MemberKind) => {
    const link = (kind === "cv" ? found.member.cv_link : found.member.profile_link) ?? "";
    const href = `/members/${encodeURIComponent(found.member.student_id)}/${kind}`;
    if (!link) return <button className="btn small ghost" onClick={() => create(found, kind)}>Create</button>;
    if (isExternalLink(link)) {
      return (
        <span className="cell-stack">
          <Link className="btn small" href={href}>View</Link>
          <small title={link}>{classifyLink(link) === "github" ? "GitHub · " : "Link · "}{describeLink(link)}</small>
        </span>
      );
    }
    return (
      <span className="cell-stack">
        <Link className="btn small" href={href}>Edit</Link>
        {drafts[link]?.original === null && <span className="badge warn">new</span>}
      </span>
    );
  };

  const table = (results: SearchResult[]) => (
    <table className="table member-table">
      <thead>
        <tr><th>Member</th><th>Profile</th><th>CV</th><th>Source</th></tr>
      </thead>
      <tbody>
        {results.map((r) => {
          const found = foundByKey.get(r.record.key);
          if (!found) return null;
          const words = parsed.words;
          return (
            <tr key={r.record.key}>
              <td data-label="Member">
                <strong><Marked parts={highlightParts(found.member.name, words)} /></strong>
                {found.isCurrent && <span className="tag tag-current">current</span>}
                <br />
                <small>
                  <Marked parts={highlightParts([found.member.role, found.committeeLabel].filter(Boolean).join(" · "), words)} />
                </small>
                {r.snippet && (
                  <small className="snippet">
                    <b>{r.snippet.label}</b> <Marked parts={r.snippet.parts} />
                    {r.snippet.fuzzy && <i> (close match)</i>}
                  </small>
                )}
              </td>
              <td data-label="Profile">{cell(found, "profile")}</td>
              <td data-label="CV">{cell(found, "cv")}</td>
              <td data-label="Source"><button className="btn small ghost" onClick={() => setSource(found)}>Source…</button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">{"// FILES"}</p>
        <h1>Member <span>files</span></h1>
        <p className="lead">
          Each member’s profile page and CV. Open one to edit it like the website, as raw text, or as visitors see it. Use “Source…” if a member keeps their files elsewhere.
        </p>
      </div>

      <div className="msearch">
        <div className="picker-box">
          <Icon name="search" size={16} />
          <input
            ref={box}
            type="text"
            value={query}
            placeholder="Search members — name, ID, role, bio, links…  (press / to search)"
            aria-label="Search members"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          />
          {query && (
            <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQuery("")}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
        <div className="msearch-options">
          <div className="checks">
            {CHIPS.map((c) => (
              <button key={c.id} type="button" className={`check-chip${chip === c.id ? " on" : ""}`} onClick={() => setChip(c.id)}>{c.label}</button>
            ))}
          </div>
          <div className="msearch-side">
            {!searching && (
              <label className="inline-select">Sort
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="name">Name A–Z</option>
                  <option value="committee">Committee order</option>
                </select>
              </label>
            )}
            <label className="toggle" title="Also look through the text of every profile and CV file (reads them once)">
              <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
              <span className="toggle-track" aria-hidden="true" />
              <span>Search inside profiles &amp; CVs</span>
            </label>
          </div>
        </div>
        {reading && <p className="hint">Reading files… {loaded + failed} of {localLinks.length}. Results update as they load.</p>}
        <details className="tips">
          <summary>Search tips</summary>
          <ul>
            <li>Type several words to narrow down — every word must match. Small typos are forgiven.</li>
            <li>Use quotes for an exact phrase: <code>&quot;machine learning&quot;</code></li>
            <li><code>committee:2025</code> · <code>role:president</code> · <code>id:2020</code> — match one part only.</li>
            <li><code>has:cv</code> · <code>no:profile</code> · <code>is:current</code> · <code>is:past</code> · <code>is:edited</code> — filter by what exists.</li>
          </ul>
        </details>
      </div>

      {!searching && (
        <section className="result-group">
          <h2 className="part-title">All members <span className="count">{sorted.length}</span></h2>
          {table(sorted)}
        </section>
      )}

      {searching && total > 0 && (
        <p className="result-summary" aria-live="polite">{total} {total === 1 ? "member" : "members"} found</p>
      )}
      {searching && outcome.title.length > 0 && (
        <section className="result-group">
          <h2 className="part-title">{parsed.words.length ? "Matches in name, role & committee" : "Members"} <span className="count">{outcome.title.length}</span></h2>
          {table(outcome.title)}
        </section>
      )}
      {searching && outcome.details.length > 0 && (
        <section className="result-group">
          <h2 className="part-title">Matches in details <span className="count">{outcome.details.length}</span></h2>
          <p className="hint">The word was not in the member’s name or role, but appears in their bio, links{deep ? " or files" : ""}.</p>
          {table(outcome.details)}
        </section>
      )}
      {searching && total === 0 && (
        <div className="no-results">
          <p><strong>No member matches “{query.trim() || CHIPS.find((c) => c.id === chip)?.label}”.</strong></p>
          {outcome.suggestions.length > 0 && (
            <p>Did you mean{" "}
              {outcome.suggestions.map((s, i) => (
                <span key={s}>{i > 0 && ", "}<button type="button" className="link-btn" onClick={() => setQuery(s)}>{s}</button></span>
              ))}
              ?
            </p>
          )}
          {!deep && <p>Tip: switch on <em>Search inside profiles &amp; CVs</em> to look through the text of their files too.</p>}
          {(chip !== "all" || query) && <button type="button" className="btn small" onClick={() => { setQuery(""); setChip("all"); }}>Clear search</button>}
        </div>
      )}
      {source && <SourceDialog open onClose={() => setSource(null)} found={source} />}
    </>
  );
}
