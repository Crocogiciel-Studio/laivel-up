#!/usr/bin/env bash
# Run the studio migrations + RLS smoke test against a throwaway plain Postgres,
# using the Supabase shim. Mirrors the CI `db` job. Use this for a quick check
# without pulling the full Supabase stack (`pnpm db:test` covers the real stack).
#
#   scripts/rls-test-bare.sh
#
# Needs Docker. Leaves no container behind.
set -euo pipefail

cd "$(dirname "$0")/.."

image=postgres:15-alpine
name="laivel-rls-$$"
port=55432
url="postgresql://postgres:postgres@127.0.0.1:${port}/postgres"

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$name" -e POSTGRES_PASSWORD=postgres -p "${port}:5432" "$image" >/dev/null

for _ in $(seq 1 30); do
  docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

psql() { docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql -f - < supabase/tests/auth_shim.sql
for f in supabase/migrations/*.sql; do
  echo "-- $f"
  psql -f - < "$f"
done
psql -f - < supabase/tests/rls_smoke.sql
