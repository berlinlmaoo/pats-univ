#!/usr/bin/env bash
# PATS University PRODUCTION blue-green deploy (VM pats-univ). Tracked in infra/prod/deploy-pats-prod.sh,
# installed as ~/deploy-pats-prod.sh. Lean version of the NEXUS pattern (deploy-nexus-bluegreen.sh):
# two web slots behind the pats-prod-proxy nginx, health + smoke + schema gates, instant rollback.
#
#   ~/deploy-pats-prod.sh deploy [REF]  -> build REF (default origin/master), unit tests, schema gate,
#                                          start the idle slot, smoke it, switch, keep the old slot warm
#   ~/deploy-pats-prod.sh env           -> same image as live, env rebuilt from ~/.pats-prod-secrets/prod.env, switch
#   ~/deploy-pats-prod.sh rollback      -> back to the previous slot (instant while it runs; else started first)
#   ~/deploy-pats-prod.sh status        -> slots, commits, live, last switches
#   ~/deploy-pats-prod.sh finish        -> stop the old slot now (otherwise done KEEP_MINUTES after a switch)
#
# Rules: master only (ALLOW_NON_MASTER=1 to override), migrations must be expand-only while the old slot
# is still serving (DROP / RENAME / TYPE / SET NOT NULL refused unless ALLOW_CONTRACT=1, and then only
# after a pre-deploy dump), the old slot must stay healthy against the migrated schema before the switch.
set -uo pipefail

SELF="$(readlink -f "$0")"
HOME_DIR="$HOME/pats-prod"
SRC="$HOME_DIR/src"
SECRETS="$HOME/.pats-prod-secrets/prod.env"
SLOT_ENV="$HOME/.pats-prod-secrets/slot.env"
BG="$HOME_DIR/bluegreen"
INC="$BG/nginx/live.inc"
LOCK=/tmp/pats-prod-deploy.lock
NET=pats-prod
PROXY=pats-prod-proxy
PUBLIC=https://patsuniv.znetworks.id
KEEP_MINUTES="${KEEP_MINUTES:-10}"
D="sudo docker"
compose() {  # realtime-tag args...   (sudo drops the caller env, so pass it explicitly)
  local tag=$1; shift
  sudo env PATS_REALTIME_TAG="$tag" PATS_PROD_HOME="$HOME_DIR" docker compose -p pats-prod -f "$SRC/infra/prod/docker-compose.prod.yml" --env-file "$SECRETS" "$@"
}
CMD="${1:-status}"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
say() { printf '\033[1m== %s\033[0m\n' "$*"; }
die() { red "ABORT: $*"; exit 1; }

c() { echo "pats-prod-web-$1"; }
other() { [ "$1" = blue ] && echo green || echo blue; }
live() { cat "$BG/live" 2>/dev/null; }
running() { [ "$($D inspect -f '{{.State.Running}}' "$(c "$1")" 2>/dev/null)" = true ]; }
commit_of() { $D inspect -f '{{index .Config.Labels "pats.commit"}}' "$(c "$1")" 2>/dev/null; }
log() { echo "$(TZ=Asia/Jakarta date '+%F %T WIB') $*" >> "$BG/history.log"; }

write_inc() {  # live idle
  mkdir -p "$BG/nginx"
  printf 'set $pats_live %s;\nset $pats_idle %s;\n' "$(c "$1")" "$(c "$2")" > "$INC.tmp" && mv "$INC.tmp" "$INC"
}
reload_proxy() { $D exec $PROXY nginx -t -q 2>/dev/null && $D exec $PROXY nginx -s reload 2>/dev/null; }
serving() { curl -s -m 5 -D - -o /dev/null "$1/api/health" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-pats-slot"{print $2}'; }

# 127.0.0.1:3201 = live slot, :3202 = idle slot (both through the proxy, header X-Pats-Slot).
code() { curl -s -o /dev/null -m 15 -w '%{http_code}' "$1"; }
wait_health() {  # url seconds
  local i; for i in $(seq 1 "$2"); do [ "$(code "$1/api/health")" = 200 ] && return 0; sleep 1; done; return 1
}
smoke() {  # base url; the checks every slot must pass before it gets traffic
  local b=$1 f=0 r
  r=$(code "$b/api/health");                 [ "$r" = 200 ] || { red "  health $r"; f=1; }
  r=$(code "$b/");                           [[ "$r" =~ ^(200|307|308)$ ]] || { red "  / $r"; f=1; }
  r=$(code "$b/login");                      [ "$r" = 200 ] || { red "  /login $r"; f=1; }
  r=$(code "$b/join");                       [ "$r" = 200 ] || { red "  /join $r"; f=1; }
  # Unknown card: the friendly "card not found" page (200 by design, noindex), never an error page.
  r=$(curl -s -m 15 "$b/c/smoke-not-a-card"); grep -Eq 'Kartu tidak ditemukan|Card not found' <<<"$r" || { red "  /c/<invalid> has no card-not-found page"; f=1; }
  r=$(code "$b/api/c/smoke-not-a-card");     [ "$r" = 404 ] || { red "  /api/c/<invalid> $r (want 404)"; f=1; }
  r=$(code "$b/overview");                   [[ "$r" =~ ^(307|308)$ ]] || { red "  /overview without session $r (want redirect)"; f=1; }
  # An unknown email gets no code (and nothing is sent): 404, never a demo code.
  r=$(curl -s -m 20 -w ' %{http_code}' -X POST -H 'Content-Type: application/json' -d '{"email":"smoke-check@invalid.invalid","audience":"hq"}' "$b/api/auth/otp/request")
  { grep -q demoCode <<<"$r" || [ "${r##* }" != 404 ]; } && { red "  OTP request for an unknown email: ${r##* }"; f=1; }
  return $f
}

build_slot_env() {
  [ -r "$SECRETS" ] || die "missing $SECRETS"
  ( set -a; . "$SECRETS"; set +a
    umask 077
    cat > "$SLOT_ENV.tmp" <<EOF
NODE_ENV=production
PATS_ENV=production
APP_URL=$PUBLIC
DATABASE_URL=postgresql://pats:${POSTGRES_PASSWORD}@pats-prod-postgres:5432/pats_univ
AUTH_SECRET=${AUTH_SECRET}
CARD_KEY_SECRET=${CARD_KEY_SECRET}
CRON_SECRET=${CRON_SECRET}
REALTIME_SECRET=${REALTIME_SECRET}
REALTIME_INTERNAL_URL=http://pats-prod-realtime:4000
REALTIME_PUBLIC_URL=$PUBLIC
OTP_PROVIDER=email
SMTP_HOST=${SMTP_HOST:-smtp.gmail.com}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_SECURE=${SMTP_SECURE:-false}
SMTP_USER=${SMTP_USER:-}
SMTP_PASS=${SMTP_PASS:-}
SMTP_FROM=${SMTP_FROM:-PATS University <noreply@znetworks.id>}
CHROMIUM_PATH=/usr/bin/chromium
STORAGE_DRIVER=local
STORAGE_DIR=/data/storage
PUSH_PROVIDER=expo
EXPO_ACCESS_TOKEN=${EXPO_ACCESS_TOKEN:-}
APPLE_TEAM_ID=${APPLE_TEAM_ID:-}
ANDROID_CERT_SHA256=${ANDROID_CERT_SHA256:-}
EOF
  ) && mv "$SLOT_ENV.tmp" "$SLOT_ENV" && chmod 600 "$SLOT_ENV"
}

start_slot() {  # slot image commit
  $D rm -f "$(c "$1")" >/dev/null 2>&1
  $D run -d --name "$(c "$1")" --network $NET --restart unless-stopped --env-file "$SLOT_ENV" \
    -e PATS_SLOT="$1" -v pats-prod-storage:/data/storage --label pats.commit="$3" --label pats.slot="$1" \
    --log-opt max-size=20m --log-opt max-file=3 "$2" >/dev/null
}

switch_to() {  # slot  (the switch itself: rewrite include + graceful reload)
  local new=$1 old; old=$(other "$1")
  write_inc "$new" "$old"
  if ! reload_proxy; then write_inc "$old" "$new"; reload_proxy; die "proxy reload failed; stayed on $old"; fi
  # The reload is graceful (old workers finish their requests): wait until new connections land on $new.
  local i; for i in $(seq 1 100); do [ "$(serving http://127.0.0.1:3201)" = "$(c "$new")" ] && break; sleep 0.05; done
  echo "$new" > "$BG/live.tmp" && mv "$BG/live.tmp" "$BG/live"
  date +%s > "$BG/epoch"
}

schedule_finish() {
  local epoch; epoch=$(cat "$BG/epoch")
  # 9>&- : the timer must not inherit the deploy lock (it would block rollbacks for KEEP_MINUTES).
  setsid nohup sh -c "sleep $((KEEP_MINUTES * 60)); '$SELF' finish-if $epoch" >> "$BG/finish.log" 2>&1 < /dev/null 9>&- &
  echo "   old slot stays warm for rollback for $KEEP_MINUTES min, then is stopped (container kept)"
}

schema_gate() {  # image
  local applied pending f bad=0
  applied=$($D exec pats-prod-postgres psql -U pats -d pats_univ -Atc \
    "select migration_name from _prisma_migrations where finished_at is not null" 2>/dev/null || true)
  pending=$($D run --rm --entrypoint sh "$1" -c 'ls /app/apps/web/prisma/migrations' | grep -v '\.toml$' | while read -r m; do grep -qx "$m" <<<"$applied" || echo "$m"; done)
  if [ -z "$pending" ]; then echo "   no pending migrations"; return 0; fi
  echo "   pending migrations:"; sed 's/^/     /' <<<"$pending"
  for f in $pending; do
    if $D run --rm --entrypoint sh "$1" -c "cat /app/apps/web/prisma/migrations/$f/migration.sql" \
       | grep -Eiq 'DROP[[:space:]]+(TABLE|COLUMN)|RENAME[[:space:]]|ALTER[[:space:]]+COLUMN[^;]*[[:space:]]TYPE[[:space:]]|SET[[:space:]]+NOT[[:space:]]+NULL|DROP[[:space:]]+TYPE'; then
      red "   $f is a CONTRACT migration (drop/rename/type/not-null): the live slot may break when it runs"; bad=1
    fi
  done
  mkdir -p "$HOME/backups-prod"
  local dump="$HOME/backups-prod/pre-deploy-$(date +%Y%m%d-%H%M%S).dump"
  $D exec pats-prod-postgres pg_dump -U pats -d pats_univ -Fc > "$dump" && $D exec -i pats-prod-postgres pg_restore -l < "$dump" >/dev/null \
    || die "pre-deploy dump failed"
  echo "   pre-deploy dump: $dump"
  if [ $bad = 1 ] && ! running "$(live 2>/dev/null || echo none)"; then
    echo "   no slot is serving yet: contract steps are safe"; bad=0
  fi
  if [ $bad = 1 ] && [ "${ALLOW_CONTRACT:-0}" != 1 ]; then
    die "contract migration: ship the expand step first (old code must keep working), or ALLOW_CONTRACT=1 after reading PROD-RUNBOOK.md"
  fi
}

status() {
  local L; L=$(live)
  echo "live: ${L:-none}   public: $PUBLIC"
  for s in blue green; do
    st=$($D inspect -f '{{.State.Status}}' "$(c $s)" 2>/dev/null | head -1)
    printf '  %-5s %-8s commit=%-9s %s\n' "$s" "${st:-absent}" "$(commit_of $s)" "$([ "$s" = "$L" ] && echo '<- live')"
  done
  printf '  realtime %s   postgres %s\n' "$($D inspect -f '{{.Config.Image}} {{.State.Status}}' pats-prod-realtime 2>/dev/null)" "$($D inspect -f '{{.State.Health.Status}}' pats-prod-postgres 2>/dev/null)"
  echo "last switches:"; tail -5 "$BG/history.log" 2>/dev/null | sed 's/^/  /'
}

case "$CMD" in
  status) status; exit 0 ;;
  finish-if)  # scheduled: stop the old slot unless another switch happened since
    exec 9>"$LOCK"; flock -w 120 9 || exit 0
    [ "$(cat "$BG/epoch" 2>/dev/null)" = "${2:-}" ] || exit 0
    o=$(other "$(live)"); running "$o" && $D stop -t 20 "$(c "$o")" >/dev/null && log "finish: stopped $o (kept for rollback)"; exit 0 ;;
  finish)
    exec 9>"$LOCK"; flock -n 9 || die "a deploy is running"
    o=$(other "$(live)"); running "$o" && $D stop -t 20 "$(c "$o")" >/dev/null && log "finish: stopped $o"; status; exit 0 ;;
  rollback)
    exec 9>"$LOCK"; flock -w 30 9 || die "a deploy is running ($LOCK)"
    L=$(live); [ -n "$L" ] || die "no live slot recorded"; P=$(other "$L")
    $D inspect "$(c "$P")" >/dev/null 2>&1 || die "previous slot $P does not exist"
    say "rollback $L -> $P ($(commit_of "$P"))"
    if ! running "$P"; then echo "   $P is stopped: starting it (not instant)"; $D start "$(c "$P")" >/dev/null; fi
    write_inc "$L" "$P"; reload_proxy >/dev/null 2>&1   # make sure :3202 points at $P
    wait_health http://127.0.0.1:3202 120 || die "$P is not healthy; stayed on $L"
    t0=$(date +%s%N); switch_to "$P"; t1=$(date +%s%N)
    hdr=$(serving http://127.0.0.1:3201)
    [ "$hdr" = "$(c "$P")" ] || red "   WARNING: live listener answers from '$hdr'"
    log "rollback $L -> $P ($(commit_of "$P")) switch $(( (t1 - t0) / 1000000 )) ms"
    green "   live = $P ($(commit_of "$P")), switch $(( (t1 - t0) / 1000000 )) ms"
    schedule_finish; exit 0 ;;
  deploy|env) ;;
  *) sed -n '5,10p' "$SELF"; exit 2 ;;
esac

exec 9>"$LOCK"; flock -n 9 || die "another deploy is running ($LOCK)"
mkdir -p "$BG/nginx"
L=$(live); [ -n "$L" ] || L=green   # first deploy goes to blue
N=$(other "$L")

if [ "$CMD" = deploy ]; then
  REF="${2:-origin/master}"
  say "source $REF"
  git -C "$SRC" fetch -q origin || die "git fetch failed"
  SHA=$(git -C "$SRC" rev-parse --short=7 "$REF^{commit}") || die "unknown ref $REF"
  if [ "${ALLOW_NON_MASTER:-0}" != 1 ] && ! git -C "$SRC" merge-base --is-ancestor "$SHA" origin/master; then
    die "$SHA is not on origin/master (release = fast-forward master first)"
  fi
  git -C "$SRC" -c advice.detachedHead=false checkout -q --detach "$SHA" || die "checkout failed"
  echo "   $(git -C "$SRC" log --oneline -1)"
  IMG="pats-web:$SHA"
  if ! $D image inspect "$IMG" >/dev/null 2>&1; then
    say "build $IMG"
    (cd "$SRC" && $D build -q -f apps/web/Dockerfile --label pats.commit="$SHA" -t "$IMG" . >/dev/null) || die "web build failed"
  fi
  if ! $D image inspect "pats-realtime:$SHA" >/dev/null 2>&1; then
    (cd "$SRC" && $D build -q -f apps/realtime/Dockerfile --label pats.commit="$SHA" -t "pats-realtime:$SHA" . >/dev/null) || die "realtime build failed"
  fi
  if [ "${SKIP_TESTS:-0}" != 1 ]; then
    say "unit tests"
    (cd "$SRC" && $D build -q -f apps/web/Dockerfile --target build -t "pats-web-build:$SHA" . >/dev/null) || die "test image build failed"
    $D run --rm -v "$SRC/tsconfig.base.json:/repo/tsconfig.base.json:ro" "pats-web-build:$SHA" \
      sh -c 'cd /repo && pnpm -s --filter @pats/shared test >/dev/null 2>&1 && pnpm -s --filter @pats/web test >/dev/null 2>&1' \
      || die "unit tests failed (run them by hand: see PROD-RUNBOOK.md)"
    echo "   web + shared unit tests passed"
  fi
else  # env: same image as the live slot
  running "$L" || die "no running live slot to copy the image from"
  IMG=$($D inspect -f '{{.Config.Image}}' "$(c "$L")"); SHA=$(commit_of "$L")
  say "env redeploy of $IMG"
fi

# Proxy config follows the release (tracked in infra/prod/nginx/pats.conf); reverted if nginx rejects it.
if [ "$CMD" = deploy ] && ! cmp -s "$SRC/infra/prod/nginx/pats.conf" "$HOME_DIR/nginx/pats.conf"; then
  say "proxy config update"
  cp "$HOME_DIR/nginx/pats.conf" "$HOME_DIR/nginx/pats.conf.prev" 2>/dev/null
  cat "$SRC/infra/prod/nginx/pats.conf" > "$HOME_DIR/nginx/pats.conf"   # same inode: the bind mount sees it
  reload_proxy || { cat "$HOME_DIR/nginx/pats.conf.prev" > "$HOME_DIR/nginx/pats.conf"; reload_proxy; die "new proxy config rejected (old one restored)"; }
fi

say "schema gate"
schema_gate "$IMG"

say "slot $N <- $IMG"
build_slot_env
start_slot "$N" "$IMG" "$SHA" || die "could not start $(c "$N")"
write_inc "$L" "$N"; reload_proxy >/dev/null 2>&1 || die "proxy reload failed"
wait_health http://127.0.0.1:3202 180 || { $D logs --tail 30 "$(c "$N")"; die "$N never became healthy (live stays $L)"; }
# Fail closed: production never runs demo OTP (the app refuses it too when PATS_ENV=production).
[ "$($D exec "$(c "$N")" printenv OTP_PROVIDER)" = email ] && [ "$($D exec "$(c "$N")" printenv PATS_ENV)" = production ] \
  || die "$N is not in production OTP mode"

say "smoke $N (preview :3202)"
smoke http://127.0.0.1:3202 || die "smoke failed on $N (live stays $L; $N left running for inspection)"
if [ -n "$(live)" ] && running "$L"; then
  say "old slot $L against the migrated schema"
  smoke http://127.0.0.1:3201 || die "the live slot $L fails after the migration: do NOT switch; see PROD-RUNBOOK.md"
fi

# Realtime follows the release (a brief Socket.IO reconnect; clients retry on their own).
if [ "$CMD" = deploy ] && [ "$($D inspect -f '{{.Config.Image}}' pats-prod-realtime 2>/dev/null)" != "pats-realtime:$SHA" ]; then
  say "realtime -> pats-realtime:$SHA"
  compose "$SHA" up -d --no-deps realtime >/dev/null 2>&1 || red "   realtime update failed (still on the old image)"
fi

say "switch $L -> $N"
t0=$(date +%s%N); switch_to "$N"; t1=$(date +%s%N)
hdr=$(serving http://127.0.0.1:3201)
[ "$hdr" = "$(c "$N")" ] || red "   WARNING: live listener answers from '$hdr'"
log "$CMD $SHA: $L -> $N, switch $(( (t1 - t0) / 1000000 )) ms"
green "   live = $N ($SHA), switch $(( (t1 - t0) / 1000000 )) ms"

pub=$(code "$PUBLIC/api/health")
[ "$pub" = 200 ] && green "   public $PUBLIC/api/health 200" || red "   public check returned $pub (tunnel?)"
running "$L" && schedule_finish
# Keep the images of both slots and the two most recent others; drop older pats-web/pats-realtime tags.
keep="$(commit_of blue) $(commit_of green)"
for repo in pats-web pats-web-build pats-realtime; do
  $D images --format '{{.Tag}}' "$repo" | grep -v '^<none>$' | tail -n +4 | while read -r t; do
    grep -qw "$t" <<<"$keep" || $D rmi "$repo:$t" >/dev/null 2>&1 || true
  done
done
exit 0
