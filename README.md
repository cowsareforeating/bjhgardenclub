# Tree Beds — Garden Club App

A mobile-first web app for tracking tree beds and care sessions. Works on phones
in the field, installs to the home screen as a Progressive Web App, and runs on
free hosting (Netlify or Cloudflare Pages).

The database lives in Supabase. The app talks to it directly using the public
"anon" key — row-level security on the database decides who can read and write
what.

---

## What you need before you start

- A computer with [Node.js 18 or newer](https://nodejs.org/) installed.
- The Supabase project's URL and "anon" key (already filled into `.env.example`).
- The Supabase schema (`tree_bed_schema.sql`) already run against the project.

If you've never used the terminal: on Mac, open the app called **Terminal**.
On Windows, open **PowerShell**. Type the commands below exactly as shown.

---

## Run it locally (about 2 minutes)

1. **Open a terminal in this folder** (the one with `package.json` in it).
2. **Copy the env file:**
   ```bash
   cp .env.example .env.local
   ```
   (On Windows PowerShell: `copy .env.example .env.local`)
3. **Install everything:**
   ```bash
   npm install
   ```
4. **Start the dev server:**
   ```bash
   npm run dev
   ```
5. Open the address it prints (usually `http://localhost:5173`) in your browser.
   To test on your phone, use the second URL it prints (the one with your
   computer's IP), making sure your phone is on the same Wi-Fi.

That's it — you should see the map.

> **First-time sign-in.** Tap *Sign in*, enter your email, click the link in your
> inbox. You'll be a *contributor* by default. To make yourself an *admin*, open
> the Supabase dashboard → SQL Editor and run:
> ```sql
> update public.profiles set role = 'admin' where email = 'you@example.com';
> ```

---

## Deploy it for free

Both options below give you a public URL you can share with the garden club. Pick
one — you don't need both.

### Option A — Netlify (easiest)

1. Push this folder to a GitHub repo (or use the Netlify CLI / drag-and-drop).
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**.
3. Pick your repo. Netlify will detect Vite. Leave the defaults:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. Before the first deploy, click **Add environment variables** and paste in:
   ```
   VITE_SUPABASE_URL        = https://xqimsxchmneiahlrxxlo.supabase.co
   VITE_SUPABASE_ANON_KEY   = sb_publishable_TjUZeDLw_p-fEhw79zc5_g_rYC-ZiMG
   ```
5. Click **Deploy site**. After a minute or two you'll get a `*.netlify.app` URL.

**Important — SPA redirects.** Add a file called `public/_redirects` with this
single line so deep links (e.g. `/bed/abc`) work after refresh:
```
/* /index.html 200
```
(This file is already created for you.)

### Option B — Cloudflare Pages

1. Push this folder to GitHub.
2. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Connect to Git**.
3. Pick your repo. Settings:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Under **Environment variables (Production)**, add:
   - `VITE_SUPABASE_URL` = `https://xqimsxchmneiahlrxxlo.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `sb_publishable_TjUZeDLw_p-fEhw79zc5_g_rYC-ZiMG`
5. Click **Save and Deploy**.

Cloudflare Pages serves SPAs correctly by default — no redirect file needed.

### Supabase auth redirect — do this once after deploying

When you set up the live URL, go to **Supabase → Authentication → URL Configuration**
and add your live URL (e.g. `https://your-app.netlify.app`) to **Site URL** and to
**Redirect URLs**. Otherwise magic-link emails will bounce people back to
`localhost`.

---

## Adding the app to a phone home screen

iPhone: open the site in Safari → Share → **Add to Home Screen**.
Android: open the site in Chrome → menu → **Install app** (or **Add to home screen**).

The app will run full-screen and cache the map tiles, so it keeps working even
when reception is patchy.

---

## What each role can do (matches the database rules)

- **Not signed in:** see the map and tap pins to view bed details and care history.
- **Contributor (default):** everything above, plus add new tree beds and record
  care sessions. Can edit or delete only the rows you created yourself.
- **Admin:** edit or delete anyone's rows, and manage the lookup tables (tree
  types / activity types).

---

## Replacing the placeholder icons

`vite-plugin-pwa` expects these files in `public/`:

- `icon-192.png` (192×192)
- `icon-512.png` (512×512)
- `icon-512-maskable.png` (512×512, with safe area around the artwork)
- `apple-touch-icon.png` (180×180)

The build will still work without them but the install prompt looks plain. The
easiest path is to drop a square logo into [maskable.app](https://maskable.app)
and export all four sizes.

---

## Common gotchas

- **"Missing Supabase env vars"** — you didn't make `.env.local`. See step 2 above.
- **Map shows but no pins** — the database is empty, or RLS blocked anon reads.
  Double-check that the `grants` section of `tree_bed_schema.sql` was run.
- **Magic link goes to localhost after deploy** — set the live URL in
  Supabase Authentication settings (see above).
- **GPS doesn't work** — modern browsers only allow geolocation over HTTPS
  (or `localhost`). Once deployed, it will work everywhere.

---

## Project layout

```
src/
  main.tsx          App bootstrap + Leaflet icon fix
  App.tsx           Routes
  index.css         Tailwind + Leaflet CSS
  context/
    AuthContext.tsx Supabase session + profile + role
  lib/
    supabase.ts     Supabase client
    types.ts        TypeScript shapes for DB rows
    geocode.ts      OpenStreetMap Nominatim wrapper
  components/
    Layout.tsx      Header + bottom nav
    Spinner.tsx
    Banner.tsx
  screens/
    MapView.tsx           Home — Leaflet map of all beds
    TreeBedDetail.tsx     One bed + its care history
    AddTreeBed.tsx        GPS / address search / tap-map
    RecordCareSession.tsx Date, activity, notes
    Login.tsx             Email magic link
    Search.tsx            Filters, recent, needs-attention
```
