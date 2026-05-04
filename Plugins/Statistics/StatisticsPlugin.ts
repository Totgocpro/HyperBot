import { EmbedBuilder, type ChatInputCommandInteraction, type GuildMember, type Message, type PartialGuildMember, type PartialMessage, type VoiceState } from "discord.js";
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

const MessagesDailyKey = "MessagesDaily";
const VoiceSecondsDailyKey = "VoiceSecondsDaily";
const JoinsDailyKey = "JoinsDaily";
const LeavesDailyKey = "LeavesDaily";
const MessageLedgerKey = "MessageLedger";

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
    const UserId = NewState.id;

    if (!(await this.ShouldTrackBots(GuildId)) && NewState.member?.user.bot) {
      return;
    }

    const SessionKey = this.BuildVoiceSessionKey(GuildId, UserId);
    const WasTrackable = await this.IsTrackableVoiceState(OldState);
    const IsTrackable = await this.IsTrackableVoiceState(NewState);

    if (!WasTrackable && IsTrackable) {
      this.VoiceSessions.set(SessionKey, {
        GuildId,
        UserId,
        LastFlushedAt: Date.now()
      });
      return;
    }

    if (WasTrackable && !IsTrackable) {
      await this.FlushVoiceSession(SessionKey, Date.now());
      this.VoiceSessions.delete(SessionKey);
    }
  }

  public async OnTick(): Promise<void> {
    await this.FlushAllVoiceSessions();
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
    const Embed = new EmbedBuilder()
      .setColor(this.ParseEmbedColor(TextConfig.StatsEmbedColor))
      .setTitle(this.ReplaceStatsTags(TextConfig.StatsEmbedTitle, DisplayName))
      .setThumbnail(Interaction.user.displayAvatarURL())
      .addFields(
        {
          name: this.ReplaceStatsTags(TextConfig.MessagesFieldTitle, DisplayName),
          value: [
            `${TextConfig.TodayLabel}: **${this.SumRange(MessageCounters, this.GetStartOfDay(Now), Now).toLocaleString()}**`,
            `${TextConfig.ThisWeekLabel}: **${this.SumRange(MessageCounters, this.GetStartOfWeek(Now), Now).toLocaleString()}**`,
            `${TextConfig.ThisMonthLabel}: **${this.SumRange(MessageCounters, this.GetStartOfMonth(Now), Now).toLocaleString()}**`,
            `${TextConfig.AllTimeLabel}: **${this.SumAll(MessageCounters).toLocaleString()}**`
          ].join("\n"),
          inline: true
        },
        {
          name: this.ReplaceStatsTags(TextConfig.VoiceFieldTitle, DisplayName),
          value: [
            `${TextConfig.TodayLabel}: **${this.FormatDuration(this.SumRange(VoiceCounters, this.GetStartOfDay(Now), Now))}**`,
            `${TextConfig.ThisWeekLabel}: **${this.FormatDuration(this.SumRange(VoiceCounters, this.GetStartOfWeek(Now), Now))}**`,
            `${TextConfig.ThisMonthLabel}: **${this.FormatDuration(this.SumRange(VoiceCounters, this.GetStartOfMonth(Now), Now))}**`,
            `${TextConfig.ThisYearLabel}: **${this.FormatDuration(this.SumRange(VoiceCounters, this.GetStartOfYear(Now), Now))}**`,
            `${TextConfig.AllTimeLabel}: **${this.FormatDuration(this.SumAll(VoiceCounters))}**`
          ].join("\n"),
          inline: true
        }
      )
      .setTimestamp(new Date());

    if (TextConfig.StatsFooterText.trim()) {
      Embed.setFooter({ text: this.ReplaceStatsTags(TextConfig.StatsFooterText, DisplayName) });
    }

    await Interaction.reply({ embeds: [Embed], ephemeral: true });
  }

  private async FlushAllVoiceSessions(): Promise<void> {
    const Now = Date.now();

    for (const [SessionKey, Session] of this.VoiceSessions.entries()) {
      const Guild = this.DiscordClient.guilds.cache.get(Session.GuildId);
      const CurrentState = Guild?.voiceStates.cache.get(Session.UserId);

      if (!CurrentState || !(await this.IsTrackableVoiceState(CurrentState))) {
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
    if (!State.channelId) {
      return false;
    }

    if (State.selfMute || State.serverMute) {
      return false;
    }

    const IgnoredVoiceChannelIds = (await this.Storage.GetGlobalConfig<string[]>(State.guild.id, "IgnoredVoiceChannelIds")) ?? [];
    return !IgnoredVoiceChannelIds.includes(State.channelId);
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

  private ReplaceStatsTags(Value: string, DisplayName: string): string {
    return Value.replace(/%user%/giu, DisplayName);
  }

  private ParseEmbedColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : DefaultStatsTextConfig.StatsEmbedColor;
    return Number.parseInt(SafeColor.slice(1), 16);
  }

  private BuildVoiceSessionKey(GuildId: string, UserId: string): string {
    return `${GuildId}:${UserId}`;
  }
}
