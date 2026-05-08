import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type GuildMember,
  type Message,
  type NewsChannel,
  type TextChannel,
  type VoiceChannel
} from "discord.js";
import { randomUUID } from "node:crypto";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type CustomCommandActionType = "SendMessage" | "Reply" | "DM" | "SendEmbed" | "ReplyEmbed" | "DMEmbed" | "AddRole" | "RemoveRole" | "ToggleRole" | "DeleteTrigger" | "React";
type CustomCommandMatchMode = "Exact" | "StartsWith";

type CustomCommandAction = {
  Id: string;
  Type: CustomCommandActionType;
  Message?: string;
  Embed?: EditableEmbed;
  RoleId?: string;
  Emoji?: string;
};

type EditableEmbed = {
  Title?: string;
  Description?: string;
  Color?: string;
  Url?: string;
  AuthorName?: string;
  AuthorIconUrl?: string;
  ThumbnailUrl?: string;
  ImageUrl?: string;
  FooterText?: string;
  FooterIconUrl?: string;
  Timestamp?: boolean;
  Fields?: Array<{ Name: string; Value: string; Inline: boolean }>;
  ImageDataUrl?: string;
  ImageName?: string;
};

type CustomCommandChecks = {
  AllowedChannelIds: string[];
  BlockedChannelIds: string[];
  RequiredRoleIds: string[];
  BlockedRoleIds: string[];
  DeniedMessage: string;
};

type CustomCommandDefinition = {
  Id: string;
  Name: string;
  Aliases: string[];
  Enabled: boolean;
  MatchMode: CustomCommandMatchMode;
  Description: string;
  Checks: CustomCommandChecks;
  Actions: CustomCommandAction[];
};

type CustomCommandsConfig = {
  Prefix: string;
  CaseSensitive: boolean;
  DefaultAllowedChannelIds: string[];
  DefaultRequiredRoleIds: string[];
  DefaultDeniedMessage: string;
  Commands: CustomCommandDefinition[];
};

const DefaultConfig: CustomCommandsConfig = {
  Prefix: "!",
  CaseSensitive: false,
  DefaultAllowedChannelIds: [],
  DefaultRequiredRoleIds: [],
  DefaultDeniedMessage: "You cannot use this command here.",
  Commands: []
};

export default class CustomCommandsPlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.Logger.Info("Custom Commands plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Custom Commands plugin disabled.");
  }

  public async OnMessage(MessageValue: Message): Promise<void> {
    if (!MessageValue.guildId || MessageValue.author.bot || !MessageValue.content) {
      return;
    }

    const Config = await this.GetConfig(MessageValue.guildId);
    const Prefix = Config.Prefix.trim() || DefaultConfig.Prefix;

    if (!MessageValue.content.startsWith(Prefix)) {
      return;
    }

    const Invocation = this.ParseInvocation(MessageValue.content.slice(Prefix.length));

    if (!Invocation.Name) {
      return;
    }

    const Command = this.FindCommand(Config.Commands, Invocation.Name, Config.CaseSensitive);

    if (!Command || !Command.Enabled || !this.MatchesMode(Command, Invocation.RawAfterPrefix, Config.CaseSensitive)) {
      return;
    }

    const Member = MessageValue.member ?? await MessageValue.guild?.members.fetch(MessageValue.author.id).catch(() => null);

    if (!Member) {
      return;
    }

    const CheckResult = this.CheckCommand(MessageValue, Member, Command, Config);

    if (!CheckResult.Allowed) {
      const DeniedMessage = Command.Checks.DeniedMessage.trim() || Config.DefaultDeniedMessage;

      if (DeniedMessage) {
        await MessageValue.reply({
          content: this.ApplyTemplate(DeniedMessage, MessageValue, Invocation.Args),
          allowedMentions: { parse: [] }
        }).catch((ErrorValue: unknown) => this.Logger.Warn("Custom command denied message failed.", ErrorValue));
      }

      return;
    }

    for (const Action of Command.Actions) {
      await this.RunAction(Action, MessageValue, Member, Invocation.Args);
    }
  }

  private ParseInvocation(RawAfterPrefix: string): { Name: string; Args: string; RawAfterPrefix: string } {
    const TrimmedValue = RawAfterPrefix.trim();
    const [Name = "", ...ArgParts] = TrimmedValue.split(/\s+/u);

    return {
      Name,
      Args: ArgParts.join(" "),
      RawAfterPrefix: TrimmedValue
    };
  }

  private FindCommand(Commands: CustomCommandDefinition[], Name: string, CaseSensitive: boolean): CustomCommandDefinition | null {
    const Normalize = (Value: string) => CaseSensitive ? Value.trim() : Value.trim().toLowerCase();
    const NormalizedName = Normalize(Name);

    return Commands.find((Command) => {
      const Names = [Command.Name, ...Command.Aliases].map(Normalize).filter(Boolean);
      return Names.includes(NormalizedName);
    }) ?? null;
  }

  private MatchesMode(Command: CustomCommandDefinition, RawAfterPrefix: string, CaseSensitive: boolean): boolean {
    if (Command.MatchMode !== "StartsWith") {
      return true;
    }

    const Normalize = (Value: string) => CaseSensitive ? Value : Value.toLowerCase();
    const RawValue = Normalize(RawAfterPrefix);
    const Names = [Command.Name, ...Command.Aliases].map((Value) => Normalize(Value.trim())).filter(Boolean);

    return Names.some((Name) => RawValue === Name || RawValue.startsWith(`${Name} `));
  }

  private CheckCommand(MessageValue: Message, Member: GuildMember, Command: CustomCommandDefinition, Config: CustomCommandsConfig): { Allowed: boolean; Reason: string } {
    const AllowedChannelIds = Command.Checks.AllowedChannelIds.length > 0 ? Command.Checks.AllowedChannelIds : Config.DefaultAllowedChannelIds;
    const RequiredRoleIds = Command.Checks.RequiredRoleIds.length > 0 ? Command.Checks.RequiredRoleIds : Config.DefaultRequiredRoleIds;

    if (AllowedChannelIds.length > 0 && !AllowedChannelIds.includes(MessageValue.channelId)) {
      return { Allowed: false, Reason: "ChannelNotAllowed" };
    }

    if (Command.Checks.BlockedChannelIds.includes(MessageValue.channelId)) {
      return { Allowed: false, Reason: "ChannelBlocked" };
    }

    if (RequiredRoleIds.length > 0 && !RequiredRoleIds.some((RoleId) => Member.roles.cache.has(RoleId))) {
      return { Allowed: false, Reason: "MissingRole" };
    }

    if (Command.Checks.BlockedRoleIds.some((RoleId) => Member.roles.cache.has(RoleId))) {
      return { Allowed: false, Reason: "BlockedRole" };
    }

    return { Allowed: true, Reason: "" };
  }

  private async RunAction(Action: CustomCommandAction, MessageValue: Message, Member: GuildMember, Args: string): Promise<void> {
    switch (Action.Type) {
      case "SendMessage":
        await this.SendChannelMessage(MessageValue, Action.Message, Args);
        return;
      case "Reply":
        await this.ReplyToMessage(MessageValue, Action.Message, Args);
        return;
      case "DM":
        await this.SendDirectMessage(MessageValue, Action.Message, Args);
        return;
      case "SendEmbed":
        await this.SendChannelEmbed(MessageValue, Action.Embed, Args);
        return;
      case "ReplyEmbed":
        await this.ReplyWithEmbed(MessageValue, Action.Embed, Args);
        return;
      case "DMEmbed":
        await this.SendDirectEmbed(MessageValue, Action.Embed, Args);
        return;
      case "AddRole":
        await this.AddRole(Member, Action.RoleId);
        return;
      case "RemoveRole":
        await this.RemoveRole(Member, Action.RoleId);
        return;
      case "ToggleRole":
        await this.ToggleRole(Member, Action.RoleId);
        return;
      case "DeleteTrigger":
        await this.DeleteTrigger(MessageValue);
        return;
      case "React":
        await this.React(MessageValue, Action.Emoji);
        return;
      default:
        return;
    }
  }

  private async SendChannelMessage(MessageValue: Message, Template: string | undefined, Args: string): Promise<void> {
    const Channel = MessageValue.channel;

    if (!Template?.trim() || !this.IsSendableChannel(Channel)) {
      return;
    }

    await Channel.send({
      content: this.ApplyTemplate(Template, MessageValue, Args),
      allowedMentions: { parse: [] }
    }).catch((ErrorValue: unknown) => this.Logger.Warn("Custom command send message action failed.", ErrorValue));
  }

  private async ReplyToMessage(MessageValue: Message, Template: string | undefined, Args: string): Promise<void> {
    if (!Template?.trim()) {
      return;
    }

    await MessageValue.reply({
      content: this.ApplyTemplate(Template, MessageValue, Args),
      allowedMentions: { parse: [] }
    }).catch((ErrorValue: unknown) => this.Logger.Warn("Custom command reply action failed.", ErrorValue));
  }

  private async SendDirectMessage(MessageValue: Message, Template: string | undefined, Args: string): Promise<void> {
    if (!Template?.trim()) {
      return;
    }

    await MessageValue.author.send({
      content: this.ApplyTemplate(Template, MessageValue, Args),
      allowedMentions: { parse: [] }
    }).catch((ErrorValue: unknown) => this.Logger.Warn("Custom command DM action failed.", ErrorValue));
  }

  private async SendChannelEmbed(MessageValue: Message, Source: EditableEmbed | undefined, Args: string): Promise<void> {
    const Channel = MessageValue.channel;

    if (!Source || !this.IsSendableChannel(Channel)) {
      return;
    }

    const BuiltEmbed = this.BuildEmbed(Source, MessageValue, Args);
    await Channel.send({
      embeds: [BuiltEmbed.Embed],
      files: BuiltEmbed.Files,
      allowedMentions: { parse: [] }
    }).catch((ErrorValue: unknown) => this.Logger.Warn("Custom command send embed action failed.", ErrorValue));
  }

  private async ReplyWithEmbed(MessageValue: Message, Source: EditableEmbed | undefined, Args: string): Promise<void> {
    if (!Source) {
      return;
    }

    const BuiltEmbed = this.BuildEmbed(Source, MessageValue, Args);
    await MessageValue.reply({
      embeds: [BuiltEmbed.Embed],
      files: BuiltEmbed.Files,
      allowedMentions: { parse: [] }
    }).catch((ErrorValue: unknown) => this.Logger.Warn("Custom command reply embed action failed.", ErrorValue));
  }

  private async SendDirectEmbed(MessageValue: Message, Source: EditableEmbed | undefined, Args: string): Promise<void> {
    if (!Source) {
      return;
    }

    const BuiltEmbed = this.BuildEmbed(Source, MessageValue, Args);
    await MessageValue.author.send({
      embeds: [BuiltEmbed.Embed],
      files: BuiltEmbed.Files,
      allowedMentions: { parse: [] }
    }).catch((ErrorValue: unknown) => this.Logger.Warn("Custom command DM embed action failed.", ErrorValue));
  }

  private BuildEmbed(Source: EditableEmbed, MessageValue: Message, Args: string): { Embed: EmbedBuilder; Files: Array<{ attachment: Buffer; name: string }> } {
    const Files: Array<{ attachment: Buffer; name: string }> = [];
    const Embed = new EmbedBuilder().setColor(this.ParseColor(Source.Color || "#5865f2"));

    if (Source.Title?.trim()) {
      Embed.setTitle(this.ApplyTemplate(Source.Title, MessageValue, Args).slice(0, 256));
    }

    if (Source.Description?.trim()) {
      Embed.setDescription(this.ApplyTemplate(Source.Description, MessageValue, Args).slice(0, 4096));
    }

    if (Source.Url?.trim()) {
      Embed.setURL(this.ApplyTemplate(Source.Url, MessageValue, Args));
    }

    if (Source.AuthorName?.trim()) {
      Embed.setAuthor({
        name: this.ApplyTemplate(Source.AuthorName, MessageValue, Args).slice(0, 256),
        iconURL: Source.AuthorIconUrl?.trim() ? this.ApplyTemplate(Source.AuthorIconUrl, MessageValue, Args) : undefined
      });
    }

    if (Source.ThumbnailUrl?.trim()) {
      Embed.setThumbnail(this.ApplyTemplate(Source.ThumbnailUrl, MessageValue, Args));
    }

    const UploadedImage = this.ParseDataImage(Source.ImageDataUrl, Source.ImageName || "custom-command-image.png");
    if (UploadedImage) {
      Files.push(UploadedImage);
      Embed.setImage(`attachment://${UploadedImage.name}`);
    } else if (Source.ImageUrl?.trim()) {
      Embed.setImage(this.ApplyTemplate(Source.ImageUrl, MessageValue, Args));
    }

    if (Source.FooterText?.trim()) {
      Embed.setFooter({
        text: this.ApplyTemplate(Source.FooterText, MessageValue, Args).slice(0, 2048),
        iconURL: Source.FooterIconUrl?.trim() ? this.ApplyTemplate(Source.FooterIconUrl, MessageValue, Args) : undefined
      });
    }

    if (Source.Timestamp) {
      Embed.setTimestamp(new Date());
    }

    for (const Field of Source.Fields ?? []) {
      if (Field.Name.trim() && Field.Value.trim()) {
        Embed.addFields({
          name: this.ApplyTemplate(Field.Name, MessageValue, Args).slice(0, 256),
          value: this.ApplyTemplate(Field.Value, MessageValue, Args).slice(0, 1024),
          inline: Field.Inline
        });
      }
    }

    return { Embed, Files };
  }

  private async AddRole(Member: GuildMember, RoleId: string | undefined): Promise<void> {
    if (!RoleId) {
      return;
    }

    await Member.roles.add(RoleId, "Custom command action").catch((ErrorValue: unknown) => {
      this.Logger.Warn("Custom command add role action failed.", ErrorValue);
    });
  }

  private async RemoveRole(Member: GuildMember, RoleId: string | undefined): Promise<void> {
    if (!RoleId) {
      return;
    }

    await Member.roles.remove(RoleId, "Custom command action").catch((ErrorValue: unknown) => {
      this.Logger.Warn("Custom command remove role action failed.", ErrorValue);
    });
  }

  private async ToggleRole(Member: GuildMember, RoleId: string | undefined): Promise<void> {
    if (!RoleId) {
      return;
    }

    if (Member.roles.cache.has(RoleId)) {
      await this.RemoveRole(Member, RoleId);
      return;
    }

    await this.AddRole(Member, RoleId);
  }

  private async DeleteTrigger(MessageValue: Message): Promise<void> {
    if (!MessageValue.deletable || !MessageValue.guild?.members.me?.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return;
    }

    await MessageValue.delete().catch((ErrorValue: unknown) => {
      this.Logger.Warn("Custom command delete trigger action failed.", ErrorValue);
    });
  }

  private async React(MessageValue: Message, Emoji: string | undefined): Promise<void> {
    if (!Emoji?.trim()) {
      return;
    }

    await MessageValue.react(Emoji.trim()).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Custom command react action failed.", ErrorValue);
    });
  }

  private IsSendableChannel(Channel: Message["channel"]): Channel is TextChannel | NewsChannel | VoiceChannel {
    return Channel.type === ChannelType.GuildText || Channel.type === ChannelType.GuildAnnouncement || Channel.type === ChannelType.GuildVoice;
  }

  private ApplyTemplate(Template: string, MessageValue: Message, Args: string): string {
    return Template
      .replaceAll("%user%", MessageValue.author.tag)
      .replaceAll("%mention%", `<@${MessageValue.author.id}>`)
      .replaceAll("%id%", MessageValue.author.id)
      .replaceAll("%server%", MessageValue.guild?.name ?? "")
      .replaceAll("%channel%", `<#${MessageValue.channelId}>`)
      .replaceAll("%args%", Args)
      .slice(0, 2000);
  }

  private async GetConfig(GuildId: string): Promise<CustomCommandsConfig> {
    return {
      Prefix: (await this.Storage.GetGlobalConfig<string>(GuildId, "Prefix")) ?? DefaultConfig.Prefix,
      CaseSensitive: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "CaseSensitive")) ?? DefaultConfig.CaseSensitive,
      DefaultAllowedChannelIds: await this.GetStringListConfig(GuildId, "DefaultAllowedChannelIds", DefaultConfig.DefaultAllowedChannelIds),
      DefaultRequiredRoleIds: await this.GetStringListConfig(GuildId, "DefaultRequiredRoleIds", DefaultConfig.DefaultRequiredRoleIds),
      DefaultDeniedMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "DefaultDeniedMessage")) ?? DefaultConfig.DefaultDeniedMessage,
      Commands: this.ParseCommands((await this.Storage.GetGlobalConfig<unknown[]>(GuildId, "Commands")) ?? DefaultConfig.Commands)
    };
  }

  private async GetStringListConfig(GuildId: string, Key: keyof CustomCommandsConfig, DefaultValue: string[]): Promise<string[]> {
    const Value = await this.Storage.GetGlobalConfig<string[]>(GuildId, Key);
    return Array.isArray(Value) ? Value.map((Item) => String(Item)).filter(Boolean) : DefaultValue;
  }

  private ParseCommands(Value: unknown): CustomCommandDefinition[] {
    if (!Array.isArray(Value)) {
      return [];
    }

    return Value.filter(this.IsRecord).map((CommandValue) => ({
      Id: this.GetString(CommandValue.Id) || randomUUID(),
      Name: this.SanitizeCommandName(this.GetString(CommandValue.Name)),
      Aliases: Array.isArray(CommandValue.Aliases) ? CommandValue.Aliases.map((Alias) => this.SanitizeCommandName(String(Alias))).filter(Boolean) : [],
      Enabled: CommandValue.Enabled !== false,
      MatchMode: this.ParseMatchMode(CommandValue.MatchMode),
      Description: this.GetString(CommandValue.Description),
      Checks: {
        AllowedChannelIds: this.GetStringArray(CommandValue.Checks, "AllowedChannelIds"),
        BlockedChannelIds: this.GetStringArray(CommandValue.Checks, "BlockedChannelIds"),
        RequiredRoleIds: this.GetStringArray(CommandValue.Checks, "RequiredRoleIds"),
        BlockedRoleIds: this.GetStringArray(CommandValue.Checks, "BlockedRoleIds"),
        DeniedMessage: this.GetString(this.IsRecord(CommandValue.Checks) ? CommandValue.Checks.DeniedMessage : "")
      },
      Actions: Array.isArray(CommandValue.Actions) ? CommandValue.Actions.filter(this.IsRecord).map((ActionValue) => ({
        Id: this.GetString(ActionValue.Id) || randomUUID(),
        Type: this.ParseActionType(ActionValue.Type),
        Message: this.GetString(ActionValue.Message),
        Embed: this.ParseEditableEmbed(ActionValue.Embed),
        RoleId: this.GetString(ActionValue.RoleId),
        Emoji: this.GetString(ActionValue.Emoji)
      })) : []
    })).filter((Command) => Command.Name && Command.Actions.length > 0);
  }

  private ParseActionType(Value: unknown): CustomCommandActionType {
    const SafeValue = String(Value);
    const AllowedTypes: CustomCommandActionType[] = ["SendMessage", "Reply", "DM", "SendEmbed", "ReplyEmbed", "DMEmbed", "AddRole", "RemoveRole", "ToggleRole", "DeleteTrigger", "React"];
    return AllowedTypes.includes(SafeValue as CustomCommandActionType) ? SafeValue as CustomCommandActionType : "SendMessage";
  }

  private ParseEditableEmbed(Value: unknown): EditableEmbed | undefined {
    if (!this.IsRecord(Value)) {
      return undefined;
    }

    return {
      Title: this.GetString(Value.Title),
      Description: this.GetString(Value.Description),
      Color: this.GetString(Value.Color),
      Url: this.GetString(Value.Url),
      AuthorName: this.GetString(Value.AuthorName),
      AuthorIconUrl: this.GetString(Value.AuthorIconUrl),
      ThumbnailUrl: this.GetString(Value.ThumbnailUrl),
      ImageUrl: this.GetString(Value.ImageUrl),
      FooterText: this.GetString(Value.FooterText),
      FooterIconUrl: this.GetString(Value.FooterIconUrl),
      Timestamp: Boolean(Value.Timestamp),
      ImageDataUrl: this.GetString(Value.ImageDataUrl),
      ImageName: this.GetString(Value.ImageName),
      Fields: Array.isArray(Value.Fields) ? Value.Fields.filter(this.IsRecord).map((Field) => ({
        Name: this.GetString(Field.Name),
        Value: this.GetString(Field.Value),
        Inline: Boolean(Field.Inline)
      })) : []
    };
  }

  private ParseMatchMode(Value: unknown): CustomCommandMatchMode {
    return Value === "StartsWith" ? "StartsWith" : "Exact";
  }

  private GetStringArray(Value: unknown, Key: string): string[] {
    if (!this.IsRecord(Value) || !Array.isArray(Value[Key])) {
      return [];
    }

    return Value[Key].map((Item) => String(Item)).filter(Boolean);
  }

  private GetString(Value: unknown): string {
    return typeof Value === "string" ? Value : "";
  }

  private ParseColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : "#5865f2";
    return Number.parseInt(SafeColor.slice(1), 16);
  }

  private ParseDataImage(Value: string | undefined, Name: string): { attachment: Buffer; name: string } | null {
    const Match = Value?.match(/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,(.+)$/iu);

    if (!Match?.[1]) {
      return null;
    }

    return {
      attachment: Buffer.from(Match[1], "base64"),
      name: Name.replace(/[^a-z0-9._-]/giu, "-") || "custom-command-image.png"
    };
  }

  private SanitizeCommandName(Value: string): string {
    return Value.trim().replace(/^!+/u, "").split(/\s+/u)[0]?.slice(0, 48) ?? "";
  }

  private IsRecord(Value: unknown): Value is Record<string, unknown> {
    return typeof Value === "object" && Value !== null && !Array.isArray(Value);
  }
}
