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
import { GetGuildEmojiLimits } from "../Core/DiscordLimits.js";
import { PluginLoader } from "../Core/PluginLoader.js";
import { ScanPluginManifests } from "../Core/PluginScanner.js";
import { GetDisabledPluginIds, IsPluginDisabled, SetPluginDisabled } from "../Core/PluginState.js";
import type { BotChannelSummary, BotEmojiLimitSummary, BotEmojiSummary, BotGuildSummary, BotMemberSummary, BotRoleSummary, CommandDefinition, CommandOptionDefinition } from "../Core/Types.js";

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
  GuildMessageReactions: 1024,
  GuildModeration: 4,
  GuildMembers: 2,
  GuildVoiceStates: 128,
  GuildPresences: 65536,
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

type DashboardPluginAction = {
  BotId: string;
  GuildId: string;
  PluginId: string;
  ActionKey: string;
  ActorId: string;
  CreatedAt: string;
  Payload?: unknown;
};

type DashboardPluginControlAction = {
  BotId: string;
  PluginId: string;
  Action: "Enable" | "Disable" | "Reload";
  ActorId: string;
  CreatedAt: string;
};

const EnableMessageEvents = process.env.ENABLE_MESSAGE_EVENTS !== "false";
const PluginDirectory = Path.resolve(process.env.PLUGIN_DIRECTORY ?? "Plugins");

console.log(`[Bot] Message events ${EnableMessageEvents ? "enabled" : "disabled"}.`);

class BotInstance {
  public readonly DiscordClient: Client;
  public readonly Loader: PluginLoader;
  private LastCommandRegistrationHash = "";
  private LastCommandRegistrationAt = 0;
  private CommandRegistrationPromise: Promise<void> = Promise.resolve();
  private readonly MemberCacheHydratedGuildIds = new Set<string>();
  private readonly BotId: string;
  private readonly Token: string;
  private readonly ClientId: string;

  constructor(BotId: string, Token: string, ClientId: string) {
    this.BotId = BotId;
    this.Token = Token;
    this.ClientId = ClientId;

    this.DiscordClient = new Client({
      intents: BuildGatewayIntents(),
      partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember, Partials.User]
    });

    this.Loader = new PluginLoader(PluginDirectory, Prisma, RedisClient, this.DiscordClient, BotId);
    this.RegisterEvents();
  }

  public async Start(): Promise<void> {
    await this.DiscordClient.login(this.Token);
  }

  public async Stop(): Promise<void> {
    await this.DiscordClient.destroy();
  }

  private RegisterEvents(): void {
    this.DiscordClient.once("clientReady", () => {
      void RunSafely(`clientReady:${this.BotId}`, async () => {
        await this.Loader.EnableAll();
        this.Loader.Watch();
        await this.EnforceGuildAccess();
        await this.CacheBotGuilds();
        await this.CachePluginStates();
        this.QueueSlashCommandRegistration();
        await RedisClient.set(`Bot:${this.BotId}:Heartbeat`, new Date().toISOString(), "EX", 30);

        setInterval(() => {
          void RunSafely(`bot tick:${this.BotId}`, async () => {
            await this.ProcessGuildCommands();
            await this.EnforceGuildAccess();
            await RedisClient.set(`Bot:${this.BotId}:Heartbeat`, new Date().toISOString(), "EX", 30);
            await this.CacheBotGuilds();
            await this.Loader.DispatchTick();
          });
        }, 10_000);

        console.info(`Bot ${this.BotId} connected as ${this.DiscordClient.user?.tag ?? "Unknown"}.`);
      });
    });

    this.DiscordClient.on("messageCreate", (Message) => {
      void RunSafely(`messageCreate:${this.BotId}`, async () => {
        if (Message.author.bot || !Message.guildId) {
          return;
        }
        await this.Loader.DispatchMessage(Message);
      });
    });

    this.DiscordClient.on("messageDelete", (Message) => {
      void RunSafely(`messageDelete:${this.BotId}`, async () => {
        await this.Loader.DispatchMessageDelete(Message);
      });
    });

    this.DiscordClient.on("messageUpdate", (OldMessage, NewMessage) => {
      void RunSafely(`messageUpdate:${this.BotId}`, async () => {
        await this.Loader.DispatchMessageUpdate(OldMessage, NewMessage);
      });
    });

    this.DiscordClient.on("messageReactionAdd", (Reaction, UserValue) => {
      void RunSafely(`messageReactionAdd:${this.BotId}`, async () => {
        if (UserValue.bot) {
          return;
        }

        const FullReaction = Reaction.partial ? await Reaction.fetch() : Reaction;
        await this.Loader.DispatchMessageReactionAdd(FullReaction, UserValue);
      });
    });

    this.DiscordClient.on("guildMemberAdd", (Member) => {
      void RunSafely(`guildMemberAdd:${this.BotId}`, async () => {
        await this.Loader.DispatchGuildMemberAdd(Member);
      });
    });

    this.DiscordClient.on("guildMemberRemove", (Member) => {
      void RunSafely(`guildMemberRemove:${this.BotId}`, async () => {
        await this.Loader.DispatchGuildMemberRemove(Member);
      });
    });

    this.DiscordClient.on("voiceStateUpdate", (OldState, NewState) => {
      void RunSafely(`voiceStateUpdate:${this.BotId}`, async () => {
        await this.Loader.DispatchVoiceStateUpdate(OldState, NewState);
      });
    });

    this.DiscordClient.on("interactionCreate", (Interaction) => {
      void RunSafely(`interactionCreate:${this.BotId}`, async () => {
        if (!Interaction.isChatInputCommand()) {
          await this.Loader.DispatchInteraction(Interaction);
          return;
        }
        await this.Loader.DispatchSlashCommand(Interaction);
      });
    });

    this.DiscordClient.on("guildCreate", (Guild) => {
      void RunSafely(`guildCreate:${this.BotId}`, async () => {
        if (!(await this.IsInviteAllowed())) {
          console.warn(`Bot ${this.BotId} leaving guild ${Guild.id} (invites not allowed).`);
          await Guild.leave();
          return;
        }

        const GuildAccess = await Prisma.guildAccess.findUnique({
          where: { BotId_GuildId: { BotId: this.BotId, GuildId: Guild.id } }
        });

        if (GuildAccess?.IsAllowed === false) {
          console.warn(`Bot ${this.BotId} leaving banned guild ${Guild.id}.`);
          await Guild.leave();
          return;
        }

        await this.CacheBotGuilds();
        this.QueueSlashCommandRegistration();
      });
    });

    this.DiscordClient.on("error", (ErrorValue) => {
      console.error(`Discord client error for bot ${this.BotId}:`, ErrorValue);
    });
  }

  public async CacheBotGuilds(): Promise<void> {
    const Guilds: BotGuildSummary[] = this.DiscordClient.guilds.cache.map((Guild) => ({
      Id: Guild.id,
      Name: Guild.name,
      Icon: Guild.iconURL(),
      MemberCount: Guild.memberCount ?? null
    }));

    await RedisClient.set(`Bot:${this.BotId}:Guilds`, JSON.stringify(Guilds), "EX", 30);
    await this.CacheBotChannels();
    await this.CacheBotRoles();
    await this.CacheBotMembers();
    await this.CacheBotEmojis();
  }

  public async CacheBotRoles(): Promise<void> {
    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      const Roles = Guild.roles.cache
        .filter((Role) => Role.id !== Guild.id && !Role.managed)
        .sort((FirstRole, SecondRole) => SecondRole.position - FirstRole.position)
        .map<BotRoleSummary>((Role) => ({
          Id: Role.id,
          Name: Role.name,
          Color: Role.color,
          Position: Role.position
        }));

      await RedisClient.set(`Bot:${this.BotId}:Guild:${Guild.id}:Roles`, JSON.stringify(Roles), "EX", 30);
    }
  }

  public async CacheBotChannels(): Promise<void> {
    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      const Channels = Guild.channels.cache
        .filter(IsSupportedDashboardChannel)
        .map<BotChannelSummary>((Channel) => ({
          Id: Channel.id,
          Name: Channel.name,
          Type: ChannelType[Channel.type] ?? String(Channel.type),
          IsWritable: CanBotWriteInChannel(Channel)
        }));

      await RedisClient.set(`Bot:${this.BotId}:Guild:${Guild.id}:Channels`, JSON.stringify(Channels), "EX", 30);
    }
  }

  public async CacheBotMembers(): Promise<void> {
    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      if (!this.MemberCacheHydratedGuildIds.has(Guild.id)) {
        await Guild.members.fetch().then(() => {
          this.MemberCacheHydratedGuildIds.add(Guild.id);
        }).catch((ErrorValue: unknown) => {
          console.warn(`Could not hydrate member cache for guild ${Guild.id}:`, ErrorValue);
          this.MemberCacheHydratedGuildIds.add(Guild.id);
        });
      }

      const Members = Guild.members.cache
        .filter((Member) => !Member.user.bot)
        .sort((FirstMember, SecondMember) => FirstMember.displayName.localeCompare(SecondMember.displayName))
        .map<BotMemberSummary>((Member) => ({
          Id: Member.id,
          DisplayName: Member.displayName,
          Username: Member.user.username
        }));

      await RedisClient.set(`Bot:${this.BotId}:Guild:${Guild.id}:Members`, JSON.stringify(Members), "EX", 30);
    }
  }

  public async CacheBotEmojis(): Promise<void> {
    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      const Emojis = Guild.emojis.cache
        .sort((FirstEmoji, SecondEmoji) => (FirstEmoji.name ?? "").localeCompare(SecondEmoji.name ?? ""))
        .map<BotEmojiSummary>((Emoji) => ({
          Id: Emoji.id,
          Name: Emoji.name ?? Emoji.id,
          Animated: Emoji.animated ?? false
        }));
      const EmojiLimits: BotEmojiLimitSummary = GetGuildEmojiLimits(Guild.premiumTier);

      await RedisClient.set(`Bot:${this.BotId}:Guild:${Guild.id}:Emojis`, JSON.stringify(Emojis), "EX", 30);
      await RedisClient.set(`Bot:${this.BotId}:Guild:${Guild.id}:EmojiLimits`, JSON.stringify(EmojiLimits), "EX", 30);
    }
  }

  public async CachePluginStates(): Promise<void> {
    const ManifestEntries = await ScanPluginManifests(PluginDirectory);
    const LoadedPluginIds = new Set(this.Loader.GetLoadedPluginIds());
    const DisabledPluginIds = new Set(await GetDisabledPluginIds(Prisma, this.BotId));
    const PluginStates = ManifestEntries.map((Entry) => ({
      Id: Entry.Manifest.Metadata.Id,
      Loaded: LoadedPluginIds.has(Entry.Manifest.Metadata.Id),
      Disabled: DisabledPluginIds.has(Entry.Manifest.Metadata.Id),
      DisplayName: Entry.Manifest.Metadata.DisplayName,
      Scope: Entry.Manifest.Scope
    }));

    await RedisClient.set(`Bot:${this.BotId}:Plugins`, JSON.stringify(PluginStates), "EX", 30);
  }

  public async EnforceGuildAccess(): Promise<void> {
    const BannedGuilds = await Prisma.guildAccess.findMany({
      where: { BotId: this.BotId, IsAllowed: false }
    });
    const BannedGuildIds = new Set(BannedGuilds.map((GuildAccess) => GuildAccess.GuildId));

    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      if (!BannedGuildIds.has(Guild.id)) {
        continue;
      }

      console.warn(`Bot ${this.BotId} leaving banned guild ${Guild.id}.`);
      await Guild.leave();
    }
  }

  public async ProcessGuildCommands(): Promise<void> {
    while (true) {
      const Raw = await RedisClient.lpop(`Bot:${this.BotId}:Commands`);
      if (!Raw) break;

      try {
        const Command = JSON.parse(Raw) as { type: string; guildId: string };
        if (Command.type === "LeaveGuild") {
          const Guild = this.DiscordClient.guilds.cache.get(Command.guildId);
          if (Guild) {
            console.warn(`Bot ${this.BotId} leaving guild ${Command.guildId} (dashboard command).`);
            await Guild.leave();
          }
        }
      } catch (ErrorValue) {
        console.error(`Bot ${this.BotId} failed to process command:`, ErrorValue);
      }
    }
  }

  private async IsInviteAllowed(): Promise<boolean> {
    const Cached = await RedisClient.get(`Bot:${this.BotId}:AllowInvite`);
    if (Cached !== null) {
      return Cached === "1";
    }
    const Bot = await Prisma.discordBot.findUnique({
      where: { Id: this.BotId },
      select: { AllowInvite: true }
    });
    const Allowed = Bot?.AllowInvite ?? true;
    await RedisClient.set(`Bot:${this.BotId}:AllowInvite`, Allowed ? "1" : "0");
    return Allowed;
  }

  public QueueSlashCommandRegistration(): void {
    this.CommandRegistrationPromise = this.CommandRegistrationPromise
      .then(async () => this.RegisterSlashCommands(await this.Loader.GetCommandDefinitions()))
      .catch((ErrorValue: unknown) => {
        console.error(`Slash command registration failed for bot ${this.BotId}:`, ErrorValue);
      });
  }

  private async RegisterSlashCommands(CommandDefinitions: CommandDefinition[]): Promise<void> {
    const CommandBodies = CommandDefinitions.map(ConvertCommandDefinition);
    const CommandRegistrationHash = JSON.stringify(CommandBodies);
    const Now = Date.now();

    if (CommandRegistrationHash === this.LastCommandRegistrationHash && Now - this.LastCommandRegistrationAt < 60_000) {
      return;
    }

    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      await PutDiscordCommandsWithRetry(this.Token, BuildGuildCommandsRoute(this.ClientId, Guild.id), CommandBodies);
      await Sleep(750);
    }

    this.LastCommandRegistrationHash = CommandRegistrationHash;
    this.LastCommandRegistrationAt = Date.now();
  }
}

const Bots = new Map<string, BotInstance>();

async function SyncBots(): Promise<void> {
  const DBBots = await Prisma.discordBot.findMany({
    where: { IsEnabled: true }
  });

  const ActiveBotIds = new Set(DBBots.map((B) => B.Id));

  for (const [BotId, Instance] of Bots.entries()) {
    if (!ActiveBotIds.has(BotId)) {
      console.info(`Stopping bot ${BotId}...`);
      await Instance.Stop();
      Bots.delete(BotId);
    }
  }

  for (const DBBot of DBBots) {
    if (!Bots.has(DBBot.Id)) {
      console.info(`Starting bot ${DBBot.Name} (${DBBot.Id})...`);
      const Instance = new BotInstance(DBBot.Id, DBBot.Token, DBBot.ClientId);
      Bots.set(DBBot.Id, Instance);
      await Instance.Start();
    }
  }
}

async function Main(): Promise<void> {
  await SyncBots();

  setInterval(() => {
    void RunSafely("sync bots", async () => {
      await SyncBots();
    });
  }, 30_000);

  setInterval(() => {
    void RunSafely("dashboard actions", async () => {
      await ProcessDashboardPluginControlActions();
      await ProcessDashboardPluginActions();
    });
  }, 1000);
}

void Main();

async function ProcessDashboardPluginActions(): Promise<void> {
  for (let Index = 0; Index < 25; Index += 1) {
    const RawAction = await RedisClient.rpop("Dashboard:PluginActions");
    if (!RawAction) return;

    try {
      const Action = JSON.parse(RawAction) as DashboardPluginAction;
      const Instance = Bots.get(Action.BotId);
      if (!Instance) {
        console.warn("Dashboard plugin action ignored because the target bot is not running.", {
          BotId: Action.BotId,
          GuildId: Action.GuildId,
          PluginId: Action.PluginId,
          ActionKey: Action.ActionKey
        });
        continue;
      }

      await Instance.Loader.DispatchDashboardAction(Action.PluginId, Action.GuildId, Action.ActionKey, Action.ActorId, Action.Payload);
    } catch (ErrorValue) {
      console.error("Dashboard plugin action failed:", ErrorValue);
    }
  }
}

async function ProcessDashboardPluginControlActions(): Promise<void> {
  for (let Index = 0; Index < 25; Index += 1) {
    const RawAction = await RedisClient.rpop("Dashboard:PluginControlActions");
    if (!RawAction) return;

    try {
      const Action = JSON.parse(RawAction) as DashboardPluginControlAction;
      const Instance = Bots.get(Action.BotId);
      if (!Instance) continue;

      await ApplyDashboardPluginControlAction(Instance, Action);
      await Prisma.auditLog.create({
        data: {
          ActorId: Action.ActorId,
          Action: `Plugin${Action.Action}`,
          Target: `${Action.BotId}:${Action.PluginId}`,
          Metadata: {
            Source: "SuperAdminPanel",
            CreatedAt: Action.CreatedAt
          }
        }
      });
      Instance.QueueSlashCommandRegistration();
      await Instance.CachePluginStates();
    } catch (ErrorValue) {
      console.error("Dashboard plugin control action failed:", ErrorValue);
    }
  }
}

async function ApplyDashboardPluginControlAction(Instance: BotInstance, Action: DashboardPluginControlAction): Promise<void> {
  switch (Action.Action) {
    case "Enable":
      await SetPluginDisabled(Prisma, Action.BotId, Action.PluginId, false);
      await Instance.Loader.EnablePlugin(Action.PluginId);
      return;
    case "Disable":
      await Instance.Loader.DisablePlugin(Action.PluginId);
      await SetPluginDisabled(Prisma, Action.BotId, Action.PluginId, true);
      return;
    case "Reload":
      if (await IsPluginDisabled(Prisma, Action.BotId, Action.PluginId)) {
        throw new Error(`Plugin ${Action.PluginId} is disabled for bot ${Action.BotId} and cannot be reloaded.`);
      }
      await Instance.Loader.ReloadPlugin(Action.PluginId);
      return;
  }
}

function BuildGatewayIntents(): number[] {
  const Intents: number[] = [
    DiscordGatewayIntentBits.Guilds,
    DiscordGatewayIntentBits.GuildMessages,
    DiscordGatewayIntentBits.GuildMessageReactions,
    DiscordGatewayIntentBits.GuildModeration,
    DiscordGatewayIntentBits.GuildMembers,
    DiscordGatewayIntentBits.GuildVoiceStates,
    DiscordGatewayIntentBits.GuildPresences
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
    ChannelType.GuildCategory,
    ChannelType.GuildForum,
    ChannelType.GuildVoice
  ].includes(Channel.type);
}

function CanBotWriteInChannel(Channel: GuildBasedChannel): boolean {
  const BotMember = Channel.guild.members.me;
  if (!BotMember) return false;
  const Permissions = Channel.permissionsFor(BotMember);
  if (!Permissions) return false;
  if (Channel.type === ChannelType.GuildForum) {
    return Permissions.has(PermissionsBitField.Flags.ViewChannel) && Permissions.has(PermissionsBitField.Flags.CreatePublicThreads);
  }
  if (Channel.type === ChannelType.GuildCategory) {
    return Permissions.has(PermissionsBitField.Flags.ViewChannel);
  }
  if (Channel.type === ChannelType.GuildVoice) {
    return Permissions.has(PermissionsBitField.Flags.ViewChannel);
  }
  return Permissions.has(PermissionsBitField.Flags.ViewChannel) && Permissions.has(PermissionsBitField.Flags.SendMessages);
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
    case "String": return DiscordApplicationCommandOptionType.String;
    case "Integer": return DiscordApplicationCommandOptionType.Integer;
    case "Boolean": return DiscordApplicationCommandOptionType.Boolean;
    case "User": return DiscordApplicationCommandOptionType.User;
    case "Channel": return DiscordApplicationCommandOptionType.Channel;
    case "Role": return DiscordApplicationCommandOptionType.Role;
  }
}

function BuildGuildCommandsRoute(ApplicationId: string, GuildId: string): `/${string}` {
  return `/applications/${ApplicationId}/guilds/${GuildId}/commands`;
}

async function PutDiscordCommandsWithRetry(Token: string, Route: `/${string}`, CommandBodies: DiscordApplicationCommandBody[]): Promise<void> {
  for (let Attempt = 1; Attempt <= 3; Attempt += 1) {
    const Response = await fetch(`https://discord.com/api/v10${Route}`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${Token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(CommandBodies)
    });

    if (Response.ok) return;

    const BodyText = await Response.text();
    if (Response.status === 429) {
      const RetryAfter = ParseRetryAfterMilliseconds(BodyText);
      console.warn(`Discord command registration rate limited. Retrying in ${RetryAfter}ms.`);
      await Sleep(RetryAfter);
      continue;
    }
    throw new Error(`Discord command registration failed: ${Response.status} ${BodyText}`);
  }
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
