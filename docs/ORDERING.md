# Ordering — which lists you can arrange by hand

Every list in the database is either **ordered by you** (the website shows it in the order of the file) or
**ordered by the website** (it sorts or looks items up itself). The admin panel mirrors this:

* **Manual lists** show a number, a **⠿ drag handle** and **↑ ↓** buttons. Drag the handle (or use the buttons —
  they also work on touch screens and with the keyboard) and press **Save**. Short lists of tags / members show
  **‹ ›** buttons and can be dragged by the chip itself.
* **Automatic lists** show no move controls, only a note saying how the website orders them.

## Content sections (`/executives`, `/projects`, …)

| File | List | Website order | In the admin |
|---|---|---|---|
| `executives.json` | `committees[]` | file order on *Past Executives* (put the newest first) | **manual** |
| | `committees[].members[]` | file order (the cards of each committee) | **manual** |
| | `members[].socials[]` | file order | **manual** |
| `projects.json` | `projects[]` | **Club Website** pinned on top, then *featured*, then file order | **manual** (within featured / not featured) |
| | `projects[].tags[]`, `projects[].members[]` | file order | **manual** |
| `achievements.json` | `tally[]` | file order, left to right | **manual** |
| | `achievements[]` | *featured* first, then file order | **manual** (within featured / not featured) |
| | `achievements[].members[]` | file order | **manual** |
| `courses.json` | `courses[]` | *featured* first, then newest `year`; file order only breaks ties | **manual** (ties) |
| `events.json` | `events[]` | sorted by date, past events hidden | **automatic** |
| `certificates.json` | `issued_certificates[]` | not listed — looked up by ID | **automatic** |

## Member files (`/members/<id>/profile` and `/cv`, UI mode)

| File | List | Website order | In the editor |
|---|---|---|---|
| `profile.json` | `socials`, `stats`, `focus_areas` (pills), `skills` (+ each `items` pill list), `achievements` | file order | **manual** |
| | `projects`, `publications` | *featured* first, then file order | **manual** (within groups) |
| | `timeline` | sorted by `start` year, newest first | **automatic** (no ↑ ↓ ⠿) |
| | tags inside timeline / project items | file order | **manual** |
| `cv.json` | the entries of every section (`education`, `experience`, `projects`, …), their bullets and sub-bullets, `certifications`, `languages`, `technical_skills` pills | file order | **manual** |

## How to add or change a rule

In `src/lib/schemas.ts` a `list` field takes two optional settings:

```ts
order: "auto",                                   // omit for "manual"
orderNote: "The website sorts events by date …", // sentence shown under the list heading
```

Lists that contain a `featured` checkbox automatically get a ★ on featured items and the note
"Featured items are listed first …" unless `orderNote` says something else. In the member mirrors use
`<Tools movable={false} />` for an automatic list and `<OrderNote>` for the explanation.

If the website's sorting changes (`src/lib/views.ts`, `ProjectSection.tsx`, `EventsList.tsx`,
`DynamicProfile.tsx`), update the matching table row and note.

## Under the hood

* `src/lib/sortable.ts` + `src/lib/use-sortable.ts` — native HTML5 drag-and-drop helpers (no dependency);
  a drag only affects the list it started in, so nested lists work.
* Moves go through the same store actions as the arrows (`moveItem`, `moveAtPath`), so **Undo / Redo**, the
  unsaved-changes bar and the live **Preview site** all pick them up.
* Browsers do not fire drag events on touch screens; the ↑ ↓ / ‹ › buttons cover that.
