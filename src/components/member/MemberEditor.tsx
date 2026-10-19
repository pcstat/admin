"use client";

import { useTheme } from "@/lib/theme";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { JsonEditor } from "@/components/json/JsonEditor";
import { CvMirror } from "@/mirror/CvMirror";
import { ProfileMirror } from "@/mirror/ProfileMirror";
import { describeLink, isExternalLink } from "@/lib/member-source";
import { parseJson, stringify, TEMPLATES, type Json, type MemberKind } from "@/lib/member-schema";
import { slugify } from "@/lib/paths";
import type { ExecutivesDoc, Member } from "@/lib/types";
import { photoUrl, useContentStore } from "@/store/content-store";
import { ModePanel, type Mode } from "./ModePanel";
import { SourceDialog } from "./SourceDialog";
import { WEBSITE_URL } from "@/lib/site-config";


/** Same wording as the website's formatExecutiveRole. */
function roleLabel(member: Member, isCurrent: boolean): string {
  if (!member.role) return "";
  const prefix = isCurrent ? "" : "Former ";
  return `${prefix}${member.role.toLowerCase().startsWith("club ") ? member.role : `Club ${member.role}`}`;
}

export interface Found {
  member: Member;
  ci: number;
  mi: number;
  committeeLabel: string;
  isCurrent: boolean;
}

function findMember(doc: ExecutivesDoc | undefined, id: string): Found | null {
  for (const [ci, c] of (doc?.committees ?? []).entries()) {
    const mi = c.members.findIndex((m) => m.student_id === id);
    const member = c.members[mi];
    if (member) return { member, ci, mi, committeeLabel: c.label || c.session, isCurrent: c.session === doc?.current_committee };
  }
  return null;
}

export function MemberEditor({ id, kind }: { id: string; kind: MemberKind }) {
  const executives = useContentStore((s) => s.docs["executives.json"]?.draft as ExecutivesDoc | undefined);
  const found = useMemo(() => findMember(executives, id), [executives, id]);

  if (!found) {
    return (
      <div className="page-narrow">
        <h1>Member not found</h1>
        <p className="lead">There is no member with the ID “{id}”. <Link href="/members">Back to member files</Link></p>
      </div>
    );
  }
  const link = (kind === "cv" ? found.member.cv_link : found.member.profile_link) ?? "";
  if (!link) return <NoFile found={found} kind={kind} />;
  return isExternalLink(link) ? <ExternalFile key={link} found={found} kind={kind} link={link} /> : <ClubFile key={link} found={found} kind={kind} link={link} />;
}

// ── no file yet ──────────────────────────────────────────────────────────────

function NoFile({ found, kind }: { found: Found; kind: MemberKind }) {
  const router = useRouter();
  const [dialog, setDialog] = useState(false);
  const label = kind === "cv" ? "CV" : "profile";
  function create() {
    const { createMemberFile, setField } = useContentStore.getState();
    const path = `members/${slugify(found.member.name) || "member"}/${kind}.json`;
    createMemberFile(path, stringify(TEMPLATES[kind](found.member.name)));
    setField("executives.json", ["committees", found.ci, "members", found.mi, kind === "cv" ? "cv_link" : "profile_link"], path);
    router.refresh();
  }
  return (
    <div className="page-narrow">
      <h1>{found.member.name} — {label}</h1>
      <p className="lead">This member has no {label} yet. Keep it in the club database, or let them maintain it in their own GitHub repository.</p>
      <div className="row-actions">
        <button className="btn primary" onClick={create}>Create in the club database</button>
        <button className="btn" onClick={() => setDialog(true)}>Use the member’s own GitHub repo / link…</button>
      </div>
      <SourceDialog open={dialog} onClose={() => setDialog(false)} found={found} />
    </div>
  );
}

// ── file kept in the club database ───────────────────────────────────────────

function ClubFile({ found, kind, link }: { found: Found; kind: MemberKind; link: string }) {
  const draft = useContentStore((s) => s.memberDrafts[link]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (useContentStore.getState().memberDrafts[link]) return;
    useContentStore.getState().loadMemberFile(link).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [link]);

  if (error) return <div className="page-narrow"><h1>Could not load {link}</h1><p className="error-text">{error}</p></div>;
  if (!draft) return <div className="page-narrow"><p className="lead">Loading {link}…</p></div>;
  return (
    <EditorFrame
      found={found}
      kind={kind}
      link={link}
      text={draft.draft}
      isNew={draft.original === null}
      onText={(t) => useContentStore.getState().setMemberDraft(link, t)}
    />
  );
}

// ── file kept in the member's own repository / any link (read-only here) ─────

function ExternalFile({ found, kind, link }: { found: Found; kind: MemberKind; link: string }) {
  const [state, setState] = useState<{ text: string | null; error: string; loading: boolean }>({ text: null, error: "", loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/external?url=${encodeURIComponent(link)}`, { cache: "no-store" });
        const data = (await res.json()) as { text?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || typeof data.text !== "string") setState({ text: data.text ?? null, error: data.error || `Could not load (${res.status}).`, loading: false });
        else setState({ text: data.text, error: "", loading: false });
      } catch (err) {
        if (!cancelled) setState({ text: null, error: err instanceof Error ? err.message : String(err), loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [link, tick]);

  function reload() {
    setState((s) => ({ ...s, loading: true, error: "" }));
    setTick((t) => t + 1);
  }

  function importCopy() {
    if (state.text === null) return;
    if (!window.confirm("Copy this file into the club database? From then on the admin panel edits the copy, and the member's own repository is no longer used for this file.")) return;
    const { createMemberFile, setField } = useContentStore.getState();
    const path = `members/${slugify(found.member.name) || "member"}/${kind}.json`;
    createMemberFile(path, state.text);
    setField("executives.json", ["committees", found.ci, "members", found.mi, kind === "cv" ? "cv_link" : "profile_link"], path);
  }

  if (state.loading && state.text === null) return <div className="page-narrow"><p className="lead">Loading from {describeLink(link)}…</p></div>;
  return (
    <EditorFrame
      found={found}
      kind={kind}
      link={link}
      text={state.text ?? ""}
      readOnly
      loadError={state.error}
      onReload={reload}
      onImport={state.text !== null && !state.error ? importCopy : undefined}
    />
  );
}

// ── the three-mode editor ────────────────────────────────────────────────────

interface FrameProps {
  found: Found;
  kind: MemberKind;
  link: string;
  text: string;
  isNew?: boolean;
  readOnly?: boolean;
  loadError?: string;
  onText?: (text: string) => void;
  onReload?: () => void;
  onImport?: () => void;
}

function EditorFrame({ found, kind, link, text, isNew, readOnly = false, loadError, onText, onReload, onImport }: FrameProps) {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("mode");
  const mode: Mode = requested === "json" || requested === "preview" ? requested : "ui";
  const [theme] = useTheme(); // the one site-wide theme (sidebar switch) — the mirrored website pages follow it
  const [dialog, setDialog] = useState(false);
  const view = useContentStore(useShallow((s) => ({ uploads: s.uploads, provider: s.provider, imageBase: s.imageBase })));

  // Undo / redo for edits made in UI mode (JSON mode has the editor's own history).
  const [history, setHistory] = useState<{ past: string[]; future: string[] }>({ past: [], future: [] });

  const parsed = useMemo(() => parseJson(text), [text]);
  const external = isExternalLink(link);

  const setMode = useCallback(
    (next: Mode) => {
      setHistory({ past: [], future: [] });
      const q = new URLSearchParams(params.toString());
      q.set("mode", next);
      router.replace(`?${q.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const update = useCallback(
    (fn: (data: Json) => Json) => {
      if (readOnly || !onText || !parsed.value) return;
      const next = stringify(fn(parsed.value));
      if (next === text || next.trimEnd() === text.trimEnd()) return;
      setHistory((h) => ({ past: [...h.past, text], future: [] }));
      onText(next);
    },
    [readOnly, onText, parsed.value, text],
  );

  function undo() {
    const prev = history.past[history.past.length - 1];
    if (prev === undefined || !onText) return;
    setHistory({ past: history.past.slice(0, -1), future: [text, ...history.future] });
    onText(prev);
  }
  function redo() {
    const next = history.future[0];
    if (next === undefined || !onText) return;
    setHistory({ past: [...history.past, text], future: history.future.slice(1) });
    onText(next);
  }

  const photoSrc = useCallback(
    (value: string) => {
      if (/^(https?:|data:|blob:)/i.test(value)) return value;
      if (external) {
        try {
          return new URL(value, link).href; // a photo file next to the member's own profile.json
        } catch {
          return value;
        }
      }
      return photoUrl(value, view);
    },
    [external, link, view],
  );
  const onPickPhoto = useCallback((file: File) => useContentStore.getState().stageImage(file, "executives"), []);

  const other: MemberKind = kind === "cv" ? "profile" : "cv";
  const goOther = () => router.push(`/members/${encodeURIComponent(found.member.student_id)}/${other}?mode=${mode === "json" ? "ui" : mode}`);
  const editable = mode === "ui" && !readOnly;
  const siteLink = WEBSITE_URL ? `${WEBSITE_URL.replace(/\/$/, "")}/${kind}/?id=${encodeURIComponent(found.member.student_id)}` : undefined;

  const mirror =
    parsed.value &&
    (kind === "profile" ? (
      <ProfileMirror data={parsed.value} editable={editable} update={update} member={found.member} theme={theme} photoSrc={photoSrc} onPickPhoto={external ? undefined : onPickPhoto} onOpenCv={goOther} />
    ) : (
      <CvMirror data={parsed.value} editable={editable} update={update} member={found.member} roleLabel={roleLabel(found.member, found.isCurrent)} theme={theme} photoSrc={photoSrc} onOpenProfile={goOther} />
    ));

  return (
    <div className="member-editor">
      <div className="member-main">
        <div className="member-head">
          <div>
            <p className="crumbs"><Link href="/members">Member files</Link> / {found.member.name}</p>
            <h1>
              {found.member.name} — {kind === "cv" ? "CV" : "Profile"}
              {isNew && <span className="badge warn">new file</span>}
            </h1>
          </div>
          <code className="path">{external ? describeLink(link) : link}</code>
        </div>

        {external && (
          <div className="notice">
            <strong>Maintained by the member</strong> in <code>{describeLink(link)}</code>. The panel only reads it — they edit their own file, and the website shows the latest version without a rebuild.
            {" "}You can look at it in every mode; to edit it here, copy it into the club database.
          </div>
        )}
        {loadError && <div className="notice bad">{loadError}</div>}

        {mode === "json" ? (
          <JsonEditor value={text} onChange={onText} readOnly={readOnly} kind={kind} />
        ) : parsed.value ? (
          mirror
        ) : (
          <div className="notice bad">
            {text ? <>The file is not valid JSON yet ({parsed.error}). </> : <>The file is empty. </>}
            <button className="btn small" onClick={() => setMode("json")}>Fix it in JSON mode</button>
          </div>
        )}
      </div>

      <ModePanel
        mode={mode}
        onMode={setMode}
        kind={kind}
        readOnly={readOnly}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={undo}
        onRedo={redo}
        sourceLabel={external ? describeLink(link) : "Club database"}
        onChangeSource={() => setDialog(true)}
        onReload={onReload}
        onImport={onImport}
        otherLabel={other === "cv" ? "CV" : "profile"}
        onOther={goOther}
        siteLink={siteLink}
      />
      <SourceDialog open={dialog} onClose={() => setDialog(false)} found={found} />
    </div>
  );
}
