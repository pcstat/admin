"use client";

import { useState } from "react";
import type { MemberKind } from "@/lib/member-schema";

export type Mode = "ui" | "json" | "preview";

interface Props {
  mode: Mode;
  onMode: (mode: Mode) => void;
  kind: MemberKind;
  readOnly: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  theme: "dark" | "light";
  onTheme: (theme: "dark" | "light") => void;
  sourceLabel: string;
  onChangeSource: () => void;
  onReload?: () => void;
  onImport?: () => void;
  otherLabel: string;
  onOther: () => void;
  siteLink?: string;
}

const MODES: { id: Mode; icon: string; label: string; hint: string }[] = [
  { id: "ui", icon: "✎", label: "UI editing", hint: "Click any text on the page to edit it. Hover an item to drag it by ⠿ or move it with ↑ ↓ (✕ removes it); pills have ‹ › — use “+ Add” to add more." },
  { id: "json", icon: "{ }", label: "JSON editing", hint: "Edit the raw file with line numbers, folding, error markers and field suggestions (Ctrl+Space)." },
  { id: "preview", icon: "👁", label: "Preview", hint: "Exactly how the page looks on the website, including your unsaved changes." },
];

/** The right-hand panel of the member editor: the three modes, undo/redo, theme and source. */
export function ModePanel(p: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const active = MODES.find((m) => m.id === p.mode);
  return (
    <aside className={`mode-panel${collapsed ? " collapsed" : ""}`}>
      <button type="button" className="collapse-toggle" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand panel" : "Collapse panel"} title={collapsed ? "Expand panel" : "Collapse panel"}>
        {collapsed ? "‹" : "›"}
      </button>
      {!collapsed && (
        <>
          <p className="panel-title">Mode</p>
          <div className="mode-toggle" role="tablist" aria-label="Editing mode">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="tab" aria-selected={p.mode === m.id} className={`mode-btn${p.mode === m.id ? " active" : ""}`} onClick={() => p.onMode(m.id)}>
                <span className="mode-icon">{m.icon}</span> {m.label}
              </button>
            ))}
          </div>
          <p className="panel-hint">{active?.hint}</p>

          {p.mode === "ui" && !p.readOnly && (
            <div className="panel-row">
              <button type="button" className="btn small ghost" disabled={!p.canUndo} onClick={p.onUndo}>↶ Undo</button>
              <button type="button" className="btn small ghost" disabled={!p.canRedo} onClick={p.onRedo}>↷ Redo</button>
            </div>
          )}
          {p.mode !== "json" && (
            <div className="panel-row">
              <span className="panel-label">Site theme</span>
              <button type="button" className="btn small ghost" onClick={() => p.onTheme(p.theme === "dark" ? "light" : "dark")}>{p.theme === "dark" ? "☾ Dark" : "☀ Light"}</button>
            </div>
          )}

          <p className="panel-title">Source</p>
          <p className="panel-source">{p.sourceLabel}</p>
          <div className="panel-col">
            <button type="button" className="btn small" onClick={p.onChangeSource}>Change source…</button>
            {p.onReload && <button type="button" className="btn small ghost" onClick={p.onReload}>Reload from source</button>}
            {p.onImport && <button type="button" className="btn small ghost" onClick={p.onImport}>Copy into club database</button>}
          </div>

          <p className="panel-title">Related</p>
          <div className="panel-col">
            <button type="button" className="btn small ghost" onClick={p.onOther}>Open the {p.otherLabel} →</button>
            {p.siteLink && <a className="btn small ghost" href={p.siteLink} target="_blank" rel="noreferrer">Saved version on website ↗</a>}
          </div>
        </>
      )}
    </aside>
  );
}
