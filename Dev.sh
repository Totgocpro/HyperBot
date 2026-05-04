#!/usr/bin/env bash
set -euo pipefail

if [ -f ".env" ]; then
  set -a
  source .env
  set +a
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://hyperbot:hyperbot@localhost:5432/hyperbot?schema=public}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export PLUGIN_DIRECTORY="${PLUGIN_DIRECTORY:-Plugins}"
export NODE_OPTIONS="${NODE_OPTIONS:-} --no-deprecation"

docker compose up -d PostgreSQL Redis

echo "Waiting for PostgreSQL..."
until docker compose exec -T PostgreSQL pg_isready -U hyperbot -d postgres >/dev/null 2>&1; do
  sleep 1
done

if [ "${RESET_DATABASE:-false}" = "true" ]; then
  echo "Recreating development database..."
  docker compose exec -T PostgreSQL psql -U hyperbot -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'hyperbot' AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS hyperbot;
CREATE DATABASE hyperbot OWNER hyperbot;
SQL
else
  echo "Keeping existing development database. Use RESET_DATABASE=true ./Dev.sh to recreate it."
  docker compose exec -T PostgreSQL psql -U hyperbot -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'CREATE DATABASE hyperbot OWNER hyperbot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hyperbot')
\gexec
SQL
fi

echo "Clearing Redis..."
docker compose exec -T Redis redis-cli FLUSHDB >/dev/null

if [ ! -d "node_modules" ]; then
  npm install
fi

npx prisma generate
npx prisma db push
npm run dev
