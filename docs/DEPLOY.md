# Deploying Anicards

A step-by-step runbook for putting the game online with Supabase (database and
login) and Vercel (hosting). Do the steps in order.

The scripts (`npm run import`, `npm run invite`, `npm run admin`) read only
two variables: `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
(no anon key needed). To run one against the hosted project, set both in the
terminal session only. Example in PowerShell:

```
$env:NEXT_PUBLIC_SUPABASE_URL='https://<project-ref>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='<service-role key>'
npm run admin -- <username>
```

Variables already set in the terminal win over `.env.local`. Close that
terminal when you are done so the production key does not linger. `.env.local`
is never edited and stays pointed at your local database.

## 1. Supabase project

1. Create a project at https://supabase.com. Pick the region closest to your
   players and save the database password.
2. Link the repo to it. The project reference is in the dashboard URL.
   ```
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```
3. Apply all migrations to the hosted database:
   ```
   npx supabase db push
   ```
4. Check that `pg_cron` is enabled (Database > Extensions). The migrations turn
   it on and schedule the auction and daily jobs; the Extensions page should
   list `pg_cron` as enabled and Database > Cron should show the jobs.
5. From Project Settings > API copy the project URL, the `anon` key and the
   `service_role` key. You need them in steps 3 and 5. The service-role key is
   secret: never expose it in the browser or commit it.

## 2. Import the catalog

In a terminal with the two hosted variables set (see the top of this page):

```
npm run import
```

If `scripts/import-anilist/.cache` exists from an older version of the importer,
delete it first so stale AniList errors are not reused. The import only adds
cards; running it again is safe.

## 3. Supabase Auth settings

In the dashboard, Authentication:

1. Providers > Discord: enable it and paste the Discord application's client ID
   and secret (see step 4). Note the callback URL shown there.
2. URL Configuration: set the Site URL to `https://<your-domain>` and add
   `https://<your-domain>/auth/callback` to the Redirect URLs.
3. Sign In / Providers: turn **off** "Allow new users to sign up" for email
   (only Discord login is used) and turn **off** "Allow anonymous sign-ins".

## 4. Discord developer app

1. Go to https://discord.com/developers/applications and create an application.
2. OAuth2: add the redirect `https://<project-ref>.supabase.co/auth/v1/callback`
   (the Supabase callback URL from step 3).
3. Copy the client ID and client secret into Supabase (step 3.1).

## 5. Vercel project

1. Import the repository in Vercel (framework: Next.js, default build settings).
2. Add these environment variables (see `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`: the hosted project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the hosted anon key
   - Do not add `SUPABASE_SERVICE_ROLE_KEY` here: the app never reads it. It
     stays only in your terminal session, for the scripts.
   - Leave `NEXT_PUBLIC_DEV_LOGIN` unset (or `false`). Do not set the
     `DEV_TEST_*` variables.
3. Deploy, then add your domain (or use the `*.vercel.app` one) and make sure it
   matches the Site URL from step 3.

## 6. First admin

1. In a terminal with the two hosted variables set (see the top of this page), create an invite code:
   ```
   npm run invite
   ```
2. Open the site, sign in with Discord and enter the code.
3. Make yourself admin, using the username you chose in the game (same
   terminal, or set the two variables again):
   ```
   npm run admin -- <username>
   ```
   The Admin page then appears for you. From there you can create more invites,
   grant currency, and manage daily pools, seasonal boosters and chat.

## 7. Keep-alive cron

`vercel.json` schedules `GET /api/ping` once a day (06:00 UTC) so the free
Supabase project is not paused for inactivity. Nothing to set up: Vercel reads
the file on deploy. Check it under Project > Settings > Cron Jobs, and open
`https://<your-domain>/api/ping`; it should answer `{"ok":true}`.

## 8. Smoke checklist

After the first deploy, on the live site:

- [ ] Sign in with Discord (and with an invite code on a new account).
- [ ] Open a booster and see the cards land in the collection.
- [ ] Market: list a card and view a listing.
- [ ] Chat: send a message in the market chat.
- [ ] Phone: open the site, use "Add to Home screen" and launch it from the new
      icon; it should open full screen. Turn on airplane mode and relaunch: the
      offline page should show instead of a browser error.
