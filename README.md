# Raising Happy Children — Setup Guide

Dr. Johnson's book-writing tool. He taps one link, dictates or types his wisdom
across 9 life stages, and it becomes a book he can download as a Word document.

This guide gets it live as a tap-and-go link, with **everything free — no card,
no subscription of any kind**:

- **No login** — he just opens the link and starts.
- **Automatic saving** — every word saves on its own, under his name. He can stop
  anytime and return from any device. The team can re-access it too.
- **Automatic backup** — every save is copied to a second, independent place, plus
  point-in-time snapshots, so the work can always be recovered.
- **Free AI writing** — the "Generate the Book" button uses Cloudflare's own free
  AI (no API key, no card).
- **Word downloads with page numbers** — both the polished book and his raw notes.

You'll use **GitHub** (holds the code) + **Cloudflare Pages** (runs it free).
Time: about 30 minutes. No coding required.

---

## What you need

1. A **GitHub** account (free) — https://github.com
2. A **Cloudflare** account (free, no credit card) — https://dash.cloudflare.com

That's it. No Anthropic account, no API key, no subscriptions.

---

## Step 1 — Put the code on GitHub

1. Go to https://github.com/new → create a repo named e.g. `dr-johnson-book`,
   set it **Private**, **Create repository**.
2. Click **uploading an existing file**.
3. Drag in **everything from this folder**, keeping the structure exactly:

```
index.html        ← the writing tool (his link)
backup.html       ← the team's backup & recovery page
functions/
  api/
    generate.js   ← free AI book generation
    save.js       ← saves + auto-copies to backup
    load.js       ← loads with automatic failover
    retrieve.js   ← powers the backup page
README.md
```

4. **Commit changes.**

---

## Step 2 — Connect it to Cloudflare Pages

1. https://dash.cloudflare.com → **Workers & Pages** → **Create application → Pages
   → Connect to Git**.
2. Authorize GitHub (choose **Only select repositories** → `dr-johnson-book`).
3. Select the repo → **Begin setup**.
4. Build settings:
   - **Framework preset:** `None`
   - **Build command:** `exit 0`
   - **Build output directory:** leave blank (or `/`)
5. **Save and Deploy.** You'll get a URL like `https://dr-johnson-book.pages.dev`.

(The buttons won't fully work until the next three steps connect storage, backup,
and the AI.)

---

## Step 3 — Storage + the backup copy (two KV namespaces)

1. Cloudflare dashboard → **Storage & Databases → KV**.
2. **Create a namespace** named `book-storage`.
3. **Create a second namespace** named `book-storage-backup`. ← this is the
   independent "another place" the work is copied to.
4. Go to **Workers & Pages → your project → Settings → Bindings → Add → KV namespace**,
   and add **both**:
   - Variable name `BOOK`  → select `book-storage`
   - Variable name `BOOK_BACKUP`  → select `book-storage-backup`

   (Spelling must match exactly: `BOOK` and `BOOK_BACKUP`, all caps.)

---

## Step 4 — Turn on the free AI

1. Still in **Settings → Bindings → Add**, choose **Workers AI**.
2. Variable name: `AI`  ← exactly this.
3. Save. (Workers AI includes a free daily allowance — plenty for one author, no
   credit card.)

---

## Step 5 — Redeploy

**Deployments** tab → latest deployment → **⋯ → Retry deployment** (bindings only
take effect after a redeploy).

Done. Your `https://...pages.dev` link is **Dr. Johnson's tap-and-go link** — send
it to him as-is.

---

## How saving, re-access & backup work

- Everything saves automatically under the name `dr-johnson` as he goes (the
  "Saved ✓" tag in the corner confirms it).
- Each save is written to **both** stores (`book-storage` and
  `book-storage-backup`), and a **snapshot** is kept periodically in the backup
  store (about every 30 minutes, last 20 kept).
- When the app loads, it tries the primary store, then the backup, then the newest
  snapshot — so a problem in one place never loses the work.
- If the off-site GitHub backup is enabled (optional step below), a copy is also
  committed to a GitHub repo on a completely separate company's infrastructure,
  with full version history — so the work survives even a total Cloudflare outage.
- Reopening the same link on any device shows a "Welcome back" screen to continue
  or view the draft.

## The recall / retrieval path (for the team)

Open **`https://your-site.pages.dev/backup.html`** — the Backup & Recovery page.
There you can:

- Load the current saved work (it auto-recovers from backup/snapshot if needed),
- See every earlier snapshot and restore/download any of them,
- Download as **Word** (page-numbered) or as a complete **.json** backup file.

As a last resort, the raw document also lives in the Cloudflare dashboard at
**Storage & Databases → KV → `book-storage` (or `book-storage-backup`) → key
`book:dr-johnson`**. Snapshots are the `snap:dr-johnson:<date>` keys.

If the off-site backup is on, there's also an independent copy on GitHub at
**your backup repo → `backups/dr-johnson.json`** — and that file's **History** on
GitHub is a full version history you can view or download anytime.

## The two Word downloads (both page-numbered)

1. **"Download what's written so far"** — his words exactly as dictated, each stage
   on its own numbered page. Works anytime, even before the AI runs. This is the
   accumulating manuscript.
2. **"Download .docx"** — the polished, AI-written book version.

---

## Optional — off-site backup to GitHub (recommended)

This adds an independent copy on GitHub (a different company than Cloudflare),
with automatic version history. All free.

1. **Create a separate, private backup repo** on GitHub (e.g. `dr-johnson-backups`).
   Use a *different* repo from your code — backups should not trigger redeploys.
2. **Make a fine-grained access token:** GitHub → **Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → Generate new token**.
   - **Repository access:** Only select repositories → your backup repo.
   - **Permissions:** Repository permissions → **Contents → Read and write**.
   - Generate and copy the token (starts with `github_pat_...`).
3. In your Cloudflare Pages project → **Settings → Variables and Secrets → Add**,
   add these (mark the token as **Encrypt / secret**):
   - `GITHUB_TOKEN`  = the token you just copied
   - `GITHUB_OWNER`  = your GitHub username (or org)
   - `GITHUB_REPO`   = the backup repo name (e.g. `dr-johnson-backups`)
   - `GITHUB_BRANCH` = `main`  *(only if your repo's default branch isn't `main`)*
4. **Redeploy.** From then on, a backup is committed to
   `backups/dr-johnson.json` in that repo (at most once every ~10 minutes, so the
   commit history stays tidy). You can confirm it's working on the backup page —
   it shows "Off-site backup: GitHub ✓" and the last push time.

> Prefer Google Drive instead of GitHub? That's also possible but needs a Google
> Apps Script web app or OAuth setup — more steps. Ask if you want that version.



The link is unlisted but technically open to anyone who has it. If you want real
sign-in protection (free for small teams), turn on **Cloudflare Access**:
your project → **Settings → enable Access**, and require an email login. Useful
especially for `backup.html`.

---

## If something doesn't work

- **"The free AI… not connected"** → Step 4: the Workers AI binding must be named
  exactly `AI`. Redeploy after fixing.
- **Work isn't saving / no "Welcome back"** → Step 3: bindings must be exactly
  `BOOK` (and `BOOK_BACKUP`). Redeploy.
- **Page is blank** → `index.html` must be at the top level of the repo; build
  output directory blank/`/`.

## Want higher-quality book writing later?

The free AI writes well but plainly. To switch to Claude (best writing, ~a few
cents per book, needs a separate Anthropic API account — not your Claude.ai
subscription), open `functions/api/generate.js` and follow the commented
instructions at the bottom of the file. It's a small, reversible change. Storage
and backup are unaffected.

## Cost

$0. GitHub, Cloudflare Pages, KV storage (both namespaces), and Workers AI all run
on free tiers with no credit card and no subscription.
