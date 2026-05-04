import { pathToFileURL } from "node:url";
import Path from "node:path";
import Chokidar from "chokidar";
import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { ChatInputCommandInteraction, Client, GuildMember, Interaction, Message, PartialGuildMember, PartialMessage, VoiceState } from "discord.js";
import { PluginLogger } from "./Logger.js";
import { ScanPluginManifests } from "./PluginScanner.js";
import { PluginStorage } from "./Storage.js";
import type { CommandAliasDefinition, CommandDefinition, LoadedPlugin, PluginConstructor } from "./Types.js";

export class PluginLoader {
  private readonly PluginDirectory: string;
  private readonly Prisma: PrismaClient;
  private readonly RedisClient: Redis;
  private readonly DiscordClient: Client;
  private readonly Plugins = new Map<string, LoadedPlugin>();

  public constructor(PluginDirectory: string, Prisma: PrismaClient, RedisClient: Redis, DiscordClient: Client) {
    this.PluginDirectory = PluginDirectory;
    this.Prisma = Prisma;
    this.RedisClient = RedisClient;
    this.DiscordClient = DiscordClient;
  }

  public async EnableAll(): Promise<void> {
    const ManifestEntries = await ScanPluginManifests(this.PluginDirectory);

    for (const ManifestEntry of ManifestEntries) {
      await this.EnablePlugin(ManifestEntry.Directory);
    }
  }

  public Watch(): void {
    const Watcher = Chokidar.watch(this.PluginDirectory, {
      ignoreInitial: true,
      depth: 3
    });

    Watcher.on("add", (ChangedPath) => this.ReloadFromChangedPath(ChangedPath));
    Watcher.on("change", (ChangedPath) => this.ReloadFromChangedPath(ChangedPath));
    Watcher.on("unlink", (ChangedPath) => this.ReloadFromChangedPath(ChangedPath));
  }

  public async GetCommandDefinitions(): Promise<CommandDefinition[]> {
    const BaseCommands = this.GetBaseCommandDefinitions();
    const Aliases = await this.GetAliasDefinitions();
    const BaseCommandMap = new Map(BaseCommands.map((Command) => [Command.Name, Command]));
    const RegisteredCommandNames = new Set(BaseCommands.map((Command) => Command.Name));
    const AliasCommands: CommandDefinition[] = [];

    for (const Alias of Aliases) {
      const AliasName = Alias.AliasName.trim().toLowerCase();
      const TargetCommandName = Alias.TargetCommandName.trim().toLowerCase();
      const TargetCommand = BaseCommandMap.get(TargetCommandName);

      if (!Alias.Enabled || !this.IsValidSlashCommandName(AliasName) || !TargetCommand || RegisteredCommandNames.has(AliasName)) {
        continue;
      }

      RegisteredCommandNames.add(AliasName);
      AliasCommands.push({
        Name: AliasName,
        Description: Alias.Description?.trim() || `Alias for /${TargetCommandName}`,
        Options: TargetCommand.Options
      });
    }

    return [...BaseCommands, ...AliasCommands];
  }

  public async DispatchMessage(Message: Message): Promise<void> {
    for (const LoadedPluginValue of this.Plugins.values()) {
      await LoadedPluginValue.Instance.OnMessage(Message);
    }
  }

  public async DispatchMessageDelete(Message: Message | PartialMessage): Promise<void> {
    for (const LoadedPluginValue of this.Plugins.values()) {
      await LoadedPluginValue.Instance.OnMessageDelete(Message);
    }
  }

  public async DispatchMessageUpdate(OldMessage: Message | PartialMessage, NewMessage: Message | PartialMessage): Promise<void> {
    for (const LoadedPluginValue of this.Plugins.values()) {
      await LoadedPluginValue.Instance.OnMessageUpdate(OldMessage, NewMessage);
    }
  }

  public async DispatchGuildMemberAdd(Member: GuildMember): Promise<void> {
    for (const LoadedPluginValue of this.Plugins.values()) {
      await LoadedPluginValue.Instance.OnGuildMemberAdd(Member);
    }
  }

  public async DispatchGuildMemberRemove(Member: GuildMember | PartialGuildMember): Promise<void> {
    for (const LoadedPluginValue of this.Plugins.values()) {
      await LoadedPluginValue.Instance.OnGuildMemberRemove(Member);
    }
  }

  public async DispatchVoiceStateUpdate(OldState: VoiceState, NewState: VoiceState): Promise<void> {
    for (const LoadedPluginValue of this.Plugins.values()) {
      await LoadedPluginValue.Instance.OnVoiceStateUpdate(OldState, NewState);
    }
  }

  public async DispatchTick(): Promise<void> {
    for (const LoadedPluginValue of this.Plugins.values()) {
      await LoadedPluginValue.Instance.OnTick();
    }
  }

  public async DispatchDashboardAction(PluginId: string, GuildId: string, ActionKey: string, ActorId: string, Payload?: unknown): Promise<void> {
    const LoadedPluginValue = this.Plugins.get(PluginId);

    if (!LoadedPluginValue) {
      return;
    }

    await LoadedPluginValue.Instance.OnDashboardAction(GuildId, ActionKey, ActorId, Payload);
  }

  public async DispatchInteraction(InteractionValue: Interaction): Promise<void> {
    for (const LoadedPluginValue of this.Plugins.values()) {
      await LoadedPluginValue.Instance.OnInteraction(InteractionValue);
    }
  }

  public async DispatchSlashCommand(Interaction: ChatInputCommandInteraction): Promise<void> {
    const CommandName = Interaction.commandName;
    const ResolvedCommandName = await this.ResolveCommandName(CommandName);
    const LoadedPluginValue = Array.from(this.Plugins.values()).find((PluginValue) =>
      PluginValue.Manifest.Commands.some((CommandDefinition) => CommandDefinition.Name === ResolvedCommandName)
    );

    if (!LoadedPluginValue) {
      await Interaction.reply({ content: "Plugin command not found.", ephemeral: true });
      return;
    }

    await LoadedPluginValue.Instance.OnSlashCommand(ResolvedCommandName, Interaction);
  }

  private GetBaseCommandDefinitions(): CommandDefinition[] {
    return Array.from(this.Plugins.values()).flatMap((LoadedPluginValue) => LoadedPluginValue.Manifest.Commands);
  }

  private async ResolveCommandName(CommandName: string): Promise<string> {
    const BaseCommandNames = new Set(this.GetBaseCommandDefinitions().map((Command) => Command.Name));

    if (BaseCommandNames.has(CommandName)) {
      return CommandName;
    }

    const Alias = (await this.GetAliasDefinitions()).find(
      (AliasValue) => AliasValue.Enabled && AliasValue.AliasName.trim().toLowerCase() === CommandName
    );

    return Alias?.TargetCommandName.trim().toLowerCase() ?? CommandName;
  }

  private async GetAliasDefinitions(): Promise<CommandAliasDefinition[]> {
    const Storage = new PluginStorage(this.Prisma, this.RedisClient, "CommandAliases");
    const Aliases = await Storage.GetGlobalConfig<unknown>("Global", "Aliases");

    if (!Array.isArray(Aliases)) {
      return [];
    }

    return Aliases.filter(this.IsCommandAliasDefinition).map((Alias) => ({
      AliasName: Alias.AliasName,
      TargetCommandName: Alias.TargetCommandName,
      Description: Alias.Description,
      Enabled: Alias.Enabled ?? true
    }));
  }

  private IsCommandAliasDefinition(Value: unknown): Value is CommandAliasDefinition {
    if (typeof Value !== "object" || Value === null || Array.isArray(Value)) {
      return false;
    }

    const RecordValue = Value as Record<string, unknown>;
    return typeof RecordValue.AliasName === "string" && typeof RecordValue.TargetCommandName === "string";
  }

  private IsValidSlashCommandName(CommandName: string): boolean {
    return /^[a-z0-9_-]{1,32}$/u.test(CommandName);
  }

  private async EnablePlugin(Directory: string): Promise<void> {
    const ManifestEntry = (await ScanPluginManifests(this.PluginDirectory)).find(
      (Entry) => Path.resolve(Entry.Directory) === Path.resolve(Directory)
    );

    if (!ManifestEntry) {
      return;
    }

    const PluginId = ManifestEntry.Manifest.Metadata.Id;
    await this.DisablePlugin(PluginId);

    const EntryPointPath = this.ResolveEntryPoint(ManifestEntry.Directory, ManifestEntry.Manifest.EntryPoint);
    const ModuleUrl = `${pathToFileURL(EntryPointPath).href}?Reload=${Date.now()}`;
    const ImportedModule = (await import(ModuleUrl)) as { default?: PluginConstructor; Plugin?: PluginConstructor };
    const PluginClass = ImportedModule.default ?? ImportedModule.Plugin;

    if (!PluginClass) {
      throw new Error(`Plugin ${PluginId} does not export a plugin class.`);
    }

    const Instance = new PluginClass({
      Manifest: ManifestEntry.Manifest,
      Storage: new PluginStorage(this.Prisma, this.RedisClient, PluginId),
      Logger: new PluginLogger(ManifestEntry.Manifest.Metadata.DisplayName),
      DiscordClient: this.DiscordClient
    });

    await Instance.OnEnable();
    this.Plugins.set(PluginId, {
      Manifest: ManifestEntry.Manifest,
      Instance,
      Directory: ManifestEntry.Directory
    });
  }

  private async DisablePlugin(PluginId: string): Promise<void> {
    const LoadedPluginValue = this.Plugins.get(PluginId);

    if (!LoadedPluginValue) {
      return;
    }

    await LoadedPluginValue.Instance.OnDisable();
    this.Plugins.delete(PluginId);
  }

  private async ReloadFromChangedPath(ChangedPath: string): Promise<void> {
    const Directory = this.ResolvePluginDirectory(ChangedPath);

    if (!Directory) {
      return;
    }

    await this.EnablePlugin(Directory);
  }

  private ResolvePluginDirectory(ChangedPath: string): string | null {
    const RelativePath = Path.relative(this.PluginDirectory, ChangedPath);
    const DirectoryName = RelativePath.split(Path.sep)[0];

    if (!DirectoryName || DirectoryName.startsWith("..")) {
      return null;
    }

    return Path.join(this.PluginDirectory, DirectoryName);
  }

  private ResolveEntryPoint(Directory: string, EntryPoint: string): string {
    const CandidatePath = Path.resolve(Directory, EntryPoint);

    if (process.env.NODE_ENV === "production" && CandidatePath.endsWith(".ts")) {
      return CandidatePath.replace(/\.ts$/, ".js");
    }

    return CandidatePath;
  }
}
