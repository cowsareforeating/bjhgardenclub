# Tree Bed App

A community app for tree-bed gardening and care: members log "care sessions" on
tree beds, add photos, react, and join sessions others logged.

## How to work in this repo

- **Plan before non-trivial work.** Propose an approach first and split work into
  small, discrete tickets that each have a high chance of success. Don't bundle
  unrelated changes.
- **Never merge or push to `main` without explicit approval.** Default flow:
  branch → commit → open a PR → share it → **wait** for the maintainer to say
  "merge." They want to review/preview before anything lands on main.
- **Don't end responses with option menus.** No "Want me to do (a)/(b)/(c)?"
  trailing branches. Finish on the substance; if an obvious small next step
  exists, just do it (or say you're doing it).
- **Be honest about verification.** Say plainly what you did and didn't test. If
  something can't be safely tested (e.g. multi-user RLS against production),
  surface that rather than implying it's verified. Flag known limitations
  proactively instead of letting them be discovered later.

## Stack & architecture

- React + TypeScript + Vite + Tailwind, deployed on Vercel (PWA).
- **Supabase** backend (Postgres + Auth + Storage). The browser uses only the
  **anon/publishable key**; **Row-Level Security (RLS) gates everything** — treat
  RLS as the real authorization layer, not the client.
- `auth.users` is the account of record; `public.profiles` is a downstream row
  keyed by the same id. Deleting a profile does **not** delete the user.

## Database migrations

- SQL lives in `migrations/NNN_*.sql`, applied **manually** in Supabase (not run
  by the app or CI). A new feature that needs schema changes isn't live until the
  maintainer runs the migration — call this out in the PR.
- The base schema (migration `001`, incl. the `profiles` table and the
  `handle_new_user` trigger) was applied directly in Supabase and is **not in
  this repo** — migrations here start at `002`.
- Follow the established style: **idempotent** (`create ... if not exists`,
  `drop policy if exists` then `create policy`, `create or replace function`),
  safe to re-run.
- FK conventions on user-authored rows: `created_by ... references auth.users(id)`
  with `on delete set null` to anonymize authored content, or `on delete cascade`
  for pure join rows (participants, reactions).

## Conventions

- Match the surrounding code's style, comment density, and naming.
- Care-session photos: bucket `care-photos` (public read); any signed-in member
  may contribute a photo (auto-joins them as a participant via DB trigger) and
  remove photos they added; editing the session itself stays creator/admin.

## Undoing changes

- To revert a specific change, use `git log --oneline` to find the commit and
  `git revert <sha>` (use `-m 1` for merge commits). A clean baseline before the
  care/detail UI revisions is `1f190e1`.
