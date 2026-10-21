# Statistics Programming Club — Admin Panel

A private editor for the club website's content. It is the third repo of the project:

| Repo | Role |
|---|---|
| [`pcstat/website`](https://github.com/pcstat/website) | The website (Next.js static export). |
| [`pcstat/database`](https://github.com/pcstat/database) | The database: JSON + photos. |
| **`pcstat/admin`** (this one) | Edits the database repo through the GitHub API. |

```
you ─▶ admin panel ──one atomic commit──▶ database repo ─▶ GitHub Action ─▶ website rebuilds (1–3 min)
```

Next.js 16 · React 19 · TypeScript · pnpm · Zustand · deployed to **Cloudflare Workers** with OpenNext.

## What you can edit

**Pages mirror the website.** The menu lists the website's pages in the same order, with the same names and icons — Home · Executives · Projects & Publications · Achievements · Events · About / Contact. Each page edits what that page shows, from its heading down to its content. Settings that belong to the whole site live on one separate page, **Site settings** (club name and contact e-mail, search / share texts, the sidebar menu). **Member files** edits each member's profile and CV.
**Executives** is one page for every committee: the current committee (tagged *current*) appears on the website's Executives page, the others on Past Executives, and both page headings are edited at the bottom. To start a new session, press *Add committee* (it goes to the top), fill in its members, then choose it as *Current committee*.
**Member files search:** type words (all must match; small typos are forgiven), use quotes for a phrase, or operators such as `committee:2025`, `role:president`, `id:2020`, `has:cv`, `no:profile`, `is:current`, `is:edited`. Results come in two groups — matches in the name / role / committee, and matches in the details (bio, links, and, when *Search inside profiles & CVs* is on, the text of the files). Press `/` to jump to the search box.
**Search boxes** (the filter above a long list, the pin pickers on Home, Member files) search what you can read in the editor: names instead of ids (a project is found by its members' names), tags, dates ("june", "monday"), ticked options such as *Featured*, and — in Member files — the member's projects and achievements. Technical values (ids, field names, image paths) are never matched. Several words all have to match; small typos and accents are forgiven; the line under a result says where the match was found. The engine is `src/lib/smart-search.ts`.
**Dates and times** can be typed or picked: type `2026-12-31`, `31 Dec 2026`, `31/12/2026` or `tomorrow` (times: `2:30 PM`, `14:30`, `2pm`, `noon`) and it is tidied up when you leave the box, or press the calendar / clock button. On a phone the picker opens from the bottom of the screen. Parsing lives in `src/lib/datetime.ts`.
**Courses** is a normal page (the cards of the website's Courses page). **Certificates** is its own screen — the *certificate registry* — because there will be thousands of certificates and they live in their own repository (`pcstat/certificates`, one JSON file per *set*). See [Certificates](#certificates).

Ids of projects, events and courses are **assigned automatically** (`proj-9f3a1c7e`) and never typed by hand. Pinning projects on the home page uses a search box (title, tag, year, status).

**Save and publish:** *Save and publish* commits to GitHub and the website rebuilds. Switch **Publish on save** off to commit with `[skip ci]` (nothing is rebuilt) and press **Publish now** later — that button starts the database repo's deploy workflow, so the database token also needs the **Actions: Read and write** permission. Ctrl/⌘ + S saves.

**Design:** the panel uses the public website's design system — Space Mono + Syne, the same colour tokens, dot-grid backdrop, sidebar, nav hover slide, card lift, theme switch, and on phones the same top bar with a full-screen menu and a save bar at the bottom. **Light / dark mode** is the same switch as on the website (`<html data-theme>` + `localStorage.theme`, dark by default); it also themes the mirrored member profile / CV pages, which no longer have a switch of their own. Colours live in the variables at the top of `src/app/globals.css`; the sidebar icons (`src/components/Icon.tsx`) are the same drawings the website's sidebar uses.

Forms are generated from `src/lib/schemas.ts`, so a new field in the database means one new line there.

Every save is validated first (duplicate IDs, unknown member IDs, bad dates, missing required fields …) with the same rules as the database repo's CI, then written as **one commit**. Photos you replace or remove are deleted in the same commit. Undo / redo / discard work on everything not saved yet.

## Try it locally (no GitHub needed)

```bash
corepack enable pnpm
pnpm install
pnpm hash-password            # prints ADMIN_PASSWORD_HASH and AUTH_SESSION_SECRET
cp .env.example .env.local    # paste the two values into it
pnpm dev                      # http://localhost:3000
```

In the default **local mode** the panel edits the `local-data/` folder (a snapshot of the database repo). A "Local test mode" badge is shown in the sidebar. To edit a real clone instead, set `DATA_LOCAL_DIR=../database`.

## Go live (Cloudflare Workers + the real database repo)

Everything is set up from GitHub — the full walk-through (Cloudflare account, API token, GitHub token, secrets) is in the **[Deployment guide](https://github.com/pcstat/website/blob/main/docs/DEPLOYMENT.md)**. In short:

* **`database.json`** (repo root) says which repo is the database: `repo` (`owner/name`), `branch`, and `url` (where the database is published on Cloudflare Pages — used for photo previews) and `website` (the public website's address — switches on the **Preview site** button and the sidebar link; default `https://pcstat.pages.dev`). The website repo has a similar file.
* **GitHub secrets** of this repo: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_REPO_TOKEN` (fine-grained token, *Contents: Read and write* on the database repo only), `ADMIN_PASSWORD_HASH`, `AUTH_SESSION_SECRET` (the last two come from `pnpm hash-password`).
* **Deploy**: push to `main` (or run the workflow by hand). `.github/workflows/deploy.yml` builds the panel, **creates the Worker if it does not exist** (its name is `name` in `wrangler.toml`, which becomes the address `https://<name>.<account>.workers.dev`) and uploads the three Worker secrets from the GitHub secrets.
* Optional repository variable `NEXT_PUBLIC_WEBSITE_URL` — overrides the `website` field of `database.json`.

Environment variables for local runs are listed in `.env.example`.

## Certificates

The menu entry **Certificates** opens the registry. The data is **not** part of the website database: it is read from and committed to the certificates repo on GitHub (`certificates` in `database.json`, which must be a public repository the token can write to; locally the folder `local-certificates/`, or `CERTIFICATES_LOCAL_DIR`).

* **Sets.** A set is a group of certificates that share everything except the person — a course run (`PY26`), a contest (`CONTEST26`), a year of membership. It is one file, `sets/<code>.json`, with two parts: what is the same on every certificate (title, date, design, signatories …) and one entry per person. **New set** creates the file on demand (it is written when you press Save). A set does **not** need a course: the title is whatever the certificates are for; linking a course is optional. *Start from an earlier set* copies the design and signatories.
* **People.** Paste one name per line, paste cells copied from a spreadsheet (name first, then the design's per-person fields such as score and grade), or choose a `.csv` file with a header row (`name`, `score`, `grade`, `note`). A preview and warnings (duplicates, empty lines) come first. Each person gets a 5-character id that is unique inside the set's file, so the certificate ID is `SPC-<set code>-<person id>` (`SPC-PY26-7W34N`): the website opens exactly one file to verify it, and the last character is a check character that lets it tell a mistyped ID from an unknown one.
* **Find a certificate.** One search box over every set: names (typo-tolerant), IDs (any part, any case, with or without dashes), course, set, dates. Operators: `set:py26` `course:python` `year:2026` `id:k7m4` `is:revoked` `is:new` `has:note` `no:grade`; chips for All / Valid / Revoked / Unsaved; press `/` to jump to the box. Click a row to open it: edit the name and per-person fields, see it exactly as printed, copy its ID and its share link (`<website>/c/<ID>`), revoke or restore it. Select rows to revoke / restore many at once or export them as CSV.
* **Revoking, not deleting.** An issued certificate cannot be deleted from the panel: *Revoke* (with an optional reason) makes the verification page say it is no longer valid, and the record stays. A certificate added in this session and not saved yet can be taken back.
* **One Save.** The save bar saves the database and the registry together (two repositories, two commits, whichever have changes). *Publish on save* covers both; the website reads the registry straight from GitHub, so it is **not** rebuilt and nothing is published.
* **Large registries.** The panel loads each set with its own small request (a few at a time), so it stays within Cloudflare Workers' request limits, and searches in memory. Tens of thousands of certificates are fine.

## Editing a member's profile and CV

**Member files** lists every member. Opening a profile or a CV gives a page with a mode panel on the right:

| Mode | What it is |
|---|---|
| **UI editing** | A page that mirrors the website's profile / CV page. Click any text to edit it; hover an item for ↑ ↓ ✕; use **+ Add** to add items. Has its own undo / redo. |
| **JSON editing** | The raw file in a code editor: line numbers, syntax colours, folding, bracket matching, find (Ctrl+F), error markers with a problem list, field-name suggestions (Ctrl+Space) and a **Format** button. |
| **Preview** | The same page exactly as visitors see it, including your unsaved changes (no edit controls). |

All three work on the same draft, so you can switch at any time. Nothing is written until you press **Save**.

The mirror uses the website's own CSS modules (`src/mirror/*.module.css`, verbatim copies) and mirrors its markup in
`src/mirror/ProfileMirror.tsx` and `CvMirror.tsx` — when the website's profile or CV page changes, update these two files.
It also uses verbatim copies of the website's `FitName.tsx` (sizes a name to its text, so very long names never overflow) and `StatGrid.tsx` (equal-sized stat boxes with one shared font size) — copy them again whenever the website's versions change.

### Members' own repositories

A member can keep their profile and CV in their **own GitHub repository** and edit them without this panel — see
[docs/MEMBER-REPOS.md](docs/MEMBER-REPOS.md). In **Member files → Source…** enter the username and repository (or paste links); the
panel stores the raw links, reads the files through `/api/external` and shows them read-only.

## Whole-site preview and the sidebar

* **Preview site** (top of the sidebar) shows the real website in an iframe with your **unsaved** changes, so you can browse it
  like a visitor before saving. It needs `website` here (in `database.json`) and `admin` in the website's `database.json`
  (this panel's address) — see "Live preview" in the website repo's `docs/DEPLOYMENT.md`.
* **Ordering**: lists the website shows in file order can be arranged by hand — drag the **⠿** handle or use **↑ ↓** (**‹ ›** for tags and member chips), then Save. Lists the website sorts itself (events, certificates, the profile timeline) say so and have no move controls. Full table: [`docs/ORDERING.md`](docs/ORDERING.md).
* The sidebar button collapses the sidebar (remembered between visits); on a phone it becomes a menu drawer. A dot next to a page means it has unsaved edits.

## Login

One shared password (like the reference project): the panel stores only its SHA-256 hash, and a signed session cookie keeps you signed in. Change the password by running `pnpm hash-password` again and updating the secret; changing `AUTH_SESSION_SECRET` signs everybody out. Per-person accounts are on the TODO list.

## Safety nets

* `/api/save` only accepts the six data files, `members/<slug>/{profile,cv}.json` and `photos/<folder>/<file>` — any other path is refused, and only photos can be deleted.
* **Conflict detection:** each save carries the commit the editor was loaded from; if the database changed since (someone else saved, or a manual commit), the save is refused instead of overwriting their work.
* JSON is re-serialised the same way the database repo formats it (2 spaces + newline), so saves produce minimal diffs, and untouched files are never rewritten.
* Closing the tab with unsaved changes asks for confirmation.

## Structure

```
database.json            which repo is the database, and which is the certificate registry (repo, branch, published url)
middleware.ts            redirects anonymous visitors to /login
src/app/                 pages: [section] (generic editor), members, certificates, login · api/: auth, data, file, save, photo, certs/*
src/components/          Shell, SaveBar, FieldRenderer (generic form), MemberFiles · certificates/ (registry screens)
src/lib/certificates/    core.ts (ID/date/template rules, identical in the certificates and website repos) · search, csv, validate
src/lib/schemas.ts       what is editable and how (the only file to touch for new fields)
src/lib/validate.ts      pre-save checks
src/lib/provider/        local-fs.ts · github.ts — the only code that knows where files live
src/lib/database-config.ts  reads database.json
src/store/               Zustand stores: content (drafts, history, photos, save), certificates (sets, save), save-all
local-certificates/       snapshot of the certificate registry for local test mode
local-data/              snapshot of the database for local test mode
```

## Notes

* **Next.js is pinned to 16.3.8 on purpose.** Next 16.4 added a manifest (`preview-props.json`) that OpenNext for Cloudflare (1.20.11) does not bundle yet, which makes every server route fail on Workers. Move to 16.4+ once OpenNext supports it (re-run `pnpm cf:build` and test login on `pnpm cf:preview`).
* `typescript` is an alias of `@typescript/typescript6` (the JS API Next.js and ESLint need) and the TypeScript 7 compiler is installed next to it as `@typescript/native`, which provides the `tsc` binary.
* Node ≥ 24 (`.nvmrc` pins 26).
* Open items: see [docs/TODO.md](docs/TODO.md).

## Pushing without deploying (`[skip ci]`)

Put `[skip ci]` in the commit message and GitHub starts **no** workflow for that push — this works the same way in the
database, admin and website repositories:

```bash
git commit -m "Fix typo in the notes [skip ci]"
git push
```

* It is the **newest commit** of the push that counts. `[ci skip]`, `[no ci]`, `[skip actions]` and `[actions skip]` work too.
* Nothing is deployed, so the live site keeps the old version. Deploy later from **Actions → (this workflow) → Run workflow** — manual runs are never skipped.
* A skipped push is not validated either: run the checks yourself first (`pnpm typecheck && pnpm lint` here, `node scripts/validate.mjs` in the database repo).
* Documentation-only pushes (`*.md`, `docs/`) are already ignored by this repo's workflow, no marker needed.
