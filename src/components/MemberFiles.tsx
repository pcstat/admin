"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SourceDialog } from "@/components/member/SourceDialog";
import type { Found } from "@/components/member/MemberEditor";
import { classifyLink, describeLink, isExternalLink } from "@/lib/member-source";
import { stringify, TEMPLATES, type MemberKind } from "@/lib/member-schema";
import { slugify } from "@/lib/paths";
import type { ExecutivesDoc } from "@/lib/types";
import { useContentStore } from "@/store/content-store";

/** Overview of every member's profile and CV — each opens in the three-mode editor. */
export function MemberFiles() {
  const router = useRouter();
  const executives = useContentStore((s) => s.docs["executives.json"]?.draft as ExecutivesDoc | undefined);
  const drafts = useContentStore((s) => s.memberDrafts);
  const [source, setSource] = useState<Found | null>(null);

  const rows: Found[] = (executives?.committees ?? []).flatMap((c, ci) =>
    c.members.map((member, mi) => ({ member, ci, mi, committeeLabel: c.label || c.session, isCurrent: c.session === executives?.current_committee })),
  );

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

  return (
    <>
      <h1>Member files</h1>
      <p className="lead">
        The magazine-style profile and the CV of each member. Open one to edit it on a page that mirrors the website (<em>UI mode</em>), as raw JSON with editor helpers (<em>JSON mode</em>), or to see it exactly as visitors do (<em>Preview</em>).
        A member can also keep their files in their <strong>own GitHub repository</strong> and edit them without access to this panel — use “Source…”.
      </p>
      <table className="table">
        <thead>
          <tr><th>Member</th><th>Profile</th><th>CV</th><th>Source</th></tr>
        </thead>
        <tbody>
          {rows.map((found) => (
            <tr key={`${found.committeeLabel}-${found.member.student_id}`}>
              <td>{found.member.name}<br /><small>{found.committeeLabel}</small></td>
              <td>{cell(found, "profile")}</td>
              <td>{cell(found, "cv")}</td>
              <td><button className="btn small ghost" onClick={() => setSource(found)}>Source…</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {source && <SourceDialog open onClose={() => setSource(null)} found={source} />}
    </>
  );
}
