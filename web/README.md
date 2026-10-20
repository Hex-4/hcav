# hcav registration

the world's second best scavenger hunt. registration only: landing page, hack club sign-in, unlimited-size teams, and invitations. the hunt list, submissions, scoring, and judging are deliberately not included.

## local development

requires node 24+ and bun.

```sh
bun install --frozen-lockfile
cp .env.example .env # only if you do not already have .env
bun run dev --host localhost --port 5173
```

open http://localhost:5173. the landing page works without credentials; registration needs hca and the airtable schema. never commit `.env` or put provider credentials in browser code.

## hca setup

create a confidential web application at https://auth.hackclub.com. set `HCA_CLIENT_ID` and `HCA_CLIENT_SECRET` in the deployment's secret environment. register both exact callback urls (or use separate development and production applications):

```text
http://localhost:5173/auth/callback
https://hcav.hackclub.com/auth/callback
```

the application requests `openid profile email slack_id verification_status`. confirm it can receive `sub`, `name`, `email`, `email_verified`, `slack_id`, `verification_status`, and `ysws_eligible` through authenticated userinfo. outbound messaging requires `verification_status: "verified"`, `ysws_eligible: true`, a verified email, and a sign-in within 24 hours. the provider's public verification check calls this combination `verified_eligible`; it is not the literal oidc claim used here. no identity documents are requested or stored.

sign-in uses the authorization-code flow, client authentication, state, nonce, pkce parameters, and signed id-token validation. provider-side enforcement of pkce must not be assumed; client authentication, state, nonce and token validation remain required.

## airtable setup

set `AIRTABLE_TOKEN` and `AIRTABLE_BASE_ID`. the token needs access to the chosen base and `data.records:read`, `data.records:write`, and `schema.bases:read`; initial schema creation also needs `schema.bases:write`.

```sh
bun run airtable:setup          # inspect only; makes no changes
bun run airtable:setup --apply  # explicitly create the three missing tables
```

the script never deletes or changes existing tables. the exact field names/types are defined in `scripts/airtable-setup.mjs`. `people` holds account profiles and membership, `teams` holds names/captains/shared invitation links, and `mail` is the outbound email queue. ids are text primary fields. do not manually duplicate ids or edit membership while the application is processing requests.

### email automation

create an airtable automation on `mail` when a record matches `status = ready`:

1. send an email to the record's `recipient`, using `subject` and the complete plain-text `body` (preserve both invitation and opt-out links).
2. update that same record's `status` to `sent` after successful delivery.

use an approved sender and verify your airtable plan's external-recipient permissions and sending allowance. test with your own email before opening dispatch. do not manually replay records or automatically retry ambiguous sends: delivery may have succeeded before a timeout. inspect the sender's delivery history first. queue records can contain personal information and should not be shared publicly.

once tested, set `EMAIL_INVITES_ENABLED=true` and `INVITES_ENABLED=true`. until then, copyable team links still work. the app records delivery submission, not inbox delivery. airtable email delivery itself is an external automation and has to be tested separately.

## slack bot setup

create a slack app from `slack-manifest.json` and have a hack club workspace administrator install/approve it. the bot needs only `chat:write`, `im:write`, and `users:read`.

provide `SLACK_BOT_TOKEN` (the installed bot's `xoxb-…` token) and `SLACK_TEAM_ID` (hack club's workspace id, starting with `T`) through the deployment's secret environment. no user token, signing secret, event subscription, interactivity endpoint, or socket-mode token is needed.

senders enter a member id or a `https://hackclub.slack.com/team/U…` profile link, not an arbitrary message or channel. the bot checks its own workspace and recipient membership before sending a fixed plain-text dm. bot/deactivated accounts are rejected. the sender must have a slack account linked through hca. enable `INVITES_ENABLED=true` after testing a real dm to your own account.

## abuse controls and behavior

- anyone signed in can create a team, join one, or share its link. there is no team-size limit, but each person can belong to only one team.
- only the captain can rename, remove members, transfer captaincy, rotate links, or request email/slack invitations. a captain transfers their role before leaving.
- messages use a fixed template, sanitized sender/team names, no custom content, and disabled slack parsing/unfurls. invitations identify the sender.
- email has stricter limits: five requests per team per rolling 24 hours, and one request per normalized email address ever, across all senders and teams. permanent hashed recipient reservations survive invitation expiry, cleanup, and restarts. retain the sqlite database when deploying or moving bases; deleting it resets this history. aliases are not consolidated. existing local email invitation records are backfilled on startup.
- email and slack also share rolling sender/team budgets: 10/hour and 40/day. ip budgets are 30/hour and 80/day; deployment-wide budgets are 100/hour and 250/day. slack destinations get at most 1/day and 3/week across all senders. reservations are atomic and survive restarts; failed/ambiguous sends consume quota too. these limits govern app queue creation, not manual airtable sends or automation replays.
- the app also limits general requests, login attempts, joins, and mutations. configure trusted client-ip forwarding correctly before launch; never trust a client-supplied forwarding header directly.
- each message has an explicit-confirmation opt-out link. suppressed recipients get no new messages; the sender sees the same generic response. already queued email may still arrive.
- targeted links require the exact verified email or linked slack identity. shared links are bearer invitations. both expire after 14 days; replacing a shared link also revokes outstanding targeted invitations. captain transfers invalidate the old captain's targeted invitations. existing members stay.
- the session cookie is http-only, same-site lax, secure in production, revocable at logout, and expires after seven days. provider tokens are not retained.

## production container

build from this directory, then run behind your https reverse proxy:

```sh
docker build -t hcav .
docker volume create hcav-data
docker run --name hcav --restart unless-stopped \
  --env-file .env \
  -e APP_ORIGIN=https://hcav.hackclub.com \
  -e SQLITE_PATH=/data/hcav.sqlite \
  -p 127.0.0.1:3000:3000 \
  -v hcav-data:/data hcav
```

the image runs as non-root, listens on port 3000, and includes a healthcheck. it does not include `.env`, tests, or development dependencies. your orchestrator should supply equivalent environment settings and a persistent `/data` volume owned by uid 1000.

**run exactly one application process/replica, with no overlapping rolling replicas.** airtable has no transactions or compare-and-swap, so membership mutations are serialized in that process. local sqlite provides durable sessions, oauth state, invitation tokens, suppression records, and atomic rate limits; airtable remains the registration database. do not use an ephemeral filesystem or share the sqlite file over a network filesystem. back up airtable and sqlite; loss of the latter also loses opt-outs and rate limits.

the public origin is `https://hcav.hackclub.com`. sveltekit 3's `paths.origin` is set at build time from `APP_ORIGIN`; adapter-node 6 does not support the old runtime `ORIGIN` variable. the docker build defaults to the production domain. to use another domain, pass `docker build --build-arg APP_ORIGIN=https://your-domain.example -t hcav .` and set the same `APP_ORIGIN` at runtime. a non-docker production build needs `APP_ORIGIN=https://hcav.hackclub.com bun run build`, then the matching runtime setting.

terminate tls at your proxy and prevent direct public access to the app port. set adapter-node's `ADDRESS_HEADER` and `XFF_DEPTH` for your actual trusted proxy chain. for exactly one proxy that overwrites incoming `X-Forwarded-For`, use `ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH=1`. do not copy those settings without verifying your proxy behavior. the default is conservative but may group all visitors under the proxy ip and throttle them together. keep access logs from recording oauth callback queries or invitation secrets.

airtable requests are paced below five/second; this launch-sized implementation prioritizes safe registration over high throughput. do not enable autoscaling without replacing the single-process mutation coordination.

## validation

```sh
bun run check
bun run lint
bun run test
bun run build
```

playwright uses the real application, real sqlite, browser interactions, and cryptographically signed oidc fixtures. airtable, slack, and hca are deterministic service doubles; outbound test network calls fail closed. tests cover sign-in rejection, csrf/logout, registration/joining, team permissions, recipient binding, revocation/opt-out, combined concurrent quotas, ineligible senders, and teams spanning airtable's 100-record pages. test data/screenshots stay in the repository's excluded `.amp/in/` directory.

before opening registration, test real hca login for verified and unverified accounts, a team join from a second account, one email, one slack dm, and opt-out with the deployed proxy settings. tests with doubles cannot establish real provider configuration or email delivery.

the landing page is a browser-default faq. edit its demo content in `src/routes/+page.svelte`; `src/lib/Faq.svelte` takes a `question` prop and renders nested html through svelte's `children` snippet. the rest of the interface uses tailwind and self-hosted comic neue (license in `static/fonts/OFL.txt`). there are no ai-generated images or third-party analytics.
