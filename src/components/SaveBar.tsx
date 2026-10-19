"use client";

import { useShallow } from "zustand/react/shallow";
import { changedSections } from "@/lib/changes";
import { useContentStore } from "@/store/content-store";
import { Icon } from "./Icon";

export function SaveBar() {
  const s = useContentStore(
    useShallow((st) => ({
      dirty: st.dirty,
      saveStatus: st.saveStatus,
      saveError: st.saveError,
      problems: st.problems,
      lastCommitUrl: st.lastCommitUrl,
      provider: st.provider,
      publishOnSave: st.publishOnSave,
      pendingPublish: st.pendingPublish,
      publishStatus: st.publishStatus,
    })),
  );
  const canUndo = useContentStore((st) => st.past.length > 0);
  const canRedo = useContentStore((st) => st.future.length > 0);
  const pages = useContentStore(useShallow((st) => changedSections(st.docs).map((p) => p.title)));
  const memberFiles = useContentStore((st) => Object.values(st.memberDrafts).filter((m) => m.original === null || m.draft !== m.original).length);
  const { undo, redo, reset, save, publish, setPublishOnSave } = useContentStore.getState();
  const github = s.provider === "github";
  const busy = s.saveStatus === "saving";
  const publishStatus = s.publishStatus;

  // What changed, in the words of the menu: the pages, plus the member files.
  const changes = [...pages, ...(memberFiles ? [memberFiles === 1 ? "Member file" : `${memberFiles} member files`] : [])];
  const count = pages.length + memberFiles;

  let message = "All changes saved";
  let tone = "ok";
  if (busy) {
    message = "Saving…";
    tone = "busy";
  } else if (s.saveStatus === "error") {
    message = s.saveError ?? "Save failed";
    tone = "bad";
  } else if (s.dirty) {
    message = `${count || 1} unsaved ${count === 1 ? "change" : "changes"}`;
    tone = "warn";
  }
  const shownCount = s.dirty || busy ? Math.max(count, 1) : 0;

  const hasExtra = (s.saveStatus === "saved" && !s.dirty && Boolean(s.lastCommitUrl) && !s.pendingPublish) || (github && s.pendingPublish) || publishStatus === "done" || publishStatus === "error" || s.problems.length > 0;

  return (
    <header className={`savebar${!s.dirty && !busy && s.saveStatus !== "error" && !hasExtra ? " clean" : ""}`}>
      <div className="savebar-row">
        <div className="savebar-status">
          <span className={`status ${tone}`} title={message} aria-label={message} aria-live="polite">
            <span className="status-dot" />
            <span className="status-count">{shownCount}</span>
            <span className="status-text">{message}</span>
          </span>
          {s.dirty && changes.length > 0 && (
            <span className="changed-files" title={changes.join("\n")}>
              {changes.slice(0, 3).map((c) => <code key={c}>{c}</code>)}
              {changes.length > 3 && <code>+{changes.length - 3}</code>}
            </span>
          )}
        </div>
        <div className="savebar-actions">
          <button className="btn ghost icon-label sb-undo" onClick={undo} disabled={!canUndo || busy} title="Undo" aria-label="Undo"><Icon name="undo" size={15} /><span>Undo</span></button>
          <button className="btn ghost icon-label sb-redo" onClick={redo} disabled={!canRedo || busy} title="Redo" aria-label="Redo"><Icon name="redo" size={15} /><span>Redo</span></button>
          <button className="btn ghost sb-discard" disabled={!s.dirty || busy} onClick={() => window.confirm("Discard every unsaved change?") && reset()}>Discard</button>
          {github && (
            <label className="toggle sb-toggle" title="Switch off to save without updating the website yet. Press “Publish now” later, when you are ready.">
              <input type="checkbox" checked={s.publishOnSave} onChange={(e) => setPublishOnSave(e.target.checked)} />
              <span className="toggle-track" aria-hidden="true" />
              <span className="long">Publish on save</span>
              <span className="short">Publish</span>
            </label>
          )}
          <button className="btn primary sb-save" disabled={!s.dirty || busy} onClick={() => void save()}>
            <span className="long">{github ? (s.publishOnSave ? "Save and publish" : "Save only") : "Save"}</span>
            <span className="short">Save</span>
          </button>
        </div>
      </div>
      {hasExtra && (
        <div className="savebar-extra">
          {s.saveStatus === "saved" && !s.dirty && s.lastCommitUrl && !s.pendingPublish && <p className="savebar-note">Saved. The website will update in 1–3 minutes.</p>}
          {github && s.pendingPublish && (
            <p className="savebar-note publish-note">
              <span>Saved, but <strong>not published</strong> — the live website still shows the old content.</span>
              <button className="btn small primary" onClick={() => void publish()} disabled={publishStatus === "busy"}>
                <Icon name="rocket" size={14} /> {publishStatus === "busy" ? "Starting…" : "Publish now"}
              </button>
            </p>
          )}
          {publishStatus === "done" && <p className="savebar-note">Publishing started. The website will update in a few minutes.</p>}
          {publishStatus === "error" && <p className="savebar-note error-text">{useContentStore.getState().publishMessage}</p>}
          {s.problems.length > 0 && (
            <ul className="problems">
              {s.problems.map((p, i) => (
                <li key={i}>{p.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </header>
  );
}
