import "dotenv/config";
import {
  ChannelType,
  Client,
  Partials,
  PermissionsBitField,
  type GuildBasedChannel
} from "discord.js";
import Path from "node:path";
import { Prisma, RedisClient } from "../Core/Clients.js";
import { PluginLoader } from "../Core/PluginLoader.js";
import type { BotChannelSummary, BotGuildSummary, CommandDefinition, CommandOptionDefinition } from "../Core/Types.js";

enum DiscordApplicationCommandOptionType {
  String = 3,
  Integer = 4,
  Boolean = 5,
  User = 6,
  Channel = 7,
  Role = 8
}

const DiscordGatewayIntentBits = {
  Guilds: 1,
  GuildMessages: 512,
  GuildModeration: 4,
  GuildMembers: 2,
  MessageContent: 32768
} as const;

type DiscordApplicationCommandBody = {
  name: string;
  description: string;
  options?: DiscordApplicationCommandOptionBody[];
};

type DiscordApplicationCommandOptionBody = {
  name: string;
  description: string;
  type: DiscordApplicationCommandOptionType;
  required: boolean;
  choices?: Array<{
    name: string;
    value: string | number;
  }>;
};

const DiscordToken = process.env.DISCORD_TOKEN;
const DiscordClientId = process.env.DISCORD_CLIENT_ID;
const DiscordGuildId = process.env.DISCORD_GUILD_ID;
const EnableMessageEvents = process.env.ENABLE_MESSAGE_EVENTS === "true";
const PluginDirectory = Path.resolve(process.env.PLUGIN_DIRECTORY ?? "Plugins");

if (!DiscordToken || !DiscordClientId) {
  throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required.");
}

const DiscordClient = new Client({
  intents: BuildGatewayIntents(),
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
});

const Loader = new PluginLoader(PluginDirectory, Prisma, RedisClient, DiscordClient);
let LastCommandRegistrationHash = "";
let LastCommandRegistrationAt = 0;
let CommandRegistrationPromise: Promise<void> = Promise.resolve();

DiscordClient.once("clientReady", () => {
  void RunSafely("clientReady", async () => {
    await Loader.EnableAll();
    Loader.Watch();
    await EnforceGuildAccess();
    await CacheBotGuilds();
    QueueSlashCommandRegistration();
    await RedisClient.set("Bot:Heartbeat", new Date().toISOString(), "EX", 30);

    setInterval(() => {
      void RunSafely("bot tick", async () => {
        await EnforceGuildAccess();
        await RedisClient.set("Bot:Heartbeat", new Date().toISOString(), "EX", 30);
        await CacheBotGuilds();
        await Loader.DispatchTick();
      });
    }, 10_000);

    console.info(`Bot connected as ${DiscordClient.user?.tag ?? "Unknown"}.`);
  });
});

DiscordClient.on("messageCreate", (Message) => {
  void RunSafely("messageCreate", async () => {
    if (Message.author.bot || !Message.guildId) {
      return;
    }

    await Loader.DispatchMessage(Message);
  });
});

DiscordClient.on("messageDelete", (Message) => {
  void RunSafely("messageDelete", async () => {
    await Loader.DispatchMessageDelete(Message);
  });
});

DiscordClient.on("messageUpdate", (OldMessage, NewMessage) => {
  void RunSafely("messageUpdate", async () => {
    await Loader.DispatchMessageUpdate(OldMessage, NewMessage);
  });
});

DiscordClient.on("guildMemberAdd", (Member) => {
  void RunSafely("guildMemberAdd", async () => {
    await Loader.DispatchGuildMemberAdd(Member);
  });
});

DiscordClient.on("guildMemberRemove", (Member) => {
  void RunSafely("guildMemberRemove", async () => {
    await Loader.DispatchGuildMemberRemove(Member);
  });
});

DiscordClient.on("interactionCreate", (Interaction) => {
  void RunSafely("interactionCreate", async () => {
    if (!Interaction.isChatInputCommand()) {
      return;
    }

    await Loader.DispatchSlashCommand(Interaction);
  });
});

DiscordClient.on("guildCreate", (Guild) => {
  void RunSafely("guildCreate", async () => {
    const GuildAccess = await Prisma.guildAccess.findUnique({
      where: { GuildId: Guild.id }
    });

    if (GuildAccess?.IsAllowed === false) {
      console.warn(`Leaving banned guild ${Guild.id}.`);
      await Guild.leave();
      return;
    }

    await CacheBotGuilds();
    QueueSlashCommandRegistration();
  });
});

DiscordClient.on("error", (ErrorValue) => {
  console.error("Discord client error:", ErrorValue);
});

await DiscordClient.login(DiscordToken);

async function RegisterSlashCommands(CommandDefinitions: CommandDefinition[]): Promise<void> {
  const CommandBodies = CommandDefinitions.map(ConvertCommandDefinition);
  const CommandRegistrationHash = JSON.stringify(CommandBodies);
  const Now = Date.now();

  if (CommandRegistrationHash === LastCommandRegistrationHash && Now - LastCommandRegistrationAt < 60_000) {
    console.info("Skipping slash command registration because commands were recently synced.");
    return;
  }

  if (DiscordGuildId) {
    await PutDiscordCommandsWithRetry(BuildGuildCommandsRoute(DiscordClientId as string, DiscordGuildId), CommandBodies);
    console.info(`Registered ${CommandBodies.length} command(s) for guild ${DiscordGuildId}.`);
    LastCommandRegistrationHash = CommandRegistrationHash;
    LastCommandRegistrationAt = Date.now();
    return;
  }

  for (const Guild of DiscordClient.guilds.cache.values()) {
    await PutDiscordCommandsWithRetry(BuildGuildCommandsRoute(DiscordClientId as string, Guild.id), CommandBodies);
    console.info(`Registered ${CommandBodies.length} command(s) for guild ${Guild.id}.`);
    await Sleep(750);
  }

  LastCommandRegistrationHash = CommandRegistrationHash;
  LastCommandRegistrationAt = Date.now();
}

function QueueSlashCommandRegistration(): void {
  CommandRegistrationPromise = CommandRegistrationPromise
    .then(() => RegisterSlashCommands(Loader.GetCommandDefinitions()))
    .catch((ErrorValue: unknown) => {
      console.error("Slash command registration failed without stopping the bot:", ErrorValue);
    });
}

function ConvertCommandDefinition(CommandDefinitionValue: CommandDefinition): DiscordApplicationCommandBody {
  return {
    name: CommandDefinitionValue.Name,
    description: CommandDefinitionValue.Description,
    options: CommandDefinitionValue.Options?.map(ConvertCommandOptionDefinition)
  };
}

function ConvertCommandOptionDefinition(CommandOptionDefinitionValue: CommandOptionDefinition): DiscordApplicationCommandOptionBody {
  return {
    name: CommandOptionDefinitionValue.Name,
    description: CommandOptionDefinitionValue.Description,
    type: ConvertCommandOptionType(CommandOptionDefinitionValue.Type),
    required: CommandOptionDefinitionValue.Required ?? false,
    choices: CommandOptionDefinitionValue.Choices?.map((Choice) => ({
      name: Choice.Name,
      value: Choice.Value
    }))
  };
}

function ConvertCommandOptionType(TypeName: CommandOptionDefinition["Type"]): DiscordApplicationCommandOptionType {
  switch (TypeName) {
    case "String":
      return DiscordApplicationCommandOptionType.String;
    case "Integer":
      return DiscordApplicationCommandOptionType.Integer;
    case "Boolean":
      return DiscordApplicationCommandOptionType.Boolean;
    case "User":
      return DiscordApplicationCommandOptionType.User;
    case "Channel":
      return DiscordApplicationCommandOptionType.Channel;
    case "Role":
      return DiscordApplicationCommandOptionType.Role;
  }
}

function BuildGlobalCommandsRoute(ApplicationId: string): `/${string}` {
  return `/applications/${ApplicationId}/commands`;
}

function BuildGuildCommandsRoute(ApplicationId: string, GuildId: string): `/${string}` {
  return `/applications/${ApplicationId}/guilds/${GuildId}/commands`;
}

async function PutDiscordCommands(Route: `/${string}`, CommandBodies: DiscordApplicationCommandBody[]): Promise<void> {
  const Response = await fetch(`https://discord.com/api/v10${Route}`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${DiscordToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(CommandBodies)
  });

  if (!Response.ok) {
    throw new Error(`Discord command registration failed: ${Response.status} ${await Response.text()}`);
  }
}

async function PutDiscordCommandsWithRetry(Route: `/${string}`, CommandBodies: DiscordApplicationCommandBody[]): Promise<void> {
  for (let Attempt = 1; Attempt <= 3; Attempt += 1) {
    const Response = await fetch(`https://discord.com/api/v10${Route}`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${DiscordToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(CommandBodies)
    });

    if (Response.ok) {
      return;
    }

    const BodyText = await Response.text();

    if (Response.status === 429) {
      const RetryAfter = ParseRetryAfterMilliseconds(BodyText);
      console.warn(`Discord command registration rate limited. Retrying in ${RetryAfter}ms.`);
      await Sleep(RetryAfter);
      continue;
    }

    throw new Error(`Discord command registration failed: ${Response.status} ${BodyText}`);
  }

  console.warn("Discord command registration is still rate limited after retries. The bot will keep running.");
}

function ParseRetryAfterMilliseconds(BodyText: string): number {
  try {
    const ParsedBody = JSON.parse(BodyText) as { retry_after?: number };
    return Math.ceil((ParsedBody.retry_after ?? 5) * 1000) + 500;
  } catch {
    return 5500;
  }
}

function Sleep(Milliseconds: number): Promise<void> {
  return new Promise((Resolve) => setTimeout(Resolve, Milliseconds));
}

async function RunSafely(Context: string, Task: () => Promise<void>): Promise<void> {
  try {
    await Task();
  } catch (ErrorValue) {
    console.error(`Unhandled bot task error in ${Context}:`, ErrorValue);
  }
}

async function CacheBotGuilds(): Promise<void> {
  const Guilds: BotGuildSummary[] = DiscordClient.guilds.cache.map((Guild) => ({
    Id: Guild.id,
    Name: Guild.name,
    Icon: Guild.iconURL(),
    MemberCount: Guild.memberCount ?? null
  }));

  await RedisClient.set("Bot:Guilds", JSON.stringify(Guilds), "EX", 30);
  await CacheBotChannels();
}

async function CacheBotChannels(): Promise<void> {
  for (const Guild of DiscordClient.guilds.cache.values()) {
    const Channels = Guild.channels.cache
      .filter(IsSupportedDashboardChannel)
      .map<BotChannelSummary>((Channel) => ({
        Id: Channel.id,
        Name: Channel.name,
        Type: ChannelType[Channel.type] ?? String(Channel.type),
        IsWritable: CanBotWriteInChannel(Channel)
      }));

    await RedisClient.set(`Bot:Guild:${Guild.id}:Channels`, JSON.stringify(Channels), "EX", 30);
  }
}

async function EnforceGuildAccess(): Promise<void> {
  const BannedGuilds = await Prisma.guildAccess.findMany({
    where: { IsAllowed: false }
  });
  const BannedGuildIds = new Set(BannedGuilds.map((GuildAccess) => GuildAccess.GuildId));

  for (const Guild of DiscordClient.guilds.cache.values()) {
    if (!BannedGuildIds.has(Guild.id)) {
      continue;
    }

    console.warn(`Leaving banned guild ${Guild.id}.`);
    await Guild.leave();
  }
}

function BuildGatewayIntents(): number[] {
  const Intents: number[] = [
    DiscordGatewayIntentBits.Guilds,
    DiscordGatewayIntentBits.GuildMessages,
    DiscordGatewayIntentBits.GuildModeration,
    DiscordGatewayIntentBits.GuildMembers
  ];

  if (EnableMessageEvents) {
    Intents.push(DiscordGatewayIntentBits.MessageContent);
  }

  return Intents;
}

function IsSupportedDashboardChannel(Channel: GuildBasedChannel): boolean {
  return [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildVoice
  ].includes(Channel.type);
}

function CanBotWriteInChannel(Channel: GuildBasedChannel): boolean {
  const BotMember = Channel.guild.members.me;

  if (!BotMember) {
    return false;
  }

  const Permissions = Channel.permissionsFor(BotMember);

  if (!Permissions) {
    return false;
  }

  if (Channel.type === ChannelType.GuildForum) {
    return Permissions.has(PermissionsBitField.Flags.ViewChannel) && Permissions.has(PermissionsBitField.Flags.CreatePublicThreads);
  }

  if (Channel.type === ChannelType.GuildVoice) {
    return Permissions.has(PermissionsBitField.Flags.ViewChannel);
  }

  return Permissions.has(PermissionsBitField.Flags.ViewChannel) && Permissions.has(PermissionsBitField.Flags.SendMessages);
}
