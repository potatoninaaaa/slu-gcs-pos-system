# SLU GCS POS and Inventory System

Offline-capable point of sale and inventory system for the Saint Louis University
Green Core Society, used during University Week. One cashier sells, an admin manages stock.

Stack: React, TypeScript, Tailwind CSS, Supabase (Postgres, Auth, Storage), Dexie (IndexedDB),
PWA service worker, Recharts, Cloudflare Pages.

## How it works

Supabase is the master record. Each device keeps a local copy in IndexedDB. The cashier screen
only reads and writes the local copy, so selling works with no internet. Every sale gets a unique
ID on the device. Saved changes wait in an outbox and upload when the internet returns, and the
server ignores a sale it already has, so nothing is duplicated or lost.

## 1. Supabase setup

1. Create a project at https://supabase.com (free plan, Singapore region). Save the database password.
2. Open SQL Editor and run, in order:
   - `supabase/migrations/20261115000000_initial_schema.sql`
   - `supabase/migrations/20261116000000_restore_backup.sql`
   - `supabase/migrations/20261120000000_add_payment_methods.sql`
3. Authentication, Sign In / Providers: keep Email on, turn off "Allow new users to sign up" and
   "Confirm email".
4. Authentication, Users, Add user: create the admin and cashier accounts (tick Auto Confirm User).
5. Make the admin an admin (SQL Editor, use the admin's email):

```sql
update public.profiles set role = 'admin' where email = 'ADMIN_EMAIL_HERE';
```

6. Project Settings, API: copy the Project URL and the anon / publishable key. Never use the
   service_role key anywhere in this project.

## 2. Run locally

```bash
npm install
cp .env.example .env.local     # Windows: copy .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

## 3. Environment variables

| Name | Value |
|---|---|
| VITE_SUPABASE_URL | your Supabase Project URL |
| VITE_SUPABASE_ANON_KEY | your anon / publishable key (safe for browsers) |

They are baked in at build time. After changing them on the host, redeploy.

## 4. Deploy to Cloudflare Pages

1. Push the repository to GitHub.
2. Cloudflare dashboard, Workers & Pages, Create application, Pages, Connect to Git.
3. Select the repository and the `main` branch.
4. Framework preset: None. Build command: `npm run build`. Build output directory: `dist`.
5. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `NODE_VERSION` = `22`.
6. Save and Deploy. The site is published at a `*.pages.dev` address. Every push to `main` redeploys.

Run `npm run build` locally first. The deployment fails on the same TypeScript errors.

## 5. First-time app setup

1. Sign in as the admin on the deployed site.
2. Settings, Logos: upload the SLU, GCS, and SAMCIS logos.
3. Settings, General: enter the organization name and receipt footer.
4. Settings, Categories: adjust the categories.
5. Products: add every product with a photo, a unique product code (SKU), a price, and stock.

## 6. Install on a device (PWA)

- Android (Chrome): open the site, menu, Install app (or Add to Home screen).
- iPhone/iPad (Safari): Share, Add to Home Screen.
- Desktop (Chrome or Edge): the install icon in the address bar.

Install it, open it from the home screen icon, and sign in once while online.

## 7. Prepare every device before University Week

1. On good internet, open the installed app and sign in. The first sign-in needs internet.
2. Open Status and wait until it says "This device is ready to work offline".
3. Close the app and open it again with Wi-Fi and mobile data off. It must open and show products.
4. Make one test sale offline, turn the internet back on, and confirm it reaches All synced.
5. Clear the test data (see "Cleaning up test data") before the event starts.

## 8. Offline testing checklist

- Airplane mode, open the installed app: it opens, products and photos show.
- Search and filter products offline: works.
- Complete a sale offline: receipt prints, stock drops, badge says "Offline: N saved locally".
- Refresh or close the app: the saved sale is still in History as "Saved locally".
- Reconnect: badge goes to Syncing, then All synced. History shows "Synced".
- Check Supabase Table Editor: the sale appears once, and stock matches.
- Reconnect twice or sync repeatedly: the sale is never duplicated.

## 9. Backup and restore

- Backup: Settings, Backup and restore, Download full backup (JSON). Download one after each
  University Week day and keep it in Google Drive. Photos and logos stay in Supabase Storage.
- Restore: Settings, Backup and restore, choose the file, Restore. It adds anything missing and
  never overwrites or duplicates existing records, so restoring twice is safe.
- Rebuilding in a new Supabase project: run all migration files, create the accounts, make the
  admin, sign in, then restore the JSON. Re-upload product photos and logos if the old storage is gone.
- Excel and PDF exports are in History, Activity, Dashboard, and Settings.

## 10. Good to know

- Free Supabase projects pause after a week with little activity. Open the app or dashboard
  during the week before the event, and check the project is not paused the day before.
- Signing in, adding or editing products, categories, users, settings, and logos need internet.
  Selling and stock adjustments work offline.
- Clearing a browser's site data erases that device's unsynced sales. Check the badge says
  All synced before closing out for the day.
- New logins can only be created in the Supabase dashboard.
- When a new version is deployed, the app shows "A new version is ready". Tap Update between sales.

## Cleaning up test data

Test sales cannot be deleted from the app. Before the event, either use a fresh Supabase project, or
in the SQL Editor run `delete from public.transactions;` (items are removed with them) and then
set each product's stock with Stock, Set to. Sign out and clear site data on each device afterwards.