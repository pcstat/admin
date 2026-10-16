"use client";

/**
 * Inline-editing primitives used by the profile and CV mirrors.
 *
 * The mirrors reproduce the website's markup. In UI mode every value becomes click-to-edit and lists get
 * add / move / remove controls; in preview mode the very same components render plain, read-only markup.
 * Every edit goes through `update(fn)`, which rewrites the JSON text — so UI mode and JSON mode always
 * show the same data.
 */
import { createContext, useContext, useEffect, useId, useRef, useState, type ElementType, type ReactNode } from "react";
import { getAtPath, moveAtPath, moveInArray, removeAtPath, setAtPath, appendAtPath, type PathSegment } from "@/lib/object-path";
import { dropSide, endDrag, getDragSource, startDrag, targetIndex } from "@/lib/sortable";
import { useSortable } from "@/lib/use-sortable";
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

interface ToolsProps {
  listPath: PathSegment[];
  index: number;
  count: number;
  /** false when the website orders this list itself (e.g. the timeline is sorted by year): no ↑ ↓ or drag handle. */
  movable?: boolean;
}

/**
 * ⠿ ↑ ↓ ✕ for one item of the list at `listPath` (shown on hover, UI mode only). The item is the element that
 * contains this component (`.m-item`): grab ⠿ to drag it, drop it on a sibling to reorder.
 */
export function Tools({ listPath, index, count, movable = true }: ToolsProps) {
  const { editable, update } = useMirror();
  const tools = useRef<HTMLSpanElement>(null);
  const listId = `mirror:${listPath.join(".")}`;
  const latest = useRef({ update, listPath, index });
  useEffect(() => {
    latest.current = { update, listPath, index };
  });

  // Make the surrounding item a drop target for its siblings.
  useEffect(() => {
    const item = tools.current?.parentElement;
    if (!item || !editable || !movable) return;
    const clear = () => item.removeAttribute("data-drop");
    const onOver = (e: DragEvent) => {
      const source = getDragSource();
      if (!source || source.list !== listId) return;
      e.preventDefault();
      item.setAttribute("data-drop", dropSide(e, item));
    };
    const onDrop = (e: DragEvent) => {
      const source = getDragSource();
      if (!source || source.list !== listId) return;
      e.preventDefault();
      e.stopPropagation();
      const to = targetIndex(source.from, latest.current.index, dropSide(e, item));
      const from = source.from;
      clear();
      endDrag();
      if (to !== from) latest.current.update((d) => moveAtPath(d, latest.current.listPath, from, to));
    };
    item.addEventListener("dragover", onOver);
    item.addEventListener("dragleave", clear);
    item.addEventListener("drop", onDrop);
    return () => {
      item.removeEventListener("dragover", onOver);
      item.removeEventListener("dragleave", clear);
      item.removeEventListener("drop", onDrop);
    };
  }, [editable, movable, listId]);

  if (!editable) return null;
  return (
    <span className="m-tools" ref={tools}>
      {movable && count > 1 && (
        <button
          type="button"
          className="m-grip"
          title="Drag to reorder"
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            startDrag(listId, index);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", "");
            const item = tools.current?.parentElement;
            if (item) {
              e.dataTransfer.setDragImage(item, 16, 16);
              item.setAttribute("data-dragging", "");
            }
          }}
          onDragEnd={() => {
            endDrag();
            const item = tools.current?.parentElement;
            item?.removeAttribute("data-dragging");
            item?.removeAttribute("data-drop");
          }}
        >
          ⠿
        </button>
      )}
      {movable && (
        <>
          <button type="button" title="Move up" disabled={index === 0} onClick={() => update((d) => moveAtPath(d, listPath, index, index - 1))}>↑</button>
          <button type="button" title="Move down" disabled={index >= count - 1} onClick={() => update((d) => moveAtPath(d, listPath, index, index + 1))}>↓</button>
        </>
      )}
      <button type="button" className="danger" title="Remove" onClick={() => update((d) => removeAtPath(d, listPath, index))}>✕</button>
    </span>
  );
}

/** A one-line explanation of how the website orders a list (UI mode only). */
export function OrderNote({ children }: { children: ReactNode }) {
  const { editable } = useMirror();
  if (!editable) return null;
  return <p className="m-note">⇅ {children}</p>;
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
  const move = (from: number, to: number) => update((d) => moveAtPath(d, path, from, to));
  const sortable = useSortable(useId(), move);

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
        <span key={i} className={`${itemClassName ?? ""} m-pill`} {...sortable.grab(i)} {...sortable.item(i)}>
          {items.length > 1 && <button type="button" className="m-x m-nudge" title="Move earlier" disabled={i === 0} onClick={() => move(i, i - 1)}>‹</button>}
          {textOf(it)}
          {items.length > 1 && <button type="button" className="m-x m-nudge" title="Move later" disabled={i >= items.length - 1} onClick={() => move(i, i + 1)}>›</button>}
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
