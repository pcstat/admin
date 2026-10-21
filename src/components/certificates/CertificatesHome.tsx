"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { rowsOf, parseQuery, searchRows, suggestNames, hasQuery } from "@/lib/certificates/search";
import { certificatesToCsv } from "@/lib/certificates/csv";
import { formatDateLong } from "@/lib/certificates/core";
import type { CertRow, SetFile } from "@/lib/certificates/types";
import { sectionBySlug } from "@/lib/schemas";
import { WEBSITE_URL } from "@/lib/site-config";
import { useCertificatesStore } from "@/store/certificates-store";
import { useContentStore } from "@/store/content-store";
import { Icon } from "../Icon";
import { FieldGroup } from "../FieldRenderer";
import { CertDrawer } from "./CertDrawer";

const PAGE = 50;
type Chip = "all" | "valid" | "revoked" | "new";
const CHIPS: { id: Chip; label: string; q: string }[] = [
  { id: "all", label: "All", q: "" },
  { id: "valid", label: "Valid", q: "is:valid" },
  { id: "revoked", label: "Revoked", q: "is:revoked" },
  { id: "new", label: "Unsaved", q: "is:new" },
];

export function download(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob(["\uFEFF" + text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10);

/** The certificate registry: find any certificate among thousands, open it, revoke it, export lists; and the sets (one file each). */
export function CertificatesHome() {
  const status = useCertificatesStore((s) => s.status);
  const loadError = useCertificatesStore((s) => s.loadError);
  const progress = useCertificatesStore((s) => s.progress);
  const sets = useCertificatesStore((s) => s.sets);
  const load = useCertificatesStore((s) => s.load);
  const docs = useContentStore((s) => s.docs);
  const section = sectionBySlug("certificates");

  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<{ code: string; personId: string } | null>(null);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

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

  const setList = useMemo(() => Object.values(sets).sort((a, b) => b.draft.certificate.date.localeCompare(a.draft.certificate.date) || a.draft.code.localeCompare(b.draft.code)), [sets]);
  // Rows are cached per set object, so editing one set does not rebuild the others.
  const allRows = useMemo(() => setList.flatMap((s) => rowsOf(s.draft, s.savedIds)), [setList]);

  const deferred = useDeferredValue(query);
  const chipQuery = CHIPS.find((c) => c.id === chip)!.q;
  const parsed = useMemo(() => parseQuery(`${deferred} ${chipQuery}`), [deferred, chipQuery]);
  const result = useMemo(() => searchRows(allRows, parsed), [allRows, parsed]);
  const visible = result.rows.slice(0, shown);
  const searching = hasQuery(parsed);
  const suggestions = result.total === 0 && searching ? suggestNames(allRows, parsed.words) : [];

  const keyOf = (r: CertRow) => `${r.setCode}|${r.id}`;
  const revokedCount = allRows.filter((r) => r.revoked).length;
  const thisYear = String(new Date().getFullYear());
  const issuedThisYear = allRows.filter((r) => r.date.startsWith(thisYear)).length;

  const picked = result.rows.filter((r) => selected.has(keyOf(r)));
  const allShownSelected = visible.length > 0 && visible.every((r) => selected.has(keyOf(r)));
  function toggleAll() {
    const next = new Set(selected);
    for (const r of visible) {
      if (allShownSelected) next.delete(keyOf(r));
      else next.add(keyOf(r));
    }
    setSelected(next);
  }
  function bulkRevoke() {
    const targets = picked.filter((r) => !r.revoked);
    if (!targets.length) return;
    const reason = window.prompt(`Revoke ${targets.length} certificate${targets.length === 1 ? "" : "s"}? They will show as REVOKED on the verification page.\n\nReason (shown to whoever verifies; may be left empty):`);
    if (reason === null) return;
    useCertificatesStore.getState().setRevoked(targets.map((r) => ({ code: r.setCode, personId: r.personId })), { date: today(), reason: reason.trim() || undefined });
    setSelected(new Set());
  }
  function bulkRestore() {
    const targets = picked.filter((r) => r.revoked);
    if (!targets.length) return;
    if (!window.confirm(`Restore ${targets.length} certificate${targets.length === 1 ? "" : "s"}? They will verify as valid again.`)) return;
    useCertificatesStore.getState().setRevoked(targets.map((r) => ({ code: r.setCode, personId: r.personId })), undefined);
    setSelected(new Set());
  }

  const exporting = picked.length ? picked : result.rows;

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">{"// WEBSITE PAGE"}</p>
        <h1>Certificate <span>registry</span></h1>
        <p className="lead">
          Every certificate the club issued, one file per set (“PY26”, “CONTEST26” …). Search all of them at once, open one to edit or revoke it, or start a new set — its file is created when you save.
        </p>
        {WEBSITE_URL && (
          <p className="file-note">
            <a className="see-site" href={`${WEBSITE_URL}/certificate`} target="_blank" rel="noreferrer">See the verification page on the website <Icon name="external" size={13} /></a>
          </p>
        )}
      </div>

      {status === "error" && (
        <div className="notice">
          <p className="error-text">Could not load the certificate registry: {loadError}</p>
          <button className="btn small" onClick={() => { useCertificatesStore.setState({ status: "idle" }); void load(); }}>Try again</button>
        </div>
      )}
      {status === "loading" && (
        <p className="hint cert-progress" role="status">Reading the registry… {progress.done} of {progress.total || "…"} sets</p>
      )}

      <div className="cert-stats">
        <div><strong>{setList.length}</strong><span>sets</span></div>
        <div><strong>{allRows.length}</strong><span>certificates</span></div>
        <div><strong>{issuedThisYear}</strong><span>dated {thisYear}</span></div>
        <div><strong>{revokedCount}</strong><span>revoked</span></div>
      </div>

      <div className="part">
        <div className="list-head">
          <h2 className="part-title">Sets <span className="count">{setList.length}</span></h2>
          <Link href="/certificates/set?new=1" className="btn primary small"><Icon name="plus" size={14} /> New set</Link>
        </div>
        {setList.length === 0 && status === "ready" && <p className="empty">No sets yet — create the first one.</p>}
        <ul className="cert-sets">
          {setList.map(({ draft, original, savedIds }) => (
            <SetCard key={draft.code} set={draft} isNew={original === null} savedCount={savedIds.size} onFind={() => { setQuery(`set:${draft.code} `); setChip("all"); setShown(PAGE); box.current?.focus(); }} />
          ))}
        </ul>
      </div>

      <div className="part">
        <div className="list-head">
          <h2 className="part-title">Find a certificate <span className="count">{result.total}</span></h2>
          <div className="list-tools">
            <button className="btn small ghost" disabled={exporting.length === 0} onClick={() => download(`certificates-${today()}.csv`, certificatesToCsv(exporting, WEBSITE_URL))}>
              <Icon name="copy" size={14} /> Export {picked.length ? `${picked.length} selected` : searching ? `${result.total} found` : "all"} (CSV)
            </button>
          </div>
        </div>

        <label className="picker-box cert-search">
          <Icon name="search" size={16} />
          <input
            ref={box}
            type="text"
            value={query}
            placeholder="Name, ID, title or set — try  alex  ·  7w34  ·  set:py26 is:revoked  ·  course:python year:2026   (press / to focus)"
            onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }}
            aria-label="Search certificates"
          />
          {query && <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQuery("")}><Icon name="close" size={14} /></button>}
        </label>
        <div className="chips cert-chips">
          {CHIPS.map((c) => (
            <button key={c.id} type="button" className={`btn small ${chip === c.id ? "primary" : "ghost"}`} onClick={() => { setChip(c.id); setShown(PAGE); }}>{c.label}</button>
          ))}
          <span className="hint cert-tip">Operators: <code>set:</code> <code>course:</code> <code>year:</code> <code>id:</code> <code>is:revoked</code> <code>has:note</code> <code>no:grade</code></span>
        </div>

        {picked.length > 0 && (
          <div className="cert-bulk">
            <strong>{picked.length} selected</strong>
            <button className="btn small" onClick={bulkRevoke} disabled={!picked.some((r) => !r.revoked)}>Revoke…</button>
            <button className="btn small" onClick={bulkRestore} disabled={!picked.some((r) => r.revoked)}>Restore</button>
            <button className="btn small ghost" onClick={() => setSelected(new Set())}>Clear selection</button>
          </div>
        )}

        <div className="cert-table-wrap">
          <table className="cert-table">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Select all shown" checked={allShownSelected} onChange={toggleAll} /></th>
                <th>Recipient</th>
                <th>Certificate ID</th>
                <th>Certificate</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={keyOf(r)} className={r.revoked ? "is-revoked" : ""} onClick={() => setOpen({ code: r.setCode, personId: r.personId })}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(keyOf(r))} onChange={() => {
                      const n = new Set(selected);
                      if (n.has(keyOf(r))) n.delete(keyOf(r));
                      else n.add(keyOf(r));
                      setSelected(n);
                    }} />
                  </td>
                  <td><button className="linklike" onClick={() => setOpen({ code: r.setCode, personId: r.personId })}>{r.name}</button></td>
                  <td className="mono">{r.id}</td>
                  <td>{r.title} <span className="tag">{r.setCode}</span></td>
                  <td>{formatDateLong(r.date)}</td>
                  <td>
                    {r.revoked ? <span className="tag cert-tag-revoked">revoked</span> : <span className="tag tag-active">valid</span>}
                    {r.isNew && <span className="tag tag-upcoming"> unsaved</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {status === "ready" && result.total === 0 && (
            <p className="empty">
              {allRows.length === 0 ? "No certificates yet." : `Nothing matches “${query.trim()}”.`}
              {suggestions.length > 0 && <> Did you mean {suggestions.map((n, i) => <span key={n}>{i ? ", " : ""}<button className="linklike" onClick={() => setQuery(n)}>{n}</button></span>)}?</>}
            </p>
          )}
        </div>
        {result.total > shown && (
          <button className="btn small add" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, result.total - shown)} more ({result.total - shown} left)</button>
        )}
      </div>

      {section?.parts.map((part, i) =>
        docs[part.file] ? (
          <div className="part" key={`${part.file}-${i}`}>
            <h2 className="part-title">{part.heading}</h2>
            <FieldGroup file={part.file} fields={part.fields} value={docs[part.file]!.draft as Record<string, unknown>} path={[]} />
          </div>
        ) : null,
      )}

      {open && <CertDrawer code={open.code} personId={open.personId} onClose={() => setOpen(null)} />}
    </>
  );
}

function SetCard({ set, isNew, savedCount, onFind }: { set: SetFile; isNew: boolean; savedCount: number; onFind: () => void }) {
  const people = Object.values(set.people);
  const revoked = people.filter((p) => p.revoked).length;
  const cert = set.certificate;
  return (
    <li className="cert-set">
      <div className="cert-set-main">
        <strong>{cert.title}</strong>
        <span className="hint">
          <span className="tag mono">{set.code}</span> {formatDateLong(cert.date)} · {cert.template.replace(/\.svg$/, "")}
        </span>
      </div>
      <div className="cert-set-side">
        <span className="count">{people.length} certificate{people.length === 1 ? "" : "s"}{revoked ? ` · ${revoked} revoked` : ""}{!isNew && people.length !== savedCount ? ` · ${people.length - savedCount} unsaved` : ""}</span>
        {isNew && <span className="tag tag-upcoming">new file</span>}
        <button className="btn small ghost" onClick={onFind}>Find in set</button>
        <Link className="btn small" href={`/certificates/set?code=${encodeURIComponent(set.code)}`}>Open</Link>
      </div>
    </li>
  );
}
