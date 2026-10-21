"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDateLong, formatId } from "@/lib/certificates/core";
import { WEBSITE_URL } from "@/lib/site-config";
import { useCertificatesStore } from "@/store/certificates-store";
import { Icon } from "../Icon";
import { CertPreview } from "./CertPreview";

const today = () => new Date().toISOString().slice(0, 10);

/** Side panel of one certificate: edit what is allowed, see it as printed, copy its share link, revoke or restore it. */
export function CertDrawer({ code, personId, onClose }: { code: string; personId: string; onClose: () => void }) {
  const state = useCertificatesStore((s) => s.sets[code]);
  const manifest = useCertificatesStore((s) => s.manifest);
  const { updatePerson, setRevoked, removePerson } = useCertificatesStore.getState();
  const [reason, setReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = state?.draft;
  const person = set?.people[personId];
  if (!state || !set || !person) return null;
  const cert = set.certificate;
  const id = formatId(code, personId);
  const tpl = manifest?.templates.find((t) => t.file === cert.template);
  const personal = (tpl?.fields ?? []).filter((f) => f.scope === "recipient" || f.scope === "either");
  const isSaved = state.savedIds.has(personId);
  const link = `${WEBSITE_URL || "https://<your-website>"}/c/${formatId(code, personId)}`;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  return (
    <>
      <div className="cert-backdrop" onClick={onClose} />
      <aside className="cert-drawer" role="dialog" aria-label={`Certificate of ${person.name}`}>
        <header>
          <div>
            <p className="eyebrow">{"// CERTIFICATE"}</p>
            <h2>{person.name || "Unnamed"}</h2>
            <p className="hint">{cert.title} · {formatDateLong(cert.date)} · <Link href={`/certificates/set?code=${encodeURIComponent(code)}`}>Set {code}</Link></p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
        </header>

        {person.revoked && (
          <p className="notice cert-revoked-note">
            <strong>Revoked</strong> on {formatDateLong(person.revoked.date)}{person.revoked.reason ? ` — ${person.revoked.reason}` : ""}. The verification page says so.
          </p>
        )}

        <div className="cert-idrow">
          <code className="mono">{id}</code>
          <button className="btn small ghost" onClick={() => void copy(id)}><Icon name="copy" size={13} /> {copied ? "Copied" : "Copy ID"}</button>
        </div>
        <div className="cert-idrow">
          <code className="mono cert-link">{link}</code>
          <button className="btn small ghost" onClick={() => void copy(link)}><Icon name="copy" size={13} /> Copy link</button>
          {WEBSITE_URL && <a className="btn small ghost" href={link} target="_blank" rel="noreferrer"><Icon name="external" size={13} /> Open</a>}
        </div>
        {!isSaved && <p className="hint">Not saved yet — the link works once this is saved and published.</p>}

        <div className="fields">
          <label className="field wide">
            <span className="label">Recipient <em> *</em></span>
            <input type="text" value={person.name} onChange={(e) => updatePerson(code, personId, { name: e.target.value })} />
          </label>
          {personal.map((f) => (
            <label className="field" key={f.key}>
              <span className="label">{f.label}</span>
              <input
                type="text"
                value={person.fields?.[f.key] ?? ""}
                placeholder={f.scope === "either" ? (cert.fields?.[f.key] ?? "") : f.help}
                onChange={(e) => {
                  const next = { ...(person.fields ?? {}) };
                  if (e.target.value) next[f.key] = e.target.value;
                  else delete next[f.key];
                  updatePerson(code, personId, { fields: next });
                }}
              />
              {f.scope === "either" && <span className="help">Empty = the set’s value.</span>}
            </label>
          ))}
          <label className="field wide">
            <span className="label">Internal note</span>
            <input type="text" value={person.note ?? ""} placeholder="e-mail, roll number … — never shown on the website" onChange={(e) => updatePerson(code, personId, { note: e.target.value })} />
            <span className="help"><strong>Not private:</strong> it is stored in the registry repository, and the website reads that repository from GitHub — if the repository is public, anyone can read this note. Do not put e-mail addresses or other personal details here.</span>
          </label>
        </div>

        <CertPreview set={set} personId={personId} person={person} />

        <div className="cert-actions">
          {person.revoked ? (
            <button className="btn" onClick={() => setRevoked([{ code, personId }], undefined)}>Restore this certificate</button>
          ) : revoking ? (
            <div className="cert-revoke-form">
              <input type="text" autoFocus value={reason} placeholder="Reason (shown to whoever verifies; optional)" onChange={(e) => setReason(e.target.value)} />
              <button className="btn" onClick={() => { setRevoked([{ code, personId }], { date: today(), reason: reason.trim() || undefined }); setRevoking(false); setReason(""); }}>Revoke</button>
              <button className="btn ghost" onClick={() => setRevoking(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn" onClick={() => setRevoking(true)}>Revoke…</button>
          )}
          {!isSaved && (
            <button className="btn ghost" onClick={() => { removePerson(code, personId); onClose(); }}>Take back (not saved yet)</button>
          )}
        </div>
        {isSaved && <p className="hint">An issued certificate cannot be deleted — revoking it makes the verification page say it is no longer valid, and the record stays.</p>}
      </aside>
    </>
  );
}
