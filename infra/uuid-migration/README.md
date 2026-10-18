# UUIDv7 conversion (copied from the NEXUS repo, scripts/uuid-migration, 18 Oct 2026)

Converts every existing cuid id to UUIDv7 in one transaction: primary keys, foreign keys, and ids embedded
in text/json/array columns. Composite ids containing ":" (Setting, LeaderboardSnapshot, `claim:` notifications)
are kept, with their inner ids rewritten. PATS has no real users, so no old-id resolution is needed.

    docker exec -i pats-univ-postgres-1 sh -c mkdir -p /uuid
    for f in *.sql; do docker cp "$f" pats-univ-postgres-1:/uuid/; done
    docker exec pats-univ-postgres-1 psql -U pats -d pats_univ -v ON_ERROR_STOP=1 -f /uuid/uuid-lib.sql
    docker exec pats-univ-postgres-1 psql -U pats -d pats_univ -v ON_ERROR_STOP=1 -v no_db_default=1 -f /uuid/convert.sql   # must end COMMITTED
    docker exec pats-univ-postgres-1 psql -U pats -d pats_univ -f /uuid/verify.sql                                           # must end VERIFY OK
    # storage volume (receipts/<memberId>/...): rename-files.py plan MAP.tsv <volume path> > plan.tsv; rename-files.py apply plan.tsv
    # then (Prisma migrate must not see unknown tables; keep a copy of the map first):
    #   psql -c "\copy legacy_id_map to /tmp/legacy_id_map.csv csv" ; DROP TABLE legacy_id_map; DROP SCHEMA uuid_mig CASCADE;

Take a pg_dump first and stop web + realtime while it runs (well under a second on the demo data).
