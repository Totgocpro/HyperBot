# HyperBot

HyperBot is a Discord bot with a web dashboard, built around a modular architecture. The core project handles plugin loading, storage, the admin interface, permissions, and Discord command synchronization. Business features live in `Plugins/`, so they can be added, removed, or changed without modifying the core.

## Project Goal

The main goal is modularity:

- each plugin has its own directory, `Plugin.json`, and TypeScript entry point;
- plugins declare their slash commands, dashboard settings, and dependencies;
- the dashboard reads plugin manifests to automatically render available settings;
- the bot reloads plugins during development and centralizes Discord events;
- configuration is stored per plugin, globally or per Discord server.

This structure makes HyperBot a reusable foundation: the bot core stays stable while features evolve as modules.

## Included Plugins

| Plugin | Scope | Commands | Main use |
| --- | --- | --- | --- |
| `Backups` | Guild | Dashboard only | Create, download, and restore server backups from the dashboard. |
| `CommandAliases` | Global | Dashboard only | Register global aliases for existing slash commands. |
| `CustomCommands` | Guild | Prefix commands | Build custom prefix commands with checks, role actions, messages, embeds, reactions, and trigger deletion. |
| `CustomStatus` | Global | Dashboard only | Configure the bot presence and rotating activity text. |
| `DiscordGame` | Guild | `/minesweeper`, `/tictactoe` | Run small interactive Discord games. |
| `Giveaway` | Guild | `/giveaway-*` | Run button-based giveaways with automatic ending, rerolls, eligibility rules, and custom embeds. |
| `Leveling` | Guild | `/leaderboard` | Award XP from activity and display member rankings. Depends on `Statistics`. |
| `Moderation` | Guild | `/warn`, `/lookup` | Store sanctions, view user history, log moderation actions, and configure AutoMod rules. |
| `Notifications` | Guild | Dashboard only | Watch RSS, YouTube, Twitch, Kick, X, Reddit, and Instagram sources and post custom embed notifications. |
| `Reminders` | Guild | `/reminder-*` | Schedule recurring messages or embeds from the dashboard, with slash commands for control. |
| `SendEmbed` | Guild | Dashboard only | Build, save, and send Discord embeds using the shared embed editor. |
| `Statistics` | Guild | `/stats` | Track messages, voice time, joins, leaves, channel counters, and custom `/stats` embeds. |
| `TempVoice` | Guild | Dashboard only | Create temporary voice channels with owner controls and protection rules. |
| `WelcomeMessage` | Guild | Dashboard only | Send welcome/leave messages and run configurable captcha verification flows. |

### Plugin Details

#### Backups

- Scope: guild.
- Interface: dashboard.
- Configuration: backup name, restore safety, backup creation, selected restore, latest restore, and backup download.
- Notes: backups include roles, permissions, categories, channels, and saved plugin configuration. Discord messages are not copied.

#### Custom Commands

- Scope: guild.
- Interface: dashboard.
- Configuration: prefix, case sensitivity, default channel/role checks, denied messages, and command action chains.
- Actions: send message, reply, DM, send/reply/DM embed, add/remove/toggle role, delete trigger, and react.
- Notes: message and embed fields support command placeholders such as `%user%`, `%mention%`, `%args%`, `%server%`, and `%channel%`.

#### Giveaway

- Scope: guild.
- Commands: `/giveaway-start`, `/giveaway-end`, `/giveaway-reroll`, `/giveaway-list`.
- Configuration: default channel, default duration, winner limits, required/blocked roles, entry messages, join/leave labels, role bonus entries, active embed, and ended embed.
- Notes: bonus entries use `ROLE_ID=ENTRIES`, for example `123456789012345678=3` gives members with that role three total entries.

#### Notifications

- Scope: guild.
- Interface: dashboard.
- Sources: RSS, YouTube, Twitch, Kick, X, Reddit, and Instagram.
- Configuration: source list, target channel, check interval, external IDs/URLs, bring-your-own API keys, and custom embed template per source.
- Notes: notification embeds support tags such as `%source%`, `%type%`, `%title%`, `%url%`, `%author%`, `%publishedAt%`, `%summary%`, and `%image%`.

#### Reminders

- Scope: guild.
- Commands: `/reminder-list`, `/reminder-enable`, `/reminder-disable`, `/reminder-delete`, `/reminder-run`.
- Configuration: reminders are created and edited from the dashboard, with target channel, message/embed mode, interval or weekly schedule, next run time, default embed, and max reminders.
- Notes: reminder text supports placeholders such as `%name%`, `%id%`, `%server%`, `%runCount%`, `%interval%`, and `%nextRun%`.

#### Statistics

- Scope: guild.
- Commands: `/stats`.
- Configuration: bot tracking, ignored voice channels, custom `/stats` embed, dashboard charts, and locked voice channel counters.
- Notes: channel counter names support tags such as `%members_count%`, `%humans_count%`, `%bots_count%`, `%online_count%`, `%voice_count%`, `%channels_count%`, `%roles_count%`, and `%boosts_count%`.

#### Welcome Message

- Scope: guild.
- Interface: dashboard.
- Configuration: welcome/leave channels, text or embed mode, image mode, role assignment, captcha channel, captcha roles, captcha difficulty, and captcha embed/messages.
- Notes: captcha challenges are sent to users in DM as generated images, and completed users can receive one or more roles.

## Requirements

- Node.js 22 or newer
- npm
- Docker Desktop or Docker Engine with Docker Compose
- A Discord application with a bot token
- PostgreSQL and Redis, or the provided `docker-compose.yml`

The bot needs the Discord intents required by the plugins you enable, especially `Guilds`, `Guild Members`, `Guild Messages`, `Message Content`, and `Guild Voice States`.

## Configuration

The provided scripts create `.env` automatically and generate random database passwords on first run. For a manual setup, copy `.env.example` to `.env` and fill the Discord values:

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_discord_application_id
DISCORD_GUILD_ID=
SUPER_ADMIN_IDS=
PUBLIC_REGISTRATION_ENABLED=true
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_HOST_PORT=3000
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
```

Useful variables:

- `DISCORD_TOKEN`: Discord bot token, required.
- `DISCORD_CLIENT_ID`: Discord application ID, required.
- `DISCORD_GUILD_ID`: optional. If set, slash commands are synchronized only for this guild.
- `SUPER_ADMIN_IDS`: optional. Comma-separated list of Discord user IDs.
- `POSTGRES_PASSWORD`: generated automatically by the scripts when missing.
- `REDIS_PASSWORD`: generated automatically by the scripts when missing.
- `PUBLIC_REGISTRATION_ENABLED`: reserved for dashboard registration configuration.
- `DATABASE_URL`: normally generated by the scripts from the random Docker PostgreSQL port.
- `REDIS_URL`: normally generated by the scripts from the random Docker Redis port.
- `COMPOSE_PROJECT_NAME`: generated automatically per project folder so multiple HyperBot folders do not share Docker containers or volumes.
- `APP_HOST_BIND`: dashboard bind address. Defaults to `127.0.0.1` for local-only access. Use `0.0.0.0` only if you need access from another device on your LAN.
- `APP_HOST_PORT`: dashboard port exposed by Docker Compose. Leave empty for an automatic free port. Existing generated `APP_HOST_PORT=3000` values are migrated back to automatic by the scripts; set another value manually only if you really want a fixed dashboard URL.
- `DATABASE_HOST_BIND`: PostgreSQL and Redis bind address. Defaults to `127.0.0.1`; keep it local unless you explicitly need external database access.
- `PLUGIN_DIRECTORY`: defaults to `Plugins` in development and `dist/Plugins` in production Docker builds.
- `ENABLE_MESSAGE_EVENTS=true`: optional, useful when enabling behavior that explicitly depends on message events.

The first dashboard account can be created from the web UI while the database is empty. After one account exists, `/api/auth/setup` returns `409` and cannot create another first admin account.

Bot invite URL:

```text
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=8
```

## Quick Start on Linux/macOS

```bash
npm install
```

The scripts create `.env` if it does not exist, including random PostgreSQL and Redis passwords.

For using Hyperbot in Release mode use :

```bash
chmod +x Release.sh
./Release.sh
```

Start development mode:

```bash
chmod +x Dev.sh
./Dev.sh
```

`Dev.sh` starts PostgreSQL and Redis with Docker Compose, assigns local database ports automatically, installs dependencies if needed, generates Prisma, syncs the schema, and starts the bot plus the dashboard.

The dashboard is available at:

```text
http://localhost:3000
```

On first launch, the interface asks you to create the first administrator account.

## Quick Start on Windows

The easiest setup on Windows is Command Prompt with Docker Desktop.

1. Install Node.js 22 from the official Node.js website.
2. Install Docker Desktop and start it.
3. Clone or open the project.
4. Open Command Prompt in the project directory.
5. Run:

```bat
Release.bat
```

`Release.bat` creates `.env` if needed, generates random PostgreSQL and Redis passwords, gives the folder its own Docker project name, starts PostgreSQL and Redis on automatic local ports, creates a database backup in `Backups\PostgreSQL`, installs dependencies, builds the application, syncs Prisma, rebuilds the Docker application image, starts the containers, and follows application logs. Set `FOLLOW_LOGS=false` in `.env` to skip log following.

## Docker Compose

To run the full application in containers:

```bash
sh ./scripts/EnsureEnv.sh .env
docker compose up -d --build
```

The `application` service uses variables from `.env`, builds the app, and exposes the dashboard at `http://localhost:3000`.

PostgreSQL, Redis, and the dashboard are bound to `127.0.0.1` by default and use automatic host ports, so multiple HyperBot projects can run at the same time without manually changing `5432`, `6379`, or `3000`. Each folder also gets a generated `COMPOSE_PROJECT_NAME`, so Docker volumes are isolated per bot. To reach the dashboard from another device on your LAN, set `APP_HOST_BIND=0.0.0.0` in `.env`, restart with `./Release.sh`, then open `http://SERVER_LAN_IP:PRINTED_PORT`. Keep `DATABASE_HOST_BIND=127.0.0.1` unless you really need external DB access.

To view logs:

```bash
docker compose logs -f application
```

To stop:

```bash
docker compose down
```

## npm Scripts

```bash
npm run dev
```

Starts the bot in watch mode and the Next.js dashboard in development mode.

```bash
npm run bot:dev
```

Starts only the bot.

```bash
npm run web:dev
```

Starts only the dashboard.

```bash
npm run build
```

Generates Prisma, compiles the bot, and builds the Next.js application.

```bash
npm run start
```

Starts the compiled bot and the production Next.js server.

## Structure

```text
app/                 Next.js routes and dashboard API
src/Bot/             Discord bot entry point
src/Core/            Plugin loader, storage, clients, and shared types
src/Web/             Authentication and web components
Plugins/             Default installed plugins
prisma/              Database schema
docker-compose.yml   PostgreSQL, Redis, and application services
```

## Add a Plugin

1. Create a directory in `Plugins/YourPluginName`.
2. Add a `Plugin.json` with metadata, scope, commands, dashboard fields, and the `EntryPoint`.
3. Implement the plugin class in TypeScript.
4. Restart the bot or modify a plugin file in development mode to trigger reload.

## License

This project is distributed under the GPL license. See `LICENSE`.
