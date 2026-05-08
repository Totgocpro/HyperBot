#!/usr/bin/env sh
set -eu
set -o pipefail 2>/dev/null || true

ProjectRoot="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
BackupDirectory="${ProjectRoot}/Backups/PostgreSQL"
Timestamp="$(date +%Y%m%d-%H%M%S)"
StopCommandWatcherPid=""
LogsPid=""

cd "${ProjectRoot}"

if [ ! -f "docker-compose.yml" ]; then
  echo "docker-compose.yml not found in ${ProjectRoot}." >&2
  echo "Run this script from the HyperBot project, or execute it with its full path." >&2
  exit 1
fi

sh ./scripts/EnsureEnv.sh .env

if [ -f ".env" ]; then
  set -a
  . ./.env
  set +a
fi

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

StopRelease() {
  trap - INT TERM HUP

  if [ -n "${StopCommandWatcherPid}" ]; then
    kill "${StopCommandWatcherPid}" >/dev/null 2>&1 || true
  fi

  if [ -n "${LogsPid}" ]; then
    kill "${LogsPid}" >/dev/null 2>&1 || true
  fi

  echo
  echo "Stopping HyperBot containers..."
  docker compose stop application redis postgresql
  echo "HyperBot containers stopped."
  exit 0
}

WatchStopCommand() {
  MainPid="$1"

  while IFS= read -r Command; do
    case "${Command}" in
      STOP|stop|Stop)
        echo "STOP command received."
        kill -TERM "${MainPid}" >/dev/null 2>&1 || true
        return
        ;;
    esac
  done
}

StartStopCommandWatcher() {
  WatchStopCommand "$$" &
  StopCommandWatcherPid="$!"
}

WaitForPostgreSQL() {
  echo "Waiting for PostgreSQL..."

  until docker compose exec -T postgresql pg_isready -U hyperbot -d postgres >/dev/null 2>&1; do
    sleep 1
  done
}

SyncPostgreSQLPassword() {
  echo "Synchronizing PostgreSQL password with .env..."

  docker compose exec -T postgresql psql -U hyperbot -d postgres -v ON_ERROR_STOP=1 -v password="${POSTGRES_PASSWORD}" <<'SQL'
ALTER USER hyperbot WITH PASSWORD :'password';
SQL
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
  ApplicationPort="$(docker compose port application 3000 | sed 's/.*://')"

  echo
  echo "Release started."
  echo "Dashboard: http://127.0.0.1:${ApplicationPort:-3000}"
  echo "Database backups: ${BackupDirectory}"
  echo
  docker compose ps
}

FollowApplicationLogs() {
  if [ "${FOLLOW_LOGS}" != "true" ]; then
    return
  fi

  echo
  echo "Following application logs. Send STOP, SIGTERM, or Ctrl+C to stop the containers."
  docker compose logs -f application &
  LogsPid="$!"
  wait "${LogsPid}"
  LogsPid=""
}

RequireCommand docker
RequireCommand npm
RequireCommand npx

trap StopRelease INT TERM HUP

echo "Starting HyperBot release deployment..."
docker compose up -d --remove-orphans postgresql redis
PostgresHostPort="$(docker compose port postgresql 5432 | sed 's/.*://')"
RedisHostPort="$(docker compose port redis 6379 | sed 's/.*://')"
export DATABASE_URL="postgresql://hyperbot:${POSTGRES_PASSWORD_URL_ENCODED}@127.0.0.1:${PostgresHostPort}/hyperbot?schema=public"
export REDIS_URL="redis://:${REDIS_PASSWORD_URL_ENCODED}@127.0.0.1:${RedisHostPort}"
echo "PostgreSQL local port: ${PostgresHostPort}"
echo "Redis local port: ${RedisHostPort}"
WaitForPostgreSQL
SyncPostgreSQLPassword
BackupDatabase
EnsureDatabaseExists
InstallDependencies
BuildApplication
SyncDatabaseSchema
StartReleaseContainers
PrintStatus
StartStopCommandWatcher
FollowApplicationLogs

if [ -n "${StopCommandWatcherPid}" ]; then
  kill "${StopCommandWatcherPid}" >/dev/null 2>&1 || true
fi
