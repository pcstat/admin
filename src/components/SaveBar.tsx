"use client";

import { useContentStore } from "@/store/content-store";

export function SaveBar() {
  const { dirty, saveStatus, saveError, problems, lastCommitUrl, provider } = useContentStore();
  const canUndo = useContentStore((s) => s.past.length > 0);
  const canRedo = useContentStore((s) => s.future.length > 0);
  const { undo, redo, reset, save } = useContentStore.getState();

  let message = "All changes saved";
  let tone = "ok";
  if (saveStatus === "saving") {
    message = "Saving…";
    tone = "busy";
  } else if (saveStatus === "error") {
    message = saveError ?? "Save failed";
    tone = "bad";
  } else if (dirty) {
    message = "Unsaved changes";
    tone = "warn";
  }

  return (
    <header className="savebar">
      <div className="savebar-row">
        <span className={`status ${tone}`}>{message}</span>
        <div className="savebar-actions">
          <button className="btn ghost" onClick={undo} disabled={!canUndo || saveStatus === "saving"} title="Undo">↶ Undo</button>
          <button className="btn ghost" onClick={redo} disabled={!canRedo || saveStatus === "saving"} title="Redo">↷ Redo</button>
          <button
            className="btn ghost"
            disabled={!dirty || saveStatus === "saving"}
            onClick={() => window.confirm("Discard every unsaved change?") && reset()}
          >
            Discard
          </button>
          <button className="btn primary" disabled={!dirty || saveStatus === "saving"} onClick={() => void save()}>
            {provider === "github" ? "Save to GitHub" : "Save"}
          </button>
        </div>
      </div>
      {saveStatus === "saved" && !dirty && lastCommitUrl && (
        <p className="savebar-note">
          Saved. The website rebuilds automatically (usually 1–3 minutes). <a href={lastCommitUrl} target="_blank" rel="noreferrer">View commit ↗</a>
        </p>
      )}
      {problems.length > 0 && (
        <ul className="problems">
          {problems.map((p, i) => (
            <li key={i}><code>{p.file}</code> {p.message}</li>
          ))}
        </ul>
      )}
    </header>
  );
}
