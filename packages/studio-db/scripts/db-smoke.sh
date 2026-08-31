#!/usr/bin/env bash
# Apply the Supabase auth shim, then every studio migration in order, then the
# RLS smoke test. This is the one place that sequence is written down; both the
# CI `db` job and scripts/rls-test-bare.sh drive it.
#
# $PSQL must be a psql invocation that reads SQL on stdin, for example:
#   PSQL='psql "$PGURL" -v ON_ERROR_STOP=1'
#   PSQL='docker exec -i my-pg psql -U postgres -v ON_ERROR_STOP=1 -q'
set -euo pipefail
cd "$(dirname "$0")/.."

: "${PSQL:?set PSQL to a psql command that reads SQL on stdin}"

run() { eval "$PSQL"; }

run < supabase/tests/auth_shim.sql
for migration in supabase/migrations/*.sql; do
  echo "-- $migration"
  run < "$migration"
done
run < supabase/tests/rls_smoke.sql
