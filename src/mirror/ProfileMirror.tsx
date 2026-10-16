"use client";

/**
 * Mirror of the website's profile page (website: src/app/profile/DynamicProfile.tsx).
 * Same markup and the website's own CSS module, so it looks the same; in UI mode the values are editable.
 * When the website's DynamicProfile changes, update this file to match (see docs/TODO.md).
 */
import { useRef, useState } from "react";
import type { Member } from "@/lib/types";
import type { Json } from "@/lib/member-schema";
import { asArray, asString, Add, Check, Field, MirrorProvider, T, Tags, Tools, useMirror } from "./edit";
import styles from "./DynamicProfile.module.css";
import "./mirror.css";

interface Props {
  data: Json;
  editable: boolean;
  update: (fn: (data: Json) => Json) => void;
  member: Member;
  theme: "dark" | "light";
  /** Turns a photo path from the JSON into something an <img> can show. */
  photoSrc: (value: string) => string;
  /** Called with the chosen image file (UI mode); should return the value to store in `photo`. */
  onPickPhoto?: (file: File) => Promise<string>;
  onOpenCv?: () => void;
}

type Obj = Record<string, unknown>;

function Section({ show, className, title, children, num }: { show: boolean; className?: string; title: string; children: React.ReactNode; num: string }) {
  if (!show) return null;
  return (
    <section className={className}>
      <span className={styles.sectionNumber}>{num} /</span>
      <h2 className={styles.masthead}>{title}</h2>
      {children}
    </section>
  );
}

function Photo({ member, photoSrc, onPickPhoto }: Pick<Props, "member" | "photoSrc" | "onPickPhoto">) {
  const { data, editable, update } = useMirror();
  const input = useRef<HTMLInputElement>(null);
  const [broken, setBroken] = useState("");
  const [error, setError] = useState("");
  const src = asString(data.photo) || member.icon_link || "";
  const url = src ? photoSrc(src) : "";
  const image =
    url && broken !== url ? (
      // eslint-disable-next-line @next/next/no-img-element -- previews can be blob: URLs, which next/image cannot show
      <img src={url} alt={asString(data.name) || member.name} width={320} height={320} className={styles.profileImage} onError={() => setBroken(url)} />
    ) : (
      <div>{member.initial}</div>
    );
  if (!editable || !onPickPhoto) return image;
  return (
    <>
      <span className="m-photo" role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => e.key === "Enter" && input.current?.click()} title="Click to change the photo">
        {image}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError("");
          try {
            const rel = await onPickPhoto(file);
            update((d) => ({ ...d, photo: rel }));
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      />
      {error && <small style={{ color: "#ff6b6b" }}>{error}</small>}
    </>
  );
}

function Social({ s, i, count }: { s: Obj; i: number; count: number }) {
  const { editable } = useMirror();
  return editable ? (
    <span className={`${styles.socialItem} m-item`}>
      <T path={["socials", i, "label"]} placeholder="Label" /> ↗
      <T path={["socials", i, "url"]} placeholder="https://…" className="m-sub" />
      <Tools listPath={["socials"]} index={i} count={count} />
    </span>
  ) : (
    <a href={asString(s.url)} target="_blank" rel="noopener noreferrer" className={styles.socialItem}>
      {asString(s.label)} ↗
    </a>
  );
}

function TimelineCard({ item, i, count }: { item: Obj; i: number; count: number }) {
  const { editable } = useMirror();
  const current = item.end === "present";
  return (
    <div className={styles.timelineCardContainer}>
      <div className={styles.timelineYear}>
        <T path={["timeline", i, "start"]} placeholder="Start" /> – <T path={["timeline", i, "end"]} placeholder="End / present" />
      </div>
      <div className={`${styles.timelineCard} m-item`}>
        <Tools listPath={["timeline"]} index={i} count={count} />
        <div className={styles.timelineRole}>
          <T path={["timeline", i, "role"]} placeholder="Role" />
          {current && <span className={styles.currentBadge}>Current</span>}
        </div>
        {(editable || !!item.company) && (
          <div className={styles.timelineCompany}>
            <span className={styles.companyIcon}>🏢</span>
            <T path={["timeline", i, "company"]} placeholder="Company" />
            {(editable || !!item.type) && (
              <span className={styles.jobType}> · <T path={["timeline", i, "type"]} placeholder="Type" /></span>
            )}
          </div>
        )}
        {(editable || !!item.description) && (
          <div className={styles.timelineDescription}>
            <T path={["timeline", i, "description"]} placeholder="Description" multiline />
          </div>
        )}
        {(editable || asArray(item.tags).length > 0) && (
          <Tags path={["timeline", i, "tags"]} className={styles.timelineTags} itemClassName={styles.timelineTag} label="tag" />
        )}
      </div>
    </div>
  );
}

function ProjectCard({ p, i, kind, count }: { p: Obj; i: number; kind: "projects" | "publications"; count: number }) {
  const { editable } = useMirror();
  const featured = p.featured === true;
  const links = (p.links ?? {}) as Obj;
  const label = kind === "projects" ? (featured ? "Featured Project" : "Project") : featured ? "Featured Publication" : "Publication";
  // Same link buttons as the website: featured projects get Live Demo + Paper, others only GitHub + Demo.
  const anchors: [string, string][] =
    kind === "projects"
      ? [["github", "GitHub ↗"], ...((featured ? [["demo", "Live Demo ↗"], ["paper", "Paper ↗"]] : [["demo", "Demo ↗"]]) as [string, string][])]
      : [["paper", "View Paper ↗"]];
  const anyLink = anchors.some(([k]) => links[k]);
  return (
    <div className={`${styles.projectCard} ${featured ? styles.featured : ""} m-item`}>
      <Tools listPath={[kind]} index={i} count={count} />
      <div>
        <div className={styles.projectLabel}>
          {"// "}{label} <Check path={[kind, i, "featured"]} label="featured" />
        </div>
        <h3 className={styles.projectTitle}><T path={[kind, i, "title"]} placeholder="Title" /></h3>
        {kind === "projects" ? (
          <p className={styles.projectDesc}><T path={[kind, i, "description"]} placeholder="Description" multiline /></p>
        ) : (
          <div className={styles.pubVenue}><T path={[kind, i, "venue"]} placeholder="Venue / journal" /></div>
        )}
        {(editable || asArray(p.tags).length > 0) && (
          <Tags path={[kind, i, "tags"]} className={styles.projectTags} itemClassName={styles.projectTag} label="tag" />
        )}
      </div>
      {editable ? (
        <div className={styles.projectFooter}>
          {anchors.map(([k, text]) => (
            <Field key={k} path={[kind, i, "links", k]} label={text.replace(" ↗", "")} />
          ))}
        </div>
      ) : (
        anyLink && (
          <div className={styles.projectFooter}>
            <div className={styles.projectLinks}>
              {anchors.map(([k, text]) =>
                links[k] ? (
                  <a key={k} href={asString(links[k])} target="_blank" rel="noopener noreferrer" className={styles.projectLink}>
                    {text}
                  </a>
                ) : null,
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}

function Body({ member, photoSrc, onPickPhoto, onOpenCv }: Omit<Props, "data" | "editable" | "update" | "theme">) {
  const { data, editable } = useMirror();
  const socials = asArray(data.socials) as Obj[];
  const stats = asArray(data.stats) as Obj[];
  const focus = asArray(data.focus_areas);
  const timeline = asArray(data.timeline) as Obj[];
  const skills = asArray(data.skills) as Obj[];
  const projects = asArray(data.projects) as Obj[];
  const publications = asArray(data.publications) as Obj[];
  const achievements = asArray(data.achievements) as Obj[];
  const hasCv = !!(asString(data.cv_link) || member.cv_link);

  // The website shows featured items first and sorts the timeline by start year; the editor keeps the file's order.
  const withIndex = <X,>(list: X[]) => list.map((item, i) => ({ item, i }));
  const featuredFirst = (list: Obj[]) => {
    const all = withIndex(list);
    return editable ? all : [...all.filter((x) => x.item.featured), ...all.filter((x) => !x.item.featured)];
  };
  const timelineOrder = (() => {
    const all = withIndex(timeline);
    if (editable) return all;
    const year = (v: unknown) => (v === "present" ? 9999 : parseInt(asString(v)));
    return [...all].sort((a, b) => year(b.item.start) - year(a.item.start));
  })();

  let n = 0;
  const num = () => String(++n).padStart(2, "0");

  return (
    <div className={styles.contentWrapper}>
      {/* HERO */}
      <section className={styles.heroSection}>
        <div className={styles.heroLeft}>
          {(editable || !!data.tagline) && (
            <span className={styles.heroTagline}>
              {"// "}<T path={["tagline"]} placeholder="tagline" />
            </span>
          )}
          <h1 className={styles.heroName}><T path={["name"]} placeholder="Name" fallback={member.name} /></h1>
          <div className={styles.heroRole}><T path={["role"]} placeholder="Role" fallback={member.role || "Executive Member"} /></div>
          {(editable || !!data.subtitle) && (
            <div className={styles.heroSubtitle}><T path={["subtitle"]} placeholder="Subtitle" /></div>
          )}
          {(editable || socials.length > 0) && (
            <div className={styles.socialsList}>
              {socials.map((s, i) => <Social key={i} s={s} i={i} count={socials.length} />)}
              <Add path={["socials"]} make={() => ({ type: "link", label: "", url: "" })} label="social link" />
            </div>
          )}
        </div>
        {(editable || stats.length > 0) && (
          <div className={styles.heroRight}>
            <div className={styles.statsGrid}>
              {stats.map((_, i) => (
                <div key={i} className={`${styles.statCard} m-item`}>
                  <Tools listPath={["stats"]} index={i} count={stats.length} />
                  <span className={styles.statValue}><T path={["stats", i, "value"]} placeholder="42" /></span>
                  <span className={styles.statLabel}><T path={["stats", i, "label"]} placeholder="Label" /></span>
                </div>
              ))}
            </div>
            <Add path={["stats"]} make={() => ({ value: "", label: "" })} label="stat" />
          </div>
        )}
      </section>

      {/* ABOUT */}
      <section className={styles.aboutSection}>
        <span className={styles.sectionNumber}>{num()} /</span>
        <h2 className={styles.masthead}>Biography</h2>
        <div className={styles.aboutGrid}>
          <div className={styles.aboutSidebar}>
            <div className={styles.imageFrame}>
              <Photo member={member} photoSrc={photoSrc} onPickPhoto={onPickPhoto} />
            </div>
            <div className={styles.sidebarMeta}>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Session</span>
                <span className={styles.metaValue}><T path={["session"]} placeholder="Session" fallback={member.session} /></span>
              </div>
              {(editable || !!data.location) && (
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Location</span>
                  <span className={styles.metaValue}><T path={["location"]} placeholder="City, Country" /></span>
                </div>
              )}
            </div>
          </div>
          <div className={styles.aboutMain}>
            {(editable || !!data.bio || !!member.bio) && (
              <div className={styles.bioText}><T path={["bio"]} placeholder="Write a short biography" multiline fallback={member.bio} /></div>
            )}
            {(editable || focus.length > 0) && (
              <div className={styles.focusAreas}>
                <h3 className={styles.subHeading}>Focus Areas</h3>
                <Tags path={["focus_areas"]} className={styles.focusPills} itemClassName={styles.focusPill} label="focus area" />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* EXPERIENCE */}
      <Section show={editable || timeline.length > 0} className={styles.timelineSection} title="Experience" num={num()}>
        <div className={styles.timelineWrapper}>
          <div className={styles.timelineSpine}></div>
          {timelineOrder.map(({ item, i }, idx) => {
            const isLeft = idx % 2 === 0;
            const card = <TimelineCard item={item} i={i} count={timeline.length} />;
            return (
              <div key={i} className={styles.timelineRow}>
                <div className={`${styles.timelineSlot} ${isLeft ? styles.leftSlot : styles.emptySlot}`}>{isLeft && card}</div>
                <div className={styles.timelineCenter}>
                  <div className={`${styles.timelineNode} ${item.end === "present" ? styles.currentNode : ""}`}></div>
                  {idx !== timeline.length - 1 && <div className={styles.timelineConnector}></div>}
                </div>
                <div className={`${styles.timelineSlot} ${!isLeft ? styles.rightSlot : styles.emptySlot}`}>{!isLeft && card}</div>
              </div>
            );
          })}
        </div>
        <Add path={["timeline"]} make={() => ({ role: "", start: "", end: "", company: "", type: "", description: "", tags: [] })} label="experience" />
      </Section>

      {/* EXPERTISE */}
      <Section show={editable || skills.length > 0} className={styles.skillsSection} title="Expertise" num={num()}>
        <div className={styles.skillsGrid}>
          {skills.map((group, i) => (
            <div key={i} className={`${styles.skillCategoryCard} m-item`}>
              <Tools listPath={["skills"]} index={i} count={skills.length} />
              <div className={styles.skillCategoryHeader}>
                {(!!group.icon || editable) && (
                  <span className={styles.skillIcon} role="img" aria-label={asString(group.category)}>
                    {group.icon === "brain" ? "🧠" : group.icon === "tools" ? "🛠️" : "💻"}
                  </span>
                )}
                <h3 className={styles.skillCategoryTitle}><T path={["skills", i, "category"]} placeholder="Category" /></h3>
                <IconPicker index={i} value={asString(group.icon)} />
              </div>
              <Tags path={["skills", i, "items"]} className={styles.skillPills} itemClassName={styles.skillPill} label="skill" />
            </div>
          ))}
        </div>
        <Add path={["skills"]} make={() => ({ category: "", icon: "code", items: [] })} label="skill group" />
      </Section>

      {/* PROJECTS */}
      <Section show={editable || projects.length > 0} className={styles.projectsSection} title="Featured Work" num={num()}>
        <div className={styles.projectsGrid}>
          {featuredFirst(projects).map(({ item, i }) => <ProjectCard key={i} p={item} i={i} kind="projects" count={projects.length} />)}
        </div>
        <Add path={["projects"]} make={() => ({ title: "", description: "", tags: [], featured: false, links: {} })} label="project" />
      </Section>

      {/* PUBLICATIONS */}
      <Section show={editable || publications.length > 0} className={styles.publicationsSection} title="Publications" num={num()}>
        <div className={styles.projectsGrid}>
          {featuredFirst(publications).map(({ item, i }) => <ProjectCard key={i} p={item} i={i} kind="publications" count={publications.length} />)}
        </div>
        <Add path={["publications"]} make={() => ({ title: "", venue: "", tags: [], featured: false, links: {} })} label="publication" />
      </Section>

      {/* ACHIEVEMENTS */}
      <Section show={editable || achievements.length > 0} className={styles.achievementsSection} title="Achievements" num={num()}>
        <div className={styles.achievementsGrid}>
          {achievements.map((_, i) => (
            <div key={i} className={`${styles.achievementCard} m-item`}>
              <Tools listPath={["achievements"]} index={i} count={achievements.length} />
              <div className={styles.achievementHeader}>
                <h3 className={styles.achievementTitle}><T path={["achievements", i, "title"]} placeholder="Title" /></h3>
                <span className={styles.achievementYear}><T path={["achievements", i, "year"]} placeholder="Year" /></span>
              </div>
              <p className={styles.achievementDetails}><T path={["achievements", i, "event"]} placeholder="Event" /></p>
            </div>
          ))}
        </div>
        <Add path={["achievements"]} make={() => ({ title: "", event: "", year: "" })} label="achievement" />
      </Section>

      {hasCv && (
        <section className={styles.cvCtaSection}>
          <a className={styles.cvButton} href="#cv" onClick={(e) => { e.preventDefault(); onOpenCv?.(); }}>
            View Full CV ↗
          </a>
        </section>
      )}
    </div>
  );
}

function IconPicker({ index, value }: { index: number; value: string }) {
  const { editable, update } = useMirror();
  if (!editable) return null;
  return (
    <select className="m-mini" value={value || "code"} title="Icon" onChange={(e) => update((d) => ({ ...d, skills: asArray(d.skills).map((s, i) => (i === index ? { ...(s as Obj), icon: e.target.value } : s)) }))}>
      <option value="brain">🧠 brain</option>
      <option value="tools">🛠️ tools</option>
      <option value="code">💻 code</option>
    </select>
  );
}

export function ProfileMirror({ data, editable, update, member, theme, photoSrc, onPickPhoto, onOpenCv }: Props) {
  return (
    <MirrorProvider value={{ data, editable, update }}>
      <div className="site-mirror" data-theme={theme}>
        <div className={styles.fullscreenContainer} style={{ minHeight: 0, paddingTop: "1rem", paddingBottom: "2rem" }}>
          <Body member={member} photoSrc={photoSrc} onPickPhoto={onPickPhoto} onOpenCv={onOpenCv} />
        </div>
      </div>
    </MirrorProvider>
  );
}
