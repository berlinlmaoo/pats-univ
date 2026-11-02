#!/bin/bash
# Ephemeral e2e stack for a release candidate: runs the five interaction matrices against the
# candidate images (pats-web:<sha>, pats-realtime:<sha>, pats-web-build:<sha>) on throwaway
# databases, demo OTP, push=log. Never touches dev or prod. Usage: ci.sh <sha>
set -u
SHA=${1:?usage: ci.sh <sha>  (images pats-web, pats-web-build, pats-realtime :<sha> must exist; MATRICES="m:db ..." to pick, KEEP=1 keeps the stack)}; N=pats-ci; D="sudo docker"; SRC=${SRC:-$HOME/pats-prod/src}
cleanup() { $D rm -f $N-web $N-pg $N-rt >/dev/null 2>&1; $D network rm $N >/dev/null 2>&1; $D volume rm $N-storage >/dev/null 2>&1; }
cleanup; $D network create $N >/dev/null
PW=$(openssl rand -hex 16); AS=$(openssl rand -hex 32); CK=$(openssl rand -hex 32); CS=$(openssl rand -hex 16); RS=$(openssl rand -hex 32)
$D run -d --name $N-pg --network $N -e POSTGRES_DB=postgres -e POSTGRES_USER=pats -e POSTGRES_PASSWORD=$PW postgres:16-alpine >/dev/null
until $D exec $N-pg pg_isready -U pats >/dev/null 2>&1; do sleep 1; done; sleep 2
$D run -d --name $N-rt --network $N -e API_URL=http://$N-web:3000 -e AUTH_SECRET=$AS -e REALTIME_SECRET=$RS -e CORS_ORIGINS=http://$N-web:3000 pats-realtime:$SHA >/dev/null
web() {  # dbname
  $D rm -f $N-web >/dev/null 2>&1
  $D exec $N-pg createdb -U pats "$1" 2>/dev/null
  $D run -d --name $N-web --network $N -e DATABASE_URL=postgresql://pats:$PW@$N-pg:5432/$1 -e APP_URL=http://$N-web:3000 -e AUTH_SECRET=$AS \
    -e OTP_PROVIDER=demo -e PUSH_PROVIDER=log -e CARD_KEY_SECRET=$CK -e CRON_SECRET=$CS -e CHROMIUM_PATH=/usr/bin/chromium -e STORAGE_DIR=/data/storage \
    -e REALTIME_INTERNAL_URL=http://$N-rt:4000 -e REALTIME_PUBLIC_URL=http://$N-rt:4000 -e REALTIME_SECRET=$RS -v $N-storage:/data/storage pats-web:$SHA >/dev/null
  for i in $(seq 90); do $D exec $N-web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && return 0; sleep 2; done
  echo "web did not become healthy on $1"; $D logs --tail 20 $N-web; return 1
}
run() {  # dbname cmd...
  local db=$1; shift
  $D run --rm --network $N -v $SRC/tsconfig.base.json:/repo/tsconfig.base.json:ro -v $N-storage:/data/storage -e STORAGE_DIR=/data/storage \
    -e DATABASE_URL=postgresql://pats:$PW@$N-pg:5432/$db -e BASE_URL=http://$N-web:3000 -e CARD_KEY_SECRET=$CK -e CRON_SECRET=$CS \
    -e AUTH_SECRET=$AS -e REALTIME_SECRET=$RS -e REALTIME_PUBLIC_URL=http://$N-rt:4000 -e SEED_MODE=demo -e E2E_PATCH -e CHROMIUM_PATH=/usr/bin/chromium -w /repo/apps/web pats-web-build:$SHA "$@"
}
rc=0; cur=
for pair in ${MATRICES:-cards:pats_univ checkin:pats_univ loyalty:pats_p4_p3 social:pats_p4_p3 phase5:pats_p5_tests}; do
  m=${pair%%:*}; db=${pair#*:}
  if [ "$db" != "$cur" ]; then
    web "$db" || { rc=1; break; }
    run "$db" sh -c "npx prisma db seed >/dev/null && npx tsx prisma/seed-phase3.ts >/dev/null && npx tsx prisma/seed-phase4.ts >/dev/null" 2>/dev/null || { echo "seed failed on $db"; rc=1; break; }
    cur=$db
  else sleep 65; fi  # OTP resend cooldown per account between matrices on the same database
  out=$(run "$db" sh -c "${E2E_PATCH:-true} && pnpm -s e2e:$m" 2>&1); r=$?; echo "$out" > /tmp/pats-ci-$m.log
  echo "== $m ($db) rc=$r pass=$(grep -c '^PASS' <<<"$out") fail=$(grep -c '^FAIL' <<<"$out")"; grep '^FAIL' <<<"$out" | sort -u | head -8
  [ $r = 0 ] || { rc=1; grep -q '^PASS\|^FAIL' <<<"$out" || tail -6 <<<"$out"; }
done
[ "${KEEP:-0}" = 1 ] || cleanup; exit $rc
