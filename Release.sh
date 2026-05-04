#!/usr/bin/env bash
set -euo pipefail

ProjectRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BackupDirectory="${ProjectRoot}/Backups/PostgreSQL"
Timestamp="$(date +%Y%m%d-%H%M%S)"

cd "${ProjectRoot}"

if [ -f ".env" ]; then
  set -a
  source .env
  set +a
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://hyperbot:hyperbot@localhost:5432/hyperbot?schema=public}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export PLUGIN_DIRECTORY="${PLUGIN_DIRECTORY:-dist/Plugins}"
export NODE_ENV="production"
export NODE_OPTIONS="${NODE_OPTIONS:-} --no-deprecation"

RequireCommand() {
  local CommandName="$1"

  if ! command -v "${CommandName}" >/dev/null 2>&1; then
    echo "Missing required command: ${CommandName}" >&2
    exit 1
  fi
}

WaitForPostgreSQL() {
  echo "Waiting for PostgreSQL..."

  until docker compose exec -T PostgreSQL pg_isready -U hyperbot -d postgres >/dev/null 2>&1; do
    sleep 1
  done
}

EnsureDatabaseExists() {
  echo "Ensuring PostgreSQL database exists..."

  docker compose exec -T PostgreSQL psql -U hyperbot -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'CREATE DATABASE hyperbot OWNER hyperbot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hyperbot')
\gexec
SQL
}

BackupDatabase() {
  mkdir -p "${BackupDirectory}"

  if ! docker compose exec -T PostgreSQL psql -U hyperbot -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'hyperbot';" | grep -q "1"; then
    echo "No existing hyperbot database found. Skipping backup."
    return
  fi

  local BackupPath="${BackupDirectory}/hyperbot-${Timestamp}.dump"
  local LatestPath="${BackupDirectory}/hyperbot-latest.dump"

  echo "Saving PostgreSQL backup to ${BackupPath}..."
  docker compose exec -T PostgreSQL pg_dump -U hyperbot -d hyperbot -Fc > "${BackupPath}"
  cp "${BackupPath}" "${LatestPath}"
}

InstallDependencies() {
  if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
    return
  fi

  echo "npm dependencies already installed."
}

BuildApplication() {
  echo "Building production assets..."
  npx prisma generate
  npm run build
  mkdir -p dist/Plugins
  cp -R Plugins/* dist/Plugins/
}

SyncDatabaseSchema() {
  echo "Synchronizing Prisma schema..."
  npx prisma db push
}

StartReleaseContainers() {
  echo "Building Docker application image..."
  docker compose build Application

  echo "Starting release containers..."
  docker compose up -d PostgreSQL Redis Application
}

PrintStatus() {
  echo
  echo "Release started."
  echo "Dashboard: ${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
  echo "Database backups: ${BackupDirectory}"
  echo
  docker compose ps
}

RequireCommand docker
RequireCommand npm
RequireCommand npx

echo "Starting HyperBot release deployment..."
docker compose up -d PostgreSQL Redis
WaitForPostgreSQL
BackupDatabase
EnsureDatabaseExists
InstallDependencies
BuildApplication
SyncDatabaseSchema
StartReleaseContainers
PrintStatus
