#!/usr/bin/env bash
set -euo pipefail

sh ./scripts/EnsureEnv.sh .env

if [ -f ".env" ]; then
  set -a
  source .env
  set +a
fi

export PLUGIN_DIRECTORY="${PLUGIN_DIRECTORY:-Plugins}"
export NODE_OPTIONS="${NODE_OPTIONS:-} --no-deprecation"

docker compose up -d --remove-orphans postgresql redis

POSTGRES_HOST_PORT="$(docker compose port postgresql 5432 | sed 's/.*://')"
REDIS_HOST_PORT="$(docker compose port redis 6379 | sed 's/.*://')"

export DATABASE_URL="postgresql://hyperbot:${POSTGRES_PASSWORD_URL_ENCODED}@127.0.0.1:${POSTGRES_HOST_PORT}/hyperbot?schema=public"
export REDIS_URL="redis://:${REDIS_PASSWORD_URL_ENCODED}@127.0.0.1:${REDIS_HOST_PORT}"

echo "PostgreSQL local port: ${POSTGRES_HOST_PORT}"
echo "Redis local port: ${REDIS_HOST_PORT}"

echo "Waiting for PostgreSQL..."
until docker compose exec -T postgresql pg_isready -U hyperbot -d postgres >/dev/null 2>&1; do
  sleep 1
done

echo "Synchronizing PostgreSQL password with .env..."
docker compose exec -T postgresql psql -U hyperbot -d postgres -v ON_ERROR_STOP=1 -v password="${POSTGRES_PASSWORD}" <<'SQL'
ALTER USER hyperbot WITH PASSWORD :'password';
SQL

if [ "${RESET_DATABASE:-false}" = "true" ]; then
  echo "Recreating development database..."
  docker compose exec -T postgresql psql -U hyperbot -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'hyperbot' AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS hyperbot;
CREATE DATABASE hyperbot OWNER hyperbot;
SQL
else
  echo "Keeping existing development database. Use RESET_DATABASE=true ./Dev.sh to recreate it."
  docker compose exec -T postgresql psql -U hyperbot -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'CREATE DATABASE hyperbot OWNER hyperbot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hyperbot')
\gexec
SQL
fi

echo "Clearing Redis..."
docker compose exec -T redis redis-cli -a "${REDIS_PASSWORD}" FLUSHDB >/dev/null

if [ ! -d "node_modules" ]; then
  npm install
fi

npx prisma generate
npx prisma db push
npm run dev
