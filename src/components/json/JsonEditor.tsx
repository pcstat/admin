"use client";

import { useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import { json, jsonLanguage, jsonParseLinter } from "@codemirror/lang-json";
import { syntaxTree } from "@codemirror/language";
import { forEachDiagnostic, linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";
import { CV_FIXED_KEYS, COMMON_CV_SECTIONS, checkMember, shapeAt, type MemberKind } from "@/lib/member-schema";
import type { PathSegment } from "@/lib/object-path";

type TreeNode = ReturnType<typeof syntaxTree>["topNode"];

/** Marks changes that come from the outside (so they are not echoed back through onChange). */
const external = Annotation.define<boolean>();

const PUNCTUATION = new Set(["{", "}", "[", "]", ",", ":"]);
const valueChildren = (node: TreeNode): TreeNode[] => {
  const out: TreeNode[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) if (!PUNCTUATION.has(c.name)) out.push(c);
  return out;
};

/** The syntax node a JSON path points at. For "key" it is the property name, otherwise the value. */
function nodeAtPath(state: EditorState, path: PathSegment[], where: "key" | "value"): TreeNode | null {
  let node: TreeNode | null = syntaxTree(state).topNode.firstChild; // JsonText → value
  let keyNode: TreeNode | null = null;
  for (const seg of path) {
    if (!node) return null;
    if (node.name === "Object" && typeof seg === "string") {
      const prop = valueChildren(node).find((p) => {
        const name = p.firstChild;
        if (!name) return false;
        try {
          return JSON.parse(state.sliceDoc(name.from, name.to)) === seg;
        } catch {
          return false;
        }
      });
      if (!prop) return null;
      keyNode = prop.firstChild;
      let value: TreeNode | null = null;
      for (let c = prop.firstChild?.nextSibling ?? null; c; c = c.nextSibling) if (!PUNCTUATION.has(c.name)) value = c;
      node = value;
    } else if (node.name === "Array" && typeof seg === "number") {
      node = valueChildren(node)[seg] ?? null;
      keyNode = null;
    } else return null;
  }
  return where === "key" ? keyNode ?? node : node;
}

/** The JSON path of the object/array node that encloses `node`. */
function pathOf(state: EditorState, node: TreeNode): PathSegment[] {
  const path: PathSegment[] = [];
  let cur: TreeNode = node;
  while (cur.parent) {
    const parent: TreeNode = cur.parent;
    if (parent.name === "Property") {
      const name = parent.firstChild;
      if (name && name !== cur) {
        try {
          path.unshift(JSON.parse(state.sliceDoc(name.from, name.to)) as string);
        } catch {
          /* half-typed key */
        }
      }
    } else if (parent.name === "Array") {
      path.unshift(valueChildren(parent).findIndex((c) => c.from === cur.from));
    }
    cur = parent;
  }
  return path;
}

function structureLinter(kind: MemberKind) {
  const syntax = jsonParseLinter();
  return (view: EditorView): Diagnostic[] => {
    const syntaxErrors = syntax(view);
    if (syntaxErrors.length) return syntaxErrors;
    let value: unknown;
    try {
      value = JSON.parse(view.state.doc.toString());
    } catch {
      return [];
    }
    const out: Diagnostic[] = [];
    for (const issue of checkMember(value, kind)) {
      const node = nodeAtPath(view.state, issue.path, issue.where) ?? syntaxTree(view.state).topNode.firstChild;
      if (!node) continue;
      out.push({ from: node.from, to: Math.max(node.to, node.from + 1), severity: issue.severity, message: issue.message });
    }
    return out;
  };
}

function keyCompletion(kind: MemberKind) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const node = syntaxTree(ctx.state).resolveInner(ctx.pos, -1);
    // Only when the cursor is inside a property name ("na|") or at the start of a new key.
    const inKey = node.name === "PropertyName" || (node.name === "Object" && /[{,]\s*"?\w*$/.test(ctx.state.sliceDoc(Math.max(0, ctx.pos - 40), ctx.pos)));
    if (!inKey) return null;
    const object = node.name === "Object" ? node : node.parent?.parent;
    if (!object || object.name !== "Object") return null;
    const shape = shapeAt(kind, pathOf(ctx.state, object));
    if (!shape || shape.t !== "object") return null;
    const present = new Set(
      valueChildren(object)
        .map((p) => (p.firstChild ? ctx.state.sliceDoc(p.firstChild.from, p.firstChild.to).replace(/^"|"$/g, "") : ""))
        .filter(Boolean),
    );
    const keys = [...Object.keys(shape.fields)];
    if (kind === "cv" && object.parent?.name === "JsonText") keys.push(...COMMON_CV_SECTIONS.filter((k) => !CV_FIXED_KEYS.includes(k)));
    const word = ctx.matchBefore(/"?[\w-]*/);
    const from = node.name === "PropertyName" ? node.from : (word?.from ?? ctx.pos);
    return {
      from,
      filter: true,
      options: keys
        .filter((k) => !present.has(k))
        .map((k) => {
          const child = shape.fields[k];
          const empty = child?.t === "array" ? "[]" : child?.t === "object" ? "{}" : child?.t === "boolean" ? "false" : '""';
          return { label: k, type: "property", detail: child ? (child.t === "union" ? "text or object" : child.t) : "list", apply: `"${k}": ${empty}` };
        }),
    };
  };
}

interface Props {
  value: string;
  onChange?: (text: string) => void;
  readOnly?: boolean;
  /** Enables schema warnings and key completion for that file type. */
  kind?: MemberKind;
  minHeight?: number;
}

export function JsonEditor({ value, onChange, readOnly = false, kind, minHeight = 420 }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const wrapCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const [wrap, setWrap] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [problems, setProblems] = useState<{ from: number; line: number; severity: string; message: string }[]>([]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Create the editor once.
  useEffect(() => {
    if (!host.current) return;
    const extensions = [
      basicSetup,
      json(),
      lintGutter(),
      linter(kind ? structureLinter(kind) : jsonParseLinter(), { delay: 250 }),
      ...(kind ? [jsonLanguage.data.of({ autocomplete: keyCompletion(kind) })] : []),
      oneDark,
      EditorView.theme({ "&": { minHeight: `${minHeight}px`, maxHeight: "72vh" }, ".cm-scroller": { fontFamily: "var(--mono)", fontSize: "13px", lineHeight: "1.5" } }),
      wrapCompartment.current.of([]),
      EditorState.tabSize.of(2),
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !u.transactions.some((t) => t.annotation(external))) onChangeRef.current?.(u.state.doc.toString());
        const head = u.state.selection.main.head;
        const line = u.state.doc.lineAt(head);
        setCursor((c) => (c.line === line.number && c.col === head - line.from + 1 ? c : { line: line.number, col: head - line.from + 1 }));
        const found: { from: number; line: number; severity: string; message: string }[] = [];
        forEachDiagnostic(u.state, (d, from) => found.push({ from, line: u.state.doc.lineAt(from).number, severity: d.severity, message: d.message }));
        setProblems((prev) => (JSON.stringify(prev) === JSON.stringify(found) ? prev : found));
      }),
    ];
    const v = new EditorView({ parent: host.current, state: EditorState.create({ doc: value, extensions }) });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // The editor is created once; later `value` changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, readOnly, minHeight]);

  // Keep the editor in step with the draft when it is changed from outside (UI mode, discard, reload).
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current !== value) v.dispatch({ changes: { from: 0, to: current.length, insert: value }, annotations: external.of(true) });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: wrapCompartment.current.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap]);

  function format() {
    const v = view.current;
    if (!v) return;
    try {
      const pretty = JSON.stringify(JSON.parse(v.state.doc.toString()), null, 2) + "\n";
      if (pretty !== v.state.doc.toString()) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: pretty }, userEvent: "input.format" });
    } catch {
      /* the lint gutter already explains why */
    }
  }

  function jumpTo(from: number) {
    const v = view.current;
    if (!v) return;
    v.dispatch({ selection: { anchor: from }, effects: EditorView.scrollIntoView(from, { y: "center" }) });
    v.focus();
  }

  const errors = problems.filter((p) => p.severity === "error");
  const warnings = problems.filter((p) => p.severity !== "error");

  return (
    <div className="json-ide">
      <div className="json-ide-bar">
        <button type="button" className="btn small" onClick={format} disabled={readOnly || errors.length > 0} title="Pretty-print the JSON (2-space indent)">
          Format
        </button>
        <button type="button" className={`btn small ghost${wrap ? " on" : ""}`} onClick={() => setWrap((w) => !w)} title="Wrap long lines">
          Wrap lines
        </button>
        <span className="json-ide-hint">Ctrl+F find · Ctrl+Z undo · Ctrl+Space suggestions · click ▸ to fold</span>
      </div>
      <div ref={host} className="json-ide-host" />
      <div className="json-ide-status">
        <span className={errors.length ? "error-text" : warnings.length ? "warn-text" : "ok-text"}>
          {errors.length ? `Invalid JSON — ${errors.length} error${errors.length > 1 ? "s" : ""}` : warnings.length ? `Valid JSON · ${warnings.length} warning${warnings.length > 1 ? "s" : ""}` : "Valid JSON"}
        </span>
        <span className="json-ide-pos">Ln {cursor.line}, Col {cursor.col}</span>
      </div>
      {problems.length > 0 && (
        <ul className="json-ide-problems">
          {problems.slice(0, 12).map((p, i) => (
            <li key={i} className={p.severity === "error" ? "bad" : "warn"}>
              <button type="button" onClick={() => jumpTo(p.from)}>
                <code>line {p.line}</code> {p.message}
              </button>
            </li>
          ))}
          {problems.length > 12 && <li className="more">…and {problems.length - 12} more</li>}
        </ul>
      )}
    </div>
  );
}
