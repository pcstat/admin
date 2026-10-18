"use client";

import { useId, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { FieldDef } from "@/lib/schemas";
import { moveInArray, type PathSegment } from "@/lib/object-path";
import { useSortable } from "@/lib/use-sortable";
import { isExternalLink, normalizeJsonLink } from "@/lib/member-source";
import type { DocFile, ExecutivesDoc, Project } from "@/lib/types";
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
      return <MembersField label={label} help={help} currentOnly={field.currentOnly} value={value} onChange={set} />;
    case "projects":
      return <ProjectsField label={label} help={help} value={value} onChange={set} />;
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
  const move = (from: number, to: number) => update(moveInArray(items, from, to));
  const sortable = useSortable(useId(), move);
  return (
    <div className="field wide">
      {label}
      <div className="chips">
        {items.map((item, i) => (
          <span className="chip-input sortable" key={i} data-sortable-item {...sortable.item(i)}>
            {items.length > 1 && <GripHandle label={`Drag ${item || "tag"} to reorder`} {...sortable.handle(i)} />}
            <input
              value={item}
              placeholder={field.placeholder}
              onChange={(e) => update(items.map((v, j) => (j === i ? e.target.value : v)))}
            />
            {items.length > 1 && <NudgeButtons index={i} count={items.length} onMove={move} horizontal />}
            <button type="button" className="icon-btn" aria-label="Remove" onClick={() => update(items.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
        <button type="button" className="btn small" onClick={() => update([...items, ""])}>+ {field.addLabel ?? "Add"}</button>
      </div>
      {items.length > 1 && <span className="hint">Drag ⠿ or use ‹ › to reorder — they are shown in this order.</span>}
    </div>
  );
}

function MembersField({ label, help, currentOnly, value, onChange }: { label: React.ReactNode; help?: React.ReactNode; currentOnly?: boolean; value: unknown; onChange: (v: unknown) => void }) {
  const executives = useContentStore((s) => s.docs["executives.json"]?.draft as ExecutivesDoc | undefined);
  const ids = Array.isArray(value) ? (value as string[]) : [];
  const all = (executives?.committees ?? [])
    .filter((c) => !currentOnly || c.session === executives?.current_committee)
    .flatMap((c) => c.members.map((m) => ({ ...m, committee: c.label || c.session })));
  const nameOf = (id: string) => all.find((m) => m.student_id === id)?.name;
  const move = (from: number, to: number) => onChange(moveInArray(ids, from, to));
  const sortable = useSortable(useId(), move);
  return (
    <div className="field wide">
      {label}
      <div className="chips">
        {ids.map((id, i) => (
          <span className={`chip sortable ${nameOf(id) ? "" : "bad"}`} key={id} {...sortable.grab(i)} {...sortable.item(i)}>
            {ids.length > 1 && <span className="grip" aria-hidden="true">⠿</span>}
            {nameOf(id) ?? `⚠ unknown ID ${id}`}
            {ids.length > 1 && <NudgeButtons index={i} count={ids.length} onMove={move} horizontal />}
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
      {ids.length > 1 && <span className="hint">Drag a name or use ‹ › to reorder — they are shown in this order.</span>}
      {help}
    </div>
  );
}

/** string[] of project ids — the projects pinned on the home page. */
function ProjectsField({ label, help, value, onChange }: { label: React.ReactNode; help?: React.ReactNode; value: unknown; onChange: (v: unknown) => void }) {
  const projects = useContentStore((s) => (s.docs["projects.json"]?.draft as { projects?: Project[] } | undefined)?.projects ?? []);
  const ids = Array.isArray(value) ? (value as string[]) : [];
  const titleOf = (id: string) => projects.find((p) => p.id === id)?.title;
  const move = (from: number, to: number) => onChange(moveInArray(ids, from, to));
  const sortable = useSortable(useId(), move);
  return (
    <div className="field wide">
      {label}
      <div className="chips">
        {ids.map((id, i) => (
          <span className={`chip sortable ${titleOf(id) ? "" : "bad"}`} key={id} {...sortable.grab(i)} {...sortable.item(i)}>
            {ids.length > 1 && <span className="grip" aria-hidden="true">⠿</span>}
            {titleOf(id) ?? `⚠ unknown project ${id}`}
            {ids.length > 1 && <NudgeButtons index={i} count={ids.length} onMove={move} horizontal />}
            <button type="button" className="icon-btn" aria-label={`Remove ${id}`} onClick={() => onChange(ids.filter((x) => x !== id))}>×</button>
          </span>
        ))}
        <select value="" aria-label="Add project" onChange={(e) => e.target.value && onChange([...ids, e.target.value])}>
          <option value="">+ Add project…</option>
          {projects
            .filter((p) => p.id && !ids.includes(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.year})
              </option>
            ))}
        </select>
      </div>
      {ids.length > 1 && <span className="hint">Drag a title or use ‹ › to reorder — they are shown in this order.</span>}
      {help}
    </div>
  );
}

function ImageField({ label, folder, value, onChange }: { label: React.ReactNode; folder: string; value: unknown; onChange: (v: unknown) => void }) {
  const stageImage = useContentStore((s) => s.stageImage);
  // useShallow: a selector that builds a new object on every call makes zustand v5 re-render forever.
  const view = useContentStore(useShallow((s) => ({ uploads: s.uploads, provider: s.provider, imageBase: s.imageBase })));
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState("");
  const rel = typeof value === "string" ? value : "";
  const external = isExternalLink(rel);

  /** A photo the member keeps in their own repository / site: only the link is stored here. */
  function applyLink() {
    const url = normalizeJsonLink(link);
    if (!url) {
      setError("Paste a full link that starts with https://");
      return;
    }
    setError("");
    onChange(url);
    setLinking(false);
    setLink("");
  }

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
          <button type="button" className="btn small ghost" onClick={() => setLinking((v) => !v)}>{external ? "Change link…" : "Use a link…"}</button>
          {rel && <button type="button" className="btn small ghost" onClick={() => onChange(undefined)}>Remove</button>}
          {rel && <code className="path">{rel}</code>}
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
      {linking && (
        <div className="image-link">
          <input
            type="url"
            className="mono"
            placeholder="https://raw.githubusercontent.com/<user>/<repo>/HEAD/photo.jpg"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
            }}
            aria-label="Link to the photo"
          />
          <button type="button" className="btn small" onClick={applyLink}>Use this link</button>
        </div>
      )}
      {external && <span className="hint">The photo is kept outside the club repository — the member changes it by replacing that file, no admin needed.</span>}
      {linking && <span className="hint">A GitHub file link (…/blob/main/photo.jpg) is converted to its raw link automatically. Keep the same file name when replacing the photo.</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

/** ⠿ drag handle. The parent passes the drag props from useSortable().handle(). */
function GripHandle({ label, ...drag }: { label: string } & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="icon-btn grip" aria-label={label} title="Drag to reorder" {...drag}>
      ⠿
    </button>
  );
}

/** ↑ ↓ (or ‹ › for horizontal lists) — the keyboard / touch alternative to dragging. */
function NudgeButtons({ index, count, onMove, horizontal }: { index: number; count: number; onMove: (from: number, to: number) => void; horizontal?: boolean }) {
  return (
    <>
      <button type="button" className="icon-btn" aria-label={horizontal ? "Move earlier" : "Move up"} title={horizontal ? "Move earlier" : "Move up"} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
        {horizontal ? "‹" : "↑"}
      </button>
      <button type="button" className="icon-btn" aria-label={horizontal ? "Move later" : "Move down"} title={horizontal ? "Move later" : "Move down"} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
        {horizontal ? "›" : "↓"}
      </button>
    </>
  );
}

function ListField({ file, field, parent, value, path }: { file: DocFile; field: Extract<FieldDef, { kind: "list" }>; parent: Obj; value: unknown; path: PathSegment[] }) {
  const { addItem, removeItem, moveItem } = useContentStore.getState();
  const items = Array.isArray(value) ? (value as Obj[]) : [];
  const taken = field.uniqueKey ? items.map((it) => String(it[field.uniqueKey as string] ?? "")) : [];
  const sortable = useSortable(`${file}:${path.join(".")}`, (from, to) => moveItem(file, path, from, to));
  const manual = field.order !== "auto";
  const hasFeatured = field.fields.some((f) => f.key === "featured");
  const note = field.orderNote ?? (manual && hasFeatured ? "Featured items are listed first on the website; this order applies within each group." : undefined);
  const movable = manual && items.length > 1;
  return (
    <section className="list wide">
      <div className="list-head">
        <h3>{field.label} <span className="count">{items.length}</span></h3>
        {note && <p className="hint order-note">{manual ? "⇅ " : "↻ "}{note}{manual && items.length > 1 ? " Drag ⠿ or use ↑ ↓ to reorder." : ""}</p>}
      </div>
      {items.map((item, index) => (
        <details className="item" key={index} open={!field.collapsedByDefault} {...(movable ? sortable.item(index) : {})}>
          <summary>
            {movable && <GripHandle label={`Drag ${field.title(item, index)} to reorder`} {...sortable.handle(index)} />}
            {manual && <span className="item-num">{index + 1}</span>}
            <span className="item-title">
              {hasFeatured && item.featured === true && <span className="star" title="Featured — listed first on the website">★ </span>}
              {field.title(item, index)}
            </span>
            <span className="item-actions" onClick={(e) => e.preventDefault()}>
              {movable && <NudgeButtons index={index} count={items.length} onMove={(from, to) => moveItem(file, path, from, to)} />}
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
