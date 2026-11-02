# PATS University — production runbook

Production = **https://patsuniv.znetworks.id** on VM 105 `pats-univ` (ssh `pats-univ`, user `debian`,
192.168.223.117). Card URLs `https://patsuniv.znetworks.id/c/<token>` are printed and written to chips:
**the domain and `CARD_KEY_SECRET` must never change.** No secrets in this file.

Dev keeps running next to prod and stays tailnet-only (`~/pats-univ`, compose project `pats-univ`,
ports 3100/3101, demo OTP, `~/deploy-pats.sh`). Nothing below touches dev.

## Layout

| What | Where |
|---|---|
| Release checkout (detached at the deployed commit) | `~/pats-prod/src` (clone of `berlinlmaoo/pats-univ`, deploy key) |
| Secrets (600, dir 700) | `~/.pats-prod-secrets/prod.env` (source of truth), `slot.env` (generated per deploy) |
| Blue-green state | `~/pats-prod/bluegreen/{live,epoch,history.log,finish.log,nginx/live.inc}` |
| Proxy config | `~/pats-prod/nginx/pats.conf` (copied from `infra/prod/nginx/pats.conf` on deploy) |
| Scripts (symlinks into the checkout) | `~/deploy-pats-prod.sh`, `~/backup-pats-prod.sh`, `~/pats-prod-cron.sh` |
| Release-candidate e2e harness | `~/pats-prod/ci.sh <sha>` (throwaway stack `pats-ci-*`) |
| Backups | `~/backups-prod` (VM, 14 days) → host `/mnt/nexus-backup/pats-univ` (30 days) |

Containers (network `pats-prod`):

- `pats-prod-postgres` (volume `pats-prod-pgdata`, no published port)
- `pats-prod-web-blue` / `pats-prod-web-green`: the two app slots (image `pats-web:<sha>`, volume `pats-prod-storage` at `/data/storage`)
- `pats-prod-realtime` (Socket.IO, image `pats-realtime:<sha>`; `API_URL` = proxy internal listener = live slot)
- `pats-prod-proxy` (nginx): `127.0.0.1:3200` public (cloudflared), `:3201` internal → live slot,
  `:3202` preview → idle slot. Both internal listeners answer with `X-Pats-Slot`.

Postgres, realtime and proxy are in `infra/prod/docker-compose.prod.yml`; the slots are started by the deploy script.

Public exposure: Cloudflare tunnel **`pats-univ`** (dedicated to this VM), systemd unit `cloudflared-pats`
(`/etc/cloudflared/pats-univ.token`, root 600), ingress `patsuniv.znetworks.id → http://127.0.0.1:3200`.
DNS: proxied CNAME `patsuniv` → `<tunnel-id>.cfargotunnel.com`. Only the web and `/socket.io/` are public.
`/api/cron/*` returns 404 publicly. Postgres, realtime's other routes, dev: never public.

Proxy: HSTS (1 year, this host only), nosniff, `X-Frame-Options SAMEORIGIN`, `frame-ancestors 'self'`,
Referrer-Policy, Permissions-Policy, http→https redirect. Rate limits per real client IP (`CF-Connecting-IP`):
`/api/auth/otp/*` and `/api/join/otp` 10/min (burst 10), everything else 30/s (burst 120). The app adds
its own OTP limits (60 s resend, 5/hour per email, 40/hour per IP, 5 attempts per code).

## Deploy (blue-green)

Release = **fast-forward `master` to a green `dev` commit**, then:

```sh
ssh pats-univ ~/deploy-pats-prod.sh deploy            # origin/master
ssh pats-univ ~/deploy-pats-prod.sh status
ssh pats-univ ~/deploy-pats-prod.sh rollback          # back to the previous slot
ssh pats-univ ~/deploy-pats-prod.sh env               # same image, env rebuilt from prod.env (e.g. SMTP creds)
ssh pats-univ ~/deploy-pats-prod.sh finish            # stop the old slot now
```

What `deploy` does, in order (any failure aborts and the live slot keeps serving):

1. `git fetch`, refuse a commit that is not on `origin/master` (`ALLOW_NON_MASTER=1` overrides), checkout detached.
2. Build `pats-web:<sha>` + `pats-realtime:<sha>`; web + shared unit tests in the build stage (`SKIP_TESTS=1` skips).
3. Proxy config update if `infra/prod/nginx/pats.conf` changed (`nginx -t`, restored on failure).
4. **Schema gate**: lists Prisma migrations not yet applied; any `DROP TABLE/COLUMN`, `RENAME`,
   `ALTER COLUMN … TYPE`, `SET NOT NULL`, `DROP TYPE` while a slot is serving = refused
   (`ALLOW_CONTRACT=1` only after the old code no longer needs what is dropped). Always takes a
   verified `pre-deploy-*.dump` first when something is pending.
5. Start the idle slot (it runs `prisma migrate deploy` on start), wait for `/api/health`.
6. Fail-closed check: the slot must have `OTP_PROVIDER=email` and `PATS_ENV=production` (the app itself
   also refuses `OTP_PROVIDER=demo` when `PATS_ENV=production`).
7. Smoke the idle slot through `:3202`: health, `/`, `/login`, `/join`, card-not-found page for an
   unknown `/c/…`, `/api/c/…` 404, dashboard redirect without a session, OTP for an unknown email = 404.
8. Smoke the **old** slot again against the migrated schema (if it fails: no switch).
9. Realtime moves to the new image (Socket.IO clients reconnect by themselves).
10. Switch: rewrite `live.inc`, `nginx -s reload` (graceful), confirm via `X-Pats-Slot`; public health check.
11. Old slot stays running `KEEP_MINUTES` (10) for an instant rollback, then is stopped (container kept,
    so a later rollback starts it first: ~10–20 s instead of <1 s).

Release candidates can also run the five interaction matrices on a throwaway stack: `~/pats-prod/ci.sh <sha>`
(needs the images built first; see the header of the script). As of 2 Nov 2026 `cards`, `checkin` and
`phase5` pass; `loyalty` and `social` contain assertions from before the 16 Oct team decisions
(rewards per venue, reservation approvers, posting defaults) and fail on those only.

## Email OTP

Login (dashboard and app) = email + 6-digit code, `OTP_PROVIDER=email`, SMTP from `prod.env`
(`SMTP_HOST` default `smtp.gmail.com`, `SMTP_PORT` 587, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
default `PATS University <noreply@znetworks.id>`). Without `SMTP_USER/SMTP_PASS` every code request
fails (`OTP_SEND_FAILED`), so nobody can sign in: this is the intended fail-closed state.
After filling them in: `~/deploy-pats-prod.sh env`. Values in `prod.env` are raw (no quotes).

## First-time setup (done 2 Nov 2026, for reference / rebuild)

```sh
# secrets: ~/.pats-prod-secrets/prod.env with POSTGRES_PASSWORD, AUTH_SECRET, CARD_KEY_SECRET,
#          CRON_SECRET, REALTIME_SECRET (openssl rand), SMTP_USER/SMTP_PASS (empty until provided)
mkdir -p ~/pats-prod/{nginx,bluegreen/nginx} ~/backups-prod
cp ~/pats-prod/src/infra/prod/nginx/pats.conf ~/pats-prod/nginx/
printf 'set $pats_live pats-prod-web-blue;\nset $pats_idle pats-prod-web-green;\n' > ~/pats-prod/bluegreen/nginx/live.inc
sudo env PATS_REALTIME_TAG=<sha> PATS_PROD_HOME=$HOME/pats-prod docker compose -p pats-prod \
  -f ~/pats-prod/src/infra/prod/docker-compose.prod.yml --env-file ~/.pats-prod-secrets/prod.env up -d
~/deploy-pats-prod.sh deploy
# reference data only (cities JKT + JOG, default settings, super admin); never the demo seed:
sudo docker run --rm --network pats-prod --env-file ~/.pats-prod-secrets/slot.env -e SEED_MODE=production \
  -e SEED_SUPER_ADMIN_EMAIL=bagas@znetworks.id -v ~/pats-prod/src/tsconfig.base.json:/repo/tsconfig.base.json:ro \
  -w /repo/apps/web pats-web-build:<sha> npx prisma db seed
```

Venues, city WhatsApp group links, hub channels, rewards and city admins are created in the dashboard.

## Crons and backups

- `* * * * * ~/pats-prod-cron.sh` → `/api/cron/{notifications,loyalty,social}` on `:3201`; errors in `~/pats-prod-cron.err`.
- `20 2 * * * ~/backup-pats-prod.sh`: `pg_dump -Fc` (verified with `pg_restore --list`) + tar of the
  storage volume into `~/backups-prod`, 14 days.
- Host `pats-backup.timer` 03:40: pulls `~/backups-prod` to `/mnt/nexus-backup/pats-univ` (30 days),
  alarm to Berlin on Telegram if the newest dump is >36 h old. Offsite copy runs only once the
  rclone remote `pats-offsite:` exists on the host (encrypted crypt remote; see the script header).

Restore test (into a scratch database, never over prod):

```sh
sudo docker exec pats-prod-postgres createdb -U pats restore_test
sudo docker exec -i pats-prod-postgres pg_restore -U pats -d restore_test --no-owner < ~/backups-prod/pats-prod-<stamp>.dump
sudo docker exec pats-prod-postgres psql -U pats -d restore_test -c 'select count(*) from "Member"'
sudo docker exec pats-prod-postgres dropdb -U pats restore_test
```

## Card printing (super admin)

Dashboard → Cards: members without a card → create batch → files: one CR80 PDF per member
(91.6 × 60 mm incl. bleed, front + back), batch PDF, CSV manifest (`qr_url` column). QR = 
`https://patsuniv.znetworks.id/c/<token>` (constant in `packages/shared/src/card.ts`, not env).
`/c/<token>` works for printed but not yet delivered cards ("pending"), and shows a friendly
"card not found" page (noindex) for anything else.

## Incidents

- Site down, slot healthy: `systemctl status cloudflared-pats`, `sudo docker logs pats-prod-proxy`.
- Bad release: `~/deploy-pats-prod.sh rollback`. If a migration broke the old slot too: restore the
  `pre-deploy-*.dump` of that deploy into a scratch DB, compare, then decide (never restore over prod blind).
- Memory: the VM has 4 GB + 2 GB swap. During a deploy both slots run (+ a build); keep dev idle then.
