"use client";

/**
 * Mirror of the website's CV page (website: src/app/cv/page.tsx), with the website's own CSS module.
 * UI mode makes every value editable; preview mode renders the same read-only markup as the website.
 * When the website's CV page changes, update this file to match (see docs/TODO.md).
 */
import { useState } from "react";
import type { Member } from "@/lib/types";
import type { Json } from "@/lib/member-schema";
import { CV_FIXED_KEYS } from "@/lib/member-schema";
import { getAtPath, setAtPath, type PathSegment } from "@/lib/object-path";
import { asArray, asString, Add, MirrorProvider, T, Tags, Tools, useMirror } from "./edit";
import { FitName } from "./FitName";
import styles from "./cv.module.css";
import "./mirror.css";

type Obj = Record<string, unknown>;

interface Props {
  data: Json;
  editable: boolean;
  update: (fn: (data: Json) => Json) => void;
  member: Member;
  /** "Club President" / "Former Club President" — computed like the website does. */
  roleLabel: string;
  theme: "dark" | "light";
  photoSrc: (value: string) => string;
  onOpenProfile?: () => void;
}

/** Database values such as "null /4.0" come from empty fields — the website never shows them (nor does preview). */
function usable(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return v !== "" && !/^(null|undefined|n\/a|-)\b/i.test(v);
}

const sectionTitle = (key: string) => "// " + key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

function Bullets({ base }: { base: PathSegment[] }) {
  const { data, editable, update } = useMirror();
  const path = [...base, "bullets"];
  const items = asArray(getAtPath(data, path));
  if (!editable && items.length === 0) return null;
  return (
    <div className={styles.cvBullets}>
      {items.map((b, i) =>
        b && typeof b === "object" ? (
          <div key={i} className={`${styles.cvBulletGroup} m-item`}>
            <Tools listPath={path} index={i} count={items.length} />
            <div className={styles.cvBulletMain}><T path={[...path, i, "text"]} placeholder="Bullet text" /></div>
            <div className={styles.cvBulletChildren}>
              {asArray((b as Obj).children).map((_, ci) => (
                <div key={ci} className={`${styles.cvBulletChild} m-item`}>
                  <Tools listPath={[...path, i, "children"]} index={ci} count={asArray((b as Obj).children).length} />
                  <T path={[...path, i, "children", ci]} placeholder="Sub-bullet" />
                </div>
              ))}
              <Add path={[...path, i, "children"]} make={() => ""} label="sub-bullet" />
            </div>
          </div>
        ) : (
          <div key={i} className={`${styles.cvBullet} m-item`}>
            <Tools listPath={path} index={i} count={items.length} />
            <T path={[...path, i]} placeholder="Bullet text" />
            {editable && (
              <button type="button" className="m-mini" style={{ marginLeft: 8 }} title="Turn into a bullet with sub-bullets" onClick={() => update((d) => setAtPath(d, [...path, i], { text: asString(b), children: [] }))}>
                + sub-bullets
              </button>
            )}
          </div>
        ),
      )}
      <Add path={path} make={() => ""} label="bullet" />
    </div>
  );
}

function Commas({ base }: { base: PathSegment[] }) {
  const { data, editable } = useMirror();
  const path = [...base, "commas"];
  if (!editable && asArray(getAtPath(data, path)).length === 0) return null;
  const items = asArray(getAtPath(data, path));
  if (editable) return <Tags path={path} className={styles.cvCommaList} itemClassName={styles.cvCommaItem} label="item" objectText />;
  return (
    <div className={styles.cvCommaList}>
      {items.map((it, i) => (
        <span key={i} className={styles.cvCommaItem}>
          {typeof it === "object" && it !== null ? asString((it as Obj).text) : asString(it)}
          {i < items.length - 1 ? ", " : ""}
        </span>
      ))}
    </div>
  );
}

function Entry({ sectionKey, index, count }: { sectionKey: string; index: number; count: number }) {
  const { data, editable } = useMirror();
  const base: PathSegment[] = [sectionKey, index];
  const item = (getAtPath(data, base) ?? {}) as Obj;
  return (
    <div className={`${styles.cvExpBlock} m-item`}>
      <Tools listPath={[sectionKey]} index={index} count={count} />
      <div className={styles.cvExpHeader}>
        <span className={styles.cvExpRole}><T path={[...base, "title"]} placeholder="Title" /></span>
        {(editable || !!item.dates) && <span className={styles.cvExpDates}><T path={[...base, "dates"]} placeholder="Dates" /></span>}
      </div>
      {(editable || !!item.subtitle) && <div className={styles.cvExpCompany}><T path={[...base, "subtitle"]} placeholder="Subtitle (company, venue…)" /></div>}
      <Bullets base={base} />
      <Commas base={base} />
    </div>
  );
}

function Section({ sectionKey, marginTop }: { sectionKey: string; marginTop?: string }) {
  const { data, editable, update } = useMirror();
  const items = asArray(data[sectionKey]);
  return (
    <>
      <div className={styles.cvSectionLabel} style={marginTop ? { marginTop } : undefined}>
        {sectionTitle(sectionKey)}
        {editable && sectionKey !== "experience" && (
          <button type="button" className="m-mini" style={{ marginLeft: 12 }} title="Remove this whole section" onClick={() => window.confirm(`Remove the whole “${sectionTitle(sectionKey).slice(3)}” section?`) && update((d) => {
            const next = { ...d };
            delete next[sectionKey];
            return next;
          })}>
            remove section
          </button>
        )}
      </div>
      {items.map((_, i) => <Entry key={i} sectionKey={sectionKey} index={i} count={items.length} />)}
      <Add path={[sectionKey]} make={() => ({ title: "", subtitle: "", dates: "", bullets: [] })} label="entry" />
    </>
  );
}

function AddSection() {
  const { data, editable, update } = useMirror();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  if (!editable) return null;
  const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const taken = key in data || CV_FIXED_KEYS.includes(key);
  const create = () => {
    if (!key || taken) return;
    update((d) => ({ ...d, [key]: [] }));
    setName("");
    setOpen(false);
  };
  if (!open) return <button type="button" className="m-add" style={{ marginTop: "2rem" }} onClick={() => setOpen(true)}>+ Add section</button>;
  return (
    <div className="m-row" style={{ marginTop: "2rem" }}>
      <input autoFocus className="m-input" style={{ width: "24ch" }} placeholder="Section name, e.g. Awards" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
      <button type="button" className="m-mini" disabled={!key || taken} onClick={create}>Add</button>
      <button type="button" className="m-mini" onClick={() => setOpen(false)}>Cancel</button>
      {key && <small>{taken ? "That section already exists." : `Shown as “${sectionTitle(key)}”`}</small>}
    </div>
  );
}

function Certification({ index, count }: { index: number; count: number }) {
  const { data, editable, update } = useMirror();
  const cert = asArray(data.certifications)[index];
  const isObject = !!cert && typeof cert === "object";
  const base: PathSegment[] = ["certifications", index];
  const name = isObject ? asString((cert as Obj).title) : asString(cert);
  const link = isObject ? asString((cert as Obj).link) : "";
  if (!editable) {
    return (
      <div className={styles.cvCert}>
        <span style={{ marginRight: "0.25rem" }}>📜</span>
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className={styles.cvCertLink}>{name} (↗ View)</a>
        ) : (
          <span className={styles.cvCertText}>{name}</span>
        )}
      </div>
    );
  }
  return (
    <div className={`${styles.cvCert} m-item`}>
      <Tools listPath={["certifications"]} index={index} count={count} />
      <span style={{ marginRight: "0.25rem" }}>📜</span>
      <span className={styles.cvCertText}><T path={isObject ? [...base, "title"] : base} placeholder="Certification" /></span>
      {isObject ? (
        <T path={[...base, "link"]} placeholder="Link (https://…)" className="m-sub" />
      ) : (
        <button type="button" className="m-mini" style={{ marginLeft: 8 }} onClick={() => update((d) => setAtPath(d, base, { title: name, link: "" }))}>+ link</button>
      )}
    </div>
  );
}

function Body({ member, roleLabel, photoSrc, onOpenProfile }: Omit<Props, "data" | "editable" | "update" | "theme">) {
  const { data, editable } = useMirror();
  const education = asArray(data.education) as Obj[];
  const certs = asArray(data.certifications);
  const dynamicKeys = Object.entries(data)
    .filter(([key, value]) => Array.isArray(value) && !CV_FIXED_KEYS.includes(key))
    .map(([key]) => key);
  const icon = member.icon_link ? photoSrc(member.icon_link) : "";

  return (
    <div className={styles.cvLayout}>
      <header className={styles.cvHeader}>
        <div className={styles.cvTitleBlock}>
          <span className={styles.cvEyebrow}>{"// Curriculum vitae"}</span>
          <h1 className={styles.cvMainTitle}>
            The Official <span className={styles.cvAccent}>Record.</span>
          </h1>
        </div>
      </header>

      <div className={styles.cvDocument}>
        <div className={styles.cvDocHeader}>
          <div className={styles.cvDocAvatar}>
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element -- previews can be blob: URLs, which next/image cannot show
              <img src={icon} alt={member.name} width={76} height={76} className={styles.avatarImg} />
            ) : (
              <span className={styles.avatarInitial}>{member.initial}</span>
            )}
          </div>
          <div className={styles.cvDocInfo}>
            <FitName
              id="cv-name"
              as="h2"
              text={member.name}
              className={styles.cvDocName}
              maxLines={3}
              minSize={20}
              maxSize={38}
              maxWidthRatio={0.1}
              lineHeight={1.1}
              title={editable ? "The name comes from the member's entry in Executives" : undefined}
            />
            <div className={styles.cvDocRole}>
              <span>{roleLabel.toUpperCase()}</span>
              {(editable || !!data.role) && <span className={styles.cvDocRoleSep}>·</span>}
              {(editable || !!data.role) && <span><T path={["role"]} placeholder="Role / headline" /></span>}
            </div>
            <div className={styles.cvDocMeta}>
              {(editable || usable(data.location)) && <span className={styles.cvDocMetaItem}><span aria-hidden="true">📍</span> <T path={["location"]} placeholder="Location" /></span>}
              {(editable || usable(data.email)) && <span className={styles.cvDocMetaItem}><span aria-hidden="true">✉</span> <T path={["email"]} placeholder="Email" /></span>}
              {(editable || usable(data.github)) && <span className={styles.cvDocMetaItem}><span aria-hidden="true">⌥</span> <T path={["github"]} placeholder="GitHub" /></span>}
            </div>
          </div>
        </div>

        <div className={styles.cvDocBody}>
          <aside className={styles.cvDocSide}>
            <div className={styles.cvSectionLabel}>{"// Education"}</div>
            {education.map((edu, i) => (
              <div key={i} className={`${styles.cvEdu} m-item`}>
                <Tools listPath={["education"]} index={i} count={education.length} />
                <div className={styles.cvEduDeg}><T path={["education", i, "degree"]} placeholder="Degree" /></div>
                <div className={styles.cvEduUni}>
                  <span><T path={["education", i, "institution"]} placeholder="Institution" /></span>
                  {(editable || usable(edu.year)) && <span><T path={["education", i, "year"]} placeholder="Year" /></span>}
                </div>
                {(editable || usable(edu.cgpa) || usable(edu.rank)) && (
                  <div className={styles.cvEduMeta}>
                    {(editable || usable(edu.cgpa)) && <span>CGPA: <T path={["education", i, "cgpa"]} placeholder="—" /></span>}
                    {(editable || usable(edu.rank)) && <span>Rank: <T path={["education", i, "rank"]} placeholder="—" /></span>}
                  </div>
                )}
              </div>
            ))}
            <Add path={["education"]} make={() => ({ degree: "", institution: "", year: "" })} label="education" />

            {(editable || certs.length > 0) && (
              <>
                <div className={styles.cvSectionLabel} style={{ marginTop: "1.5rem" }}>{"// Certifications"}</div>
                {certs.map((_, i) => <Certification key={i} index={i} count={certs.length} />)}
                <Add path={["certifications"]} make={() => ""} label="certification" />
              </>
            )}

            {(editable || asArray(data.languages).length > 0) && (
              <>
                <div className={styles.cvSectionLabel} style={{ marginTop: "1.5rem" }}>{"// Languages"}</div>
                <Tags path={["languages"]} className={styles.cvLangGrid} itemClassName={styles.cvLangPill} label="language" />
              </>
            )}
          </aside>

          <main className={styles.cvDocMain}>
            <Section sectionKey="experience" />
            {dynamicKeys.map((key) => <Section key={key} sectionKey={key} marginTop="2rem" />)}
            <AddSection />
          </main>
        </div>
      </div>

      <div className={styles.profileCallToAction}>
        <a className={styles.profileButton} href="#profile" onClick={(e) => { e.preventDefault(); onOpenProfile?.(); }}>
          View Profile ↗
        </a>
      </div>
    </div>
  );
}

export function CvMirror({ data, editable, update, member, roleLabel, theme, photoSrc, onOpenProfile }: Props) {
  return (
    <MirrorProvider value={{ data, editable, update }}>
      <div className="site-mirror" data-theme={theme}>
        <section className={`${styles.pageContainer} pg`} id="page-cv" style={{ paddingTop: "1rem", paddingBottom: "2rem" }}>
          <Body member={member} roleLabel={roleLabel} photoSrc={photoSrc} onOpenProfile={onOpenProfile} />
        </section>
      </div>
    </MirrorProvider>
  );
}
