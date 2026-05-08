@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ProjectRoot=%~dp0"
set "ProjectRoot=%ProjectRoot:~0,-1%"
set "BackupDirectory=%ProjectRoot%\Backups\PostgreSQL"

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "Timestamp=%%I"

cd /d "%ProjectRoot%" || exit /b 1

if not exist "docker-compose.yml" (
  echo docker-compose.yml not found in %ProjectRoot%. 1>&2
  echo Run this script from the HyperBot project, or execute it with its full path. 1>&2
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\EnsureEnv.ps1" ".env" || exit /b 1

if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    set "EnvKey=%%A"
    set "EnvValue=%%B"
    if not "!EnvKey!"=="" if not "!EnvKey:~0,1!"=="#" (
      if "!EnvValue:~0,1!"=="^"" set "EnvValue=!EnvValue:~1!"
      if "!EnvValue:~-1!"=="^"" set "EnvValue=!EnvValue:~0,-1!"
      set "!EnvKey!=!EnvValue!"
    )
  )
)

call :RequireCommand docker || exit /b 1
call :RequireCommand npm || exit /b 1
call :RequireCommand npx || exit /b 1

if "%PLUGIN_DIRECTORY%"=="" set "PLUGIN_DIRECTORY=dist/Plugins"
if "%NEXT_PUBLIC_APP_URL%"=="" set "NEXT_PUBLIC_APP_URL=http://localhost:3000"
if "%NEXT_TELEMETRY_DISABLED%"=="" set "NEXT_TELEMETRY_DISABLED=1"
if "%FOLLOW_LOGS%"=="" set "FOLLOW_LOGS=true"
set "NODE_OPTIONS=%NODE_OPTIONS% --no-deprecation"

echo Starting HyperBot release deployment...
docker compose up -d --remove-orphans postgresql redis || exit /b 1

call :SetDockerHostUrls || exit /b 1
call :WaitForPostgreSQL || exit /b 1
call :SyncPostgreSQLPassword || exit /b 1
call :BackupDatabase || exit /b 1
call :EnsureDatabaseExists || exit /b 1
call :InstallDependencies || exit /b 1
call :BuildApplication || exit /b 1
call :SyncDatabaseSchema || exit /b 1
call :StartReleaseContainers || exit /b 1
call :PrintStatus
call :FollowApplicationLogs

exit /b 0

:RequireCommand
where "%~1" >nul 2>nul
if errorlevel 1 (
  echo Missing required command: %~1 1>&2
  exit /b 1
)
exit /b 0

:SetDockerHostUrls
for /f %%P in ('docker compose port postgresql 5432') do set "PostgresEndpoint=%%P"
for /f %%P in ('docker compose port redis 6379') do set "RedisEndpoint=%%P"
set "PostgresHostPort=!PostgresEndpoint:*:=!"
set "RedisHostPort=!RedisEndpoint:*:=!"
set "DATABASE_URL=postgresql://hyperbot:%POSTGRES_PASSWORD_URL_ENCODED%@127.0.0.1:!PostgresHostPort!/hyperbot?schema=public"
set "REDIS_URL=redis://:%REDIS_PASSWORD_URL_ENCODED%@127.0.0.1:!RedisHostPort!"
echo PostgreSQL local port: !PostgresHostPort!
echo Redis local port: !RedisHostPort!
exit /b 0

:WaitForPostgreSQL
echo Waiting for PostgreSQL...
:WaitForPostgreSQLLoop
docker compose exec -T postgresql pg_isready -U hyperbot -d postgres >nul 2>nul
if errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto WaitForPostgreSQLLoop
)
exit /b 0

:SyncPostgreSQLPassword
echo Synchronizing PostgreSQL password with .env...
docker compose exec -T postgresql psql -U hyperbot -d postgres -v ON_ERROR_STOP=1 -c "ALTER USER hyperbot WITH PASSWORD '%POSTGRES_PASSWORD%';" || exit /b 1
exit /b 0

:EnsureDatabaseExists
echo Ensuring PostgreSQL database exists...
docker compose exec -T postgresql psql -U hyperbot -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'hyperbot';" | findstr /C:"1" >nul
if errorlevel 1 (
  docker compose exec -T postgresql createdb -U hyperbot -O hyperbot hyperbot || exit /b 1
)
exit /b 0

:BackupDatabase
if not exist "%BackupDirectory%" mkdir "%BackupDirectory%" || exit /b 1

docker compose exec -T postgresql psql -U hyperbot -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'hyperbot';" | findstr /C:"1" >nul
if errorlevel 1 (
  echo No existing hyperbot database found. Skipping backup.
  exit /b 0
)

set "BackupPath=%BackupDirectory%\hyperbot-%Timestamp%.dump"
set "LatestPath=%BackupDirectory%\hyperbot-latest.dump"

echo Saving PostgreSQL backup to %BackupPath%...
docker compose exec -T postgresql pg_dump -U hyperbot -d hyperbot -Fc > "%BackupPath%" || exit /b 1
copy /Y "%BackupPath%" "%LatestPath%" >nul || exit /b 1
exit /b 0

:InstallDependencies
echo Installing npm dependencies, including build dependencies...
npm install --include=dev || exit /b 1
exit /b 0

:BuildApplication
echo Building production assets...
set "NODE_ENV=production"
npx prisma generate || exit /b 1
npm run build || exit /b 1
if not exist "dist\Plugins" mkdir "dist\Plugins" || exit /b 1
xcopy "Plugins" "dist\Plugins" /E /I /Y >nul || exit /b 1
exit /b 0

:SyncDatabaseSchema
echo Synchronizing Prisma schema...
npx prisma db push || exit /b 1
exit /b 0

:StartReleaseContainers
echo Building Docker application image...
docker compose build application || exit /b 1

echo Starting release containers...
docker compose up -d --remove-orphans postgresql redis application || exit /b 1
exit /b 0

:PrintStatus
for /f %%P in ('docker compose port application 3000') do set "ApplicationEndpoint=%%P"
set "ApplicationHostPort=!ApplicationEndpoint:*:=!"
echo.
echo Release started.
echo Dashboard: http://127.0.0.1:!ApplicationHostPort!
echo Database backups: %BackupDirectory%
echo.
docker compose ps
exit /b 0

:FollowApplicationLogs
if /I not "%FOLLOW_LOGS%"=="true" exit /b 0

echo.
echo Following application logs. Press Ctrl+C to stop the log view.
docker compose logs -f application
exit /b 0
