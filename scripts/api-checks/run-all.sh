#!/usr/bin/env bash
# Run the API checks, each on a freshly rebuilt and seeded local database (see README.md).
#
#   scripts/api-checks/run-all.sh                # every check, in order (p1 … p7, e2e, e3, e3r, e4, e5)
#   scripts/api-checks/run-all.sh p2 p7          # only these
#   scripts/api-checks/run-all.sh --no-reseed p6 # on the current data (most checks need a clean seed)
#
# Run from app/backend with the backend listening on $BASE (default http://localhost:3000).
# The rebuild ERASES the database at DATABASE_URL; it refuses anything that is not localhost.
set -uo pipefail

cd "$(dirname "$0")/../.." || exit 1
LOG_DIR="${API_CHECKS_LOG_DIR:-${TMPDIR:-/tmp}/neocentral-api-checks}"
mkdir -p "$LOG_DIR"

RESEED=1
if [ "${1:-}" = "--no-reseed" ]; then RESEED=0; shift; fi
NAMES=("$@")
[ ${#NAMES[@]} -eq 0 ] && NAMES=(p1 p2 p3 p4 p5 p6 p7 e2e e3 e3r e4 e5)

BASE_SEEDERS="seed-master seed-thesis-topics seed-milestone-templates seed-guidance-milestone seed-thesis-research-flow seed-thesis-monitoring"
FULL_SEEDERS="$BASE_SEEDERS seed-thesis-proposal-flow"

# Paket E3 (monitoring) was written against the six seeders before the proposal seeder existed.
seeders_for() { case "$1" in e3|e3r) echo "$BASE_SEEDERS" ;; *) echo "$FULL_SEEDERS" ;; esac; }
file_for() {
  case "$1" in
    e2e) echo "scripts/api-checks/e2e.mjs" ;;
    e3) echo "scripts/api-checks/e3-api.mjs" ;;
    e3r) echo "scripts/api-checks/e3-ready-api.mjs" ;;
    *) echo "scripts/api-checks/$1-api.mjs" ;;
  esac
}

reseed() {
  local target
  target=$(node -e 'require("dotenv").config({ quiet: true }); const u = new URL(process.env.DATABASE_URL); console.log(`${u.hostname}${u.pathname}`)') || return 1
  case "$target" in
    localhost/*|127.0.0.1/*) ;;
    *) echo "Menolak membangun ulang database di luar localhost: $target" >&2; return 1 ;;
  esac
  npx prisma db push --force-reset --skip-generate >"$LOG_DIR/seed-push.log" 2>&1 || { echo "db push gagal (lihat $LOG_DIR/seed-push.log)"; return 1; }
  for seeder in $1; do
    node "scripts/$seeder.js" >"$LOG_DIR/seed-$seeder.log" 2>&1 || { echo "$seeder gagal (lihat $LOG_DIR/seed-$seeder.log)"; return 1; }
  done
}

STATUS=0
for name in "${NAMES[@]}"; do
  file=$(file_for "$name")
  [ -f "$file" ] || { echo "$name: berkas $file tidak ada"; STATUS=1; continue; }
  if [ $RESEED -eq 1 ]; then
    reseed "$(seeders_for "$name")" || { echo "$name: seed gagal, dilewati"; STATUS=1; continue; }
  fi
  node "$file" >"$LOG_DIR/$name.log" 2>&1
  code=$?
  echo "$name (exit $code): $(grep -E 'pemeriksaan, [0-9]+ lulus' "$LOG_DIR/$name.log" | tail -1)"
  grep -E '^ *GAGAL|^FAIL' "$LOG_DIR/$name.log" | head -10
  [ $code -ne 0 ] && STATUS=1
done
echo "Log: $LOG_DIR"
exit $STATUS
