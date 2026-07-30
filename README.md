# HyperBot

![License](https://img.shields.io/badge/license-GPL--3.0-blue)
![Node.js](https://img.shields.io/badge/node.js-%3E%3D22.12.0-339933?logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/python-%3E%3D3.10-3776AB?logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/docker-compose-2496ED?logo=docker&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-5.6-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/next.js-16.3_canary-000000?logo=next.js&logoColor=white)
![Discord.js](https://img.shields.io/badge/discord.js-14.16-5865F2?logo=discord&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/postgresql-16-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/redis-7-DC382D?logo=redis&logoColor=white)
![Platforms](https://img.shields.io/badge/platforms-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)
[![CodeFactor](https://www.codefactor.io/repository/github/totgocpro/hyperbot/badge)](https://www.codefactor.io/repository/github/totgocpro/hyperbot)

HyperBot is a Discord bot with a web dashboard and a plugin-based architecture. The core project handles bot instances, plugin loading, storage, the admin interface, permissions, Discord command synchronization, PostgreSQL, and Redis. Features live in `Plugins/`, so they can be added or changed without rewriting the core.

The repository includes a cross-platform CLI for non-technical users. It creates and configures an instance, tries to keep the web dashboard on port `3000`, starts Docker services, exports the instance, updates from GitHub, and keeps local plugins safe during updates.

## Requirements

Install these before starting HyperBot:

- Docker Desktop or Docker Engine with Docker Compose
- Python 3.10 or newer
- Git, only needed for updates from GitHub

The launcher creates its own Python virtual environment in `.hyperbot-cli-venv`. You do not need to install Python packages manually.

## Quick Start

### Linux and macOS

```bash
chmod +x HyperBot.sh
./HyperBot.sh create
```

### Windows

Open `cmd.exe` or PowerShell in the HyperBot folder, then run:

```bat
HyperBot.bat create
```

The `create` command:

- creates `.env` when needed;
- generates PostgreSQL and Redis passwords;
- uses dashboard port `3000` when it is available;
- automatically picks another free port if `3000` is already in use;
- starts PostgreSQL, Redis, and the HyperBot application with Docker;
- builds the Docker image;
- prepares the Prisma database schema.

When startup finishes, the CLI prints the dashboard URL, for example:

```text
http://127.0.0.1:3000
```

On first launch, the web UI asks you to create the first administrator account.

## Web Port

To create or start an instance on a specific dashboard port:

```bash
./HyperBot.sh create --port 8080
./HyperBot.sh start --port 8080
```

On Windows:

```bat
HyperBot.bat create --port 8080
HyperBot.bat start --port 8080
```

To change configuration without starting the bot:

```bash
./HyperBot.sh configure --port 8080
```

Interactive configuration assistant:

```bash
./HyperBot.sh configure -i
```

The assistant can configure the dashboard port, bind address, Discord super-admin IDs, and public registration.

## CLI Commands

Linux and macOS:

```bash
./HyperBot.sh menu
./HyperBot.sh start
./HyperBot.sh stop
./HyperBot.sh status
./HyperBot.sh logs -f
./HyperBot.sh export
./HyperBot.sh update
```

Windows:

```bat
HyperBot.bat menu
HyperBot.bat start
HyperBot.bat stop
HyperBot.bat status
HyperBot.bat logs -f
HyperBot.bat export
HyperBot.bat update
```

Main commands:

| Command | Purpose |
| --- | --- |
| `create` | Configures a new instance and starts it. |
| `start` | Builds and starts HyperBot in production Docker mode. |
| `stop` | Stops the application, Redis, and PostgreSQL without deleting data. |
| `status` | Shows Docker containers and the dashboard URL. |
| `logs -f` | Follows application logs. |
| `configure` | Updates common `.env` settings quickly. |
| `export` | Creates a zip containing `.env`, `Plugins/`, and a PostgreSQL backup. |
| `update` | Updates from `git@github.com:Totgocpro/HyperBot.git` while preserving local plugins. |
| `menu` | Opens the interactive text menu. |

The legacy `Release.sh` and `Release.bat` files are still available for compatibility. They now call the CLI with `start --logs`.

## Included Plugins

| Plugin | Scope | Category | Commands | Dashboard and behavior |
| --- | --- | --- | --- | --- |
| `Achievement` | Guild | Engagement | `/achievements`, `/progress` | Create and track achievements for members. Supports message counts, image sending, daily streaks, voice activity, and more. Custom dashboard achievement editor with configurable announcement channel and DM on completion. |
| `Automation` | Guild | Automation | Dashboard only | Defines If-Then automation rules with triggers (message, join, leave, voice, schedule), AND/OR condition gates, and actions (send message, add/remove role, add reaction, delete message, DM). Custom dashboard rule builder. |
| `Backups` | Guild | Administration | Dashboard only | Creates and restores Discord server backups from the dashboard. Covers backup naming, restore safety, and backup action buttons. |
| `CommandAliases` | Global | General | Dashboard only | Registers global command aliases from dashboard-managed alias entries. |
| `CustomCommands` | Guild | Automation | Dashboard only | Builds prefix commands with a configurable prefix, default channel checks, default role checks, denied messages, and command definitions. |
| `CustomStatus` | Global | General | Dashboard only | Configures bot presence, activity type, rotating status text, emoji placement, rotation mode, and rotation interval. |
| `DiscordGame` | Guild | Fun | `/minesweeper`, `/tictactoe`, `/love`, `/askyes` | Provides Discord games and generated image interactions. Dashboard settings cover game text, colors, emojis, love image rendering, and yes/no answer images. |
| `EmojiAdder` | Guild | Utility | Dashboard only | Searches and adds GIFs as Discord emojis (via Klipy API), can delete emojis, and supports a per-guild Klipy key or the `KLIPY_API_KEY` environment variable. Get a key at https://klipy.com/developers. Requires the bot to manage guild expressions. |
| `Giveaway` | Guild | Engagement | `/giveaway-start`, `/giveaway-end`, `/giveaway-reroll`, `/giveaway-list` | Runs button-based giveaways with default channel, default duration, winner limits, required roles, blocked roles, bonus entry rules, messages, and button labels. |
| `InviteTracker` | Guild | Engagement | `/invites`, `/invite-leaderboard` | Tracks invite usage, fake joins, leaves, unknown joins, invite logs, and leaderboard data. Includes dashboard charts and a cache refresh action. Requires the bot to read server invites. |
| `Leveling` | Guild | Engagement | `/leaderboard` | Awards XP from counted messages and counted voice minutes, then displays a public leaderboard. Depends on `Statistics`. |
| `Moderation` | Guild | Moderation | `/warn`, `/lookup` | Stores sanctions, logs moderation actions, logs deleted/edited messages and joins/leaves, supports regex AutoMod, repeated spam detection, invite blocking, word replacement, and word censorship. |
| `Notifications` | Guild | Automation | Dashboard only | Sends scheduled notifications to configured channels. Sources support dashboard-managed source definitions, default channels, and default check intervals. |
| `Reminders` | Guild | Automation | `/reminder-list`, `/reminder-enable`, `/reminder-disable`, `/reminder-delete`, `/reminder-run` | Schedules dashboard-managed reminders with default channel, embed mode, interval, color, footer text, reminder limits, and slash command management. |
| `SendEmbed` | Guild | Messages | Dashboard only | Builds, saves, previews, and sends Discord embeds to selected text, announcement, or voice channels through the shared embed editor. |
| `Statistics` | Guild | Analytics | `/stats` | Tracks messages, reactions, voice time, joins, leaves, hourly activity, channel counters, and member activity status. Provides dashboard charts, an activity pie chart, configurable active/inactive thresholds, optional active/inactive role assignment, and a configurable `/stats` embed. |
| `TempVoice` | Guild | Voice | Dashboard only | Creates temporary voice rooms from a creator channel with owner controls, locks, bans, protected roles, music controls (many platforms), YouTube cookie-file support, a generated music panel, and optional TTS. |
| `Tickets` | Guild | Support | Dashboard only | Publishes a ticket panel, creates private ticket channels, applies support role permissions, tracks ticket status, can save transcripts, logs ticket events, and shows open/closed ticket charts. |
| `WelcomeMessage` | Guild | Community | Dashboard only | Sends welcome and leave messages as embeds or generated images, supports background and avatar styling, and can publish a captcha verification panel with role grants. |

### Plugin Notes

- `Leveling` depends on `Statistics`, because XP is calculated from tracked message and voice activity.
- `InviteTracker` needs enough Discord permissions to fetch server invites. Without that, invite attribution can show unknown joins.
- `EmojiAdder` needs the bot permission for managing guild expressions.
- `TempVoice` needs permissions to create and manage voice channels. Music playback can use public YouTube videos or a server-side `cookies.txt` path and Spotify integration need apis keys
- `Tickets` needs permission to create/manage text channels and permission overwrites in the configured category.

## Export an Instance

```bash
./HyperBot.sh export
```

The export is created in `Exports/`, for example:

```text
Exports/hyperbot-instance-20260606-143000.zip
```

The export contains:

- the `Plugins/` directory;
- `.env`;
- a PostgreSQL backup in `Backups/PostgreSQL/`;
- `manifest.json`.

Warning: `.env` contains secrets. Keep exports private.

## Update HyperBot

```bash
./HyperBot.sh update
./HyperBot.sh start
```

The update command:

- backs up `Plugins/` to `Backups/Updates/`;
- sets the git remote to `https://github.com/Totgocpro/HyperBot.git`;
- pulls the latest version of the current branch;
- restores local plugins that do not exist in the pulled version.

If HyperBot was downloaded as a GitHub ZIP and does not contain a `.git` folder, the CLI first backs up the current source to `Backups/Updates/`, initializes Git, detects the GitHub default branch, and replaces official files with the GitHub version. Local-only files such as `.env`, backups, exports, runtime folders, and custom plugin folders are kept. If an official file was edited locally, the GitHub version wins and the previous local copy remains in the update backup.

If Git reports tracked local changes, the CLI backs up the current source to `Backups/Updates/`, resets official files to the current Git version, then updates from GitHub. Use `--allow-dirty` only if you intentionally want Git to try updating while tracked files are still modified.

## Configuration

The CLI writes common settings to `.env`.

| Variable | Description |
| --- | --- |
| `APP_HOST_PORT` | Local dashboard port. The CLI tries `3000` by default. |
| `APP_HOST_BIND` | Dashboard bind address. Keep `127.0.0.1` for local-only access. |
| `SUPER_ADMIN_IDS` | Comma-separated Discord user IDs with super-admin access. |
| `PUBLIC_REGISTRATION_ENABLED` | Enables or disables public registration. |
| `KLIPY_API_KEY` | API key for Emoji Adder (Klipy API, replaces discontinued Tenor). Get one at https://klipy.com/developers. |
| `TEMPVOICE_YOUTUBE_COOKIES_PATH` | Optional path to a YouTube cookies file for Temp Voice music. |
| `YOUTUBE_COOKIES_PATH` | Fallback YouTube cookies path. |
| `DATABASE_HOST_BIND` | PostgreSQL and Redis bind address. Keep `127.0.0.1` unless you intentionally expose them. |

To make the dashboard reachable from another device on your local network:

```bash
./HyperBot.sh configure --host-bind 0.0.0.0
./HyperBot.sh start
```

Keep `DATABASE_HOST_BIND=127.0.0.1` unless you know why you need external database access.

Bot invite URL template:

```text
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=8
```

The bot needs the Discord intents required by the plugins you enable, especially `Guilds`, `Guild Members`, `Guild Messages`, `Message Content`, and `Guild Voice States`.

## Development

The CLI is intended for production-style Docker startup. For local development with watch mode:

```bash
npm install
npm run dev
```

Useful structure:

```text
app/                 Next.js routes and dashboard API
src/Bot/             Discord bot entry point
src/Core/            Plugin loader, storage, clients, and shared types
src/Web/             Authentication and web components
Plugins/             Installed plugins
prisma/              Prisma schema
scripts/hyperbot_cli.py
```

To add a plugin:

1. Create `Plugins/YourPluginName`.
2. Add `Plugin.json` with metadata, scope, commands, dashboard fields, and `EntryPoint`.
3. Implement the TypeScript entry point declared in the manifest.
4. Restart HyperBot.

## License

HyperBot is distributed under the GPL license. See `LICENSE`.
