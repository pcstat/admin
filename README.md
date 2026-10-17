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

Executives (committees, members, photos, social links) · Projects · Events · Courses · Achievements (+ tally) · Certificates · plus each member's `profile.json` / `cv.json` as JSON (**Member files**).

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
* The **‹** button collapses the sidebar (remembered between visits); the mode panel has its own **›** collapse button.

## Login

One shared password (like the reference project): the panel stores only its SHA-256 hash, and a signed session cookie keeps you signed in. Change the password by running `pnpm hash-password` again and updating the secret; changing `AUTH_SESSION_SECRET` signs everybody out. Per-person accounts are on the TODO list.

## Safety nets

* `/api/save` only accepts the six data files, `members/<slug>/{profile,cv}.json` and `photos/<folder>/<file>` — any other path is refused, and only photos can be deleted.
* **Conflict detection:** each save carries the commit the editor was loaded from; if the database changed since (someone else saved, or a manual commit), the save is refused instead of overwriting their work.
* JSON is re-serialised the same way the database repo formats it (2 spaces + newline), so saves produce minimal diffs, and untouched files are never rewritten.
* Closing the tab with unsaved changes asks for confirmation.

## Structure

```
database.json            which repo is the database (repo, branch, published url)
middleware.ts            redirects anonymous visitors to /login
src/app/                 pages: [section] (generic editor), members, login · api/: auth, data, file, save, photo
src/components/          Shell, SaveBar, FieldRenderer (generic form), MemberFiles
src/lib/schemas.ts       what is editable and how (the only file to touch for new fields)
src/lib/validate.ts      pre-save checks
src/lib/provider/        local-fs.ts · github.ts — the only code that knows where files live
src/lib/database-config.ts  reads database.json
src/store/               Zustand store: drafts, history, staged photos, save
local-data/              snapshot of the database for local test mode
```

## Notes

* **Next.js is pinned to 16.3.8 on purpose.** Next 16.4 added a manifest (`preview-props.json`) that OpenNext for Cloudflare (1.20.11) does not bundle yet, which makes every server route fail on Workers. Move to 16.4+ once OpenNext supports it (re-run `pnpm cf:build` and test login on `pnpm cf:preview`).
* `typescript` is an alias of `@typescript/typescript6` (the JS API Next.js and ESLint need) and the TypeScript 7 compiler is installed next to it as `@typescript/native`, which provides the `tsc` binary.
* Node ≥ 24 (`.nvmrc` pins 26).
* Open items: see [docs/TODO.md](docs/TODO.md).
