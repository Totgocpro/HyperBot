#!/usr/bin/env sh
set -eu
set -o pipefail 2>/dev/null || true

ProjectRoot="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
BackupDirectory="${ProjectRoot}/Backups/PostgreSQL"
Timestamp="$(date +%Y%m%d-%H%M%S)"

cd "${ProjectRoot}"

if [ ! -f "docker-compose.yml" ]; then
  echo "docker-compose.yml not found in ${ProjectRoot}." >&2
  echo "Run this script from the HyperBot project, or execute it with its full path." >&2
  exit 1
fi

if [ -f ".env" ]; then
  set -a
  . ./.env
  set +a
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://hyperbot:hyperbot@localhost:5432/hyperbot?schema=public}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export PLUGIN_DIRECTORY="${PLUGIN_DIRECTORY:-dist/Plugins}"
export NODE_OPTIONS="${NODE_OPTIONS:-} --no-deprecation"
export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"
export FOLLOW_LOGS="${FOLLOW_LOGS:-true}"

RequireCommand() {
  CommandName="$1"

  if ! command -v "${CommandName}" >/dev/null 2>&1; then
    echo "Missing required command: ${CommandName}" >&2
    exit 1
  fi
}

WaitForPostgreSQL() {
  echo "Waiting for PostgreSQL..."

  until docker compose exec -T postgresql pg_isready -U hyperbot -d postgres >/dev/null 2>&1; do
    sleep 1
  done
}

EnsureDatabaseExists() {
  echo "Ensuring PostgreSQL database exists..."

  docker compose exec -T postgresql psql -U hyperbot -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'CREATE DATABASE hyperbot OWNER hyperbot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hyperbot')
\gexec
SQL
}

BackupDatabase() {
  mkdir -p "${BackupDirectory}"

  if ! docker compose exec -T postgresql psql -U hyperbot -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'hyperbot';" | grep -q "1"; then
    echo "No existing hyperbot database found. Skipping backup."
    return
  fi

  BackupPath="${BackupDirectory}/hyperbot-${Timestamp}.dump"
  LatestPath="${BackupDirectory}/hyperbot-latest.dump"

  echo "Saving PostgreSQL backup to ${BackupPath}..."
  docker compose exec -T postgresql pg_dump -U hyperbot -d hyperbot -Fc > "${BackupPath}"
  cp "${BackupPath}" "${LatestPath}"
}

InstallDependencies() {
  echo "Installing npm dependencies, including build dependencies..."
  npm install --include=dev
}

BuildApplication() {
  echo "Building production assets..."
  export NODE_ENV="production"
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
  docker compose build application

  echo "Starting release containers..."
  docker compose up -d --remove-orphans postgresql redis application
}

PrintStatus() {
  echo
  echo "Release started."
  echo "Dashboard: ${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
  echo "Database backups: ${BackupDirectory}"
  echo
  docker compose ps
}

FollowApplicationLogs() {
  if [ "${FOLLOW_LOGS}" != "true" ]; then
    return
  fi

  echo
  echo "Following application logs. Stop this process to stop the MCSManager instance console."
  docker compose logs -f application
}

RequireCommand docker
RequireCommand npm
RequireCommand npx

echo "Starting HyperBot release deployment..."
docker compose up -d --remove-orphans postgresql redis
WaitForPostgreSQL
BackupDatabase
EnsureDatabaseExists
InstallDependencies
BuildApplication
SyncDatabaseSchema
StartReleaseContainers
PrintStatus
FollowApplicationLogs
