#!/usr/bin/env bash
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
# Recreates a scratch database, applies stubs + migrations + seed, then runs the end-to-end checks.
set -euo pipefail
cd "$(dirname "$0")/../.."
P="psql -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists lms_test" -c "create database lms_test"
for f in supabase/tests/00_supabase_stubs.sql supabase/migrations/*.sql supabase/seed.sql supabase/tests/01_end_to_end.sql; do
  $P -d lms_test -f "$f" > /dev/null
done
echo "ALL CHECKS PASSED"
