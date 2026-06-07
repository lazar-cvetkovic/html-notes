# Setup

A static gallery (GitHub Pages) for your self-contained HTML notes, backed by Supabase
(Storage + Postgres + Auth). **Public read, private write** — anyone can browse the notes,
only you (logged in) can upload or delete.

---

## 1. Create a Supabase project

1. Go to <https://supabase.com> → create a free project.
2. After it provisions, open **Project Settings → API** and copy:
   - **Project URL** (e.g. `https://abcd1234.supabase.co`)
   - **anon public** key

## 2. Create the storage bucket

1. **Storage → New bucket** → name it `notes`.
2. Mark it **Public** (so notes can be opened by a public URL). Create.

## 3. Create the table + security policies

Open **SQL Editor → New query**, paste this, and run it
(replace the email with **your** owner email — it must match `OWNER_EMAIL` in `config.js`):

```sql
-- Metadata table -----------------------------------------------------------
create table public.notes (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  tags         text[] default '{}',
  storage_path text not null,
  created_at   timestamptz default now()
);
alter table public.notes enable row level security;

-- Anyone can read notes
create policy "notes_read" on public.notes
  for select using (true);

-- Only the owner (by email) can insert/update/delete
create policy "notes_write" on public.notes
  for all to authenticated
  using      (auth.jwt() ->> 'email' = 'laki.cvetkovic@gmail.com')
  with check (auth.jwt() ->> 'email' = 'laki.cvetkovic@gmail.com');

-- Storage: anyone can read objects in the "notes" bucket
create policy "notes_obj_read" on storage.objects
  for select using (bucket_id = 'notes');

-- Storage: only the owner can upload
create policy "notes_obj_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'notes'
              and auth.jwt() ->> 'email' = 'laki.cvetkovic@gmail.com');

-- Storage: only the owner can delete
create policy "notes_obj_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'notes'
         and auth.jwt() ->> 'email' = 'laki.cvetkovic@gmail.com');
```

## 4. Configure Auth

1. **Authentication → Providers → Email**: make sure **Email** is enabled
   (magic link / OTP is on by default).
2. **Authentication → Sign In / Providers** (or **Settings**): turn **off "Allow new users to sign up"**.
   This way only the account you create can ever log in — extra protection on top of the
   email-based policies above.
3. **Authentication → Users → Add user** → add yourself (`laki.cvetkovic@gmail.com`).
   Use "Send invite" / "magic link", or set a password — either is fine since we sign in by magic link.
4. **Authentication → URL Configuration → Redirect URLs**: add both
   - `http://localhost:8000` (for local testing — match the port you serve on)
   - your GitHub Pages URL, e.g. `https://<your-user>.github.io/html-notes/`

## 5. Fill in `config.js`

```js
window.SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
window.OWNER_EMAIL = "laki.cvetkovic@gmail.com";
```

These are public values; committing them is fine (writes are protected by the policies, not by secrecy).

## 6. Run locally

From the `html-notes` folder:

```powershell
python -m http.server 8000
# or:  npx serve -l 8000
```

Open <http://localhost:8000>. You should see the gallery (empty at first).
Click **Owner login**, request a magic link, open it, and you'll see **+ Upload note** appear.

## 7. Deploy to GitHub Pages

1. Create a GitHub repo (e.g. `html-notes`) and push these files.
2. **Repo → Settings → Pages →** Source: *Deploy from a branch*, Branch: `main` / `/ (root)`.
3. Wait for the URL `https://<your-user>.github.io/html-notes/` to go live, and confirm it's in
   the Supabase redirect URLs (step 4.4).

## 8. Import your existing notes

Log in and use **+ Upload note** for each of your current files
(`messaging-systems.html`, `unity-dots-objasnjenje.html`, `threads-objasnjenje.html`,
`devops-objasnjenje.html`), giving each a title and tags (e.g. `Backend`, `Messaging`, `Unity`,
`Concurrency`, `DevOps`).
