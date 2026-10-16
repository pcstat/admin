# TODO

- [ ] Per-person logins (the shared password is intentionally simple for now). Consider Cloudflare Access in front of the Worker.
- [ ] Form editors for `profile.json` and `cv.json` (today: raw JSON with validation, in *Member files*).
- [ ] Live preview of the draft inside the panel.
- [ ] Rename / delete members' files from the panel; upload new CV PDFs if the website ever needs them.
- [ ] Show a history of recent commits (who changed what) in the sidebar.
- [ ] Upgrade Next.js beyond 16.3.8 once OpenNext for Cloudflare supports `preview-props.json` (see README → Notes).
- [ ] Remove the `typescript` → `@typescript/typescript6` alias once typescript-eslint supports TypeScript 7; move to ESLint 10 when `eslint-config-next` does.
- [ ] Optional: after a save, also start the website's deploy workflow directly (today the database repo's GitHub Action does it).

- [ ] `src/mirror/ProfileMirror.tsx` and `CvMirror.tsx` copy the markup of the website's `DynamicProfile.tsx` / `cv/page.tsx`, and `*.module.css` are verbatim copies — re-sync them when those website files change.
- [ ] Whole-site preview covers every page except the admin-only ones; the website must be deployed with this panel's address as `admin` in its `database.json` for it to work.
- [ ] JSON mode: key suggestions cover the profile / CV shapes only; the six database files have no JSON mode yet.
- [ ] Externally hosted profiles are read-only here (the panel has no token for the member's repo).
