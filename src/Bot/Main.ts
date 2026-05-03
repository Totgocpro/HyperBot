import "dotenv/config";
import {
  Client,
} from "discord.js";
import Path from "node:path";
import { Prisma, RedisClient } from "../Core/Clients.js";
import { PluginLoader } from "../Core/PluginLoader.js";
import type { BotGuildSummary, CommandDefinition, CommandOptionDefinition } from "../Core/Types.js";

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
  intents: BuildGatewayIntents()
});

const Loader = new PluginLoader(PluginDirectory, Prisma, RedisClient, DiscordClient);

DiscordClient.once("ready", async () => {
  await Loader.EnableAll();
  Loader.Watch();
  await EnforceGuildAccess();
  await CacheBotGuilds();
  await RegisterSlashCommands(Loader.GetCommandDefinitions());
  await RedisClient.set("Bot:Heartbeat", new Date().toISOString(), "EX", 30);

  setInterval(async () => {
    await EnforceGuildAccess();
    await RedisClient.set("Bot:Heartbeat", new Date().toISOString(), "EX", 30);
    await CacheBotGuilds();
    await Loader.DispatchTick();
  }, 10_000);

  console.info(`Bot connected as ${DiscordClient.user?.tag ?? "Unknown"}.`);
});

DiscordClient.on("messageCreate", async (Message) => {
  if (Message.author.bot || !Message.guildId) {
    return;
  }

  await Loader.DispatchMessage(Message);
});

DiscordClient.on("interactionCreate", async (Interaction) => {
  if (!Interaction.isChatInputCommand()) {
    return;
  }

  await Loader.DispatchSlashCommand(Interaction);
});

DiscordClient.on("guildCreate", async (Guild) => {
  const GuildAccess = await Prisma.guildAccess.findUnique({
    where: { GuildId: Guild.id }
  });

  if (GuildAccess?.IsAllowed === false) {
    console.warn(`Leaving banned guild ${Guild.id}.`);
    await Guild.leave();
    return;
  }

  await CacheBotGuilds();
  await RegisterSlashCommands(Loader.GetCommandDefinitions());
});

await DiscordClient.login(DiscordToken);

async function RegisterSlashCommands(CommandDefinitions: CommandDefinition[]): Promise<void> {
  const CommandBodies = CommandDefinitions.map(ConvertCommandDefinition);

  if (DiscordGuildId) {
    await PutDiscordCommands(BuildGuildCommandsRoute(DiscordClientId as string, DiscordGuildId), CommandBodies);
    console.info(`Registered ${CommandBodies.length} command(s) for guild ${DiscordGuildId}.`);
    return;
  }

  for (const Guild of DiscordClient.guilds.cache.values()) {
    await PutDiscordCommands(BuildGuildCommandsRoute(DiscordClientId as string, Guild.id), CommandBodies);
    console.info(`Registered ${CommandBodies.length} command(s) for guild ${Guild.id}.`);
  }
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

async function CacheBotGuilds(): Promise<void> {
  const Guilds: BotGuildSummary[] = DiscordClient.guilds.cache.map((Guild) => ({
    Id: Guild.id,
    Name: Guild.name,
    Icon: Guild.iconURL(),
    MemberCount: Guild.memberCount ?? null
  }));

  await RedisClient.set("Bot:Guilds", JSON.stringify(Guilds), "EX", 30);
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
  const Intents: number[] = [DiscordGatewayIntentBits.Guilds];

  if (EnableMessageEvents) {
    Intents.push(DiscordGatewayIntentBits.GuildMessages, DiscordGatewayIntentBits.MessageContent);
  }

  return Intents;
}
