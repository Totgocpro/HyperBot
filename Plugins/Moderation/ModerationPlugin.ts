import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ChannelWebhookCreateOptions,
  type ForumChannel,
  type GuildBasedChannel,
  type GuildMember,
  type Interaction,
  type Message,
  type PartialGuildMember,
  type PartialMessage,
  type NewsChannel,
  type TextChannel,
  type Webhook,
  type VoiceChannel,
  type User
} from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type ModerationSanctionType = "Warn" | "Timeout" | "Ban" | "Kick";

type ModerationSanction = {
  Type: ModerationSanctionType;
  UserId: string;
  UserTag: string;
  ModeratorId: string;
  ModeratorTag: string;
  Reason: string;
  CreatedAt: string;
};

type ModerationAutomodAction = "Delete" | "Warn" | "Mute" | "DeleteAndWarn" | "DeleteAndMute" | "WarnAndMute" | "DeleteWarnAndMute";

type WebhookWritableChannel = Message["channel"] & {
  createWebhook(Options: ChannelWebhookCreateOptions): Promise<Webhook>;
};

type ModerationConfig = {
  LogChannelId: string;
  WarnMessage: string;
  LogMessage: string;
  DeletedMessageLog: string;
  EditedMessageLog: string;
  MemberJoinLog: string;
  MemberLeaveLog: string;
  ModerationRoleIds: string[];
  AutoModEnabled: boolean;
  AutoModRegexPatterns: string[];
  AutoModAction: ModerationAutomodAction;
  AutoModReason: string;
  AutoModLogMessage: string;
  RepeatedSpamEnabled: boolean;
  RepeatedSpamWindowSeconds: number;
  RepeatedSpamThreshold: number;
  RepeatedSpamAction: ModerationAutomodAction;
  RepeatedSpamWhitelistRoleIds: string[];
  InviteBlockEnabled: boolean;
  AllowedInviteCodes: string[];
  InviteBlockAction: ModerationAutomodAction;
  InviteBlockReason: string;
  InviteBlockLogMessage: string;
  PunishmentMuteReason: string;
  PunishmentMuteDurationMinutes: number;
  ReplaceWordEnabled: boolean;
  ReplaceWordRules: string[];
  CensorWordEnabled: boolean;
  CensorWords: string[];
  RewriteBlockedRoleIds: string[];
  RewriteWarnUser: boolean;
  RewriteWarnReason: string;
  RewriteLogMessage: string;
};

const LookupPageSize = 10;
const LookupButtonPrefix = "Moderation:Lookup:";
const MaxDiscordTimeoutMinutes = 28 * 24 * 60;

const DefaultModerationConfig: ModerationConfig = {
  LogChannelId: "",
  WarnMessage: "%user% has been warned by %moderator%: %reason%",
  LogMessage: "%type% applied to %user% by %moderator%: %reason%",
  DeletedMessageLog: "Message deleted in %channel% from %user%: %content%",
  EditedMessageLog: "Message edited in %channel% from %user%: before `%old%` after `%new%`",
  MemberJoinLog: "%user% joined the server.",
  MemberLeaveLog: "%user% left the server.",
  ModerationRoleIds: [],
  AutoModEnabled: false,
  AutoModRegexPatterns: [],
  AutoModAction: "DeleteAndWarn",
  AutoModReason: "Message matched AutoMod rule: %pattern%",
  AutoModLogMessage: "AutoMod matched %user% in %channel% with `%pattern%`: %content%",
  RepeatedSpamEnabled: false,
  RepeatedSpamWindowSeconds: 10,
  RepeatedSpamThreshold: 3,
  RepeatedSpamAction: "DeleteAndWarn",
  RepeatedSpamWhitelistRoleIds: [],
  InviteBlockEnabled: false,
  AllowedInviteCodes: [],
  InviteBlockAction: "DeleteAndWarn",
  InviteBlockReason: "Invite links to other servers are not allowed: %invite%",
  InviteBlockLogMessage: "Blocked invite from %user% in %channel%: %invite%",
  PunishmentMuteReason: "Muted by AutoMod for %duration%: %reason%",
  PunishmentMuteDurationMinutes: 10,
  ReplaceWordEnabled: false,
  ReplaceWordRules: [],
  CensorWordEnabled: false,
  CensorWords: [
    "fuck",
    "fucking",
    "shit",
    "bitch",
    "bastard",
    "asshole",
    "kill",
    "murder",
    "suicide",
    "terrorist",
    "bomb",
    "rape",
    "violate",
    "merde",
    "putain",
    "salope",
    "connard",
    "encule",
    "tuer",
    "meurtre",
    "suicide",
    "terroriste",
    "bombe",
    "viol"
  ],
  RewriteBlockedRoleIds: [],
  RewriteWarnUser: false,
  RewriteWarnReason: "Message cleaned by moderation: %words%",
  RewriteLogMessage: "Cleaned message from %user% in %channel%: `%old%` -> `%new%`"
};

export default class ModerationPlugin extends BasePlugin {
  private readonly MessageCache = new Map<string, { AuthorTag: string; ChannelName: string; Content: string }>();
  private readonly MessageCacheLimit = 5000;
  private readonly RepeatedMessageCache = new Map<string, Array<{ Content: string; CreatedAt: number }>>();
  private readonly RewriteDeletedMessageIds = new Set<string>();

  public async OnEnable(): Promise<void> {
    this.Logger.Info("Moderation plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Moderation plugin disabled.");
  }

  public async OnSlashCommand(CommandName: string, Interaction: ChatInputCommandInteraction): Promise<void> {
    if (!Interaction.guildId || !Interaction.inCachedGuild()) {
      await Interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    if (CommandName === "warn") {
      await this.HandleWarn(Interaction);
      return;
    }

    if (CommandName === "lookup") {
      await this.HandleLookup(Interaction);
    }
  }

  public async OnInteraction(InteractionValue: Interaction): Promise<void> {
    if (!InteractionValue.isButton() || !InteractionValue.customId.startsWith(LookupButtonPrefix)) {
      return;
    }

    await this.HandleLookupButton(InteractionValue);
  }

  public async OnMessage(MessageValue: Message): Promise<void> {
    if (!MessageValue.guildId || MessageValue.author.bot) {
      return;
    }

    this.RememberMessage(MessageValue);
    const WasRewritten = await this.RunMessageRewrite(MessageValue);

    if (WasRewritten) {
      return;
    }

    await this.RunAutoMod(MessageValue);
  }

  public async OnMessageDelete(MessageValue: Message | PartialMessage): Promise<void> {
    if (!MessageValue.guildId || MessageValue.author?.bot) {
      return;
    }

    const Config = await this.GetConfig(MessageValue.guildId);

    if (this.RewriteDeletedMessageIds.delete(MessageValue.id)) {
      this.MessageCache.delete(MessageValue.id);
      return;
    }

    if (!Config.DeletedMessageLog.trim()) {
      return;
    }

    const CachedMessage = this.MessageCache.get(MessageValue.id);
    const Content = MessageValue.content?.slice(0, 900) || CachedMessage?.Content || "[No cached content]";
    const UserTag = MessageValue.author?.tag ?? CachedMessage?.AuthorTag ?? "Unknown user";
    const ChannelName = this.GetChannelName(MessageValue) ?? CachedMessage?.ChannelName ?? "Unknown channel";

    this.MessageCache.delete(MessageValue.id);

    await this.SendLogMessage(MessageValue.guildId, Config, {
      Title: "Message deleted",
      Description: this.ApplyTemplate(Config.DeletedMessageLog, {
        User: UserTag,
        Moderator: "System",
        Reason: "Message deleted",
        Type: "MessageDelete",
        Channel: ChannelName,
        Content,
        Old: "",
        New: ""
      }),
      Color: 0xef4444
    });
  }

  public async OnMessageUpdate(OldMessage: Message | PartialMessage, NewMessage: Message | PartialMessage): Promise<void> {
    if (!NewMessage.guildId || NewMessage.author?.bot) {
      return;
    }

    const OldContent = OldMessage.content?.slice(0, 900) ?? "";
    const NewContent = NewMessage.content?.slice(0, 900) ?? "";

    if (!OldContent && !NewContent) {
      return;
    }

    if (OldContent && OldContent === NewContent) {
      return;
    }

    if (!NewMessage.partial && NewMessage.content) {
      this.RememberMessage(NewMessage as Message);
    }

    const Config = await this.GetConfig(NewMessage.guildId);

    if (!Config.EditedMessageLog.trim()) {
      return;
    }

    const UserTag = NewMessage.author?.tag ?? "Unknown user";
    const ChannelName = this.GetChannelName(NewMessage) ?? "Unknown channel";

    await this.SendLogMessage(NewMessage.guildId, Config, {
      Title: "Message edited",
      Description: this.ApplyTemplate(Config.EditedMessageLog, {
        User: UserTag,
        Moderator: "System",
        Reason: "Message edited",
        Type: "MessageEdit",
        Channel: ChannelName,
        Content: NewContent,
        Old: OldContent || "[No cached old content]",
        New: NewContent || "[No cached new content]"
      }),
      Color: 0xf59e0b
    });
  }

  public async OnGuildMemberAdd(Member: GuildMember): Promise<void> {
    const Config = await this.GetConfig(Member.guild.id);

    if (!Config.MemberJoinLog.trim()) {
      return;
    }

    await this.SendLogMessage(Member.guild.id, Config, {
      Title: "Member joined",
      Description: this.ApplyTemplate(Config.MemberJoinLog, {
        User: Member.user.tag,
        Moderator: "System",
        Reason: "Member joined",
        Type: "MemberJoin",
        Channel: "",
        Content: "",
        Old: "",
        New: ""
      }),
      Color: 0x22c55e
    });
  }

  public async OnGuildMemberRemove(Member: GuildMember | PartialGuildMember): Promise<void> {
    const Config = await this.GetConfig(Member.guild.id);

    if (!Config.MemberLeaveLog.trim()) {
      return;
    }

    await this.SendLogMessage(Member.guild.id, Config, {
      Title: "Member left",
      Description: this.ApplyTemplate(Config.MemberLeaveLog, {
        User: Member.user.tag,
        Moderator: "System",
        Reason: "Member left",
        Type: "MemberLeave",
        Channel: "",
        Content: "",
        Old: "",
        New: ""
      }),
      Color: 0x64748b
    });
  }

  private async HandleWarn(Interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
    const Config = await this.GetConfig(Interaction.guildId);

    if (!this.HasModerationAccess(Interaction.member, Config)) {
      await Interaction.reply({ content: "You need Moderate Members permission to warn users.", ephemeral: true });
      return;
    }

    const TargetUser = Interaction.options.getUser("user", true);
    const Reason = Interaction.options.getString("reason", true);

    if (!Config.LogChannelId) {
      await Interaction.reply({ content: "Moderation log channel is not configured.", ephemeral: true });
      return;
    }

    const Sanction: ModerationSanction = {
      Type: "Warn",
      UserId: TargetUser.id,
      UserTag: TargetUser.tag,
      ModeratorId: Interaction.user.id,
      ModeratorTag: Interaction.user.tag,
      Reason,
      CreatedAt: new Date().toISOString()
    };

    await this.AppendSanction(Interaction.guildId, TargetUser.id, Sanction);

    const ReplyMessage = this.ApplyTemplate(Config.WarnMessage, {
      User: TargetUser.tag,
      Moderator: Interaction.user.tag,
      Reason,
      Type: Sanction.Type,
      Channel: "",
      Content: "",
      Old: "",
      New: ""
    });

    await Interaction.reply({ content: ReplyMessage, ephemeral: false });

    if (Config.LogMessage.trim()) {
      await this.SendSanctionLog(Interaction.guildId, Config, Sanction, TargetUser, Interaction.user);
    }
  }

  private async HandleLookup(Interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
    const Config = await this.GetConfig(Interaction.guildId);

    if (!this.HasModerationAccess(Interaction.member, Config)) {
      await Interaction.reply({ content: "You need Moderate Members permission to lookup sanctions.", ephemeral: true });
      return;
    }

    const TargetUser = Interaction.options.getUser("user", true);
    const Sanctions = await this.GetSanctions(Interaction.guildId, TargetUser.id);
    const Page = 0;
    const TotalPages = this.GetLookupTotalPages(Sanctions);
    const PageSanctions = this.GetLookupPageSanctions(Sanctions, Page);
    const Embed = this.BuildLookupEmbed(TargetUser.tag, TargetUser.displayAvatarURL(), Sanctions.length, PageSanctions, Page, TotalPages);
    const Components = this.BuildLookupComponents(Interaction.user.id, TargetUser.id, Page, TotalPages);

    await Interaction.reply({ embeds: [Embed], components: Components, ephemeral: true });
  }

  private async HandleLookupButton(InteractionValue: ButtonInteraction): Promise<void> {
    if (!InteractionValue.guildId || !InteractionValue.inCachedGuild()) {
      await InteractionValue.reply({ content: "This lookup is only available in a server.", ephemeral: true });
      return;
    }

    const [, , Action, OwnerId, TargetUserId, PageValue] = InteractionValue.customId.split(":");

    if (InteractionValue.user.id !== OwnerId) {
      await InteractionValue.reply({ content: "Only the user who launched this lookup can use these buttons.", ephemeral: true });
      return;
    }

    const Config = await this.GetConfig(InteractionValue.guildId);

    if (!this.HasModerationAccess(InteractionValue.member, Config)) {
      await InteractionValue.reply({ content: "You need Moderate Members permission to lookup sanctions.", ephemeral: true });
      return;
    }

    const CurrentPage = Number.parseInt(PageValue ?? "0", 10);
    const PageDelta = Action === "Next" ? 1 : Action === "Previous" ? -1 : 0;
    const Sanctions = await this.GetSanctions(InteractionValue.guildId, TargetUserId);
    const TotalPages = this.GetLookupTotalPages(Sanctions);
    const NextPage = Math.min(Math.max(CurrentPage + PageDelta, 0), TotalPages - 1);
    const TargetUser = await this.DiscordClient.users.fetch(TargetUserId).catch(() => null);
    const Embed = this.BuildLookupEmbed(
      TargetUser?.tag ?? TargetUserId,
      TargetUser?.displayAvatarURL() ?? null,
      Sanctions.length,
      this.GetLookupPageSanctions(Sanctions, NextPage),
      NextPage,
      TotalPages
    );

    await InteractionValue.update({
      embeds: [Embed],
      components: this.BuildLookupComponents(OwnerId, TargetUserId, NextPage, TotalPages)
    });
  }

  private BuildLookupEmbed(
    TargetUserTag: string,
    TargetUserAvatarUrl: string | null,
    SanctionCount: number,
    PageSanctions: ModerationSanction[],
    Page: number,
    TotalPages: number
  ): EmbedBuilder {
    const Embed = new EmbedBuilder()
      .setTitle(`Moderation lookup: ${TargetUserTag}`)
      .setColor(0x2563eb)
      .setDescription(SanctionCount === 0 ? "No sanction found." : `Found ${SanctionCount} sanction(s). Showing page ${Page + 1}/${TotalPages}.`);

    if (TargetUserAvatarUrl) {
      Embed.setThumbnail(TargetUserAvatarUrl);
    }

    for (const Sanction of PageSanctions) {
      Embed.addFields({
        name: `${Sanction.Type} | ${new Date(Sanction.CreatedAt).toLocaleString("en-US")}`,
        value: this.TruncateDiscordField(`Moderator: ${Sanction.ModeratorTag} (${Sanction.ModeratorId})\nReason: ${Sanction.Reason}`),
        inline: false
      });
    }

    return Embed;
  }

  private BuildLookupComponents(OwnerId: string, TargetUserId: string, Page: number, TotalPages: number): ActionRowBuilder<ButtonBuilder>[] {
    if (TotalPages <= 1) {
      return [];
    }

    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${LookupButtonPrefix}Previous:${OwnerId}:${TargetUserId}:${Page}`)
          .setLabel("Previous Page")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(Page <= 0),
        new ButtonBuilder()
          .setCustomId(`${LookupButtonPrefix}Next:${OwnerId}:${TargetUserId}:${Page}`)
          .setLabel("Next Page")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(Page >= TotalPages - 1)
      )
    ];
  }

  private GetLookupPageSanctions(Sanctions: ModerationSanction[], Page: number): ModerationSanction[] {
    const StartIndex = Math.max(0, Page) * LookupPageSize;
    return Sanctions.slice().reverse().slice(StartIndex, StartIndex + LookupPageSize);
  }

  private GetLookupTotalPages(Sanctions: ModerationSanction[]): number {
    return Math.max(1, Math.ceil(Sanctions.length / LookupPageSize));
  }

  private TruncateDiscordField(Value: string): string {
    return Value.length <= 1024 ? Value : `${Value.slice(0, 1021)}...`;
  }

  private async SendSanctionLog(GuildId: string, Config: ModerationConfig, Sanction: ModerationSanction, TargetUser: User, Moderator: User): Promise<void> {
    await this.SendLogMessage(GuildId, Config, {
      Title: `${Sanction.Type} applied`,
      Description: this.ApplyTemplate(Config.LogMessage, {
        User: TargetUser.tag,
        Moderator: Moderator.tag,
        Reason: Sanction.Reason,
        Type: Sanction.Type,
        Channel: "",
        Content: "",
        Old: "",
        New: ""
      }),
      Color: 0x22c55e
    });
  }

  private async RunAutoMod(MessageValue: Message): Promise<void> {
    const GuildId = MessageValue.guildId;

    if (!GuildId || !MessageValue.content) {
      return;
    }

    const Config = await this.GetConfig(GuildId);

    const InviteCode = this.FindBlockedInviteCode(MessageValue.content, Config);

    if (Config.InviteBlockEnabled && InviteCode) {
      await this.ApplyAutomodAction(MessageValue, Config, {
        Action: Config.InviteBlockAction,
        Title: "Invite blocked",
        ReasonTemplate: Config.InviteBlockReason,
        LogTemplate: Config.InviteBlockLogMessage,
        Pattern: "",
        Invite: InviteCode,
        Color: 0xf97316
      });
      return;
    }

    if (Config.RepeatedSpamEnabled && !this.HasAnyRole(MessageValue.member, Config.RepeatedSpamWhitelistRoleIds) && this.IsRepeatedSpam(MessageValue, Config)) {
      await this.ApplyAutomodAction(MessageValue, Config, {
        Action: Config.RepeatedSpamAction,
        Title: "Repeated spam detected",
        ReasonTemplate: `Repeated message spam (${Config.RepeatedSpamThreshold} messages in ${Config.RepeatedSpamWindowSeconds}s).`,
        LogTemplate: "Repeated spam from %user% in %channel%: %content%",
        Pattern: "",
        Invite: "",
        Color: 0xeab308
      });
      return;
    }

    if (!Config.AutoModEnabled) {
      return;
    }

    const MatchedPattern = this.FindMatchedPattern(MessageValue.content, Config.AutoModRegexPatterns);

    if (!MatchedPattern) {
      return;
    }

    await this.ApplyAutomodAction(MessageValue, Config, {
      Action: Config.AutoModAction,
      Title: "AutoMod match",
      ReasonTemplate: Config.AutoModReason,
      LogTemplate: Config.AutoModLogMessage,
      Pattern: MatchedPattern,
      Invite: "",
      Color: 0xdc2626
    });
  }

  private async RunMessageRewrite(MessageValue: Message): Promise<boolean> {
    const GuildId = MessageValue.guildId;

    if (!GuildId || !MessageValue.content) {
      return false;
    }

    const Config = await this.GetConfig(GuildId);

    if (!Config.ReplaceWordEnabled && !Config.CensorWordEnabled) {
      return false;
    }

    if (this.HasAnyRole(MessageValue.member, Config.RewriteBlockedRoleIds)) {
      return false;
    }

    const RewriteResult = this.BuildCleanContent(MessageValue.content, Config);

    if (!RewriteResult.Changed) {
      return false;
    }

    if (!this.CanCreateWebhookInChannel(MessageValue.channel)) {
      this.Logger.Warn("Moderation rewrite matched a message but cannot create a webhook in this channel.", {
        GuildId,
        ChannelId: MessageValue.channelId,
        MessageId: MessageValue.id
      });
      return false;
    }

    const CleanContent = RewriteResult.Content;

    if (!CleanContent.trim() && MessageValue.attachments.size === 0) {
      return false;
    }

    let Webhook: Webhook | null = null;

    try {
      Webhook = await MessageValue.channel.createWebhook({
        name: MessageValue.member?.displayName || MessageValue.author.displayName || MessageValue.author.username,
        avatar: MessageValue.member?.displayAvatarURL({ extension: "png", size: 256 }) ?? MessageValue.author.displayAvatarURL({ extension: "png", size: 256 }),
        reason: "Moderation message rewrite"
      });

      this.RewriteDeletedMessageIds.add(MessageValue.id);
      await MessageValue.delete();

      await Webhook.send({
        content: CleanContent.slice(0, 2000),
        username: MessageValue.member?.displayName || MessageValue.author.displayName || MessageValue.author.username,
        avatarURL: MessageValue.member?.displayAvatarURL({ extension: "png", size: 256 }) ?? MessageValue.author.displayAvatarURL({ extension: "png", size: 256 }),
        allowedMentions: { parse: [] },
        files: MessageValue.attachments.map((Attachment) => Attachment.url).slice(0, 10)
      });
    } catch (ErrorValue) {
      this.RewriteDeletedMessageIds.delete(MessageValue.id);
      this.Logger.Warn("Moderation rewrite could not repost a cleaned message.", ErrorValue);
      return false;
    } finally {
      if (Webhook) {
        await Webhook.delete("Moderation message rewrite completed").catch((ErrorValue: unknown) => {
          this.Logger.Warn("Moderation rewrite could not delete its webhook.", ErrorValue);
        });
      }
    }

    const ChannelName = this.GetChannelName(MessageValue) ?? "Unknown channel";
    const Words = [...RewriteResult.MatchedWords].join(", ");
    const Reason = this.ApplyTemplate(Config.RewriteWarnReason, {
      User: MessageValue.author.tag,
      Moderator: "AutoMod",
      Reason: "Message cleaned by moderation",
      Type: "Rewrite",
      Channel: ChannelName,
      Content: MessageValue.content.slice(0, 900),
      Old: MessageValue.content.slice(0, 900),
      New: RewriteResult.Content.slice(0, 900),
      Pattern: "",
      Invite: "",
      Words
    });

    if (Config.RewriteWarnUser) {
      await this.AppendSanction(GuildId, MessageValue.author.id, {
        Type: "Warn",
        UserId: MessageValue.author.id,
        UserTag: MessageValue.author.tag,
        ModeratorId: this.DiscordClient.user?.id ?? "AutoMod",
        ModeratorTag: this.DiscordClient.user?.tag ?? "AutoMod",
        Reason,
        CreatedAt: new Date().toISOString()
      });
    }

    if (Config.RewriteLogMessage.trim()) {
      await this.SendLogMessage(GuildId, Config, {
        Title: "Message cleaned",
        Description: this.ApplyTemplate(Config.RewriteLogMessage, {
          User: MessageValue.author.tag,
          Moderator: "AutoMod",
          Reason,
          Type: "Rewrite",
          Channel: ChannelName,
          Content: RewriteResult.Content.slice(0, 900),
          Old: MessageValue.content.slice(0, 900),
          New: RewriteResult.Content.slice(0, 900),
          Pattern: "",
          Invite: "",
          Words
        }),
        Color: 0x06b6d4
      });
    }

    return true;
  }

  private BuildCleanContent(Content: string, Config: ModerationConfig): { Changed: boolean; Content: string; MatchedWords: Set<string> } {
    let CleanContent = Content;
    const MatchedWords = new Set<string>();

    if (Config.ReplaceWordEnabled) {
      for (const Rule of Config.ReplaceWordRules) {
        const ReplacementRule = this.ParseReplacementRule(Rule);

        if (!ReplacementRule) {
          continue;
        }

        CleanContent = this.ReplaceWord(CleanContent, ReplacementRule.Search, ReplacementRule.Replacement, MatchedWords);
      }
    }

    if (Config.CensorWordEnabled) {
      for (const Word of Config.CensorWords.map((Value) => Value.trim()).filter(Boolean)) {
        CleanContent = this.ReplaceWord(CleanContent, Word, this.CensorWord(Word), MatchedWords);
      }
    }

    return {
      Changed: CleanContent !== Content,
      Content: CleanContent,
      MatchedWords
    };
  }

  private ReplaceWord(Content: string, Search: string, Replacement: string, MatchedWords: Set<string>): string {
    const TrimmedSearch = Search.trim();

    if (!TrimmedSearch) {
      return Content;
    }

    const Regex = TrimmedSearch.includes(" ")
      ? new RegExp(this.EscapeRegExp(TrimmedSearch), "giu")
      : new RegExp(`(^|[^\\p{L}\\p{N}_])(${this.EscapeRegExp(TrimmedSearch)})(?=$|[^\\p{L}\\p{N}_])`, "giu");

    return Content.replace(Regex, (...Args: unknown[]) => {
      const Match = String(Args[0]);
      const Prefix = TrimmedSearch.includes(" ") ? "" : String(Args[1]);
      const MatchedWord = TrimmedSearch.includes(" ") ? Match : String(Args[2]);

      MatchedWords.add(MatchedWord.toLowerCase());
      return `${Prefix}${this.MatchReplacementCasing(MatchedWord, Replacement)}`;
    });
  }

  private ParseReplacementRule(Rule: string): { Search: string; Replacement: string } | null {
    const SeparatorMatch = Rule.match(/\s*(?:=>|->|=)\s*/u);

    if (!SeparatorMatch || SeparatorMatch.index === undefined) {
      return null;
    }

    const Search = Rule.slice(0, SeparatorMatch.index).trim();
    const Replacement = Rule.slice(SeparatorMatch.index + SeparatorMatch[0].length).trim();

    if (!Search) {
      return null;
    }

    return { Search, Replacement };
  }

  private CensorWord(Word: string): string {
    const TrimmedWord = Word.trim();

    if (TrimmedWord.length <= 1) {
      return "*";
    }

    if (TrimmedWord.length === 2) {
      return `${TrimmedWord[0]}*`;
    }

    return `${TrimmedWord[0]}${"*".repeat(Math.max(1, TrimmedWord.length - 2))}${TrimmedWord[TrimmedWord.length - 1]}`;
  }

  private MatchReplacementCasing(MatchedWord: string, Replacement: string): string {
    if (MatchedWord.toUpperCase() === MatchedWord) {
      return Replacement.toUpperCase();
    }

    if (MatchedWord[0]?.toUpperCase() === MatchedWord[0]) {
      return `${Replacement[0]?.toUpperCase() ?? ""}${Replacement.slice(1)}`;
    }

    return Replacement;
  }

  private CanCreateWebhookInChannel(Channel: Message["channel"]): Channel is WebhookWritableChannel {
    return "createWebhook" in Channel && typeof Channel.createWebhook === "function";
  }

  private HasAnyRole(Member: GuildMember | null, RoleIds: string[]): boolean {
    return RoleIds.some((RoleId) => Member?.roles.cache.has(RoleId));
  }

  private HasModerationAccess(Member: GuildMember | null, Config: ModerationConfig): boolean {
    return Member?.permissions.has(PermissionFlagsBits.ModerateMembers) === true || this.HasAnyRole(Member, Config.ModerationRoleIds);
  }

  private EscapeRegExp(Value: string): string {
    return Value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  }

  private NormalizeMuteDurationMinutes(DurationMinutes: number): number {
    if (!Number.isFinite(DurationMinutes)) {
      return DefaultModerationConfig.PunishmentMuteDurationMinutes;
    }

    return Math.min(Math.max(Math.trunc(DurationMinutes), 1), MaxDiscordTimeoutMinutes);
  }

  private FormatDuration(DurationMinutes: number): string {
    const Days = Math.floor(DurationMinutes / 1440);
    const Hours = Math.floor((DurationMinutes % 1440) / 60);
    const Minutes = DurationMinutes % 60;
    const Parts: string[] = [];

    if (Days > 0) {
      Parts.push(`${Days}d`);
    }

    if (Hours > 0) {
      Parts.push(`${Hours}h`);
    }

    if (Minutes > 0 || Parts.length === 0) {
      Parts.push(`${Minutes}m`);
    }

    return Parts.join(" ");
  }

  private async ApplyAutomodAction(
    MessageValue: Message,
    Config: ModerationConfig,
    Options: {
      Action: ModerationAutomodAction;
      Title: string;
      ReasonTemplate: string;
      LogTemplate: string;
      Pattern: string;
      Invite: string;
      Color: number;
    }
  ): Promise<void> {
    const GuildId = MessageValue.guildId;

    if (!GuildId) {
      return;
    }

    const ChannelName = this.GetChannelName(MessageValue) ?? "Unknown channel";
    const Reason = this.ApplyTemplate(Options.ReasonTemplate, {
      User: MessageValue.author.tag,
      Moderator: "AutoMod",
      Reason: "AutoMod regex match",
      Type: "AutoMod",
      Channel: ChannelName,
      Content: MessageValue.content.slice(0, 900),
      Old: "",
      New: "",
      Pattern: Options.Pattern,
      Invite: Options.Invite
    });
    const ShouldDelete = Options.Action === "Delete" || Options.Action === "DeleteAndWarn" || Options.Action === "DeleteAndMute" || Options.Action === "DeleteWarnAndMute";
    const ShouldWarn = Options.Action === "Warn" || Options.Action === "DeleteAndWarn" || Options.Action === "WarnAndMute" || Options.Action === "DeleteWarnAndMute";
    const ShouldMute = Options.Action === "Mute" || Options.Action === "DeleteAndMute" || Options.Action === "WarnAndMute" || Options.Action === "DeleteWarnAndMute";
    const MuteDurationMinutes = this.NormalizeMuteDurationMinutes(Config.PunishmentMuteDurationMinutes);
    const MuteDurationLabel = this.FormatDuration(MuteDurationMinutes);
    const MuteReason = this.ApplyTemplate(Config.PunishmentMuteReason, {
      User: MessageValue.author.tag,
      Moderator: "AutoMod",
      Reason,
      Type: "Timeout",
      Channel: ChannelName,
      Content: MessageValue.content.slice(0, 900),
      Old: "",
      New: "",
      Pattern: Options.Pattern,
      Invite: Options.Invite,
      Duration: MuteDurationLabel
    });

    if (ShouldDelete) {
      if (!MessageValue.deletable) {
        this.Logger.Warn("AutoMod matched a message but cannot delete it. Check bot permissions and role hierarchy.", {
          GuildId,
          ChannelId: MessageValue.channelId,
          MessageId: MessageValue.id
        });
      }

      await MessageValue.delete().catch((ErrorValue: unknown) => {
        this.Logger.Warn("AutoMod could not delete a matching message.", ErrorValue);
      });
    }

    if (ShouldMute) {
      const TargetMember = MessageValue.member ?? await MessageValue.guild?.members.fetch(MessageValue.author.id).catch(() => null);
      let MuteApplied = false;

      if (!TargetMember?.moderatable) {
        this.Logger.Warn("AutoMod matched a message but cannot mute the member. Check bot permissions and role hierarchy.", {
          GuildId,
          UserId: MessageValue.author.id,
          ChannelId: MessageValue.channelId,
          MessageId: MessageValue.id
        });
      } else {
        MuteApplied = await TargetMember.timeout(MuteDurationMinutes * 60_000, MuteReason).then(() => true).catch((ErrorValue: unknown) => {
          this.Logger.Warn("AutoMod could not mute a matching member.", ErrorValue);
          return false;
        });
      }

      if (MuteApplied) {
        await this.AppendSanction(GuildId, MessageValue.author.id, {
          Type: "Timeout",
          UserId: MessageValue.author.id,
          UserTag: MessageValue.author.tag,
          ModeratorId: this.DiscordClient.user?.id ?? "AutoMod",
          ModeratorTag: this.DiscordClient.user?.tag ?? "AutoMod",
          Reason: MuteReason,
          CreatedAt: new Date().toISOString()
        });
      }
    }

    if (ShouldWarn) {
      await this.AppendSanction(GuildId, MessageValue.author.id, {
        Type: "Warn",
        UserId: MessageValue.author.id,
        UserTag: MessageValue.author.tag,
        ModeratorId: this.DiscordClient.user?.id ?? "AutoMod",
        ModeratorTag: this.DiscordClient.user?.tag ?? "AutoMod",
        Reason,
        CreatedAt: new Date().toISOString()
      });
    }

    if (!Options.LogTemplate.trim()) {
      return;
    }

    await this.SendLogMessage(GuildId, Config, {
      Title: Options.Title,
      Description: this.ApplyTemplate(Options.LogTemplate, {
        User: MessageValue.author.tag,
        Moderator: "AutoMod",
        Reason,
        Type: Options.Action,
        Channel: ChannelName,
        Content: MessageValue.content.slice(0, 900),
        Old: "",
        New: "",
        Pattern: Options.Pattern,
        Invite: Options.Invite,
        Duration: MuteDurationLabel
      }),
      Color: Options.Color
    });
  }

  private FindMatchedPattern(Content: string, Patterns: string[]): string | null {
    for (const Pattern of Patterns.map((Value) => Value.trim()).filter(Boolean)) {
      try {
        if (new RegExp(Pattern, "iu").test(Content)) {
          return Pattern;
        }
      } catch (ErrorValue) {
        this.Logger.Warn("Invalid AutoMod regex ignored.", { Pattern, ErrorValue });
      }
    }

    return null;
  }

  private IsRepeatedSpam(MessageValue: Message, Config: ModerationConfig): boolean {
    const CacheKey = `${MessageValue.guildId}:${MessageValue.author.id}`;
    const Now = Date.now();
    const WindowMilliseconds = Math.max(1, Config.RepeatedSpamWindowSeconds) * 1000;
    const NormalizedContent = MessageValue.content.trim().toLowerCase();
    const PreviousMessages = (this.RepeatedMessageCache.get(CacheKey) ?? []).filter((Entry) => Now - Entry.CreatedAt <= WindowMilliseconds);
    const NextMessages = [...PreviousMessages, { Content: NormalizedContent, CreatedAt: Now }];

    this.RepeatedMessageCache.set(CacheKey, NextMessages);

    return NextMessages.filter((Entry) => Entry.Content === NormalizedContent).length >= Math.max(2, Config.RepeatedSpamThreshold);
  }

  private FindBlockedInviteCode(Content: string, Config: ModerationConfig): string | null {
    const InviteMatches = Content.matchAll(/(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9-]+)/giu);
    const AllowedInviteCodes = new Set(Config.AllowedInviteCodes.map((InviteCode) => InviteCode.trim().toLowerCase()).filter(Boolean));

    for (const InviteMatch of InviteMatches) {
      const InviteCode = InviteMatch[1]?.toLowerCase();

      if (InviteCode && !AllowedInviteCodes.has(InviteCode)) {
        return InviteCode;
      }
    }

    return null;
  }

  private async SendLogMessage(GuildId: string, Config: ModerationConfig, MessageOptions: { Title: string; Description: string; Color: number }): Promise<void> {
    const Channel = await this.ResolveWritableLogChannel(GuildId, Config.LogChannelId);

    if (!Channel) {
      this.Logger.Warn("Moderation log channel is missing or not writable.", { GuildId, ChannelId: Config.LogChannelId });
      return;
    }

    const Embed = new EmbedBuilder()
      .setTitle(MessageOptions.Title)
      .setDescription(MessageOptions.Description)
      .setColor(MessageOptions.Color)
      .setTimestamp(new Date());

    if (Channel.type === ChannelType.GuildForum) {
      await Channel.threads.create({
        name: MessageOptions.Title.slice(0, 90),
        message: { embeds: [Embed] }
      });
      return;
    }

    await Channel.send({ embeds: [Embed] });
  }

  private async ResolveWritableLogChannel(GuildId: string, ChannelId: string): Promise<TextChannel | NewsChannel | VoiceChannel | ForumChannel | null> {
    if (!ChannelId) {
      return null;
    }

    const Guild = await this.DiscordClient.guilds.fetch(GuildId).catch(() => null);
    const Channel = (await Guild?.channels.fetch(ChannelId).catch(() => null)) as GuildBasedChannel | null;

    if (!Channel) {
      return null;
    }

    if (Channel.type === ChannelType.GuildText || Channel.type === ChannelType.GuildAnnouncement || Channel.type === ChannelType.GuildVoice) {
      return Channel as TextChannel | NewsChannel | VoiceChannel;
    }

    if (Channel.type === ChannelType.GuildForum) {
      return Channel as ForumChannel;
    }

    return null;
  }

  private async AppendSanction(GuildId: string, UserId: string, Sanction: ModerationSanction): Promise<void> {
    const Sanctions = await this.GetSanctions(GuildId, UserId);
    Sanctions.push(Sanction);
    await this.Storage.SetUserValue(GuildId, UserId, "Sanctions", Sanctions);
  }

  private async GetSanctions(GuildId: string, UserId: string): Promise<ModerationSanction[]> {
    return (await this.Storage.GetUserValue<ModerationSanction[]>(GuildId, UserId, "Sanctions")) ?? [];
  }

  private async GetConfig(GuildId: string): Promise<ModerationConfig> {
    return {
      LogChannelId: (await this.Storage.GetGlobalConfig<string>(GuildId, "LogChannelId")) ?? DefaultModerationConfig.LogChannelId,
      WarnMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "WarnMessage")) ?? DefaultModerationConfig.WarnMessage,
      LogMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "LogMessage")) ?? DefaultModerationConfig.LogMessage,
      DeletedMessageLog: (await this.Storage.GetGlobalConfig<string>(GuildId, "DeletedMessageLog")) ?? DefaultModerationConfig.DeletedMessageLog,
      EditedMessageLog: (await this.Storage.GetGlobalConfig<string>(GuildId, "EditedMessageLog")) ?? DefaultModerationConfig.EditedMessageLog,
      MemberJoinLog: (await this.Storage.GetGlobalConfig<string>(GuildId, "MemberJoinLog")) ?? DefaultModerationConfig.MemberJoinLog,
      MemberLeaveLog: (await this.Storage.GetGlobalConfig<string>(GuildId, "MemberLeaveLog")) ?? DefaultModerationConfig.MemberLeaveLog,
      ModerationRoleIds: (await this.Storage.GetGlobalConfig<string[]>(GuildId, "ModerationRoleIds")) ?? DefaultModerationConfig.ModerationRoleIds,
      AutoModEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "AutoModEnabled")) ?? DefaultModerationConfig.AutoModEnabled,
      AutoModRegexPatterns: (await this.Storage.GetGlobalConfig<string[]>(GuildId, "AutoModRegexPatterns")) ?? DefaultModerationConfig.AutoModRegexPatterns,
      AutoModAction: (await this.Storage.GetGlobalConfig<ModerationConfig["AutoModAction"]>(GuildId, "AutoModAction")) ?? DefaultModerationConfig.AutoModAction,
      AutoModReason: (await this.Storage.GetGlobalConfig<string>(GuildId, "AutoModReason")) ?? DefaultModerationConfig.AutoModReason,
      AutoModLogMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "AutoModLogMessage")) ?? DefaultModerationConfig.AutoModLogMessage,
      RepeatedSpamEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "RepeatedSpamEnabled")) ?? DefaultModerationConfig.RepeatedSpamEnabled,
      RepeatedSpamWindowSeconds: (await this.Storage.GetGlobalConfig<number>(GuildId, "RepeatedSpamWindowSeconds")) ?? DefaultModerationConfig.RepeatedSpamWindowSeconds,
      RepeatedSpamThreshold: (await this.Storage.GetGlobalConfig<number>(GuildId, "RepeatedSpamThreshold")) ?? DefaultModerationConfig.RepeatedSpamThreshold,
      RepeatedSpamAction: (await this.Storage.GetGlobalConfig<ModerationConfig["RepeatedSpamAction"]>(GuildId, "RepeatedSpamAction")) ?? DefaultModerationConfig.RepeatedSpamAction,
      RepeatedSpamWhitelistRoleIds: (await this.Storage.GetGlobalConfig<string[]>(GuildId, "RepeatedSpamWhitelistRoleIds")) ?? DefaultModerationConfig.RepeatedSpamWhitelistRoleIds,
      InviteBlockEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "InviteBlockEnabled")) ?? DefaultModerationConfig.InviteBlockEnabled,
      AllowedInviteCodes: (await this.Storage.GetGlobalConfig<string[]>(GuildId, "AllowedInviteCodes")) ?? DefaultModerationConfig.AllowedInviteCodes,
      InviteBlockAction: (await this.Storage.GetGlobalConfig<ModerationConfig["InviteBlockAction"]>(GuildId, "InviteBlockAction")) ?? DefaultModerationConfig.InviteBlockAction,
      InviteBlockReason: (await this.Storage.GetGlobalConfig<string>(GuildId, "InviteBlockReason")) ?? DefaultModerationConfig.InviteBlockReason,
      InviteBlockLogMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "InviteBlockLogMessage")) ?? DefaultModerationConfig.InviteBlockLogMessage,
      PunishmentMuteReason: (await this.Storage.GetGlobalConfig<string>(GuildId, "PunishmentMuteReason")) ?? DefaultModerationConfig.PunishmentMuteReason,
      PunishmentMuteDurationMinutes: this.NormalizeMuteDurationMinutes((await this.Storage.GetGlobalConfig<number>(GuildId, "PunishmentMuteDurationMinutes")) ?? DefaultModerationConfig.PunishmentMuteDurationMinutes),
      ReplaceWordEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "ReplaceWordEnabled")) ?? DefaultModerationConfig.ReplaceWordEnabled,
      ReplaceWordRules: (await this.Storage.GetGlobalConfig<string[]>(GuildId, "ReplaceWordRules")) ?? DefaultModerationConfig.ReplaceWordRules,
      CensorWordEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "CensorWordEnabled")) ?? DefaultModerationConfig.CensorWordEnabled,
      CensorWords: (await this.Storage.GetGlobalConfig<string[]>(GuildId, "CensorWords")) ?? DefaultModerationConfig.CensorWords,
      RewriteBlockedRoleIds: (await this.Storage.GetGlobalConfig<string[]>(GuildId, "RewriteBlockedRoleIds")) ?? DefaultModerationConfig.RewriteBlockedRoleIds,
      RewriteWarnUser: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "RewriteWarnUser")) ?? DefaultModerationConfig.RewriteWarnUser,
      RewriteWarnReason: (await this.Storage.GetGlobalConfig<string>(GuildId, "RewriteWarnReason")) ?? DefaultModerationConfig.RewriteWarnReason,
      RewriteLogMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "RewriteLogMessage")) ?? DefaultModerationConfig.RewriteLogMessage
    };
  }

  private RememberMessage(MessageValue: Message): void {
    this.MessageCache.set(MessageValue.id, {
      AuthorTag: MessageValue.author.tag,
      ChannelName: this.GetChannelName(MessageValue) ?? "Unknown channel",
      Content: MessageValue.content?.slice(0, 900) || "[No content]"
    });

    if (this.MessageCache.size <= this.MessageCacheLimit) {
      return;
    }

    const FirstKey = this.MessageCache.keys().next().value as string | undefined;

    if (FirstKey) {
      this.MessageCache.delete(FirstKey);
    }
  }

  private GetChannelName(MessageValue: Message | PartialMessage): string | null {
    return "name" in MessageValue.channel && MessageValue.channel?.name ? `#${MessageValue.channel.name}` : null;
  }

  private ApplyTemplate(Template: string, Values: { User: string; Moderator: string; Reason: string; Type: string; Channel: string; Content: string; Old: string; New: string; Pattern?: string; Invite?: string; Words?: string; Duration?: string }): string {
    return Template
      .replaceAll("%user%", Values.User)
      .replaceAll("%moderator%", Values.Moderator)
      .replaceAll("%reason%", Values.Reason)
      .replaceAll("%type%", Values.Type)
      .replaceAll("%channel%", Values.Channel)
      .replaceAll("%content%", Values.Content)
      .replaceAll("%old%", Values.Old)
      .replaceAll("%new%", Values.New)
      .replaceAll("%pattern%", Values.Pattern ?? "")
      .replaceAll("%invite%", Values.Invite ?? "")
      .replaceAll("%words%", Values.Words ?? "")
      .replaceAll("%duration%", Values.Duration ?? "")
      .slice(0, 4000);
  }
}
