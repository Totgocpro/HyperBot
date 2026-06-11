import { pathToFileURL } from "node:url";
import Path from "node:path";
import Chokidar from "chokidar";
import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type GuildMember,
  type Interaction,
  type Message,
  type MessageReaction,
  type PartialGuildMember,
  type PartialMessage,
  type PartialUser,
  type StringSelectMenuInteraction,
  type User,
  type VoiceState
} from "discord.js";
import { PluginLogger } from "./Logger.js";
import { ScanPluginManifests } from "./PluginScanner.js";
import { IsPluginDisabled } from "./PluginState.js";
import { PluginStorage } from "./Storage.js";
import { PluginScope } from "./Types.js";
import type { CommandAliasDefinition, CommandDefinition, CommandOptionDefinition, LoadedPlugin, PluginConstructor } from "./Types.js";

const HelpCommandName = "help";
const HelpSelectCustomIdPrefix = "HyperBotHelp:";
const MaxDiscordSelectOptions = 25;
const HyperBotColor = 0x5865f2;

export class PluginLoader {
  private readonly PluginDirectory: string;
  private readonly Prisma: PrismaClient;
  private readonly RedisClient: Redis;
  private readonly DiscordClient: Client;
  private readonly BotId: string;
  private readonly Plugins = new Map<string, LoadedPlugin>();

  public constructor(PluginDirectory: string, Prisma: PrismaClient, RedisClient: Redis, DiscordClient: Client, BotId: string) {
    this.PluginDirectory = PluginDirectory;
    this.Prisma = Prisma;
    this.RedisClient = RedisClient;
    this.DiscordClient = DiscordClient;
    this.BotId = BotId;
  }

  public async EnableAll(): Promise<void> {
    const ManifestEntries = await ScanPluginManifests(this.PluginDirectory);

    for (const ManifestEntry of ManifestEntries) {
      if (ManifestEntry.Manifest.Scope !== PluginScope.Global && await IsPluginDisabled(this.Prisma, this.BotId, ManifestEntry.Manifest.Metadata.Id)) {
        continue;
      }

      await this.EnablePluginFromDirectory(ManifestEntry.Directory);
    }
  }

  public async EnablePlugin(PluginId: string): Promise<void> {
    const ManifestEntry = (await ScanPluginManifests(this.PluginDirectory)).find((Entry) => Entry.Manifest.Metadata.Id === PluginId);

    if (!ManifestEntry) {
      throw new Error(`Plugin ${PluginId} not found.`);
    }

    await this.EnablePluginFromDirectory(ManifestEntry.Directory);
  }

  public async DisablePlugin(PluginId: string): Promise<void> {
    await this.DisableLoadedPlugin(PluginId);
  }

  public async ReloadPlugin(PluginId: string): Promise<void> {
    await this.EnablePlugin(PluginId);
  }

  public GetLoadedPluginIds(): string[] {
    return Array.from(this.Plugins.keys());
  }

  public Watch(): void {
    const Watcher = Chokidar.watch(this.PluginDirectory, {
      ignoreInitial: true,
      depth: 3
    });

    Watcher.on("swan", (ChangedPath) => this.ReloadFromChangedPath(ChangedPath));
    Watcher.on("add", (ChangedPath) => this.ReloadFromChangedPath(ChangedPath));
    Watcher.on("change", (ChangedPath) => this.ReloadFromChangedPath(ChangedPath));
    Watcher.on("unlink", (ChangedPath) => this.ReloadFromChangedPath(ChangedPath));
  }

  public async GetCommandDefinitions(): Promise<CommandDefinition[]> {
    const BaseCommands = [this.BuildHelpCommandDefinition(), ...this.GetBaseCommandDefinitions()];
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

  public async DispatchMessageReactionAdd(Reaction: MessageReaction, UserValue: User | PartialUser): Promise<void> {
    for (const LoadedPluginValue of this.Plugins.values()) {
      await LoadedPluginValue.Instance.OnMessageReactionAdd(Reaction, UserValue);
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

  public async DispatchDashboardAction(PluginId: string, GuildId: string, ActionKey: string, ActorId: string, Payload?: unknown): Promise<boolean> {
    const LoadedPluginValue = this.Plugins.get(PluginId);

    if (!LoadedPluginValue) {
      console.warn("Dashboard plugin action ignored because the plugin is not loaded.", {
        BotId: this.BotId,
        GuildId,
        PluginId,
        ActionKey,
        ActorId
      });
      return false;
    }

    await LoadedPluginValue.Instance.OnDashboardAction(GuildId, ActionKey, ActorId, Payload);
    return true;
  }

  public async DispatchInteraction(InteractionValue: Interaction): Promise<void> {
    if (InteractionValue.isStringSelectMenu() && InteractionValue.customId.startsWith(HelpSelectCustomIdPrefix)) {
      await this.HandleHelpSelect(InteractionValue);
      return;
    }

    for (const LoadedPluginValue of this.Plugins.values()) {
      await LoadedPluginValue.Instance.OnInteraction(InteractionValue);
    }
  }

  public async DispatchSlashCommand(Interaction: ChatInputCommandInteraction): Promise<void> {
    const CommandName = Interaction.commandName;

    if (CommandName === HelpCommandName) {
      await this.HandleHelpCommand(Interaction);
      return;
    }

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
    return Array.from(this.Plugins.values()).flatMap((LoadedPluginValue) =>
      LoadedPluginValue.Manifest.Commands.filter((Command) => Command.Name !== HelpCommandName)
    );
  }

  private BuildHelpCommandDefinition(): CommandDefinition {
    const Modules = this.GetHelpModules();

    return {
      Name: HelpCommandName,
      Description: "Show HyperBot help.",
      Options: [
        {
          Name: "module",
          Description: "Module to show help for.",
          Type: "String",
          Required: false,
          Choices: Modules.length <= MaxDiscordSelectOptions ? Modules.map((PluginValue) => ({
            Name: this.Truncate(PluginValue.Manifest.Metadata.DisplayName, 100),
            Value: PluginValue.Manifest.Metadata.Id
          })) : undefined
        }
      ]
    };
  }

  private async HandleHelpCommand(Interaction: ChatInputCommandInteraction): Promise<void> {
    const RequestedModule = Interaction.options.getString("module")?.trim();

    if (RequestedModule) {
      const PluginValue = this.FindHelpModule(RequestedModule);

      if (!PluginValue) {
        await Interaction.reply({ content: "Unknown help module.", ephemeral: true });
        return;
      }

      await Interaction.reply({
        embeds: [this.BuildModuleHelpEmbed(PluginValue)],
        components: this.BuildHelpSelectRows(Interaction.user.id, PluginValue.Manifest.Metadata.Id),
        ephemeral: true
      });
      return;
    }

    await Interaction.reply({
      embeds: [this.BuildHelpOverviewEmbed()],
      components: this.BuildHelpSelectRows(Interaction.user.id),
      ephemeral: true
    });
  }

  private async HandleHelpSelect(InteractionValue: StringSelectMenuInteraction): Promise<void> {
    const OwnerId = InteractionValue.customId.slice(HelpSelectCustomIdPrefix.length);

    if (OwnerId !== InteractionValue.user.id) {
      await InteractionValue.reply({ content: "This help menu belongs to another user.", ephemeral: true });
      return;
    }

    const PluginId = InteractionValue.values[0];
    const PluginValue = PluginId ? this.FindHelpModule(PluginId) : null;

    if (!PluginValue) {
      await InteractionValue.update({
        embeds: [this.BuildHelpOverviewEmbed()],
        components: this.BuildHelpSelectRows(InteractionValue.user.id)
      });
      return;
    }

    await InteractionValue.update({
      embeds: [this.BuildModuleHelpEmbed(PluginValue)],
      components: this.BuildHelpSelectRows(InteractionValue.user.id, PluginValue.Manifest.Metadata.Id)
    });
  }

  private BuildHelpOverviewEmbed(): EmbedBuilder {
    const Modules = this.GetHelpModules();
    const Embed = new EmbedBuilder()
      .setColor(HyperBotColor)
      .setTitle("HyperBot Help")
      .setDescription("Select a module from the menu below to view its help.");

    if (Modules.length === 0) {
      return Embed.addFields({ name: "Modules", value: "No module is currently loaded." });
    }

    if (Modules.length > 25) {
      Embed.addFields({
        name: "More modules",
        value: `Only the first ${MaxDiscordSelectOptions} modules can be displayed in the menu. Use \`/help module:<module id>\` for the others.`
      });
    }

    return Embed;
  }

  private BuildModuleHelpEmbed(PluginValue: LoadedPlugin): EmbedBuilder {
    const Manifest = PluginValue.Manifest;
    const Commands = Manifest.Commands.filter((Command) => Command.Name !== HelpCommandName);
    const Description = Manifest.Help?.Description ?? `${Manifest.Metadata.DisplayName} module.`;
    const Embed = new EmbedBuilder()
      .setColor(HyperBotColor)
      .setTitle(`${Manifest.Metadata.DisplayName} Help`)
      .setDescription(this.Truncate(Description, 4096))
      .addFields({
        name: "Module",
        value: [
          `Id: \`${Manifest.Metadata.Id}\``,
          `Scope: \`${Manifest.Scope}\``,
          Manifest.Category ? `Category: \`${Manifest.Category}\`` : null
        ].filter((Line): Line is string => Line !== null).join("\n")
      });

    if (Manifest.Help?.Details?.length) {
      Embed.addFields({
        name: "Help info",
        value: this.Truncate(Manifest.Help.Details.map((Detail) => `- ${Detail}`).join("\n"), 1024)
      });
    }

    if (Commands.length === 0) {
      Embed.addFields({
        name: "Commands",
        value: "This module has no slash commands. Configure it from the dashboard."
      });
      return Embed;
    }

    const MaxCommandFields = Manifest.Help?.Details?.length ? 22 : 23;

    for (const Command of Commands.slice(0, MaxCommandFields)) {
      Embed.addFields({
        name: `/${Command.Name}`,
        value: this.BuildCommandHelpValue(Command)
      });
    }

    if (Commands.length > MaxCommandFields) {
      Embed.addFields({
        name: "More commands",
        value: `${Commands.length - MaxCommandFields} additional command(s) are not shown in this embed.`
      });
    }

    return Embed;
  }

  private BuildCommandHelpValue(Command: CommandDefinition): string {
    const Lines = [
      Command.Help?.Description ?? Command.Description,
      `Usage: \`${Command.Help?.Usage ?? this.BuildCommandUsage(Command)}\``
    ];

    if (Command.Options?.length) {
      Lines.push("Arguments:");
      Lines.push(...Command.Options.map((OptionValue) => this.FormatCommandOption(OptionValue)));
    }

    if (Command.Help?.Details?.length) {
      Lines.push(...Command.Help.Details.map((Detail) => `- ${Detail}`));
    }

    return this.Truncate(Lines.join("\n"), 1024);
  }

  private BuildCommandUsage(Command: CommandDefinition): string {
    const Options = Command.Options?.map((OptionValue) =>
      OptionValue.Required ? `<${OptionValue.Name}>` : `[${OptionValue.Name}]`
    ) ?? [];

    return [`/${Command.Name}`, ...Options].join(" ");
  }

  private FormatCommandOption(OptionValue: CommandOptionDefinition): string {
    const RequiredLabel = OptionValue.Required ? "required" : "optional";
    const Choices = OptionValue.Choices?.length
      ? ` Choices: ${OptionValue.Choices.map((Choice) => Choice.Name).join(", ")}.`
      : "";

    return `- \`${OptionValue.Name}\` (${OptionValue.Type}, ${RequiredLabel}): ${OptionValue.Description}${Choices}`;
  }

  private BuildHelpSelectRows(UserId: string, SelectedPluginId?: string): Array<ActionRowBuilder<StringSelectMenuBuilder>> {
    const Modules = this.GetHelpModules().slice(0, MaxDiscordSelectOptions);

    if (Modules.length === 0) {
      return [];
    }

    const Select = new StringSelectMenuBuilder()
      .setCustomId(`${HelpSelectCustomIdPrefix}${UserId}`)
      .setPlaceholder("Select a module")
      .addOptions(Modules.map((PluginValue) => ({
        label: this.Truncate(PluginValue.Manifest.Metadata.DisplayName, 100),
        value: PluginValue.Manifest.Metadata.Id,
        description: this.Truncate(PluginValue.Manifest.Help?.Description ?? PluginValue.Manifest.Metadata.Id, 100),
        default: PluginValue.Manifest.Metadata.Id === SelectedPluginId
      })));

    return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(Select)];
  }

  private FindHelpModule(Value: string): LoadedPlugin | null {
    const NormalizedValue = Value.trim().toLowerCase();
    return this.GetHelpModules().find((PluginValue) =>
      PluginValue.Manifest.Metadata.Id.toLowerCase() === NormalizedValue ||
      PluginValue.Manifest.Metadata.DisplayName.toLowerCase() === NormalizedValue
    ) ?? null;
  }

  private GetHelpModules(): LoadedPlugin[] {
    return Array.from(this.Plugins.values())
      .sort((First, Second) => First.Manifest.Metadata.DisplayName.localeCompare(Second.Manifest.Metadata.DisplayName));
  }

  private Truncate(Value: string, MaxLength: number): string {
    if (Value.length <= MaxLength) {
      return Value;
    }

    if (MaxLength <= 3) {
      return Value.slice(0, MaxLength);
    }

    return `${Value.slice(0, MaxLength - 3)}...`;
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
    const Storage = new PluginStorage(this.Prisma, this.RedisClient, this.BotId, "CommandAliases");
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

  private async EnablePluginFromDirectory(Directory: string): Promise<void> {
    const ManifestEntry = (await ScanPluginManifests(this.PluginDirectory)).find(
      (Entry) => Path.resolve(Entry.Directory) === Path.resolve(Directory)
    );

    if (!ManifestEntry) {
      return;
    }

    const PluginId = ManifestEntry.Manifest.Metadata.Id;
    await this.DisableLoadedPlugin(PluginId);

    const EntryPointPath = this.ResolveEntryPoint(ManifestEntry.Directory, ManifestEntry.Manifest.EntryPoint);
    const ModuleUrl = `${pathToFileURL(EntryPointPath).href}?Reload=${Date.now()}`;
    const ImportedModule = (await import(ModuleUrl)) as { default?: PluginConstructor; Plugin?: PluginConstructor };
    const PluginClass = ImportedModule.default ?? ImportedModule.Plugin;

    if (!PluginClass) {
      throw new Error(`Plugin ${PluginId} does not export a plugin class.`);
    }

    const Instance = new PluginClass({
      BotId: this.BotId,
      Manifest: ManifestEntry.Manifest,
      Storage: new PluginStorage(this.Prisma, this.RedisClient, this.BotId, PluginId),
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

  private async DisableLoadedPlugin(PluginId: string): Promise<void> {
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

    const ManifestEntry = (await ScanPluginManifests(this.PluginDirectory)).find(
      (Entry) => Path.resolve(Entry.Directory) === Path.resolve(Directory)
    );

    if (!ManifestEntry) {
      return;
    }

    if (await IsPluginDisabled(this.Prisma, this.BotId, ManifestEntry.Manifest.Metadata.Id)) {
      await this.DisableLoadedPlugin(ManifestEntry.Manifest.Metadata.Id);
      return;
    }

    await this.EnablePluginFromDirectory(Directory);
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
