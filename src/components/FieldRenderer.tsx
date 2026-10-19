"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Picker } from "./Picker";
import { DateField, TimeField } from "./DateTime";
import { itemSearchFields, matchFields, queryWords, snippetParts, type ResolveCtx } from "@/lib/smart-search";
import { useMemo } from "react";
import { newId } from "@/lib/schemas";
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
  const empty = value === undefined || value === null || (typeof value === "string" && value.trim() === "");
  const missing = "required" in field && field.required && empty;
  const help = (
    <>
      {field.help ? <span className="help">{field.help}</span> : null}
      {missing && <span className="req-msg">Required — please fill this in before saving.</span>}
    </>
  );

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
    case "date":
      return <DateField label={label} help={help} value={value} format={field.format} onChange={set} />;
    case "time":
      return <TimeField label={label} help={help} value={value} onChange={set} />;
    case "checks":
      return <ChecksField label={label} help={help} options={field.options} value={value} onChange={set} />;
    case "readonly":
      return (
        <div className="field">
          {label}
          <code className="readonly-value">{typeof value === "string" && value ? value : "assigned when you save"}</code>
          {help}
        </div>
      );
    case "group":
      return (
        <section className={`group wide${field.bare ? " bare" : ""}`}>
          {!field.bare && <h3 className="group-title">{field.label}</h3>}
          {!field.bare && field.help && <p className="hint">{field.help}</p>}
          <FieldGroup file={file} fields={field.fields} value={(value && typeof value === "object" ? value : {}) as Obj} path={path} />
        </section>
      );
  }
}

function ChecksField({ label, help, options, value, onChange }: { label: React.ReactNode; help: React.ReactNode; options: { value: string; label?: string }[]; value: unknown; onChange: (v: unknown) => void }) {
  const chosen = Array.isArray(value) ? (value as string[]) : [];
  const toggle = (v: string) => onChange(options.map((o) => o.value).filter((x) => (x === v ? !chosen.includes(v) : chosen.includes(x))));
  return (
    <div className="field wide">
      {label}
      <div className="checks">
        {options.map((o) => (
          <label key={o.value} className={`check-chip${chosen.includes(o.value) ? " on" : ""}`}>
            <input type="checkbox" checked={chosen.includes(o.value)} onChange={() => toggle(o.value)} />
            {o.label ?? o.value}
          </label>
        ))}
      </div>
      {help}
    </div>
  );
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
      </div>
      <Picker
        ariaLabel="Search members"
        placeholder="Search members by name, ID or role…"
        emptyText="No member matches."
        options={all
          .filter((m) => !ids.includes(m.student_id))
          .map((m) => ({ value: m.student_id, label: m.name, sub: [m.student_id, m.role, m.committee].filter(Boolean).join(" · "), keywords: `${m.bio ?? ""} ${m.role_display ?? ""}` }))}
        onPick={(id) => onChange([...ids, id])}
      />
      {ids.length > 1 && <span className="hint">Drag a name or use ‹ › to reorder — they are shown in this order.</span>}
      {help}
    </div>
  );
}

/** string[] of project ids — the projects pinned on the home page. A search box finds the project to pin. */
function ProjectsField({ label, help, value, onChange }: { label: React.ReactNode; help?: React.ReactNode; value: unknown; onChange: (v: unknown) => void }) {
  const projects = useContentStore((s) => (s.docs["projects.json"]?.draft as { projects?: Project[] } | undefined)?.projects ?? []);
  const execs = useContentStore((s) => s.docs["executives.json"]?.draft as ExecutivesDoc | undefined);
  const memberNames = useMemo(() => new Map((execs?.committees ?? []).flatMap((c) => c.members.map((m) => [m.student_id, m.name] as const))), [execs]);
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
        {ids.length === 0 && <span className="hint">Nothing pinned — the “Top projects” block is hidden.</span>}
      </div>
      <Picker
        ariaLabel="Search projects to pin"
        placeholder={`Search ${projects.length} projects — title, member, tag, year…`}
        emptyText="No project matches."
        options={projects
          .filter((p) => p.id && !ids.includes(p.id))
          .map((p) => {
            const names = (p.members ?? []).map((id) => memberNames.get(id)).filter((n): n is string => Boolean(n));
            return {
              value: p.id,
              label: p.title || "(untitled)",
              sub: [p.year, p.status, (p.tags ?? []).slice(0, 3).join(", "), names.slice(0, 2).join(", ")].filter(Boolean).join(" · "),
              keywords: `${p.description ?? ""} ${(p.tags ?? []).join(" ")} ${names.join(" ")} ${p.link ?? ""}`,
            };
          })}
        onPick={(id) => onChange([...ids, id])}
      />
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

  /** A photo the member keeps on their own site: only the link is stored here. */
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
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
      {linking && (
        <div className="image-link">
          <input
            type="url"
            className="mono"
            placeholder="https://example.com/photo.jpg"
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
      {external && <span className="hint">The photo is hosted elsewhere — the member can change it themselves by replacing that file, no admin needed.</span>}
      {linking && <span className="hint">Paste a link to the photo. GitHub file links work too. Keep the same file name when replacing the photo.</span>}
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

/** Names behind the ids in the data, so searches see what the person sees (a project's members are stored as student IDs). */
function useResolveCtx(): ResolveCtx {
  const executives = useContentStore((s) => s.docs["executives.json"]?.draft as ExecutivesDoc | undefined);
  const projects = useContentStore((s) => (s.docs["projects.json"]?.draft as { projects?: Project[] } | undefined)?.projects);
  return useMemo(() => {
    const members = new Map((executives?.committees ?? []).flatMap((c) => c.members.map((m) => [m.student_id, m.name] as const)));
    const sessions = new Map((executives?.committees ?? []).map((c) => [c.session, c.label || c.session] as const));
    const titles = new Map((projects ?? []).map((p) => [p.id, p.title] as const));
    return { memberName: (id) => members.get(id), projectTitle: (id) => titles.get(id), committeeLabel: (s) => sessions.get(s) };
  }, [executives, projects]);
}

function ListField({ file, field, parent, value, path }: { file: DocFile; field: Extract<FieldDef, { kind: "list" }>; parent: Obj; value: unknown; path: PathSegment[] }) {
  const { addItem, insertItem, removeItem, moveItem } = useContentStore.getState();
  const items = Array.isArray(value) ? (value as Obj[]) : [];
  const taken = field.uniqueKey ? items.map((it) => String(it[field.uniqueKey as string] ?? "")) : [];
  const sortable = useSortable(`${file}:${path.join(".")}`, (from, to) => moveItem(file, path, from, to));
  const box = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  const manual = field.order !== "auto";
  const hasFeatured = field.fields.some((f) => f.key === "featured");
  const note = field.orderNote ?? (manual && hasFeatured ? "Featured items are listed first on the website; this order applies within each group." : undefined);
  const ctx = useResolveCtx();
  const words = queryWords(filter);
  const filtering = words.length > 0;
  const scoped = items.map((item, index) => ({ item, index }));
  const isCurrent = (item: Obj) => Boolean(field.currentMarker) && item[field.currentMarker!.itemKey] === parent[field.currentMarker!.key] && item[field.currentMarker!.itemKey] !== "";
  // The search reads what the person sees in each item's form (names instead of ids, no keys or hidden values).
  const visible = scoped
    .map((entry) => ({ ...entry, match: filtering ? matchFields(itemSearchFields(field.fields, entry.item, ctx), words) : null }))
    .filter((entry) => !entry.match || entry.match.matched);
  const movable = manual && scoped.length > 1 && !filtering;
  const showFilter = scoped.length > 6;
  const canAdd = !field.locked;
  const canDelete = !field.locked;
  const pendingOpen = useRef<number | null>(null);
  useEffect(() => {
    // A new (or duplicated) item opens by itself and puts the cursor in its first field, so it is never "lost" in a collapsed list.
    const index = pendingOpen.current;
    if (index === null) return;
    pendingOpen.current = null;
    const el = box.current?.querySelectorAll<HTMLDetailsElement>(":scope > .rows > details.item")[index];
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.querySelector<HTMLElement>("input[type=text], textarea, select")?.focus({ preventScroll: true });
  }, [items.length]);
  const setAll = (open: boolean) => box.current?.querySelectorAll<HTMLDetailsElement>(":scope > .rows > details.item").forEach((d) => (d.open = open));

  function duplicate(index: number) {
    const copy = structuredClone(items[index]) as Obj;
    if (field.autoId) copy[field.autoId.key] = newId(field.autoId.prefix, taken);
    else if (field.uniqueKey) copy[field.uniqueKey] = "";
    const titleKey = field.fields.find((f) => f.kind === "text" && (f.key === "title" || f.key === "name"))?.key;
    if (titleKey && typeof copy[titleKey] === "string") copy[titleKey] = `${copy[titleKey]} (copy)`;
    pendingOpen.current = index + 1;
    setFilter("");
    insertItem(file, path, index + 1, copy);
  }

  return (
    <section className="list wide" ref={box}>
      <div className="list-head">
        <h3>{field.label} <span className="count">{scoped.length}</span></h3>
        <div className="list-tools">
          {showFilter && (
            <label className="list-filter">
              <Icon name="search" size={15} />
              <input type="text" value={filter} placeholder={`Search ${field.itemLabel}s — names, tags, dates…`} onChange={(e) => setFilter(e.target.value)} aria-label={`Filter ${field.itemLabel}s`} />
            </label>
          )}
          {scoped.length > 1 && field.collapsedByDefault && (
            <>
              <button type="button" className="btn small ghost" onClick={() => setAll(true)}>Expand all</button>
              <button type="button" className="btn small ghost" onClick={() => setAll(false)}>Collapse all</button>
            </>
          )}
        </div>
      </div>
      {note && <p className="hint order-note">{manual ? "⇅ " : "↻ "}{note}{movable ? " Drag ⠿ or use ↑ ↓ to reorder." : ""}</p>}
      <div className="rows">
        {visible.map(({ item, index, match }, pos) => {
          const badge = field.badge?.(item) ?? (isCurrent(item) ? "current" : undefined);
          return (
            <details className="item" key={index} open={!field.collapsedByDefault} {...(movable ? sortable.item(index) : {})}>
              <summary>
                {movable && <GripHandle label={`Drag ${field.title(item, index)} to reorder`} {...sortable.handle(index)} />}
                {manual && <span className="item-num">{index + 1}</span>}
                <span className="item-title">
                  {hasFeatured && item.featured === true && <span className="star" title="Featured — listed first on the website">★ </span>}
                  {field.title(item, index)}
                </span>
                {badge && <span className={`tag tag-${badge}`}>{badge}</span>}
                {match && match.hits[0] && (() => {
                  const hit = match.hits.find((h) => h.text !== field.title(item, index)) ?? match.hits[0]!;
                  return (
                    <span className="item-match">
                      <b>{hit.label}</b> {snippetParts(hit.text, words).map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
                    </span>
                  );
                })()}
                <span className="item-actions" onClick={(e) => (e.target as HTMLElement).closest("button") && e.preventDefault()}>
                  {movable && <NudgeButtons index={pos} count={visible.length} onMove={(from, to) => moveItem(file, path, visible[from]!.index, visible[to]!.index)} />}
                  {!field.locked && (
                    <>
                      {canAdd && (
                        <button type="button" className="icon-btn" aria-label="Duplicate" title="Duplicate" onClick={() => duplicate(index)}>
                          <Icon name="copy" size={14} />
                        </button>
                      )}
                      {canDelete && <button
                        type="button"
                        className="icon-btn danger"
                        aria-label="Delete"
                        title="Delete"
                        onClick={() => window.confirm(`Delete this ${field.itemLabel}?`) && removeItem(file, path, index)}
                      >
                        <Icon name="trash" size={14} />
                      </button>}
                    </>
                  )}
                </span>
              </summary>
              <FieldGroup file={file} fields={field.fields} value={item} path={[...path, index]} />
            </details>
          );
        })}
        {scoped.length === 0 && <p className="empty">No {field.itemLabel}s yet.</p>}
        {scoped.length > 0 && visible.length === 0 && <p className="empty">No {field.itemLabel} matches “{filter}”.</p>}
      </div>
      {canAdd && (
        <button type="button" className="btn small add" onClick={() => {
          setFilter("");
          if (field.addAtStart) {
            pendingOpen.current = 0;
            insertItem(file, path, 0, field.create({ parent, taken }));
          } else {
            pendingOpen.current = items.length;
            addItem(file, path, field.create({ parent, taken }));
          }
        }}>
          <Icon name="plus" size={14} /> Add {field.itemLabel}
        </button>
      )}
    </section>
  );
}
