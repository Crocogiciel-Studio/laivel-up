#!/usr/bin/env bash
# Run the studio migrations + RLS smoke test against a throwaway plain Postgres
# with the Supabase shim -- a quick check without pulling the full Supabase
# stack (`pnpm db:test` covers the real stack). The apply-and-test sequence
# itself lives in scripts/db-smoke.sh, shared with the CI `db` job.
#
#   scripts/rls-test-bare.sh
#
# Needs Docker. Leaves no container behind.
set -euo pipefail
cd "$(dirname "$0")/.."

image=postgres:15-alpine
name="laivel-rls-$$"

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$name" -e POSTGRES_PASSWORD=postgres "$image" >/dev/null

# pg_isready also passes against the image's temporary bootstrap server, so poll
# with a real query against the final one instead.
for _ in $(seq 1 60); do
  docker exec "$name" psql -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 1
done

export PSQL="docker exec -i $name psql -U postgres -v ON_ERROR_STOP=1 -q"
scripts/db-smoke.sh
