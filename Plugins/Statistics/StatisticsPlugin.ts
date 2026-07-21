import { AttachmentBuilder, ChannelType, EmbedBuilder, PermissionFlagsBits, type ChatInputCommandInteraction, type Guild, type GuildMember, type Message, type MessageReaction, type PartialGuildMember, type PartialMessage, type PartialUser, type User, type VoiceChannel, type VoiceState } from "discord.js";
import { createElement, type ReactNode } from "react";
import { BasePlugin } from "../../src/Core/BasePlugin.js";
import { Prisma } from "../../src/Core/Clients.js";
import {
  RenderSatoriToPng, FetchImageAsDataUri, FetchImageBuffer, GetDominantColor,
  HexToRgb, RgbToHex, MixRgb, Rgba, BoostColor,
  BuildActivityChartDataUri, BuildScoreGaugeDataUri, BuildBackgroundDataUri,
  SvgToDataUri, EscapeSvgText, DescribeArcPath, PolarToCartesian,
  type RgbColor, type ImageResizeOptions, type ServerActivityPoint
} from "../../src/Core/ImageGenerator.js";

const H = createElement;

type DailyCounters = Record<string, number>;
type HourlyCounters = Record<string, number>;

type MessageLedger = Record<string, {
  UserId: string;
  DayKey: string;
  HourKey?: string;
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

type ActivityConfig = {
  ActivityWindowDays: number;
  ActiveMessageThreshold: number;
  ActiveVoiceMinuteThreshold: number;
  ActiveReactionThreshold: number;
  LowActivityMessageThreshold: number;
  LowActivityVoiceMinuteThreshold: number;
  LowActivityReactionThreshold: number;
  ActiveRoleId: string;
  InactiveRoleId: string;
};

type ActivityBucket = {
  Label: string;
  Value: number;
  Color: string;
};

type ActivityOverview = {
  Active: number;
  LowActivity: number;
  Inactive: number;
  Total: number;
  WindowDays: number;
  GeneratedAt: string;
  Buckets: ActivityBucket[];
  Thresholds: {
    ActiveMessages: number;
    ActiveVoiceMinutes: number;
    ActiveReactions: number;
    LowActivityMessages: number;
    LowActivityVoiceMinutes: number;
    LowActivityReactions: number;
  };
};

type ServerTopMember = {
  UserId: string;
  DisplayName: string;
  AvatarUrl: string;
  Messages: number;
  VoiceSeconds: number;
  Reactions: number;
  Score: number;
};

type ServerStatisticsImageData = {
  GuildName: string;
  GuildIconUrl: string | null;
  GuildBannerUrl: string | null;
  AccentColor: string;
  ActivityScore: number;
  ActivityWindowDays: number;
  MemberCount: number;
  HumanCount: number;
  BotCount: number;
  BoostCount: number;
  ChannelCount: number;
  TotalMessages: number;
  TotalVoiceSeconds: number;
  TotalReactions: number;
  ActivityPoints: ServerActivityPoint[];
  TopMembers: ServerTopMember[];
  GeneratedAt: Date;
};

type ServerStatisticsImageAssets = {
  GuildIconDataUri: string | null;
  GuildBannerDataUri: string | null;
  TopMemberDataUris: Array<string | null>;
};

const MessagesDailyKey = "MessagesDaily";
const MessagesHourlyKey = "MessagesHourly";
const VoiceSecondsDailyKey = "VoiceSecondsDaily";
const VoiceSecondsHourlyKey = "VoiceSecondsHourly";
const ReactionsDailyKey = "ReactionsDaily";
const ReactionsHourlyKey = "ReactionsHourly";
const JoinsDailyKey = "JoinsDaily";
const JoinsHourlyKey = "JoinsHourly";
const LeavesDailyKey = "LeavesDaily";
const LeavesHourlyKey = "LeavesHourly";
const MessageLedgerKey = "MessageLedger";
const ChannelCountersKey = "ChannelCounters";
const ActivityOverviewKey = "ActivityOverview";

const DefaultActivityConfig: ActivityConfig = {
  ActivityWindowDays: 30,
  ActiveMessageThreshold: 20,
  ActiveVoiceMinuteThreshold: 60,
  ActiveReactionThreshold: 10,
  LowActivityMessageThreshold: 3,
  LowActivityVoiceMinuteThreshold: 10,
  LowActivityReactionThreshold: 2,
  ActiveRoleId: "",
  InactiveRoleId: ""
};

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
  private LastActivityOverviewAt = 0;
  private LastActivityRoleSyncAt = 0;
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
    await this.IncrementHourlyCounter(MessageValue.guildId, MessagesHourlyKey, 1, Now);
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
    if (Entry.HourKey) {
      await this.IncrementHourlyCounterByHourKey(MessageValue.guildId, MessagesHourlyKey, -1, Entry.HourKey);
    }
    await this.IncrementUserDailyCounterByDayKey(MessageValue.guildId, Entry.UserId, MessagesDailyKey, -1, Entry.DayKey);
    delete Ledger[MessageValue.id];
    await this.Storage.SetGlobalConfig(MessageValue.guildId, MessageLedgerKey, Ledger);
  }

  public async OnMessageReactionAdd(Reaction: MessageReaction, UserValue: User | PartialUser): Promise<void> {
    const GuildId = Reaction.message.guildId;

    if (!GuildId || (!(await this.ShouldTrackBots(GuildId)) && UserValue.bot)) {
      return;
    }

    const Now = new Date();
    await this.IncrementDailyCounter(GuildId, ReactionsDailyKey, 1, Now);
    await this.IncrementHourlyCounter(GuildId, ReactionsHourlyKey, 1, Now);
    await this.IncrementUserDailyCounter(GuildId, UserValue.id, ReactionsDailyKey, 1, Now);
  }

  public async OnGuildMemberAdd(Member: GuildMember): Promise<void> {
    if (!(await this.ShouldTrackBots(Member.guild.id)) && Member.user.bot) {
      return;
    }

    await this.IncrementDailyCounter(Member.guild.id, JoinsDailyKey, 1, new Date());
    await this.IncrementHourlyCounter(Member.guild.id, JoinsHourlyKey, 1, new Date());
  }

  public async OnGuildMemberRemove(Member: GuildMember | PartialGuildMember): Promise<void> {
    if (!(await this.ShouldTrackBots(Member.guild.id)) && Member.user.bot) {
      return;
    }

    await this.IncrementDailyCounter(Member.guild.id, LeavesDailyKey, 1, new Date());
    await this.IncrementHourlyCounter(Member.guild.id, LeavesHourlyKey, 1, new Date());
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
    await this.UpdateActivityOverviewIfNeeded();
  }

  public async OnSlashCommand(CommandName: string, Interaction: ChatInputCommandInteraction): Promise<void> {
    if (CommandName === "server-statistics") {
      await this.HandleServerStatisticsCommand(Interaction);
      return;
    }

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

  private async HandleServerStatisticsCommand(Interaction: ChatInputCommandInteraction): Promise<void> {
    if (!Interaction.guildId || !Interaction.guild) {
      await Interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    await Interaction.deferReply();
    await this.FlushAllVoiceSessions();
    await this.UpdateGuildActivityOverview(Interaction.guild, false);

    const Data = await this.BuildServerStatisticsImageData(Interaction.guild);
    const ImageBuffer = await this.BuildServerStatisticsImage(Data);
    const Attachment = new AttachmentBuilder(ImageBuffer, { name: "server-statistics.png" });

    await Interaction.editReply({ files: [Attachment] });
  }

  private async BuildServerStatisticsImageData(Guild: Guild): Promise<ServerStatisticsImageData> {
    const Now = new Date();
    const GraphStartDate = this.GetStartOfDay(Now);
    GraphStartDate.setDate(GraphStartDate.getDate() - 13);
    const Config = await this.GetActivityConfig(Guild.id);
    const Members = await Guild.members.fetch().catch(() => Guild.members.cache);
    const TrackBots = await this.ShouldTrackBots(Guild.id);
    const MessageCounters = (await this.Storage.GetGlobalConfig<DailyCounters>(Guild.id, MessagesDailyKey)) ?? {};
    const VoiceCounters = (await this.Storage.GetGlobalConfig<DailyCounters>(Guild.id, VoiceSecondsDailyKey)) ?? {};
    const ReactionCounters = (await this.Storage.GetGlobalConfig<DailyCounters>(Guild.id, ReactionsDailyKey)) ?? {};
    const ActivityOverview = await this.Storage.GetGlobalConfig<ActivityOverview>(Guild.id, ActivityOverviewKey);
    const TopMembers = await this.BuildServerTopMembers(Guild, Config.ActivityWindowDays, TrackBots);
    const GuildIconUrl = Guild.iconURL({ extension: "png", size: 256 });
    const GuildBannerUrl = Guild.bannerURL({ extension: "png", size: 1024 });
    const AccentColor = await this.ResolveGuildAccentColor(GuildIconUrl, GuildBannerUrl);
    const ActivityPoints: ServerActivityPoint[] = [];

    for (let Index = 0; Index < 14; Index += 1) {
      const Day = new Date(GraphStartDate);
      Day.setDate(GraphStartDate.getDate() + Index);
      const DayKey = this.ToDayKey(Day);
      const Messages = MessageCounters[DayKey] ?? 0;
      const VoiceMinutes = Math.floor((VoiceCounters[DayKey] ?? 0) / 60);
      const Reactions = ReactionCounters[DayKey] ?? 0;

      ActivityPoints.push({
        Label: `${Day.getMonth() + 1}/${Day.getDate()}`,
        Messages,
        VoiceMinutes,
        Reactions,
        Score: this.CalculateActivityPoints(Messages, VoiceMinutes, Reactions)
      });
    }

    const HumanCount = Members.filter((Member) => !Member.user.bot).size || Math.max(0, Guild.memberCount - Members.filter((Member) => Member.user.bot).size);
    const BotCount = Math.max(0, Guild.memberCount - HumanCount);

    return {
      GuildName: Guild.name,
      GuildIconUrl,
      GuildBannerUrl,
      AccentColor,
      ActivityScore: this.CalculateServerActivityScore(ActivityOverview, ActivityPoints, Math.max(1, HumanCount)),
      ActivityWindowDays: Math.max(1, Config.ActivityWindowDays),
      MemberCount: Guild.memberCount,
      HumanCount,
      BotCount,
      BoostCount: Guild.premiumSubscriptionCount ?? 0,
      ChannelCount: Guild.channels.cache.size,
      TotalMessages: this.SumRange(MessageCounters, GraphStartDate, Now),
      TotalVoiceSeconds: this.SumRange(VoiceCounters, GraphStartDate, Now),
      TotalReactions: this.SumRange(ReactionCounters, GraphStartDate, Now),
      ActivityPoints,
      TopMembers,
      GeneratedAt: Now
    };
  }

  private async BuildServerTopMembers(Guild: Guild, WindowDays: number, TrackBots: boolean): Promise<ServerTopMember[]> {
    const Now = new Date();
    const StartDate = this.GetStartOfDay(Now);
    StartDate.setDate(StartDate.getDate() - Math.max(1, WindowDays) + 1);
    const StoredValues = await Prisma.userPluginValue.findMany({
      where: {
        BotId: this.BotId,
        GuildId: Guild.id,
        PluginId: this.Manifest.Metadata.Id,
        Key: {
          in: [MessagesDailyKey, VoiceSecondsDailyKey, ReactionsDailyKey]
        }
      },
      select: {
        UserId: true,
        Key: true,
        Value: true
      }
    });
    const Rows = new Map<string, { UserId: string; Messages: number; VoiceSeconds: number; Reactions: number }>();

    for (const StoredValue of StoredValues) {
      const Row = Rows.get(StoredValue.UserId) ?? {
        UserId: StoredValue.UserId,
        Messages: 0,
        VoiceSeconds: 0,
        Reactions: 0
      };
      const Total = this.SumRange(this.ParseDailyCounters(StoredValue.Value), StartDate, Now);

      if (StoredValue.Key === MessagesDailyKey) {
        Row.Messages = Total;
      } else if (StoredValue.Key === VoiceSecondsDailyKey) {
        Row.VoiceSeconds = Total;
      } else if (StoredValue.Key === ReactionsDailyKey) {
        Row.Reactions = Total;
      }

      Rows.set(StoredValue.UserId, Row);
    }

    return Array.from(Rows.values())
      .map((Row) => {
        const Member = Guild.members.cache.get(Row.UserId);
        return {
          ...Row,
          DisplayName: Member?.displayName ?? `User ${Row.UserId.slice(-4)}`,
          AvatarUrl: Member?.user.displayAvatarURL({ extension: "png", size: 128 }) ?? "",
          Score: this.CalculateActivityPoints(Row.Messages, Math.floor(Row.VoiceSeconds / 60), Row.Reactions)
        };
      })
      .filter((Row) => Row.Score > 0)
      .filter((Row) => TrackBots || Guild.members.cache.get(Row.UserId)?.user.bot !== true)
      .sort((FirstRow, SecondRow) => SecondRow.Score - FirstRow.Score || SecondRow.Messages - FirstRow.Messages || SecondRow.VoiceSeconds - FirstRow.VoiceSeconds)
      .slice(0, 3);
  }

  private async BuildServerStatisticsImage(Data: ServerStatisticsImageData): Promise<Buffer> {
    const Width = 1200;
    const Height = 675;
    const Assets = await this.BuildServerStatisticsImageAssets(Data);
    return await RenderSatoriToPng(this.BuildServerStatisticsElement(Data, Assets), Width, Height);
  }

  private async BuildServerStatisticsImageAssets(Data: ServerStatisticsImageData): Promise<ServerStatisticsImageAssets> {
    return {
      GuildIconDataUri: Data.GuildIconUrl ? await FetchImageAsDataUri(Data.GuildIconUrl, { Width: 138, Height: 138 }) : null,
      GuildBannerDataUri: Data.GuildBannerUrl ? await FetchImageAsDataUri(Data.GuildBannerUrl, { Width: 1200, Height: 675 }) : null,
      TopMemberDataUris: await Promise.all(Data.TopMembers.map((Member) => Member.AvatarUrl ? FetchImageAsDataUri(Member.AvatarUrl, { Width: 76, Height: 76 }) : Promise.resolve(null)))
    };
  }

  private BuildServerStatisticsElement(Data: ServerStatisticsImageData, Assets: ServerStatisticsImageAssets): ReactNode {
    const Accent = HexToRgb(Data.AccentColor);
    const AccentSoft = Rgba(Accent, 0.18);
    const MutedText = "rgba(203, 213, 225, 0.72)";
    const CardStyle = {
      display: "flex",
      backgroundColor: "rgba(15, 23, 42, 0.68)",
      border: "1px solid rgba(226, 232, 240, 0.12)",
      borderRadius: 26
    };
    const Metrics = [
      { Label: "Members", Value: Data.MemberCount.toLocaleString(), Detail: `${Data.HumanCount.toLocaleString()} humans - ${Data.BotCount.toLocaleString()} bots` },
      { Label: "Messages", Value: Data.TotalMessages.toLocaleString(), Detail: "last 14 days" },
      { Label: "Voice time", Value: this.FormatDuration(Data.TotalVoiceSeconds), Detail: "counted voice activity" },
      { Label: "Reactions", Value: Data.TotalReactions.toLocaleString(), Detail: "last 14 days" }
    ];

    return H("div", {
      style: {
        width: 1200,
        height: 675,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        color: "#f8fafc",
        fontFamily: "DejaVu Sans",
        backgroundColor: "#050816"
      },
      children: [
        H("img", {
          key: "background-art",
          src: BuildBackgroundDataUri(1200, 675, Data.AccentColor),
          style: { position: "absolute", left: 0, top: 0, width: 1200, height: 675 }
        }),
        Assets.GuildBannerDataUri ? H("img", {
          key: "banner",
          src: Assets.GuildBannerDataUri,
          style: { position: "absolute", left: 0, top: 0, width: 1200, height: 675, opacity: 0.26 }
        }) : null,
        H("div", {
          key: "content",
          style: { position: "absolute", left: 42, top: 42, width: 1116, height: 591, display: "flex", flexDirection: "column", gap: 16 },
          children: [
            H("div", {
              key: "header",
              style: { ...CardStyle, height: 184, padding: 22, flexDirection: "row", alignItems: "center" },
              children: [
                Assets.GuildIconDataUri ? H("img", {
                  key: "icon",
                  src: Assets.GuildIconDataUri,
                  style: { width: 138, height: 138, borderRadius: 34, objectFit: "cover", border: "1px solid rgba(226, 232, 240, 0.18)" }
                }) : H("div", {
                  key: "icon-placeholder",
                  style: { width: 138, height: 138, borderRadius: 34, backgroundColor: AccentSoft, alignItems: "center", justifyContent: "center", display: "flex", fontSize: 44, fontWeight: 800 },
                  children: Data.GuildName.slice(0, 2).toUpperCase()
                }),
                H("div", {
                  key: "title-block",
                  style: { display: "flex", flexDirection: "column", marginLeft: 28, flex: 1, minWidth: 0 },
                  children: [
                    H("div", { key: "title", style: { fontSize: 48, fontWeight: 800, lineHeight: 1.05, maxWidth: 620 }, children: this.TruncatePlainText(Data.GuildName, 28) }),
                    H("div", { key: "subtitle", style: { marginTop: 14, fontSize: 20, fontWeight: 600, color: "rgba(226, 232, 240, 0.76)" }, children: "Server activity over the last 14 days" }),
                    H("div", {
                      key: "pills",
                      style: { display: "flex", flexDirection: "row", gap: 10, marginTop: 18 },
                      children: [
                        this.BuildSatoriPill(`${Data.ActivityWindowDays}d member window`),
                        this.BuildSatoriPill(`${Data.BoostCount.toLocaleString()} boosts`),
                        this.BuildSatoriPill(`${Data.ChannelCount.toLocaleString()} channels`)
                      ]
                    })
                  ]
                }),
                H("div", {
                  key: "generated",
                  style: { fontSize: 18, fontWeight: 600, color: "rgba(226, 232, 240, 0.68)", alignSelf: "flex-start" },
                  children: `Generated ${Data.GeneratedAt.toLocaleDateString()} ${Data.GeneratedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                })
              ]
            }),
            H("div", {
              key: "metrics",
              style: { display: "flex", flexDirection: "row", gap: 24, height: 104 },
              children: Metrics.map((Metric, Index) => H("div", {
                key: Metric.Label,
                style: { ...CardStyle, width: 249, height: 104, padding: "22px 22px 14px 22px", flexDirection: "column", position: "relative", overflow: "hidden" },
                children: [
                  H("div", { key: "bar", style: { position: "absolute", left: 0, top: 0, width: 6, height: 104, backgroundColor: Rgba(Accent, Index === 0 ? 0.95 : 0.72) } }),
                  H("div", { key: "label", style: { fontSize: 15, fontWeight: 800, color: "rgba(226, 232, 240, 0.64)" }, children: Metric.Label.toUpperCase() }),
                  H("div", { key: "value", style: { marginTop: 8, fontSize: 30, fontWeight: 800, lineHeight: 1 }, children: Metric.Value }),
                  H("div", { key: "detail", style: { marginTop: 7, fontSize: 15, fontWeight: 600, color: MutedText }, children: Metric.Detail })
                ]
              }))
            }),
            H("div", {
              key: "main",
              style: { display: "flex", flexDirection: "row", gap: 33, height: 206 },
              children: [
                H("div", {
                  key: "chart",
                  style: { ...CardStyle, width: 705, height: 206, padding: 26, flexDirection: "column" },
                  children: [
                    H("div", { key: "chart-title", style: { fontSize: 25, fontWeight: 800 }, children: "General activity" }),
                    H("div", { key: "chart-subtitle", style: { marginTop: 6, fontSize: 15, fontWeight: 600, color: MutedText }, children: "Messages + reactions + voice minutes" }),
                    H("img", { key: "chart-image", src: BuildActivityChartDataUri(Data.ActivityPoints, Data.AccentColor), style: { marginTop: 14, width: 653, height: 95 } })
                  ]
                }),
                H("div", {
                  key: "score",
                  style: { ...CardStyle, width: 354, height: 206, padding: 26, flexDirection: "column", alignItems: "center", position: "relative" },
                  children: [
                    H("div", { key: "score-title", style: { width: "100%", fontSize: 25, fontWeight: 800 }, children: "Activity score" }),
                    H("img", { key: "score-gauge", src: BuildScoreGaugeDataUri(Data.ActivityScore, Data.AccentColor), style: { marginTop: 8, width: 146, height: 108 } }),
                    H("div", { key: "score-value", style: { position: "absolute", top: 82, fontSize: 42, fontWeight: 800 }, children: String(Data.ActivityScore) }),
                    H("div", { key: "score-total", style: { position: "absolute", top: 128, fontSize: 15, fontWeight: 700, color: MutedText }, children: "/ 100" }),
                    H("div", { key: "score-desc", style: { marginTop: 12, fontSize: 14, fontWeight: 600, color: "rgba(226, 232, 240, 0.66)" }, children: "Active members and recent activity" })
                  ]
                })
              ]
            }),
            H("div", {
              key: "top",
              style: { display: "flex", flexDirection: "column", marginTop: 4 },
              children: [
                H("div", { key: "top-title", style: { fontSize: 22, fontWeight: 800, marginBottom: 8 }, children: "Top 3 active members" }),
                Data.TopMembers.length === 0 ? H("div", {
                  key: "empty-top",
                  style: { fontSize: 17, fontWeight: 600, color: MutedText },
                  children: "No tracked member activity yet."
                }) : H("div", {
                  key: "top-list",
                  style: { display: "flex", flexDirection: "row", gap: 12 },
                  children: Data.TopMembers.map((Member, Index) => H("div", {
                    key: Member.UserId,
                    style: { ...CardStyle, width: 356, height: 44, padding: "5px 14px", flexDirection: "row", alignItems: "center", overflow: "hidden", position: "relative" },
                    children: [
                      H("div", { key: "rank-bar", style: { position: "absolute", left: 0, top: 0, width: 5, height: 44, backgroundColor: Rgba(Accent, 0.9) } }),
                      H("div", { key: "rank", style: { width: 34, fontSize: 20, fontWeight: 800 }, children: `#${Index + 1}` }),
                      Assets.TopMemberDataUris[Index] ? H("img", {
                        key: "avatar",
                        src: Assets.TopMemberDataUris[Index] ?? "",
                        style: { width: 34, height: 34, borderRadius: 17, marginRight: 12 }
                      }) : H("div", {
                        key: "avatar-placeholder",
                        style: { width: 34, height: 34, borderRadius: 17, backgroundColor: AccentSoft, marginRight: 12 }
                      }),
                      H("div", {
                        key: "member-info",
                        style: { display: "flex", flexDirection: "column", minWidth: 0 },
                        children: [
                          H("div", { key: "name", style: { fontSize: 15, fontWeight: 700, color: "#e2e8f0" }, children: this.TruncatePlainText(Member.DisplayName, 22) }),
                          H("div", {
                            key: "stats",
                            style: { marginTop: 2, fontSize: 11, fontWeight: 600, color: "rgba(203, 213, 225, 0.64)" },
                            children: `${Member.Messages.toLocaleString()} msg - ${this.FormatDuration(Member.VoiceSeconds)} - ${Member.Reactions.toLocaleString()} react`
                          })
                        ]
                      })
                    ]
                  }))
                })
              ]
            })
          ]
        })
      ].filter(Boolean)
    });
  }

  private BuildSatoriPill(Text: string): ReactNode {
    return H("div", {
      style: {
        display: "flex",
        height: 34,
        alignItems: "center",
        justifyContent: "center",
        padding: "0 14px",
        borderRadius: 17,
        backgroundColor: "rgba(226, 232, 240, 0.1)",
        border: "1px solid rgba(226, 232, 240, 0.12)",
        color: "rgba(226, 232, 240, 0.82)",
        fontSize: 15,
        fontWeight: 700
      },
      children: Text
    });
  }

  private async ResolveGuildAccentColor(IconUrl: string | null, BannerUrl: string | null): Promise<string> {
    const ImageBuffer = await FetchImageBuffer(IconUrl ?? BannerUrl);
    if (!ImageBuffer) {
      return DefaultStatsTextConfig.StatsEmbedColor;
    }

    return RgbToHex(await GetDominantColor(ImageBuffer.Buffer, DefaultStatsTextConfig.StatsEmbedColor));
  }

  private CalculateActivityPoints(Messages: number, VoiceMinutes: number, Reactions: number): number {
    return Math.round(Messages * 1.2 + VoiceMinutes * 1.8 + Reactions * 0.7);
  }

  private CalculateServerActivityScore(Overview: ActivityOverview | null, Points: ServerActivityPoint[], HumanCount: number): number {
    if (Overview && Overview.Total > 0) {
      return Math.max(0, Math.min(100, Math.round(((Overview.Active + Overview.LowActivity * 0.45) / Overview.Total) * 100)));
    }

    const AverageDailyPoints = Points.reduce((Total, Point) => Total + Point.Score, 0) / Math.max(1, Points.length);
    return Math.max(0, Math.min(100, Math.round((AverageDailyPoints / Math.max(1, HumanCount) / 3) * 100)));
  }

  private ParseDailyCounters(Value: unknown): DailyCounters {
    if (!this.IsRecord(Value)) {
      return {};
    }

    return Object.fromEntries(Object.entries(Value).filter((Entry): Entry is [string, number] => typeof Entry[1] === "number" && Number.isFinite(Entry[1])));
  }

  private TruncatePlainText(Value: string, MaxLength: number): string {
    if (Value.length <= MaxLength) {
      return Value;
    }

    return `${Value.slice(0, Math.max(1, MaxLength - 3))}...`;
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
    await this.IncrementHourlyCounter(Session.GuildId, VoiceSecondsHourlyKey, Seconds, new Date(Now));
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

  private async IncrementHourlyCounter(GuildId: string, Key: string, Amount: number, DateValue: Date): Promise<void> {
    await this.IncrementHourlyCounterByHourKey(GuildId, Key, Amount, this.ToHourKey(DateValue));
  }

  private async IncrementHourlyCounterByHourKey(GuildId: string, Key: string, Amount: number, HourKey: string): Promise<void> {
    const Counters = (await this.Storage.GetGlobalConfig<HourlyCounters>(GuildId, Key)) ?? {};
    Counters[HourKey] = Math.max(0, (Counters[HourKey] ?? 0) + Amount);
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
      DayKey: this.ToDayKey(DateValue),
      HourKey: this.ToHourKey(DateValue)
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

  private ToHourKey(DateValue: Date): string {
    const WeekdayIndex = (DateValue.getDay() + 6) % 7;
    return `${WeekdayIndex}:${DateValue.getHours()}`;
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

  private async GetActivityConfig(GuildId: string): Promise<ActivityConfig> {
    return {
      ActivityWindowDays: await this.GetNumberConfigValue(GuildId, "ActivityWindowDays", DefaultActivityConfig.ActivityWindowDays),
      ActiveMessageThreshold: await this.GetNumberConfigValue(GuildId, "ActiveMessageThreshold", DefaultActivityConfig.ActiveMessageThreshold),
      ActiveVoiceMinuteThreshold: await this.GetNumberConfigValue(GuildId, "ActiveVoiceMinuteThreshold", DefaultActivityConfig.ActiveVoiceMinuteThreshold),
      ActiveReactionThreshold: await this.GetNumberConfigValue(GuildId, "ActiveReactionThreshold", DefaultActivityConfig.ActiveReactionThreshold),
      LowActivityMessageThreshold: await this.GetNumberConfigValue(GuildId, "LowActivityMessageThreshold", DefaultActivityConfig.LowActivityMessageThreshold),
      LowActivityVoiceMinuteThreshold: await this.GetNumberConfigValue(GuildId, "LowActivityVoiceMinuteThreshold", DefaultActivityConfig.LowActivityVoiceMinuteThreshold),
      LowActivityReactionThreshold: await this.GetNumberConfigValue(GuildId, "LowActivityReactionThreshold", DefaultActivityConfig.LowActivityReactionThreshold),
      ActiveRoleId: (await this.Storage.GetGlobalConfig<string>(GuildId, "ActiveRoleId")) ?? DefaultActivityConfig.ActiveRoleId,
      InactiveRoleId: (await this.Storage.GetGlobalConfig<string>(GuildId, "InactiveRoleId")) ?? DefaultActivityConfig.InactiveRoleId
    };
  }

  private async GetNumberConfigValue(GuildId: string, Key: string, Fallback: number): Promise<number> {
    const StoredValue = await this.Storage.GetGlobalConfig<number>(GuildId, Key);

    if (typeof StoredValue !== "number" || !Number.isFinite(StoredValue)) {
      return Fallback;
    }

    return Math.max(0, StoredValue);
  }

  private async UpdateActivityOverviewIfNeeded(): Promise<void> {
    const Now = Date.now();
    const ShouldUpdateOverview = Now - this.LastActivityOverviewAt >= 60_000;
    const ShouldSyncRoles = Now - this.LastActivityRoleSyncAt >= 300_000;

    if (!ShouldUpdateOverview && !ShouldSyncRoles) {
      return;
    }

    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      await this.UpdateGuildActivityOverview(Guild, ShouldSyncRoles);
    }

    this.LastActivityOverviewAt = Now;
    if (ShouldSyncRoles) {
      this.LastActivityRoleSyncAt = Now;
    }
  }

  private async UpdateGuildActivityOverview(Guild: Guild, SyncRoles: boolean): Promise<void> {
    const Config = await this.GetActivityConfig(Guild.id);
    const Now = new Date();
    const StartDate = new Date(Now);
    StartDate.setDate(StartDate.getDate() - Math.max(1, Config.ActivityWindowDays) + 1);

    const Members = await Guild.members.fetch().catch(() => Guild.members.cache);
    const TrackBots = await this.ShouldTrackBots(Guild.id);
    let Active = 0;
    let LowActivity = 0;
    let Inactive = 0;

    for (const Member of Members.values()) {
      if (!TrackBots && Member.user.bot) {
        continue;
      }

      const MessageCounters = (await this.Storage.GetUserValue<DailyCounters>(Guild.id, Member.id, MessagesDailyKey)) ?? {};
      const VoiceCounters = (await this.Storage.GetUserValue<DailyCounters>(Guild.id, Member.id, VoiceSecondsDailyKey)) ?? {};
      const ReactionCounters = (await this.Storage.GetUserValue<DailyCounters>(Guild.id, Member.id, ReactionsDailyKey)) ?? {};
      const Messages = this.SumRange(MessageCounters, StartDate, Now);
      const VoiceMinutes = Math.floor(this.SumRange(VoiceCounters, StartDate, Now) / 60);
      const Reactions = this.SumRange(ReactionCounters, StartDate, Now);
      const Status = this.ClassifyActivity(Messages, VoiceMinutes, Reactions, Config);

      if (Status === "Active") {
        Active += 1;
      } else if (Status === "LowActivity") {
        LowActivity += 1;
      } else {
        Inactive += 1;
      }

      if (SyncRoles) {
        await this.SyncActivityRoles(Member, Status, Config);
      }
    }

    const Total = Active + LowActivity + Inactive;
    const Overview: ActivityOverview = {
      Active,
      LowActivity,
      Inactive,
      Total,
      WindowDays: Math.max(1, Config.ActivityWindowDays),
      GeneratedAt: Now.toISOString(),
      Buckets: [
        { Label: "Active", Value: Active, Color: "#22c55e" },
        { Label: "Low activity", Value: LowActivity, Color: "#f59e0b" },
        { Label: "Inactive", Value: Inactive, Color: "#ef4444" }
      ],
      Thresholds: {
        ActiveMessages: Config.ActiveMessageThreshold,
        ActiveVoiceMinutes: Config.ActiveVoiceMinuteThreshold,
        ActiveReactions: Config.ActiveReactionThreshold,
        LowActivityMessages: Config.LowActivityMessageThreshold,
        LowActivityVoiceMinutes: Config.LowActivityVoiceMinuteThreshold,
        LowActivityReactions: Config.LowActivityReactionThreshold
      }
    };

    await this.Storage.SetGlobalConfig(Guild.id, ActivityOverviewKey, Overview);
  }

  private ClassifyActivity(Messages: number, VoiceMinutes: number, Reactions: number, Config: ActivityConfig): "Active" | "LowActivity" | "Inactive" {
    if (
      Messages >= Config.ActiveMessageThreshold ||
      VoiceMinutes >= Config.ActiveVoiceMinuteThreshold ||
      Reactions >= Config.ActiveReactionThreshold
    ) {
      return "Active";
    }

    if (
      Messages >= Config.LowActivityMessageThreshold ||
      VoiceMinutes >= Config.LowActivityVoiceMinuteThreshold ||
      Reactions >= Config.LowActivityReactionThreshold
    ) {
      return "LowActivity";
    }

    return "Inactive";
  }

  private async SyncActivityRoles(Member: GuildMember, Status: "Active" | "LowActivity" | "Inactive", Config: ActivityConfig): Promise<void> {
    const ActiveRole = Config.ActiveRoleId ? Member.guild.roles.cache.get(Config.ActiveRoleId) : null;
    const InactiveRole = Config.InactiveRoleId ? Member.guild.roles.cache.get(Config.InactiveRoleId) : null;
    const BotMember = Member.guild.members.me;

    if (!BotMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return;
    }

    if (ActiveRole && ActiveRole.editable) {
      if (Status === "Active" && !Member.roles.cache.has(ActiveRole.id)) {
        await Member.roles.add(ActiveRole).catch(() => null);
      } else if (Status !== "Active" && Member.roles.cache.has(ActiveRole.id)) {
        await Member.roles.remove(ActiveRole).catch(() => null);
      }
    }

    if (InactiveRole && InactiveRole.editable) {
      if (Status === "Inactive" && !Member.roles.cache.has(InactiveRole.id)) {
        await Member.roles.add(InactiveRole).catch(() => null);
      } else if (Status !== "Inactive" && Member.roles.cache.has(InactiveRole.id)) {
        await Member.roles.remove(InactiveRole).catch(() => null);
      }
    }
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
        if (!Counter.Enabled) {
          if (Counter.ChannelId) {
            const ExistingChannel = Guild.channels.cache.get(Counter.ChannelId);

            if (ExistingChannel?.type === ChannelType.GuildVoice) {
              await ExistingChannel.delete("Statistics channel counter disabled").catch((ErrorValue: unknown) => {
                this.Logger.Warn("Statistics counter channel could not be deleted.", {
                  ChannelId: Counter.ChannelId,
                  Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
                  GuildId: Guild.id
                });
              });
            }

            Counter.ChannelId = "";
            HasChanges = true;
          }

          continue;
        }

        if (!Counter.Template.trim()) {
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
    const BotId = this.DiscordClient.user?.id;

    if (!BotId) {
      return null;
    }

    const CreatedChannel = await Guild.channels.create({
      name: Name,
      type: ChannelType.GuildVoice,
      reason: "Statistics channel counter created",
      permissionOverwrites: [
        {
          id: Guild.id,
          deny: [PermissionFlagsBits.Connect]
        },
        {
          id: BotId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels]
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
    const BotId = this.DiscordClient.user?.id;

    if (!BotId) {
      return;
    }

    const EveryoneOverwrite = Channel.permissionOverwrites.cache.get(Channel.guild.id);
    const BotOverwrite = Channel.permissionOverwrites.cache.get(BotId);

    if (
      EveryoneOverwrite?.deny.has(PermissionFlagsBits.Connect) &&
      BotOverwrite?.allow.has(PermissionFlagsBits.ViewChannel) &&
      BotOverwrite?.allow.has(PermissionFlagsBits.ManageChannels)
    ) {
      return;
    }

    await Channel.permissionOverwrites.edit(BotId, {
      ViewChannel: true,
      Connect: true,
      ManageChannels: true
    }, {
      reason: "Statistics channel counter bot permissions"
    }).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Statistics counter channel bot permissions could not be set.", {
        ChannelId: Channel.id,
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        GuildId: Channel.guild.id
      });
    });

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
