"use client";

import { useRef, useState } from "react";
import type { FieldDef } from "@/lib/schemas";
import type { PathSegment } from "@/lib/object-path";
import type { DocFile, ExecutivesDoc } from "@/lib/types";
import { photoUrl, useContentStore } from "@/store/content-store";

type Obj = Record<string, unknown>;

interface Props {
  file: DocFile;
  fields: FieldDef[];
  value: Obj;
  path: PathSegment[];
}

export function FieldGroup({ file, fields, value, path }: Props) {
  return (
    <div className="fields">
      {fields.map((field) => (
        <Field key={field.key} file={file} field={field} parent={value} path={[...path, field.key]} />
      ))}
    </div>
  );
}

function Field({ file, field, parent, path }: { file: DocFile; field: FieldDef; parent: Obj; path: PathSegment[] }) {
  const setField = useContentStore((s) => s.setField);
  const value = parent[field.key];
  const set = (v: unknown) => setField(file, path, v);
  const label = (
    <span className="label">
      {field.label}
      {"required" in field && field.required && <em title="Required"> *</em>}
    </span>
  );
  const help = field.help ? <span className="help">{field.help}</span> : null;

  switch (field.kind) {
    case "text": {
      return (
        <label className="field">
          {label}
          <input
            type="text"
            className={field.mono ? "mono" : ""}
            value={typeof value === "string" ? value : ""}
            placeholder={field.placeholder}
            onChange={(e) => set(e.target.value === "" && !field.required ? undefined : e.target.value)}
          />
          {help}
        </label>
      );
    }
    case "textarea":
      return (
        <label className="field wide">
          {label}
          <textarea
            rows={field.rows ?? 3}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => set(e.target.value === "" && !field.required ? undefined : e.target.value)}
          />
          {help}
        </label>
      );
    case "number":
      return (
        <label className="field">
          {label}
          <input
            type="number"
            min={0}
            value={typeof value === "number" ? value : ""}
            onChange={(e) => set(e.target.value === "" ? undefined : Number(e.target.value))}
          />
          {help}
        </label>
      );
    case "checkbox":
      return (
        <label className="field check">
          <input type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} />
          <span className="label">{field.label}</span>
        </label>
      );
    case "select":
      return (
        <label className="field">
          {label}
          <select value={typeof value === "string" ? value : ""} onChange={(e) => set(e.target.value === "" ? undefined : e.target.value)}>
            {!field.required && <option value="">—</option>}
            {typeof value === "string" && value && !field.options.some((o) => o.value === value) && <option value={value}>{value} (custom)</option>}
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label ?? o.value}
              </option>
            ))}
          </select>
          {help}
        </label>
      );
    case "session-select":
      return <SessionSelect label={label} help={help} value={value} onChange={set} />;
    case "strings":
      return <StringsField label={label} field={field} value={value} onChange={set} />;
    case "members":
      return <MembersField label={label} value={value} onChange={set} />;
    case "image":
      return <ImageField label={label} folder={field.folder} value={value} onChange={set} />;
    case "list":
      return <ListField file={file} field={field} parent={parent} value={value} path={path} />;
  }
}

function SessionSelect({ label, help, value, onChange }: { label: React.ReactNode; help: React.ReactNode; value: unknown; onChange: (v: unknown) => void }) {
  const executives = useContentStore((s) => s.docs["executives.json"]?.draft as ExecutivesDoc | undefined);
  const sessions = (executives?.committees ?? []).map((c) => ({ session: c.session, label: c.label }));
  return (
    <label className="field">
      {label}
      <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
        {typeof value === "string" && !sessions.some((s) => s.session === value) && <option value={value}>{value} (not found)</option>}
        {sessions.map((s) => (
          <option key={s.session} value={s.session}>
            {s.label || s.session}
          </option>
        ))}
      </select>
      {help}
    </label>
  );
}

function StringsField({ label, field, value, onChange }: { label: React.ReactNode; field: Extract<FieldDef, { kind: "strings" }>; value: unknown; onChange: (v: unknown) => void }) {
  const items = Array.isArray(value) ? (value as string[]) : [];
  const update = (next: string[]) => onChange(next);
  return (
    <div className="field wide">
      {label}
      <div className="chips">
        {items.map((item, i) => (
          <span className="chip-input" key={i}>
            <input
              value={item}
              placeholder={field.placeholder}
              onChange={(e) => update(items.map((v, j) => (j === i ? e.target.value : v)))}
            />
            <button type="button" className="icon-btn" aria-label="Remove" onClick={() => update(items.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
        <button type="button" className="btn small" onClick={() => update([...items, ""])}>+ {field.addLabel ?? "Add"}</button>
      </div>
    </div>
  );
}

function MembersField({ label, value, onChange }: { label: React.ReactNode; value: unknown; onChange: (v: unknown) => void }) {
  const executives = useContentStore((s) => s.docs["executives.json"]?.draft as ExecutivesDoc | undefined);
  const ids = Array.isArray(value) ? (value as string[]) : [];
  const all = (executives?.committees ?? []).flatMap((c) => c.members.map((m) => ({ ...m, committee: c.label || c.session })));
  const nameOf = (id: string) => all.find((m) => m.student_id === id)?.name;
  return (
    <div className="field wide">
      {label}
      <div className="chips">
        {ids.map((id) => (
          <span className={`chip ${nameOf(id) ? "" : "bad"}`} key={id}>
            {nameOf(id) ?? `⚠ unknown ID ${id}`}
            <button type="button" className="icon-btn" aria-label={`Remove ${id}`} onClick={() => onChange(ids.filter((x) => x !== id))}>×</button>
          </span>
        ))}
        <select
          value=""
          aria-label="Add member"
          onChange={(e) => e.target.value && onChange([...ids, e.target.value])}
        >
          <option value="">+ Add member…</option>
          {all
            .filter((m) => !ids.includes(m.student_id))
            .map((m) => (
              <option key={m.student_id} value={m.student_id}>
                {m.name} ({m.student_id}) — {m.committee}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

function ImageField({ label, folder, value, onChange }: { label: React.ReactNode; folder: string; value: unknown; onChange: (v: unknown) => void }) {
  const stageImage = useContentStore((s) => s.stageImage);
  const view = useContentStore((s) => ({ uploads: s.uploads, provider: s.provider, imageBase: s.imageBase }));
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const rel = typeof value === "string" ? value : "";

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      onChange(await stageImage(file, folder));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="field wide">
      {label}
      <div className="image-field">
        {/* eslint-disable-next-line @next/next/no-img-element -- previews can be blob: URLs, which next/image cannot show */}
        {rel ? <img src={photoUrl(rel, view)} alt="" className="thumb" /> : <div className="thumb empty">No photo</div>}
        <div className="image-actions">
          <button type="button" className="btn small" onClick={() => input.current?.click()}>{rel ? "Replace…" : "Upload…"}</button>
          {rel && <button type="button" className="btn small ghost" onClick={() => onChange(undefined)}>Remove</button>}
          {rel && <code className="path">{rel}</code>}
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

function ListField({ file, field, parent, value, path }: { file: DocFile; field: Extract<FieldDef, { kind: "list" }>; parent: Obj; value: unknown; path: PathSegment[] }) {
  const { addItem, removeItem, moveItem } = useContentStore.getState();
  const items = Array.isArray(value) ? (value as Obj[]) : [];
  const taken = field.uniqueKey ? items.map((it) => String(it[field.uniqueKey as string] ?? "")) : [];
  return (
    <section className="list wide">
      <div className="list-head">
        <h3>{field.label} <span className="count">{items.length}</span></h3>
      </div>
      {items.map((item, index) => (
        <details className="item" key={index} open={!field.collapsedByDefault}>
          <summary>
            <span className="item-title">{field.title(item, index)}</span>
            <span className="item-actions" onClick={(e) => e.preventDefault()}>
              <button type="button" className="icon-btn" aria-label="Move up" disabled={index === 0} onClick={() => moveItem(file, path, index, index - 1)}>↑</button>
              <button type="button" className="icon-btn" aria-label="Move down" disabled={index === items.length - 1} onClick={() => moveItem(file, path, index, index + 1)}>↓</button>
              <button
                type="button"
                className="icon-btn danger"
                aria-label="Delete"
                onClick={() => window.confirm(`Delete this ${field.itemLabel}?`) && removeItem(file, path, index)}
              >
                🗑
              </button>
            </span>
          </summary>
          <FieldGroup file={file} fields={field.fields} value={item} path={[...path, index]} />
        </details>
      ))}
      <button type="button" className="btn small add" onClick={() => addItem(file, path, field.create({ parent, taken }))}>+ Add {field.itemLabel}</button>
    </section>
  );
}
