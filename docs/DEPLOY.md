# Deploying Kizuna

A step-by-step runbook for putting the game online with Supabase (database and
login) and Vercel (hosting). Do the steps in order.

The scripts (`npm run import`, `npm run admin`) read only
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

1. Open the site, sign in with Discord and pick a username.
2. In a terminal with the two hosted variables set (see the top of this page),
   make yourself admin with that username:
   ```
   npm run admin -- <username>
   ```
   The Admin page then appears for you. From there you can create invite codes,
   grant currency, and manage daily pools, seasonal boosters and chat.

## 7. Keep-alive cron

`vercel.json` schedules `GET /api/ping` once a day (06:00 UTC) so the free
Supabase project is not paused for inactivity. Nothing to set up: Vercel reads
the file on deploy. Check it under Project > Settings > Cron Jobs, and open
`https://<your-domain>/api/ping`; it should answer `{"ok":true}`.

## 8. Push notifications

The database decides who gets a push (`0047_push_dispatch.sql`: a trigger on
`notifications` and the `push-boosters` cron job) and posts to
`/api/push`, which sends standard web push. Set it up once:

1. Generate the keys on your machine: `npx web-push generate-vapid-keys`.
2. Vercel > Project > Settings > Environment Variables (Production), then
   redeploy:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: the public key
   - `VAPID_PRIVATE_KEY`: the private key (secret)
   - `VAPID_SUBJECT`: `mailto:` plus an address you read, or the site URL
   - `PUSH_SECRET`: a random string of 32+ characters (secret)
3. Supabase > SQL editor, with your domain and the same `PUSH_SECRET`:
   ```sql
   insert into push_config (key, value) values
     ('url', 'https://<your-domain>/api/push'),
     ('secret', '<PUSH_SECRET>')
   on conflict (key) do update set value = excluded.value;
   ```
   Without these two rows nothing is sent (that is how local and test
   databases stay quiet).
4. Database > Extensions should list `pg_net`, and Database > Cron should
   list `push-boosters`.

Players turn alerts on from the bell panel or the home card. On iPhone this
needs iOS 16.4+ and the Home Screen app (the guide in the app explains it).
Installed apps pick up the new service worker on their next launch; nobody
reinstalls.

## 9. Smoke checklist

After the first deploy, on the live site:

- [ ] Sign in with Discord on a new account and pick a username.
- [ ] Open a booster and see the cards land in the collection.
- [ ] Market: list a card and view a listing.
- [ ] Chat: send a message in the market chat.
- [ ] Phone: open the site, use "Add to Home screen" and launch it from the new
      icon; it should open full screen. Turn on airplane mode and relaunch: the
      offline page should show instead of a browser error.
- [ ] Push: turn on alerts on an Android phone and on the installed iPhone app.
      From another account, buy one of your listed cards: the sale alert
      arrives with the game closed and opens the market activity. With the
      app closed, let the free stock reach 10 in daytime: the booster alert
      arrives within a minute or two, and not again within 4 hours.
