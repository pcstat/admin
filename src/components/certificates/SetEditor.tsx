"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SET_CODE_RE, formatDateLong, formatId } from "@/lib/certificates/core";
import { certificatesToCsv, parseRecipients } from "@/lib/certificates/csv";
import { setPath } from "@/lib/certificates/paths";
import { rowsOf } from "@/lib/certificates/search";
import type { CertificateSection, PersonEntry, TemplateDef } from "@/lib/certificates/types";
import { WEBSITE_URL } from "@/lib/site-config";
import { useCertificatesStore } from "@/store/certificates-store";
import { useContentStore } from "@/store/content-store";
import type { Course } from "@/lib/types";
import { Icon } from "../Icon";
import { CertDrawer } from "./CertDrawer";
import { CertPreview } from "./CertPreview";
import { download } from "./CertificatesHome";

const today = () => new Date().toISOString().slice(0, 10);

/** Starting values for the template's set-level fields: the template's defaults, or the values of `from`. */
function fieldsFor(tpl: TemplateDef | undefined, from?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of tpl?.fields ?? []) {
    if (f.scope === "recipient") continue;
    const v = from?.[f.key] ?? f.default;
    if (v) out[f.key] = v;
  }
  return out;
}

export function SetEditor() {
  const params = useSearchParams();
  const code = params.get("code");
  const isNew = params.get("new") === "1";
  const status = useCertificatesStore((s) => s.status);
  const load = useCertificatesStore((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">{"// CERTIFICATE SET"}</p>
        <h1>{isNew ? <>New <span>set</span></> : <>Certificate <span>set</span></>}</h1>
        <p className="lead">
          A set is a group of certificates that share everything except the person — a course run, a contest, a year of membership. It is stored as its own file: the set’s info once at the top, then one entry per person. An ID is <code>SPC-</code>set code<code>-</code>person id (for example SPC-PY26-7W34N); the set code tells the website which file to open.
        </p>
        <p className="file-note"><Link className="see-site" href="/certificates">← All certificates</Link></p>
      </div>
      {status === "loading" && <p className="hint">Reading the registry…</p>}
      {status === "error" && <p className="error-text">The registry could not be loaded. Go back and try again.</p>}
      {status === "ready" && (isNew ? <NewSet /> : code ? <ExistingSet code={code} /> : <p className="empty">No set chosen.</p>)}
    </>
  );
}

/** Fields of the first part of a set (what is the same on every certificate): title, date, design, optional course and the design's shared values. */
function SetFields({ value, onChange }: { value: CertificateSection; onChange: (next: CertificateSection) => void }) {
  const manifest = useCertificatesStore((s) => s.manifest);
  const courses = useContentStore((s) => (s.docs["courses.json"]?.draft as { courses?: Course[] } | undefined)?.courses ?? []);
  const tpl = manifest?.templates.find((t) => t.file === value.template);
  const setFields = (tpl?.fields ?? []).filter((f) => f.scope !== "recipient");

  function changeTemplate(file: string) {
    const next = manifest?.templates.find((t) => t.file === file);
    // keep what the new design shares with the old one, fill the rest with its defaults
    onChange({ ...value, template: file, fields: fieldsFor(next, value.fields) });
  }

  function chooseCourse(id: string) {
    if (!id) {
      const rest = { ...value };
      delete rest.course_id;
      return onChange(rest);
    }
    const course = courses.find((c) => c.id === id);
    onChange({ ...value, course_id: id, title: value.title.trim() ? value.title : (course?.title ?? value.title) });
  }

  return (
    <div className="fields">
      <label className="field wide">
        <span className="label">What are the certificates for? <em> *</em></span>
        <input type="text" value={value.title} placeholder="Python for Data Analysis — Spring 2026   ·   Annual Programming Contest 2026" onChange={(e) => onChange({ ...value, title: e.target.value })} />
        <span className="help">Printed on every certificate and shown on the verification page. It does not have to be a course.</span>
      </label>
      <label className="field">
        <span className="label">Date printed <em> *</em></span>
        <input type="date" value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} />
        {value.date && <span className="help">{formatDateLong(value.date)}</span>}
      </label>
      <label className="field">
        <span className="label">Design <em> *</em></span>
        <select value={value.template} onChange={(e) => changeTemplate(e.target.value)}>
          {(manifest?.templates ?? []).map((t) => <option key={t.file} value={t.file}>{t.label}</option>)}
        </select>
        {tpl?.description && <span className="help">{tpl.description}</span>}
      </label>
      <label className="field">
        <span className="label">Course (optional)</span>
        <select value={value.course_id ?? ""} onChange={(e) => chooseCourse(e.target.value)}>
          <option value="">— not linked to a course —</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <span className="help">Only a link for your overview; picking one fills the title if it is empty.</span>
      </label>
      {setFields.map((f) => (
        <label className="field" key={f.key}>
          <span className="label">{f.label}{f.scope === "either" ? " (set)" : ""}</span>
          <input type="text" value={value.fields?.[f.key] ?? ""} placeholder={f.help} onChange={(e) => {
            const next = { ...(value.fields ?? {}) };
            if (e.target.value) next[f.key] = e.target.value;
            else delete next[f.key];
            onChange({ ...value, fields: next });
          }} />
        </label>
      ))}
    </div>
  );
}

function NewSet() {
  const router = useRouter();
  const manifest = useCertificatesStore((s) => s.manifest);
  const sets = useCertificatesStore((s) => s.sets);
  const createSet = useCertificatesStore((s) => s.createSet);
  const firstTemplate = manifest?.templates[0];
  const [code, setCode] = useState("");
  const [value, setValue] = useState<CertificateSection>(() => ({ title: "", date: today(), template: firstTemplate?.file ?? "", fields: fieldsFor(firstTemplate) }));
  const [error, setError] = useState<string | null>(null);

  const previous = useMemo(() => Object.values(sets).map((s) => s.draft).sort((a, b) => b.certificate.date.localeCompare(a.certificate.date)), [sets]);
  const codeOk = SET_CODE_RE.test(code);
  const taken = Boolean(sets[code]);

  function startFrom(fromCode: string) {
    const from = sets[fromCode]?.draft.certificate;
    if (!from) return;
    // The design, signatories, wording … are the same from set to set; the title, date and people are not.
    setValue({ ...value, template: from.template, course_id: from.course_id, fields: { ...(from.fields ?? {}) } });
  }

  function create() {
    const problem = createSet({ code, certificate: value });
    if (problem) return setError(problem);
    router.replace(`/certificates/set?code=${encodeURIComponent(code)}`);
  }

  const ready = codeOk && !taken && value.title.trim() && value.date && value.template;

  return (
    <div className="part">
      <h2 className="part-title">Create the set</h2>
      <div className="fields">
        <label className="field">
          <span className="label">Set code <em> *</em></span>
          <input type="text" className="mono" value={code} maxLength={12} placeholder="PY26" onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "")); setError(null); }} />
          <span className="help">
            {code === "" && "2–12 capital letters or digits, starting with a letter. It names the file and is part of every ID (SPC-PY26-7W34N). It cannot be changed later."}
            {code !== "" && !codeOk && "Use 2–12 capital letters or digits, starting with a letter."}
            {codeOk && taken && `The code ${code} is already used by “${sets[code]!.draft.certificate.title}”.`}
            {codeOk && !taken && <>Creates <code>{setPath(code)}</code>; IDs look like <code>{formatId(code, "7W34N")}</code></>}
          </span>
        </label>
        {previous.length > 0 && (
          <label className="field">
            <span className="label">Start from an earlier set</span>
            <select defaultValue="" onChange={(e) => startFrom(e.target.value)}>
              <option value="">— nothing —</option>
              {previous.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.certificate.title}</option>)}
            </select>
            <span className="help">Copies the design and the signatories.</span>
          </label>
        )}
      </div>
      <SetFields value={value} onChange={setValue} />
      {error && <p className="error-text">{error}</p>}
      <p className="hint">The file is created when you press <strong>Save</strong>. Add the people next.</p>
      <button className="btn primary" disabled={!ready} onClick={create}><Icon name="plus" size={14} /> Create set</button>
    </div>
  );
}

function ExistingSet({ code }: { code: string }) {
  const state = useCertificatesStore((s) => s.sets[code]);
  const manifest = useCertificatesStore((s) => s.manifest);
  const { updateCertificate } = useCertificatesStore.getState();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [shown, setShown] = useState(50);

  const set = state?.draft;
  const rows = useMemo(() => (set && state ? rowsOf(set, state.savedIds) : []), [set, state]);
  const f = filter.trim().toLowerCase();
  const matching = f ? rows.filter((r) => r.n.name.includes(f) || r.key.includes(f.replace(/[^a-z0-9]/g, "").toUpperCase())) : rows;

  if (!set || !state) return <p className="empty">There is no set with the code {code}.</p>;
  const cert = set.certificate;
  const tpl = manifest?.templates.find((t) => t.file === cert.template);
  const personal = (tpl?.fields ?? []).filter((x) => x.scope !== "set");
  const firstId = Object.keys(set.people)[0];
  const sampleId = firstId ?? "00000";
  const sample: PersonEntry = (firstId ? set.people[firstId] : undefined) ?? { name: "Recipient name" };

  return (
    <>
      <div className="part">
        <h2 className="part-title">{cert.title || set.code} <span className="tag mono">{set.code}</span> {state.original === null && <span className="tag tag-upcoming">new file</span>}</h2>
        <p className="hint">File: <code>{setPath(set.code)}</code> · IDs look like <code>{formatId(set.code, sampleId)}</code> · the code cannot be changed, because every ID contains it. Everything here is printed on <strong>every</strong> certificate of the set.</p>
        <SetFields value={cert} onChange={(next) => updateCertificate(code, next)} />
      </div>

      <div className="part">
        <h2 className="part-title">Preview</h2>
        <CertPreview set={set} personId={sampleId} person={sample} />
        {!firstId && <p className="hint">Shown with a sample name until you add people.</p>}
      </div>

      <AddPeople code={code} personal={personal.map((p) => ({ key: p.key, label: p.label, scope: p.scope }))} />

      <div className="part">
        <div className="list-head">
          <h2 className="part-title">People <span className="count">{rows.length}</span></h2>
          <div className="list-tools">
            {rows.length > 8 && (
              <label className="list-filter"><Icon name="search" size={15} /><input type="text" value={filter} placeholder="Find in this set…" onChange={(e) => { setFilter(e.target.value); setShown(50); }} /></label>
            )}
            <button className="btn small ghost" disabled={rows.length === 0} onClick={() => download(`${set.code.toLowerCase()}-certificates.csv`, certificatesToCsv(rows, WEBSITE_URL))}><Icon name="copy" size={14} /> Export CSV</button>
          </div>
        </div>
        <div className="cert-table-wrap">
          <table className="cert-table">
            <thead><tr><th>Recipient</th><th>Certificate ID</th><th>Status</th></tr></thead>
            <tbody>
              {matching.slice(0, shown).map((r) => (
                <tr key={r.personId} className={r.revoked ? "is-revoked" : ""} onClick={() => setOpen(r.personId)}>
                  <td><button className="linklike" onClick={() => setOpen(r.personId)}>{r.name}</button></td>
                  <td className="mono">{r.id}</td>
                  <td>{r.revoked ? <span className="tag cert-tag-revoked">revoked</span> : <span className="tag tag-active">valid</span>}{r.isNew && <span className="tag tag-upcoming"> unsaved</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="empty">Nobody yet — add people above.</p>}
          {rows.length > 0 && matching.length === 0 && <p className="empty">Nobody matches “{filter}”.</p>}
        </div>
        {matching.length > shown && <button className="btn small add" onClick={() => setShown(shown + 50)}>Show more ({matching.length - shown} left)</button>}
      </div>

      {open && <CertDrawer code={code} personId={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Paste names (or a table from a spreadsheet, or a .csv file) → certificates with fresh person ids, after a preview. */
function AddPeople({ code, personal }: { code: string; personal: { key: string; label: string; scope: string }[] }) {
  const [text, setText] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const parsed = useMemo(() => parseRecipients(text, personal.map((p) => ({ key: p.key, label: p.label, scope: p.scope as "recipient" | "either" }))), [text, personal]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setDone("That file is larger than 2 MB.");
    setText(await file.text());
    setDone(null);
  }

  function add() {
    const ids = useCertificatesStore.getState().addPeople(code, parsed.rows.map((r) => ({ name: r.name, fields: r.fields, note: r.note })));
    setText("");
    setDone(`Added ${ids.length} certificate${ids.length === 1 ? "" : "s"}, each with its own ID. Press Save to issue them.`);
  }

  return (
    <div className="part">
      <h2 className="part-title">Add people</h2>
      <p className="hint">
        Paste one name per line, or paste cells copied from a spreadsheet{personal.length ? <> (name first{personal.map((p) => `, then ${p.label.toLowerCase()}`).join("")})</> : ""}, or choose a .csv file with a header row
        {personal.length ? <> — columns: <code>name</code>{personal.map((p) => <span key={p.key}>, <code>{p.key}</code></span>)}, <code>note</code></> : <> — columns: <code>name</code>, <code>note</code></>}.
      </p>
      <textarea className="cert-paste" rows={6} value={text} placeholder={"Alexandra Fontaine\nJohn Doe\nJane Smith"} onChange={(e) => { setText(e.target.value); setDone(null); }} />
      <div className="cert-paste-tools">
        <label className="btn small ghost">
          <Icon name="folder" size={14} /> Choose .csv / .txt file
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {text && <span className="count">{parsed.rows.length} recipient{parsed.rows.length === 1 ? "" : "s"} found</span>}
      </div>
      {parsed.warnings.length > 0 && <ul className="problems cert-warnings">{parsed.warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}{parsed.warnings.length > 8 && <li>… and {parsed.warnings.length - 8} more</li>}</ul>}
      {parsed.rows.length > 0 && (
        <div className="cert-table-wrap cert-preview-table">
          <table className="cert-table">
            <thead><tr><th>#</th><th>Name</th>{personal.map((p) => <th key={p.key}>{p.label}</th>)}<th>Note</th></tr></thead>
            <tbody>
              {parsed.rows.slice(0, 5).map((r, i) => (
                <tr key={i}><td>{i + 1}</td><td>{r.name}</td>{personal.map((p) => <td key={p.key}>{r.fields[p.key] ?? ""}</td>)}<td>{r.note}</td></tr>
              ))}
            </tbody>
          </table>
          {parsed.rows.length > 5 && <p className="hint">… and {parsed.rows.length - 5} more.</p>}
        </div>
      )}
      <button className="btn primary" disabled={parsed.rows.length === 0} onClick={add}><Icon name="plus" size={14} /> Add {parsed.rows.length || ""} certificate{parsed.rows.length === 1 ? "" : "s"}</button>
      {done && <p className="hint">{done}</p>}
    </div>
  );
}
