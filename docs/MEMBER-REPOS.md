# Members editing their own profile and CV

A member does **not** need access to the admin panel. They keep their profile and CV as two JSON files in
**their own public GitHub repository**; the website and the admin panel read the latest version from there.

## For the member

1. Create a **public** repository on GitHub (any name, e.g. `club-profile`).
2. Add two files to it — start from the templates in [`member-repo-template/`](member-repo-template):
   * `profile.json` — the profile page (`/profile?id=…`)
   * `cv.json` — the CV page (`/cv?id=…`)
3. Optionally add a photo next to them (e.g. `photo.jpg`) and write `"photo": "photo.jpg"` in `profile.json`.
   Use png, jpg, webp or gif — GitHub does not serve svg images from raw links.
4. Send the club admin one of:
   * your **GitHub username and repository name** (and the folder, if the files are not in the repository root), or
   * the **links** to the two files (a normal `github.com/…/blob/…` link or a raw link, both work).
5. To change anything later: edit the files on GitHub (pencil icon → *Commit changes*). That is all.
   Changes show on the website within about five minutes — GitHub caches raw files for a short time — with no rebuild.

Tips: the *Format* button of the admin panel's JSON mode and any JSON validator help you spot typos. If the file is not
valid JSON the website shows the club's default profile instead.

## For the admin

Open **Member files → Source…** next to the member and pick *Member's GitHub repo* (username + repository, optional
branch/folder/file names) or *Other links*. The panel shows the exact raw links it will use and can **test** them before you
confirm. It writes them into the member's `profile_link` / `cv_link` in `executives.json`; the website already knows how to
load such absolute links, so nothing else has to change. Remember to **Save**.

* The panel only **reads** externally hosted files. To look at them use *UI mode*, *JSON mode* or *Preview* (all read-only), or
  **Copy into club database** to take over editing them yourself.
* Which files? You can switch only the profile, only the CV, or both — untick what the member does not provide.
* The default branch is used unless you enter one (`HEAD`).
* Private repositories cannot be read.

## What the website does with them

`profile_link` and `cv_link` may be a path inside the club database (`members/<slug>/profile.json`) **or** a full https
link. The website fetches the file in the visitor's browser each time, so the member's edits are live without a rebuild.
A `photo` written as a relative path is looked up next to the member's `profile.json`.
