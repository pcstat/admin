"use client";

/**
 * Inline-editing primitives used by the profile and CV mirrors.
 *
 * The mirrors reproduce the website's markup. In UI mode every value becomes click-to-edit and lists get
 * add / move / remove controls; in preview mode the very same components render plain, read-only markup.
 * Every edit goes through `update(fn)`, which rewrites the JSON text — so UI mode and JSON mode always
 * show the same data.
 */
import { createContext, useContext, useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { getAtPath, moveAtPath, removeAtPath, setAtPath, appendAtPath, type PathSegment } from "@/lib/object-path";
import type { Json } from "@/lib/member-schema";

interface MirrorContextValue {
  data: Json;
  editable: boolean;
  update: (fn: (data: Json) => Json) => void;
}

const MirrorContext = createContext<MirrorContextValue | null>(null);

export function MirrorProvider({ value, children }: { value: MirrorContextValue; children: ReactNode }) {
  return <MirrorContext.Provider value={value}>{children}</MirrorContext.Provider>;
}

export function useMirror(): MirrorContextValue {
  const ctx = useContext(MirrorContext);
  if (!ctx) throw new Error("useMirror outside MirrorProvider");
  return ctx;
}

export const asString = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function useValue(path: PathSegment[]): unknown {
  return getAtPath(useMirror().data, path);
}

interface TProps {
  path: PathSegment[];
  as?: ElementType;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  /** Shown (read-only) when the value is empty — e.g. the member's own name. */
  fallback?: string;
}

/** A text value: plain in preview, click-to-edit in UI mode (commits on blur / Enter, Esc cancels). */
export function T({ path, as: Tag = "span", className, placeholder = "Click to add", multiline, fallback }: TProps) {
  const { data, editable, update } = useMirror();
  const value = asString(getAtPath(data, path));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && box.current) {
      box.current.focus();
      box.current.style.height = "auto";
      box.current.style.height = `${box.current.scrollHeight}px`;
    }
  }, [editing, draft]);

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  if (!editable) return <Tag className={className}>{value || fallback || ""}</Tag>;

  if (editing) {
    const commit = () => {
      setEditing(false);
      if (draft !== value) update((d) => setAtPath(d, path, draft));
    };
    return (
      <Tag className={className}>
        <textarea
          ref={box}
          rows={1}
          className="m-input"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            } else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              commit();
            }
          }}
        />
      </Tag>
    );
  }
  const shown = value || fallback || "";
  return (
    <Tag
      className={`${className ?? ""} m-edit${shown ? "" : " m-empty"}`}
      data-ph={placeholder}
      tabIndex={0}
      role="textbox"
      onClick={startEditing}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter") startEditing();
      }}
    >
      {shown}
    </Tag>
  );
}

/** ↑ ↓ ✕ buttons for one item of the list at `listPath` (shown on hover, UI mode only). */
export function Tools({ listPath, index, count }: { listPath: PathSegment[]; index: number; count: number }) {
  const { editable, update } = useMirror();
  if (!editable) return null;
  return (
    <span className="m-tools">
      <button type="button" title="Move up" disabled={index === 0} onClick={() => update((d) => moveAtPath(d, listPath, index, index - 1))}>↑</button>
      <button type="button" title="Move down" disabled={index >= count - 1} onClick={() => update((d) => moveAtPath(d, listPath, index, index + 1))}>↓</button>
      <button type="button" className="danger" title="Remove" onClick={() => update((d) => removeAtPath(d, listPath, index))}>✕</button>
    </span>
  );
}

/** "+ Add …" button appending `make()` to the list at `path` (UI mode only). */
export function Add({ path, make, label }: { path: PathSegment[]; make: () => unknown; label: string }) {
  const { editable, update } = useMirror();
  if (!editable) return null;
  return (
    <button type="button" className="m-add" onClick={() => update((d) => appendAtPath(d, path, make()))}>
      + {label}
    </button>
  );
}

interface TagsProps {
  path: PathSegment[];
  className?: string;
  itemClassName?: string;
  label: string;
  /** Items may be strings or { text } objects (CV "commas"). */
  objectText?: boolean;
}

/** A list of short strings rendered as pills (focus areas, skills, tags, languages …). */
export function Tags({ path, className, itemClassName, label, objectText }: TagsProps) {
  const { data, editable, update } = useMirror();
  const items = asArray(getAtPath(data, path));
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const textOf = (v: unknown) => (objectText && v && typeof v === "object" ? asString((v as { text?: unknown }).text) : asString(v));

  if (!editable) {
    return (
      <div className={className}>
        {items.map((it, i) => (
          <span key={i} className={itemClassName}>{textOf(it)}</span>
        ))}
      </div>
    );
  }
  const commit = () => {
    const text = draft.trim();
    setAdding(false);
    setDraft("");
    if (text) update((d) => appendAtPath(d, path, text));
  };
  return (
    <div className={className}>
      {items.map((it, i) => (
        <span key={i} className={itemClassName}>
          {textOf(it)}
          <button type="button" className="m-x" title="Remove" onClick={() => update((d) => removeAtPath(d, path, i))}>×</button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          className="m-input"
          style={{ width: "14ch", display: "inline-block" }}
          value={draft}
          placeholder={label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
        />
      ) : (
        <button type="button" className="m-add" style={{ marginTop: 0 }} onClick={() => setAdding(true)}>
          + {label}
        </button>
      )}
    </div>
  );
}

/** A true/false toggle (e.g. "featured"), UI mode only. */
export function Check({ path, label }: { path: PathSegment[]; label: string }) {
  const { data, editable, update } = useMirror();
  if (!editable) return null;
  return (
    <label className="m-check">
      <input type="checkbox" checked={getAtPath(data, path) === true} onChange={(e) => update((d) => setAtPath(d, path, e.target.checked))} /> {label}
    </label>
  );
}

/** Labelled one-line field shown only in UI mode — for values that have no visible spot on the page (links, …). */
export function Field({ path, label, placeholder }: { path: PathSegment[]; label: string; placeholder?: string }) {
  const { editable } = useMirror();
  if (!editable) return null;
  return (
    <div className="m-field">
      <b>{label}</b>
      <T path={path} placeholder={placeholder ?? "https://…"} />
    </div>
  );
}
