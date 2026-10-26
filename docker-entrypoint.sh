#!/bin/sh
# Commands of the backend container:
#   start          run the API (default)
#   db-push        apply prisma/schema.prisma to the database; refuses changes that lose data
#   seed-master    roles, academic years, accounts, plus sample theses (not for production)
#   seed           seed-master plus all demo and test data
#   reset --yes    DROP every table, apply the schema, then run "seed"
#   anything else  run as is, e.g. "node scripts/seed-cpl.js"
set -e

PRISMA=./node_modules/.bin/prisma
SEEDERS="seed-master seed-thesis-topics seed-thesis-rubrics seed-milestone-templates seed-guidance-milestone seed-thesis-research-flow seed-thesis-monitoring seed-thesis-proposal-flow seed-thesis-final-stages"

run_seeders() {
  for seeder in $SEEDERS; do
    echo "==> $seeder"
    node "scripts/$seeder.js"
  done
}

command="${1:-start}"
[ "$#" -gt 0 ] && shift

case "$command" in
  start)
    exec node src/server.js
    ;;
  db-push)
    exec "$PRISMA" db push --skip-generate "$@"
    ;;
  seed-master)
    exec node scripts/seed-master.js
    ;;
  seed)
    run_seeders
    ;;
  reset)
    if [ "$1" != "--yes" ]; then
      echo "reset drops every table. Run again as: reset --yes" >&2
      exit 1
    fi
    "$PRISMA" db push --force-reset --skip-generate
    run_seeders
    ;;
  *)
    exec "$command" "$@"
    ;;
esac
