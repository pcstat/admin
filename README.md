# Statistics Programming Club — Admin Panel

A private editor for the club website's content. It is the third repo of the project:

| Repo | Role |
|---|---|
| `programming-club-demo` | The website (Next.js static export). |
| `programming-club-demo-data` | The database: JSON + photos. |
| **`programming-club-demo-admin`** (this one) | Edits the database repo through the GitHub API. |

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

In the default **local mode** the panel edits the `local-data/` folder (a snapshot of the database repo). A "Local test mode" badge is shown in the sidebar. To edit a real clone instead, set `DATA_LOCAL_DIR=../programming-club-demo-data`.

## Go live (Cloudflare Workers + the real database repo)

1. **GitHub token** — GitHub → Settings → Developer settings → Fine-grained tokens → *Generate*: repository access **only the database repo**, permission **Contents: Read and write**. Keep it secret.
2. **Edit `wrangler.toml`** `[vars]`: `DATABASE_REPO` (`owner/name`), `DATABASE_BRANCH`, `NEXT_PUBLIC_WEBSITE_URL`.
3. **Secrets** (stored encrypted in Cloudflare, never in git):
   ```bash
   pnpm wrangler secret put GITHUB_TOKEN
   pnpm wrangler secret put ADMIN_PASSWORD_HASH      # from `pnpm hash-password`
   pnpm wrangler secret put AUTH_SESSION_SECRET      # from `pnpm hash-password`
   ```
4. **Deploy** — either `pnpm cf:deploy` from your machine, or push to `main`: `.github/workflows/deploy.yml` builds and deploys. It needs two repo secrets, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
5. In the **database repo** add the secret `WEBSITE_DEPLOY_HOOK` (the website's Cloudflare Pages deploy hook) so saved changes rebuild the website. See that repo's README.

Environment variables are listed in `.env.example`.

## Login

One shared password (like the reference project): the panel stores only its SHA-256 hash, and a signed session cookie keeps you signed in. Change the password by running `pnpm hash-password` again and updating the secret; changing `AUTH_SESSION_SECRET` signs everybody out. Per-person accounts are on the TODO list.

## Safety nets

* `/api/save` only accepts the six data files, `members/<slug>/{profile,cv}.json` and `photos/<folder>/<file>` — any other path is refused, and only photos can be deleted.
* **Conflict detection:** each save carries the commit the editor was loaded from; if the database changed since (someone else saved, or a manual commit), the save is refused instead of overwriting their work.
* JSON is re-serialised the same way the database repo formats it (2 spaces + newline), so saves produce minimal diffs, and untouched files are never rewritten.
* Closing the tab with unsaved changes asks for confirmation.

## Structure

```
middleware.ts            redirects anonymous visitors to /login
src/app/                 pages: [section] (generic editor), members, login · api/: auth, data, file, save, photo
src/components/          Shell, SaveBar, FieldRenderer (generic form), MemberFiles
src/lib/schemas.ts       what is editable and how (the only file to touch for new fields)
src/lib/validate.ts      pre-save checks
src/lib/provider/        local-fs.ts · github.ts — the only code that knows where files live
src/store/               Zustand store: drafts, history, staged photos, save
local-data/              snapshot of the database for local test mode
```

## Notes

* **Next.js is pinned to 16.3.8 on purpose.** Next 16.4 added a manifest (`preview-props.json`) that OpenNext for Cloudflare (1.20.11) does not bundle yet, which makes every server route fail on Workers. Move to 16.4+ once OpenNext supports it (re-run `pnpm cf:build` and test login on `pnpm cf:preview`).
* `typescript` is an alias of `@typescript/typescript6` (the JS API Next.js and ESLint need) and the TypeScript 7 compiler is installed next to it as `@typescript/native`, which provides the `tsc` binary.
* Node ≥ 24 (`.nvmrc` pins 26).
* Open items: see [docs/TODO.md](docs/TODO.md).
