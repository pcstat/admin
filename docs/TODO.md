# TODO

- [ ] Per-person logins (the shared password is intentionally simple for now). Consider Cloudflare Access in front of the Worker.
- [ ] Form editors for `profile.json` and `cv.json` (today: raw JSON with validation, in *Member files*).
- [ ] Live preview of the draft inside the panel.
- [ ] Rename / delete members' files from the panel; upload new CV PDFs if the website ever needs them.
- [ ] Show a history of recent commits (who changed what) in the sidebar.
- [ ] Upgrade Next.js beyond 16.3.8 once OpenNext for Cloudflare supports `preview-props.json` (see README → Notes).
- [ ] Remove the `typescript` → `@typescript/typescript6` alias once typescript-eslint supports TypeScript 7; move to ESLint 10 when `eslint-config-next` does.
- [ ] Optional: after a save, also call the website deploy hook directly (today the database repo's GitHub Action does it).
