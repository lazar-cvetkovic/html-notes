# HTML Notes

A centralized, "Notion-like" library for self-contained HTML notes — browse them all in one
searchable, tag-filtered gallery and upload/delete from the live site.

- **Frontend:** static HTML/CSS/JS, hosted on **GitHub Pages** (no build step).
- **Backend:** [Supabase](https://supabase.com) — Storage for the `.html` files, Postgres for
  metadata (title, description, tags), Auth for owner login.
- **Access model:** public read, private write. Anyone can view notes; only the owner (logged in)
  can upload or delete.

## Files

| File | Purpose |
|---|---|
| `index.html` | Gallery shell: search, tag filter, card grid, login + upload modals. |
| `app.js` | Supabase client, load/render, search & tag filtering, auth, upload (with rollback), delete. |
| `styles.css` | Dark GitHub-style theme. |
| `config.js` | Your Supabase URL + anon key + owner email (public values). |
| `SETUP.md` | One-time Supabase + GitHub Pages setup. |

## Getting started

See **[SETUP.md](SETUP.md)** — create a Supabase project, run the SQL, fill in `config.js`,
serve locally, then deploy to GitHub Pages.
