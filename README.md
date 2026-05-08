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

| Plugin | Scope | Commands | Description |
| --- | --- | --- | --- |
| `Backups` | Guild | - | Create and restore backups from the dashboard. |
| `CommandAliases` | Global | - | Add aliases for existing slash commands. |
| `CustomCommands` | Guild | - | Create prefix commands such as `!role` with checks and actions from the dashboard. |
| `CustomStatus` | Global | - | Custom Discord presence with rotating status text. |
| `DiscordGame` | Guild | `/minesweeper`, `/tictactoe` | Interactive Discord mini-games. |
| `Giveaway` | Guild | `/giveaway-start`, `/giveaway-end`, `/giveaway-reroll`, `/giveaway-list` | Button-based giveaways with automatic ending, winner rerolls, entry rules, and role bonuses. |
| `Leveling` | Guild | `/leaderboard` | XP, rankings, and member progression. Depends on `Statistics`. |
| `Moderation` | Guild | `/warn`, `/lookup` | Sanctions, moderation logs, and AutoMod rules. |
| `Notifications` | Guild | - | Dashboard-managed RSS, YouTube, Twitch, Kick, X, Reddit, and Instagram notifications with custom embeds per source. |
| `SendEmbed` | Guild | - | Create and send embeds from the dashboard. |
| `Statistics` | Guild | `/stats` | Message, voice, join, and leave statistics. |
| `TempVoice` | Guild | - | Temporary voice channels with a control panel. |
| `WelcomeMessage` | Guild | - | Join and leave messages, as embeds or images. |

### Giveaway Plugin

The `Giveaway` plugin provides Mee6-style giveaway messages with Discord buttons.

- `/giveaway-start prize duration winners [channel]`: creates a giveaway message with enter and leave buttons.
- `/giveaway-end message_id`: ends a giveaway immediately and selects winners.
- `/giveaway-reroll message_id`: rerolls winners for an ended giveaway.
- `/giveaway-list`: shows active giveaways for the server.

Dashboard settings include default channel and duration, maximum winners, required roles, blocked roles, custom messages, embed colors, and role-based bonus entries. Bonus entries use the format `ROLE_ID=ENTRIES`, for example `123456789012345678=3` gives members with that role three total entries.

The `Reminders` plugin provides Mee6-style scheduled messages for server announcements, recurring rules, bump prompts, event notices, or automated embed posts. Reminders are created and edited from the dashboard panel so scheduled content stays controlled by guild managers.

- `/reminder-list`: lists configured reminders, their status, channel, interval, and next run.
- `/reminder-enable id`: re-enables a disabled reminder.
- `/reminder-disable id`: pauses a reminder without deleting it.
- `/reminder-delete id`: removes a reminder permanently.
- `/reminder-run id`: sends a reminder immediately without changing its next scheduled run.

Dashboard settings include reminder creation/editing, target channel, message/embed mode, schedule interval, next run time, default reminder channel, default embed mode, default interval, embed color, footer text, and maximum reminders per server. Reminder text supports placeholders like `%name%`, `%id%`, `%server%`, `%runCount%`, `%interval%`, and `%nextRun%`.

### Notifications Plugin

The `Notifications` plugin watches external sources and posts new items into configured Discord channels. Sources are created from the dashboard and each source has its own target channel, check interval, and embed template.

Supported source types:

- RSS: any public RSS or Atom feed URL.
- YouTube: public channel RSS feeds, using a YouTube channel ID or a feed URL override.
- Twitch: live stream notifications through the Twitch API. Use per-source client ID/secret or set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in `.env`.
- Kick: live stream notifications through Kick channel data. A per-source access token can be provided when needed.
- X: recent post notifications through the X API. Requires a per-source bearer token.
- Reddit: subreddit post notifications through public JSON, or through Reddit OAuth using per-source client credentials / bearer token.
- Instagram: media notifications through Instagram Graph. Requires a per-source user ID and access token.

Notification embeds support `%source%`, `%type%`, `%title%`, `%url%`, `%author%`, `%publishedAt%`, `%summary%`, and `%image%`.

## Requirements

- Node.js 22 or newer
- npm
- Docker Desktop or Docker Engine with Docker Compose
- A Discord application with a bot token
- PostgreSQL and Redis, or the provided `docker-compose.yml`

The bot needs the Discord intents required by the plugins you enable, especially `Guilds`, `Guild Members`, `Guild Messages`, `Message Content`, and `Guild Voice States`.

## Configuration

Create a `.env` file at the project root:

```env
POSTGRES_PASSWORD=replace_with_a_strong_database_password
REDIS_PASSWORD=replace_with_a_strong_redis_password
DATABASE_URL=postgresql://hyperbot:replace_with_a_strong_database_password@localhost:5432/hyperbot?schema=public
REDIS_URL=redis://:replace_with_a_strong_redis_password@localhost:6379
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_discord_application_id
DISCORD_GUILD_ID=
SUPER_ADMIN_IDS=
PUBLIC_REGISTRATION_ENABLED=true
NEXT_PUBLIC_APP_URL=http://localhost:3000
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
```

Useful variables:

- `DISCORD_TOKEN`: Discord bot token, required.
- `DISCORD_CLIENT_ID`: Discord application ID, required.
- `DISCORD_GUILD_ID`: optional. If set, slash commands are synchronized only for this guild.
- `SUPER_ADMIN_IDS`: optional. Comma-separated list of Discord user IDs.
- `POSTGRES_PASSWORD`: required by Docker Compose. Use a strong value.
- `REDIS_PASSWORD`: required by Docker Compose. Use a strong value.
- `PUBLIC_REGISTRATION_ENABLED`: reserved for dashboard registration configuration.
- `DATABASE_URL`: local Prisma/database URL. With Docker Compose, use the same password as `POSTGRES_PASSWORD`.
- `REDIS_URL`: local Redis URL. With Docker Compose, include the same password as `REDIS_PASSWORD`.
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

Then create the `.env` file using the template from the configuration section.

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

`Dev.sh` starts PostgreSQL and Redis with Docker Compose, installs dependencies if needed, generates Prisma, syncs the schema, and starts the bot plus the dashboard.

The dashboard is available at:

```text
http://localhost:3000
```

On first launch, the interface asks you to create the first administrator account.

## Quick Start on Windows

The easiest setup on Windows is PowerShell or Command Prompt with Docker Desktop.

1. Install Node.js 22 from the official Node.js website.
2. Install Docker Desktop and start it.
3. Clone or open the project.
4. Create the `.env` file at the project root with the configuration variables.
5. Open PowerShell in the project directory.

Start PostgreSQL and Redis:

```powershell
docker compose up -d postgresql redis
```

Install dependencies:

```powershell
npm install
```

Set up Prisma:

```powershell
npx prisma generate
npx prisma db push
```

Start the bot and dashboard:

```powershell
$env:DATABASE_URL="postgresql://hyperbot:YOUR_POSTGRES_PASSWORD@localhost:5432/hyperbot?schema=public"
$env:REDIS_URL="redis://:YOUR_REDIS_PASSWORD@localhost:6379"
$env:PLUGIN_DIRECTORY="Plugins"
npm run dev
```

Then open:

```text
http://localhost:3000
```

For later runs, start Docker Desktop, then run `docker compose up -d postgresql redis` and `npm run dev`.

For a Windows release deployment similar to `Release.sh`, run:

```bat
Release.bat
```

`Release.bat` loads `.env`, starts PostgreSQL and Redis, waits for PostgreSQL, creates a database backup in `Backups\PostgreSQL`, installs dependencies, builds the application, syncs Prisma, rebuilds the Docker application image, starts the containers, and follows application logs. Set `FOLLOW_LOGS=false` in `.env` to skip log following.

## Docker Compose

To run the full application in containers:

```bash
docker compose up -d --build
```

The `application` service uses variables from `.env`, builds the app, and exposes the dashboard at `http://localhost:3000`.

PostgreSQL and Redis are bound to `127.0.0.1` only in the provided Compose file. They are available to the application container through the internal Docker network, but are not exposed on every host interface. Redis requires `REDIS_PASSWORD`; PostgreSQL requires `POSTGRES_PASSWORD`.

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
