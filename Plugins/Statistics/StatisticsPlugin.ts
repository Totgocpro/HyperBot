import { AttachmentBuilder, ChannelType, EmbedBuilder, PermissionFlagsBits, type ChatInputCommandInteraction, type Guild, type GuildMember, type Message, type PartialGuildMember, type PartialMessage, type VoiceChannel, type VoiceState } from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type DailyCounters = Record<string, number>;

type MessageLedger = Record<string, {
  UserId: string;
  DayKey: string;
}>;

type VoiceSession = {
  GuildId: string;
  UserId: string;
  LastFlushedAt: number;
};

type StatsTextConfig = {
  StatsEmbedTitle: string;
  MessagesFieldTitle: string;
  VoiceFieldTitle: string;
  TodayLabel: string;
  ThisWeekLabel: string;
  ThisMonthLabel: string;
  ThisYearLabel: string;
  AllTimeLabel: string;
  StatsFooterText: string;
  StatsEmbedColor: string;
};

type EditableEmbedField = {
  Name: string;
  Value: string;
  Inline: boolean;
};

type EditableEmbed = {
  Title: string;
  Description: string;
  Color: string;
  Url: string;
  AuthorName: string;
  AuthorIconUrl: string;
  ThumbnailUrl: string;
  ImageUrl: string;
  FooterText: string;
  FooterIconUrl: string;
  Timestamp: boolean;
  Fields: EditableEmbedField[];
  ImageDataUrl: string;
  ImageName: string;
};

type BuiltStatsEmbed = {
  Embed: EmbedBuilder;
  Files: AttachmentBuilder[];
};

type ChannelCounter = {
  Id: string;
  Enabled: boolean;
  ChannelId: string;
  Template: string;
};

const MessagesDailyKey = "MessagesDaily";
const VoiceSecondsDailyKey = "VoiceSecondsDaily";
const JoinsDailyKey = "JoinsDaily";
const LeavesDailyKey = "LeavesDaily";
const MessageLedgerKey = "MessageLedger";
const ChannelCountersKey = "ChannelCounters";

const DefaultStatsTextConfig: StatsTextConfig = {
  StatsEmbedTitle: "%user%'s statistics",
  MessagesFieldTitle: "Messages",
  VoiceFieldTitle: "Voice time",
  TodayLabel: "Today",
  ThisWeekLabel: "This week",
  ThisMonthLabel: "This month",
  ThisYearLabel: "This year",
  AllTimeLabel: "All-time",
  StatsFooterText: "Statistics are tracked from the moment the plugin version with user stats is active.",
  StatsEmbedColor: "#3b82f6"
};

const DefaultStatsEmbed: EditableEmbed = {
  Title: "%user%'s statistics",
  Description: "",
  Color: "#3b82f6",
  Url: "",
  AuthorName: "",
  AuthorIconUrl: "",
  ThumbnailUrl: "%avatar%",
  ImageUrl: "",
  FooterText: "Statistics are tracked from the moment the plugin version with user stats is active.",
  FooterIconUrl: "",
  Timestamp: true,
  Fields: [
    {
      Name: "Messages",
      Value: "Today: **%messages_today%**\nThis week: **%messages_week%**\nThis month: **%messages_month%**\nAll-time: **%messages_all%**",
      Inline: true
    },
    {
      Name: "Voice time",
      Value: "Today: **%voice_today%**\nThis week: **%voice_week%**\nThis month: **%voice_month%**\nThis year: **%voice_year%**\nAll-time: **%voice_all%**",
      Inline: true
    }
  ],
  ImageDataUrl: "",
  ImageName: ""
};

export default class StatisticsPlugin extends BasePlugin {
  private readonly VoiceSessions = new Map<string, VoiceSession>();

  public async OnEnable(): Promise<void> {
    this.Logger.Info("Statistics plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    await this.FlushAllVoiceSessions();
    this.Logger.Info("Statistics plugin disabled.");
  }

  public async OnMessage(MessageValue: Message): Promise<void> {
    if (!MessageValue.guildId || (!(await this.ShouldTrackBots(MessageValue.guildId)) && MessageValue.author.bot)) {
      return;
    }

    const Now = new Date();
    await this.IncrementDailyCounter(MessageValue.guildId, MessagesDailyKey, 1, Now);
    await this.IncrementUserDailyCounter(MessageValue.guildId, MessageValue.author.id, MessagesDailyKey, 1, Now);
    await this.TrackCountedMessage(MessageValue.guildId, MessageValue.id, MessageValue.author.id, Now);
  }

  public async OnMessageDelete(MessageValue: Message | PartialMessage): Promise<void> {
    if (!MessageValue.guildId) {
      return;
    }

    const Ledger = (await this.Storage.GetGlobalConfig<MessageLedger>(MessageValue.guildId, MessageLedgerKey)) ?? {};
    const Entry = Ledger[MessageValue.id];

    if (!Entry) {
      return;
    }

    await this.IncrementDailyCounterByDayKey(MessageValue.guildId, MessagesDailyKey, -1, Entry.DayKey);
    await this.IncrementUserDailyCounterByDayKey(MessageValue.guildId, Entry.UserId, MessagesDailyKey, -1, Entry.DayKey);
    delete Ledger[MessageValue.id];
    await this.Storage.SetGlobalConfig(MessageValue.guildId, MessageLedgerKey, Ledger);
  }

  public async OnGuildMemberAdd(Member: GuildMember): Promise<void> {
    if (!(await this.ShouldTrackBots(Member.guild.id)) && Member.user.bot) {
      return;
    }

    await this.IncrementDailyCounter(Member.guild.id, JoinsDailyKey, 1, new Date());
  }

  public async OnGuildMemberRemove(Member: GuildMember | PartialGuildMember): Promise<void> {
    if (!(await this.ShouldTrackBots(Member.guild.id)) && Member.user.bot) {
      return;
    }

    await this.IncrementDailyCounter(Member.guild.id, LeavesDailyKey, 1, new Date());
  }

  public async OnVoiceStateUpdate(OldState: VoiceState, NewState: VoiceState): Promise<void> {
    const GuildId = NewState.guild.id;

    if (!(await this.ShouldTrackBots(GuildId)) && NewState.member?.user.bot) {
      return;
    }

    await this.RefreshVoiceChannelSessions(NewState.guild.id, OldState.channelId, Date.now());
    await this.RefreshVoiceChannelSessions(NewState.guild.id, NewState.channelId, Date.now());
  }

  public async OnTick(): Promise<void> {
    await this.FlushAllVoiceSessions();
    await this.UpdateChannelCounters();
  }

  public async OnSlashCommand(CommandName: string, Interaction: ChatInputCommandInteraction): Promise<void> {
    if (CommandName !== "stats") {
      await super.OnSlashCommand(CommandName, Interaction);
      return;
    }

    if (!Interaction.guildId) {
      await Interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    await this.FlushAllVoiceSessions();

    const MessageCounters = (await this.Storage.GetUserValue<DailyCounters>(Interaction.guildId, Interaction.user.id, MessagesDailyKey)) ?? {};
    const VoiceCounters = (await this.Storage.GetUserValue<DailyCounters>(Interaction.guildId, Interaction.user.id, VoiceSecondsDailyKey)) ?? {};
    const Now = new Date();
    const DisplayName = await this.GetInteractionDisplayName(Interaction);
    const TextConfig = await this.GetStatsTextConfig(Interaction.guildId);
    const StatsEmbed = await this.GetStatsEmbedConfig(Interaction.guildId, TextConfig);
    const TemplateValues = this.BuildStatsTemplateValues(DisplayName, Interaction.user.displayAvatarURL(), MessageCounters, VoiceCounters, Now);
    const BuiltEmbed = this.BuildStatsEmbed(StatsEmbed, TemplateValues);

    await Interaction.reply({ embeds: [BuiltEmbed.Embed], files: BuiltEmbed.Files, ephemeral: true });
  }

  private async FlushAllVoiceSessions(): Promise<void> {
    const Now = Date.now();

    for (const [SessionKey, Session] of this.VoiceSessions.entries()) {
      const Guild = this.DiscordClient.guilds.cache.get(Session.GuildId);
      const CurrentState = Guild?.voiceStates.cache.get(Session.UserId);

      if (!CurrentState || !(await this.IsCountableVoiceState(CurrentState))) {
        await this.FlushVoiceSession(SessionKey, Now);
        this.VoiceSessions.delete(SessionKey);
        continue;
      }

      await this.FlushVoiceSession(SessionKey, Now);
    }
  }

  private async FlushVoiceSession(SessionKey: string, Now: number): Promise<void> {
    const Session = this.VoiceSessions.get(SessionKey);

    if (!Session || Now <= Session.LastFlushedAt) {
      return;
    }

    const Seconds = Math.floor((Now - Session.LastFlushedAt) / 1000);

    if (Seconds <= 0) {
      return;
    }

    await this.IncrementDailyCounter(Session.GuildId, VoiceSecondsDailyKey, Seconds, new Date(Now));
    await this.IncrementUserDailyCounter(Session.GuildId, Session.UserId, VoiceSecondsDailyKey, Seconds, new Date(Now));
    Session.LastFlushedAt = Now;
  }

  private async IncrementDailyCounter(GuildId: string, Key: string, Amount: number, DateValue: Date): Promise<void> {
    const DayKey = DateValue.toISOString().slice(0, 10);
    await this.IncrementDailyCounterByDayKey(GuildId, Key, Amount, DayKey);
  }

  private async IncrementDailyCounterByDayKey(GuildId: string, Key: string, Amount: number, DayKey: string): Promise<void> {
    const Counters = (await this.Storage.GetGlobalConfig<DailyCounters>(GuildId, Key)) ?? {};
    Counters[DayKey] = Math.max(0, (Counters[DayKey] ?? 0) + Amount);
    await this.Storage.SetGlobalConfig(GuildId, Key, Counters);
  }

  private async IncrementUserDailyCounter(GuildId: string, UserId: string, Key: string, Amount: number, DateValue: Date): Promise<void> {
    const DayKey = DateValue.toISOString().slice(0, 10);
    await this.IncrementUserDailyCounterByDayKey(GuildId, UserId, Key, Amount, DayKey);
  }

  private async IncrementUserDailyCounterByDayKey(GuildId: string, UserId: string, Key: string, Amount: number, DayKey: string): Promise<void> {
    const Counters = (await this.Storage.GetUserValue<DailyCounters>(GuildId, UserId, Key)) ?? {};
    Counters[DayKey] = Math.max(0, (Counters[DayKey] ?? 0) + Amount);
    await this.Storage.SetUserValue(GuildId, UserId, Key, Counters);
  }

  private async TrackCountedMessage(GuildId: string, MessageId: string, UserId: string, DateValue: Date): Promise<void> {
    const Ledger = (await this.Storage.GetGlobalConfig<MessageLedger>(GuildId, MessageLedgerKey)) ?? {};
    Ledger[MessageId] = {
      UserId,
      DayKey: this.ToDayKey(DateValue)
    };
    await this.Storage.SetGlobalConfig(GuildId, MessageLedgerKey, Ledger);
  }

  private SumRange(Counters: DailyCounters, StartDate: Date, EndDate: Date): number {
    const StartKey = this.ToDayKey(StartDate);
    const EndKey = this.ToDayKey(EndDate);

    return Object.entries(Counters).reduce((Total, [DayKey, Value]) => {
      if (DayKey < StartKey || DayKey > EndKey) {
        return Total;
      }

      return Total + Value;
    }, 0);
  }

  private SumAll(Counters: DailyCounters): number {
    return Object.values(Counters).reduce((Total, Value) => Total + Value, 0);
  }

  private GetStartOfDay(DateValue: Date): Date {
    return new Date(DateValue.getFullYear(), DateValue.getMonth(), DateValue.getDate());
  }

  private GetStartOfWeek(DateValue: Date): Date {
    const StartDate = this.GetStartOfDay(DateValue);
    const DayIndex = (StartDate.getDay() + 6) % 7;
    StartDate.setDate(StartDate.getDate() - DayIndex);
    return StartDate;
  }

  private GetStartOfMonth(DateValue: Date): Date {
    return new Date(DateValue.getFullYear(), DateValue.getMonth(), 1);
  }

  private GetStartOfYear(DateValue: Date): Date {
    return new Date(DateValue.getFullYear(), 0, 1);
  }

  private ToDayKey(DateValue: Date): string {
    return DateValue.toISOString().slice(0, 10);
  }

  private FormatDuration(SecondsValue: number): string {
    const Hours = Math.floor(SecondsValue / 3600);
    const Minutes = Math.floor((SecondsValue % 3600) / 60);

    if (Hours <= 0) {
      return `${Minutes}m`;
    }

    return `${Hours}h ${Minutes}m`;
  }

  private async ShouldTrackBots(GuildId: string): Promise<boolean> {
    return (await this.Storage.GetGlobalConfig<boolean>(GuildId, "TrackBots")) ?? false;
  }

  private async IsTrackableVoiceState(State: VoiceState): Promise<boolean> {
    if (!(await this.IsCountableVoiceState(State))) {
      return false;
    }

    return (await this.GetCountableVoiceStates(State.guild.id, State.channelId)).some((VoiceStateValue) => VoiceStateValue.id !== State.id);
  }

  private async IsCountableVoiceState(State: VoiceState): Promise<boolean> {
    if (!State.channelId) {
      return false;
    }

    if (State.selfMute || State.serverMute) {
      return false;
    }

    const IgnoredVoiceChannelIds = (await this.Storage.GetGlobalConfig<string[]>(State.guild.id, "IgnoredVoiceChannelIds")) ?? [];
    return !IgnoredVoiceChannelIds.includes(State.channelId);
  }

  private async RefreshVoiceChannelSessions(GuildId: string, ChannelId: string | null, Now: number): Promise<void> {
    if (!ChannelId) {
      return;
    }

    const Guild = this.DiscordClient.guilds.cache.get(GuildId);
    const ChannelStates = Guild?.voiceStates.cache.filter((State) => State.channelId === ChannelId);

    if (!ChannelStates) {
      return;
    }

    const CountableStates = await this.GetCountableVoiceStates(GuildId, ChannelId);
    const CountableUserIds = new Set(CountableStates.map((State) => State.id));
    const ShouldCountTime = CountableStates.length >= 2;

    for (const State of ChannelStates.values()) {
      const SessionKey = this.BuildVoiceSessionKey(GuildId, State.id);
      const HasSession = this.VoiceSessions.has(SessionKey);
      const ShouldHaveSession = ShouldCountTime && CountableUserIds.has(State.id);

      if (!HasSession && ShouldHaveSession) {
        this.VoiceSessions.set(SessionKey, {
          GuildId,
          UserId: State.id,
          LastFlushedAt: Now
        });
        continue;
      }

      if (HasSession && !ShouldHaveSession) {
        await this.FlushVoiceSession(SessionKey, Now);
        this.VoiceSessions.delete(SessionKey);
      }
    }
  }

  private async GetCountableVoiceStates(GuildId: string, ChannelId: string | null): Promise<VoiceState[]> {
    if (!ChannelId) {
      return [];
    }

    const Guild = this.DiscordClient.guilds.cache.get(GuildId);
    const ChannelStates = Guild?.voiceStates.cache.filter((State) => State.channelId === ChannelId);

    if (!ChannelStates) {
      return [];
    }

    const CountableStates: VoiceState[] = [];

    for (const State of ChannelStates.values()) {
      if (await this.IsCountableVoiceState(State)) {
        CountableStates.push(State);
      }
    }

    return CountableStates;
  }

  private async GetStatsTextConfig(GuildId: string): Promise<StatsTextConfig> {
    return {
      StatsEmbedTitle: await this.GetTextConfigValue(GuildId, "StatsEmbedTitle"),
      MessagesFieldTitle: await this.GetTextConfigValue(GuildId, "MessagesFieldTitle"),
      VoiceFieldTitle: await this.GetTextConfigValue(GuildId, "VoiceFieldTitle"),
      TodayLabel: await this.GetTextConfigValue(GuildId, "TodayLabel"),
      ThisWeekLabel: await this.GetTextConfigValue(GuildId, "ThisWeekLabel"),
      ThisMonthLabel: await this.GetTextConfigValue(GuildId, "ThisMonthLabel"),
      ThisYearLabel: await this.GetTextConfigValue(GuildId, "ThisYearLabel"),
      AllTimeLabel: await this.GetTextConfigValue(GuildId, "AllTimeLabel"),
      StatsFooterText: await this.GetTextConfigValue(GuildId, "StatsFooterText"),
      StatsEmbedColor: await this.GetTextConfigValue(GuildId, "StatsEmbedColor")
    };
  }

  private async GetStatsEmbedConfig(GuildId: string, TextConfig: StatsTextConfig): Promise<EditableEmbed> {
    const StoredValue = await this.Storage.GetGlobalConfig<unknown>(GuildId, "StatsEmbed");

    if (!this.IsRecord(StoredValue)) {
      return this.BuildLegacyStatsEmbed(TextConfig);
    }

    return {
      Title: this.GetRecordString(StoredValue, "Title", DefaultStatsEmbed.Title),
      Description: this.GetRecordString(StoredValue, "Description", DefaultStatsEmbed.Description),
      Color: this.GetRecordString(StoredValue, "Color", DefaultStatsEmbed.Color),
      Url: this.GetRecordString(StoredValue, "Url", DefaultStatsEmbed.Url),
      AuthorName: this.GetRecordString(StoredValue, "AuthorName", DefaultStatsEmbed.AuthorName),
      AuthorIconUrl: this.GetRecordString(StoredValue, "AuthorIconUrl", DefaultStatsEmbed.AuthorIconUrl),
      ThumbnailUrl: this.GetRecordString(StoredValue, "ThumbnailUrl", DefaultStatsEmbed.ThumbnailUrl),
      ImageUrl: this.GetRecordString(StoredValue, "ImageUrl", DefaultStatsEmbed.ImageUrl),
      FooterText: this.GetRecordString(StoredValue, "FooterText", DefaultStatsEmbed.FooterText),
      FooterIconUrl: this.GetRecordString(StoredValue, "FooterIconUrl", DefaultStatsEmbed.FooterIconUrl),
      Timestamp: typeof StoredValue.Timestamp === "boolean" ? StoredValue.Timestamp : DefaultStatsEmbed.Timestamp,
      Fields: this.ParseEmbedFields(StoredValue.Fields),
      ImageDataUrl: this.GetRecordString(StoredValue, "ImageDataUrl", DefaultStatsEmbed.ImageDataUrl),
      ImageName: this.GetRecordString(StoredValue, "ImageName", DefaultStatsEmbed.ImageName)
    };
  }

  private BuildLegacyStatsEmbed(TextConfig: StatsTextConfig): EditableEmbed {
    return {
      ...DefaultStatsEmbed,
      Title: TextConfig.StatsEmbedTitle,
      Color: TextConfig.StatsEmbedColor,
      FooterText: TextConfig.StatsFooterText,
      Fields: [
        {
          Name: TextConfig.MessagesFieldTitle,
          Value: [
            `${TextConfig.TodayLabel}: **%messages_today%**`,
            `${TextConfig.ThisWeekLabel}: **%messages_week%**`,
            `${TextConfig.ThisMonthLabel}: **%messages_month%**`,
            `${TextConfig.AllTimeLabel}: **%messages_all%**`
          ].join("\n"),
          Inline: true
        },
        {
          Name: TextConfig.VoiceFieldTitle,
          Value: [
            `${TextConfig.TodayLabel}: **%voice_today%**`,
            `${TextConfig.ThisWeekLabel}: **%voice_week%**`,
            `${TextConfig.ThisMonthLabel}: **%voice_month%**`,
            `${TextConfig.ThisYearLabel}: **%voice_year%**`,
            `${TextConfig.AllTimeLabel}: **%voice_all%**`
          ].join("\n"),
          Inline: true
        }
      ]
    };
  }

  private BuildStatsTemplateValues(DisplayName: string, AvatarUrl: string, MessageCounters: DailyCounters, VoiceCounters: DailyCounters, Now: Date): Record<string, string> {
    const MessagesToday = this.SumRange(MessageCounters, this.GetStartOfDay(Now), Now);
    const MessagesWeek = this.SumRange(MessageCounters, this.GetStartOfWeek(Now), Now);
    const MessagesMonth = this.SumRange(MessageCounters, this.GetStartOfMonth(Now), Now);
    const MessagesAll = this.SumAll(MessageCounters);
    const VoiceToday = this.SumRange(VoiceCounters, this.GetStartOfDay(Now), Now);
    const VoiceWeek = this.SumRange(VoiceCounters, this.GetStartOfWeek(Now), Now);
    const VoiceMonth = this.SumRange(VoiceCounters, this.GetStartOfMonth(Now), Now);
    const VoiceYear = this.SumRange(VoiceCounters, this.GetStartOfYear(Now), Now);
    const VoiceAll = this.SumAll(VoiceCounters);

    return {
      "%user%": DisplayName,
      "%avatar%": AvatarUrl,
      "%messages_today%": MessagesToday.toLocaleString(),
      "%messages_week%": MessagesWeek.toLocaleString(),
      "%messages_month%": MessagesMonth.toLocaleString(),
      "%messages_all%": MessagesAll.toLocaleString(),
      "%voice_today%": this.FormatDuration(VoiceToday),
      "%voice_week%": this.FormatDuration(VoiceWeek),
      "%voice_month%": this.FormatDuration(VoiceMonth),
      "%voice_year%": this.FormatDuration(VoiceYear),
      "%voice_all%": this.FormatDuration(VoiceAll),
      "%voice_today_seconds%": VoiceToday.toLocaleString(),
      "%voice_week_seconds%": VoiceWeek.toLocaleString(),
      "%voice_month_seconds%": VoiceMonth.toLocaleString(),
      "%voice_year_seconds%": VoiceYear.toLocaleString(),
      "%voice_all_seconds%": VoiceAll.toLocaleString()
    };
  }

  private BuildStatsEmbed(Source: EditableEmbed, TemplateValues: Record<string, string>): BuiltStatsEmbed {
    const Embed = new EmbedBuilder().setColor(this.ParseEmbedColor(Source.Color));
    const Files: AttachmentBuilder[] = [];
    const Title = this.ApplyStatsTemplate(Source.Title, TemplateValues).trim();
    const Description = this.ApplyStatsTemplate(Source.Description, TemplateValues).trim();
    const Url = this.ApplyStatsTemplate(Source.Url, TemplateValues).trim();
    const AuthorName = this.ApplyStatsTemplate(Source.AuthorName, TemplateValues).trim();
    const AuthorIconUrl = this.ApplyStatsTemplate(Source.AuthorIconUrl, TemplateValues).trim();
    const ThumbnailUrl = this.ApplyStatsTemplate(Source.ThumbnailUrl, TemplateValues).trim();
    const ImageUrl = this.ApplyStatsTemplate(Source.ImageUrl, TemplateValues).trim();
    const FooterText = this.ApplyStatsTemplate(Source.FooterText, TemplateValues).trim();
    const FooterIconUrl = this.ApplyStatsTemplate(Source.FooterIconUrl, TemplateValues).trim();

    if (Title) {
      Embed.setTitle(Title.slice(0, 256));
    }

    if (Description) {
      Embed.setDescription(Description.slice(0, 4096));
    }

    if (Url) {
      Embed.setURL(Url);
    }

    if (AuthorName) {
      Embed.setAuthor({ name: AuthorName.slice(0, 256), iconURL: AuthorIconUrl || undefined });
    }

    if (ThumbnailUrl) {
      Embed.setThumbnail(ThumbnailUrl);
    }

    const ParsedImage = this.ParseDataImage(Source.ImageDataUrl, Source.ImageName);

    if (ParsedImage) {
      Files.push(new AttachmentBuilder(ParsedImage.Buffer, { name: ParsedImage.Name }));
      Embed.setImage(`attachment://${ParsedImage.Name}`);
    } else if (ImageUrl) {
      Embed.setImage(ImageUrl);
    }

    if (FooterText) {
      Embed.setFooter({ text: FooterText.slice(0, 2048), iconURL: FooterIconUrl || undefined });
    }

    if (Source.Timestamp) {
      Embed.setTimestamp(new Date());
    }

    const Fields = Source.Fields.map((Field) => ({
      name: this.ApplyStatsTemplate(Field.Name, TemplateValues).trim().slice(0, 256),
      value: this.ApplyStatsTemplate(Field.Value, TemplateValues).trim().slice(0, 1024),
      inline: Field.Inline
    })).filter((Field) => Field.name && Field.value).slice(0, 25);

    if (Fields.length > 0) {
      Embed.addFields(Fields);
    }

    return { Embed, Files };
  }

  private ApplyStatsTemplate(Value: string, TemplateValues: Record<string, string>): string {
    return Object.entries(TemplateValues).reduce((CurrentValue, [Key, Replacement]) => CurrentValue.replaceAll(Key, Replacement), Value);
  }

  private ParseEmbedFields(Value: unknown): EditableEmbedField[] {
    if (!Array.isArray(Value)) {
      return DefaultStatsEmbed.Fields;
    }

    return Value.filter((Item): Item is Record<string, unknown> => this.IsRecord(Item)).map((Item) => ({
      Name: typeof Item.Name === "string" ? Item.Name : "",
      Value: typeof Item.Value === "string" ? Item.Value : "",
      Inline: Item.Inline === true
    })).filter((Field) => Field.Name.trim() || Field.Value.trim());
  }

  private ParseDataImage(DataUrl: string, ImageName: string): { Buffer: Buffer; Name: string } | null {
    const Match = /^data:image\/(png|jpe?g|gif|webp);base64,([a-z0-9+/=]+)$/iu.exec(DataUrl);

    if (!Match) {
      return null;
    }

    const Extension = Match[1].toLowerCase() === "jpeg" ? "jpg" : Match[1].toLowerCase();
    const SafeBaseName = ImageName.replace(/\.[^.]+$/u, "").replace(/[^a-z0-9_-]/giu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "").slice(0, 40) || "stats-image";
    return {
      Buffer: Buffer.from(Match[2], "base64"),
      Name: `${SafeBaseName}.${Extension}`
    };
  }

  private IsRecord(Value: unknown): Value is Record<string, unknown> {
    return typeof Value === "object" && Value !== null && !Array.isArray(Value);
  }

  private GetRecordString(Value: Record<string, unknown>, Key: string, Fallback: string): string {
    return typeof Value[Key] === "string" ? Value[Key] : Fallback;
  }

  private async UpdateChannelCounters(): Promise<void> {
    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      const Counters = await this.GetChannelCounters(Guild.id);
      let HasChanges = false;

      for (const Counter of Counters) {
        if (!Counter.Enabled || !Counter.Template.trim()) {
          continue;
        }

        const Channel = await this.ResolveOrCreateCounterChannel(Guild, Counter);

        if (!Channel) {
          continue;
        }

        if (Counter.ChannelId !== Channel.id) {
          Counter.ChannelId = Channel.id;
          HasChanges = true;
        }

        const NextName = this.BuildCounterChannelName(Counter.Template, Guild);

        if (Channel.name !== NextName) {
          await Channel.setName(NextName, "Statistics channel counter update").catch((ErrorValue: unknown) => {
            this.Logger.Warn("Statistics counter channel could not be renamed.", {
              ChannelId: Channel.id,
              Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
              GuildId: Guild.id
            });
          });
        }
      }

      if (HasChanges) {
        await this.Storage.SetGlobalConfig(Guild.id, ChannelCountersKey, Counters);
      }
    }
  }

  private async ResolveOrCreateCounterChannel(Guild: Guild, Counter: ChannelCounter): Promise<VoiceChannel | null> {
    if (Counter.ChannelId) {
      const ExistingChannel = await Guild.channels.fetch(Counter.ChannelId).catch(() => null);

      if (ExistingChannel?.type === ChannelType.GuildVoice) {
        await this.EnsureCounterChannelLocked(ExistingChannel);
        return ExistingChannel;
      }
    }

    const Name = this.BuildCounterChannelName(Counter.Template, Guild);
    const CreatedChannel = await Guild.channels.create({
      name: Name,
      type: ChannelType.GuildVoice,
      reason: "Statistics channel counter created",
      permissionOverwrites: [
        {
          id: Guild.id,
          deny: [PermissionFlagsBits.Connect]
        }
      ]
    }).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Statistics counter channel could not be created.", {
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        GuildId: Guild.id
      });
      return null;
    });

    return CreatedChannel?.type === ChannelType.GuildVoice ? CreatedChannel : null;
  }

  private async EnsureCounterChannelLocked(Channel: VoiceChannel): Promise<void> {
    const EveryoneOverwrite = Channel.permissionOverwrites.cache.get(Channel.guild.id);

    if (EveryoneOverwrite?.deny.has(PermissionFlagsBits.Connect)) {
      return;
    }

    await Channel.permissionOverwrites.edit(Channel.guild.id, {
      Connect: false
    }, {
      reason: "Statistics channel counter locked"
    }).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Statistics counter channel could not be locked.", {
        ChannelId: Channel.id,
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        GuildId: Channel.guild.id
      });
    });
  }

  private BuildCounterChannelName(Template: string, Guild: Guild): string {
    const MembersCount = Guild.memberCount;
    const BotsCount = Guild.members.cache.filter((Member) => Member.user.bot).size;
    const HumansCount = Math.max(0, MembersCount - BotsCount);
    const OnlineCount = Guild.members.cache.filter((Member) => Member.presence?.status && Member.presence.status !== "offline").size;
    const VoiceCount = Guild.voiceStates.cache.filter((State) => Boolean(State.channelId)).size;
    const BoostCount = Guild.premiumSubscriptionCount ?? 0;

    return Template
      .replaceAll("%members_count%", MembersCount.toLocaleString())
      .replaceAll("%humans_count%", HumansCount.toLocaleString())
      .replaceAll("%bots_count%", BotsCount.toLocaleString())
      .replaceAll("%online_count%", OnlineCount.toLocaleString())
      .replaceAll("%voice_count%", VoiceCount.toLocaleString())
      .replaceAll("%channels_count%", Guild.channels.cache.size.toLocaleString())
      .replaceAll("%roles_count%", Guild.roles.cache.size.toLocaleString())
      .replaceAll("%boosts_count%", BoostCount.toLocaleString())
      .slice(0, 100) || "Statistics";
  }

  private async GetChannelCounters(GuildId: string): Promise<ChannelCounter[]> {
    const StoredValue = await this.Storage.GetGlobalConfig<unknown>(GuildId, ChannelCountersKey);

    if (!Array.isArray(StoredValue)) {
      return [];
    }

    return StoredValue.filter((Value): Value is Record<string, unknown> => typeof Value === "object" && Value !== null && !Array.isArray(Value)).map((Value) => ({
      Id: typeof Value.Id === "string" ? Value.Id : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      Enabled: Value.Enabled !== false,
      ChannelId: typeof Value.ChannelId === "string" ? Value.ChannelId : "",
      Template: typeof Value.Template === "string" ? Value.Template : "Members: %members_count%"
    }));
  }

  private async GetTextConfigValue(GuildId: string, Key: keyof StatsTextConfig): Promise<string> {
    const StoredValue = await this.Storage.GetGlobalConfig<string>(GuildId, Key);
    const SafeValue = StoredValue ?? DefaultStatsTextConfig[Key];
    return SafeValue.trim() || DefaultStatsTextConfig[Key];
  }

  private async GetInteractionDisplayName(Interaction: ChatInputCommandInteraction): Promise<string> {
    if (Interaction.inCachedGuild()) {
      return Interaction.member.displayName;
    }

    if (Interaction.guild) {
      const Member = await Interaction.guild.members.fetch(Interaction.user.id).catch(() => null);

      if (Member) {
        return Member.displayName;
      }
    }

    return Interaction.user.globalName ?? Interaction.user.displayName;
  }

  private ParseEmbedColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : DefaultStatsTextConfig.StatsEmbedColor;
    return Number.parseInt(SafeColor.slice(1), 16);
  }

  private BuildVoiceSessionKey(GuildId: string, UserId: string): string {
    return `${GuildId}:${UserId}`;
  }
}
