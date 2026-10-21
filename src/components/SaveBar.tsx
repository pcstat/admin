"use client";

import { useShallow } from "zustand/react/shallow";
import { changedSections } from "@/lib/changes";
import { dirtyCodes, useCertificatesStore } from "@/store/certificates-store";
import { useContentStore } from "@/store/content-store";
import { saveAll } from "@/store/save-all";
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
  // Certificates live in their own repository, but are saved and published with the same buttons.
  const c = useCertificatesStore(
    useShallow((st) => ({ sets: dirtyCodes(st).length, saveStatus: st.saveStatus, saveError: st.saveError, problems: st.problems, pending: st.pendingPublish, publishStatus: st.publishStatus, publishMessage: st.publishMessage })),
  );
  const { undo, redo, reset, publish, setPublishOnSave } = useContentStore.getState();
  const github = s.provider === "github";
  const busy = s.saveStatus === "saving" || c.saveStatus === "saving";
  const dirty = s.dirty || c.sets > 0;
  const pendingPublish = s.pendingPublish || c.pending;
  const publishStatus = s.publishStatus === "busy" || c.publishStatus === "busy" ? "busy" : s.publishStatus === "error" || c.publishStatus === "error" ? "error" : s.publishStatus === "done" || c.publishStatus === "done" ? "done" : "idle";
  const problems = [...s.problems.map((p) => p.message), ...c.problems.map((p) => p.message)];
  const saveError = s.saveStatus === "error" ? s.saveError : c.saveStatus === "error" ? c.saveError : null;
  async function publishAll() {
    if (s.pendingPublish) await publish();
    if (c.pending) await useCertificatesStore.getState().publish();
  }

  // What changed, in the words of the menu: the pages, plus the member files.
  const changes = [...pages, ...(memberFiles ? [memberFiles === 1 ? "Member file" : `${memberFiles} member files`] : []), ...(c.sets ? [c.sets === 1 ? "Certificate set" : `${c.sets} certificate sets`] : [])];
  const count = pages.length + memberFiles + c.sets;

  let message = "All changes saved";
  let tone = "ok";
  if (busy) {
    message = "Saving…";
    tone = "busy";
  } else if (saveError) {
    message = saveError;
    tone = "bad";
  } else if (dirty) {
    message = `${count || 1} unsaved ${count === 1 ? "change" : "changes"}`;
    tone = "warn";
  }
  const shownCount = dirty || busy ? Math.max(count, 1) : 0;

  const hasExtra = (s.saveStatus === "saved" && !dirty && Boolean(s.lastCommitUrl) && !pendingPublish) || (github && pendingPublish) || publishStatus === "done" || publishStatus === "error" || problems.length > 0;

  return (
    <header className={`savebar${!dirty && !busy && !saveError && !hasExtra ? " clean" : ""}`}>
      <div className="savebar-row">
        <div className="savebar-status">
          <span className={`status ${tone}`} title={message} aria-label={message} aria-live="polite">
            <span className="status-dot" />
            <span className="status-count">{shownCount}</span>
            <span className="status-text">{message}</span>
          </span>
          {dirty && changes.length > 0 && (
            <span className="changed-files" title={changes.join("\n")}>
              {changes.slice(0, 3).map((c) => <code key={c}>{c}</code>)}
              {changes.length > 3 && <code>+{changes.length - 3}</code>}
            </span>
          )}
        </div>
        <div className="savebar-actions">
          <button className="btn ghost icon-label sb-undo" onClick={undo} disabled={!canUndo || busy} title="Undo" aria-label="Undo"><Icon name="undo" size={15} /><span>Undo</span></button>
          <button className="btn ghost icon-label sb-redo" onClick={redo} disabled={!canRedo || busy} title="Redo" aria-label="Redo"><Icon name="redo" size={15} /><span>Redo</span></button>
          <button className="btn ghost sb-discard" disabled={!dirty || busy} onClick={() => window.confirm("Discard every unsaved change?") && (reset(), useCertificatesStore.getState().discard())}>Discard</button>
          {github && (
            <label className="toggle sb-toggle" title="Switch off to save without updating the website yet. Press “Publish now” later, when you are ready.">
              <input type="checkbox" checked={s.publishOnSave} onChange={(e) => setPublishOnSave(e.target.checked)} />
              <span className="toggle-track" aria-hidden="true" />
              <span className="long">Publish on save</span>
              <span className="short">Publish</span>
            </label>
          )}
          <button className="btn primary sb-save" disabled={!dirty || busy} onClick={() => void saveAll()}>
            <span className="long">{github ? (s.publishOnSave ? "Save and publish" : "Save only") : "Save"}</span>
            <span className="short">Save</span>
          </button>
        </div>
      </div>
      {hasExtra && (
        <div className="savebar-extra">
          {s.saveStatus === "saved" && !dirty && s.lastCommitUrl && !pendingPublish && <p className="savebar-note">Saved. The website will update in 1–3 minutes.</p>}
          {github && pendingPublish && (
            <p className="savebar-note publish-note">
              <span>Saved, but <strong>not published</strong> — the live website still shows the old content.</span>
              <button className="btn small primary" onClick={() => void publishAll()} disabled={publishStatus === "busy"}>
                <Icon name="rocket" size={14} /> {publishStatus === "busy" ? "Starting…" : "Publish now"}
              </button>
            </p>
          )}
          {publishStatus === "done" && <p className="savebar-note">Publishing started. The website will update in a few minutes.</p>}
          {publishStatus === "error" && <p className="savebar-note error-text">{useContentStore.getState().publishMessage ?? useCertificatesStore.getState().publishMessage}</p>}
          {problems.length > 0 && (
            <ul className="problems">
              {problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </header>
  );
}
