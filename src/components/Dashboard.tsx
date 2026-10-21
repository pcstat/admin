"use client";

import Link from "next/link";
import { useCertificatesStore } from "@/store/certificates-store";
import { useContentStore } from "@/store/content-store";
import type { ClubEvent, ExecutivesDoc, HomeConfig, Project } from "@/lib/types";
import { Icon } from "./Icon";

const today = () => new Date().toISOString().slice(0, 10);

/** Start page: what the website holds right now (including unsaved edits) and where to change it. */
export function Dashboard() {
  const docs = useContentStore((s) => s.docs);
  const executives = docs["executives.json"]?.draft as ExecutivesDoc | undefined;
  const projects = (docs["projects.json"]?.draft as { projects?: Project[] } | undefined)?.projects ?? [];
  const events = (docs["events.json"]?.draft as { events?: ClubEvent[] } | undefined)?.events ?? [];
  const achievements = (docs["achievements.json"]?.draft as { achievements?: unknown[] } | undefined)?.achievements ?? [];
  const home = docs["home.json"]?.draft as HomeConfig | undefined;
  const courses = (docs["courses.json"]?.draft as { courses?: unknown[] } | undefined)?.courses ?? [];
  const certsReady = useCertificatesStore((s) => s.status === "ready");
  const certCount = useCertificatesStore((s) => Object.values(s.sets).reduce((n, x) => n + Object.keys(x.draft.people).length, 0));

  const current = executives?.committees.find((c) => c.session === executives.current_committee);
  const upcoming = events.filter((e) => e.date >= today()).sort((a, b) => a.date.localeCompare(b.date));
  const pinnedProjects = (home?.pinned_projects ?? []).map((id) => projects.find((p) => p.id === id)).filter((p): p is Project => Boolean(p));
  const pinnedPeople = (home?.pinned_executives ?? []).map((id) => current?.members.find((m) => m.student_id === id)).filter(Boolean);

  const tiles: { href: string; icon: string; title: string; value: string; detail: string }[] = [
    { href: "/home", icon: "home", title: "Home", value: "", detail: "hero text, pinned projects and team, terminal" },
    { href: "/executives", icon: "people", title: "Executives", value: String(current?.members.length ?? 0), detail: current ? `in the ${current.label || current.session} committee · ${Math.max((executives?.committees.length ?? 1) - 1, 0)} past` : "no current committee" },
    { href: "/projects", icon: "box", title: "Projects & Publications", value: String(projects.length), detail: `${projects.filter((p) => p.status === "publication" || p.status === "research").length} are research or publications` },
    { href: "/achievements", icon: "trophy", title: "Achievements", value: String(achievements.length), detail: "listed on the website" },
    { href: "/events", icon: "calendar", title: "Events", value: String(upcoming.length), detail: upcoming[0] ? `upcoming — next is ${upcoming[0].date}` : "upcoming — none scheduled" },
    { href: "/courses", icon: "book", title: "Courses", value: String(courses.length), detail: "courses and certifications on the website" },
    { href: "/certificates", icon: "badge", title: "Certificates", value: certsReady ? String(certCount) : "", detail: "issued by the club — search, issue, revoke" },
    { href: "/about", icon: "info", title: "About / Contact", value: "", detail: "mission cards, meetups, contact banner" },
    { href: "/settings", icon: "gear", title: "Site settings", value: "", detail: "club name, e-mail, sidebar menu" },
  ];

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">{"// OVERVIEW"}</p>
        <h1>Club <span>dashboard</span></h1>
        <p className="lead">
          Every page of the website has a matching page here, in the same order. Pick one, change it, save.
        </p>
      </div>

      <ol className="steps">
        <li><strong>1. Pick a page</strong><span>Use the menu — it lists the same pages as the website. Settings that belong to the whole site (name, e-mail, sidebar menu) are under Site settings.</span></li>
        <li><strong>2. Change it</strong><span>Type in the boxes, drag ⠿ to reorder. Nothing goes live yet. “Preview site” shows your edits on the real website.</span></li>
        <li><strong>3. Save</strong><span>Press <kbd>Save</kbd> (or Ctrl + S). The website updates in 1–3 minutes.</span></li>
      </ol>

      <div className="dash">
        <section className="dash-main">
          <h2 className="part-title">Pages</h2>
          <ul className="tiles">
            {tiles.map((t) => (
              <li key={t.href}>
                <Link href={t.href} className="tile">
                  <Icon name={t.icon} size={22} />
                  <span className="tile-name">{t.title}</span>
                  {t.value !== "" && <strong className="tile-value">{t.value}</strong>}
                  <span className="tile-detail">{t.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <aside className="dash-side">
          <h2 className="part-title">Pinned on the home page</h2>
          <p className="side-label">Top projects</p>
          {pinnedProjects.length ? <ol className="plain-list">{pinnedProjects.map((p) => <li key={p.id}>{p.title}</li>)}</ol> : <p className="hint">Nothing pinned.</p>}
          <p className="side-label">Meet the team</p>
          {pinnedPeople.length ? <ol className="plain-list">{pinnedPeople.map((m) => <li key={m!.student_id}>{m!.name}</li>)}</ol> : <p className="hint">Nothing pinned.</p>}
          <Link href="/home" className="btn small">Change pins</Link>
        </aside>
      </div>
    </>
  );
}
