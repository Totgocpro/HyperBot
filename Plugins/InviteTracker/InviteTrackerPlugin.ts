import { ChannelType, EmbedBuilder, PermissionFlagsBits, type ChatInputCommandInteraction, type Guild, type GuildMember, type Invite, type PartialGuildMember, type TextChannel } from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type InviteTrackerConfig = {
  TrackBotAccounts: boolean;
  FakeAccountMaxAgeDays: number;
  LeaderboardSize: number;
  LogChannelId: string;
  JoinLogMessage: string;
  LeaveLogMessage: string;
  UnknownInviteMessage: string;
  EmbedColor: string;
};

type InviteCacheEntry = {
  ChannelId: string | null;
  Code: string;
  CreatedAt: string | null;
  InviterId: string | null;
  Uses: number;
};

type InviteCache = Record<string, InviteCacheEntry>;

type InviteStats = Record<string, {
  Bonus: number;
  Fake: number;
  Leaves: number;
  Regular: number;
  Unknown: number;
}>;

type InviteJoinLedger = Record<string, {
  Code: string;
  Fake: boolean;
  InviterId: string | null;
  JoinedAt: string;
}>;

type DailyCounters = Record<string, number>;

type InviteLeaderboardRow = {
  Fake: number;
  Leaves: number;
  Regular: number;
  Score: number;
  Unknown: number;
  UserId: string;
};

const InviteCacheKey = "InviteCache";
const InviteStatsKey = "InviteStats";
const InviteJoinLedgerKey = "InviteJoinLedger";
const InvitesDailyKey = "InvitesDaily";
const FakeInvitesDailyKey = "FakeInvitesDaily";
const InviteLeavesDailyKey = "InviteLeavesDaily";
const UnknownInvitesDailyKey = "UnknownInvitesDaily";

const DefaultConfig: InviteTrackerConfig = {
  TrackBotAccounts: false,
  FakeAccountMaxAgeDays: 7,
  LeaderboardSize: 10,
  LogChannelId: "",
  JoinLogMessage: "%member% joined using %invite% from %inviter%. Total: %total%.",
  LeaveLogMessage: "%member% left. Invited by %inviter% with %invite%.",
  UnknownInviteMessage: "%member% joined, but the used invite could not be detected.",
  EmbedColor: "#22c55e"
};

export default class InviteTrackerPlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    for (const GuildValue of this.DiscordClient.guilds.cache.values()) {
      await this.RefreshInviteCache(GuildValue).catch((ErrorValue: unknown) => {
        this.Logger.Warn("Invite cache refresh failed on enable.", this.BuildErrorMetadata(GuildValue.id, ErrorValue));
      });
    }

    this.Logger.Info("Invite Tracker plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Invite Tracker plugin disabled.");
  }

  public async OnGuildMemberAdd(Member: GuildMember): Promise<void> {
    const Config = await this.GetConfig(Member.guild.id);

    if (!Config.TrackBotAccounts && Member.user.bot) {
      return;
    }

    const PreviousCache = await this.GetInviteCache(Member.guild.id);
    const CurrentCache = await this.FetchInviteCache(Member.guild).catch(async (ErrorValue: unknown) => {
      this.Logger.Warn("Invite fetch failed on member join.", this.BuildErrorMetadata(Member.guild.id, ErrorValue));
      await this.TrackUnknownJoin(Member, Config);
      return null;
    });

    if (!CurrentCache) {
      return;
    }

    const UsedInvite = this.FindUsedInvite(PreviousCache, CurrentCache);
    await this.Storage.SetGlobalConfig(Member.guild.id, InviteCacheKey, CurrentCache);

    if (!UsedInvite || !UsedInvite.InviterId) {
      await this.TrackUnknownJoin(Member, Config);
      return;
    }

    const IsFake = this.IsFakeAccount(Member, Config);
    const Stats = await this.GetInviteStats(Member.guild.id);
    const InviterStats = this.GetStatsRow(Stats, UsedInvite.InviterId);
    InviterStats.Regular += IsFake ? 0 : 1;
    InviterStats.Fake += IsFake ? 1 : 0;
    Stats[UsedInvite.InviterId] = InviterStats;
    await this.Storage.SetGlobalConfig(Member.guild.id, InviteStatsKey, Stats);

    const Ledger = await this.GetJoinLedger(Member.guild.id);
    Ledger[Member.id] = {
      Code: UsedInvite.Code,
      Fake: IsFake,
      InviterId: UsedInvite.InviterId,
      JoinedAt: new Date().toISOString()
    };
    await this.Storage.SetGlobalConfig(Member.guild.id, InviteJoinLedgerKey, Ledger);
    await this.IncrementDailyCounter(Member.guild.id, InvitesDailyKey, 1);

    if (IsFake) {
      await this.IncrementDailyCounter(Member.guild.id, FakeInvitesDailyKey, 1);
    }

    await this.SendLog(Member.guild, Config, this.ApplyTemplate(Config.JoinLogMessage, {
      Code: UsedInvite.Code,
      Fake: IsFake,
      InviterId: UsedInvite.InviterId,
      MemberId: Member.id,
      Total: this.CalculateScore(InviterStats)
    }));
  }

  public async OnGuildMemberRemove(Member: GuildMember | PartialGuildMember): Promise<void> {
    const GuildId = Member.guild.id;
    const Ledger = await this.GetJoinLedger(GuildId);
    const JoinEntry = Ledger[Member.id];

    if (!JoinEntry?.InviterId) {
      return;
    }

    const Stats = await this.GetInviteStats(GuildId);
    const InviterStats = this.GetStatsRow(Stats, JoinEntry.InviterId);
    InviterStats.Leaves += 1;
    Stats[JoinEntry.InviterId] = InviterStats;
    delete Ledger[Member.id];

    await this.Storage.SetGlobalConfig(GuildId, InviteStatsKey, Stats);
    await this.Storage.SetGlobalConfig(GuildId, InviteJoinLedgerKey, Ledger);
    await this.IncrementDailyCounter(GuildId, InviteLeavesDailyKey, 1);

    const Config = await this.GetConfig(GuildId);
    await this.SendLog(Member.guild, Config, this.ApplyTemplate(Config.LeaveLogMessage, {
      Code: JoinEntry.Code,
      Fake: JoinEntry.Fake,
      InviterId: JoinEntry.InviterId,
      MemberId: Member.id,
      Total: this.CalculateScore(InviterStats)
    }));
  }

  public async OnSlashCommand(CommandName: string, Interaction: ChatInputCommandInteraction): Promise<void> {
    if (CommandName === "invites") {
      await this.HandleInvitesCommand(Interaction);
      return;
    }

    if (CommandName === "invite-leaderboard") {
      await this.HandleInviteLeaderboardCommand(Interaction);
      return;
    }

    await super.OnSlashCommand(CommandName, Interaction);
  }

  public async OnDashboardAction(GuildId: string, ActionKey: string): Promise<void> {
    if (ActionKey !== "RefreshInviteCache") {
      return;
    }

    const GuildValue = this.DiscordClient.guilds.cache.get(GuildId);

    if (!GuildValue) {
      throw new Error("Guild is not available in the bot cache.");
    }

    await this.RefreshInviteCache(GuildValue);
  }

  private async HandleInvitesCommand(Interaction: ChatInputCommandInteraction): Promise<void> {
    if (!Interaction.guildId) {
      await Interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    const TargetUser = Interaction.options.getUser("user") ?? Interaction.user;
    const Stats = await this.GetInviteStats(Interaction.guildId);
    const Row = this.GetStatsRow(Stats, TargetUser.id);
    const Config = await this.GetConfig(Interaction.guildId);
    const Embed = new EmbedBuilder()
      .setColor(this.ParseEmbedColor(Config.EmbedColor))
      .setTitle(`${TargetUser.displayName}'s invite stats`)
      .setDescription([
        `Score: **${this.CalculateScore(Row).toLocaleString()}**`,
        `Regular: **${Row.Regular.toLocaleString()}**`,
        `Fake: **${Row.Fake.toLocaleString()}**`,
        `Left: **${Row.Leaves.toLocaleString()}**`,
        `Bonus: **${Row.Bonus.toLocaleString()}**`,
        `Unknown: **${Row.Unknown.toLocaleString()}**`
      ].join("\n"))
      .setThumbnail(TargetUser.displayAvatarURL())
      .setTimestamp(new Date());

    await Interaction.reply({ embeds: [Embed] });
  }

  private async HandleInviteLeaderboardCommand(Interaction: ChatInputCommandInteraction): Promise<void> {
    if (!Interaction.guildId) {
      await Interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    const Config = await this.GetConfig(Interaction.guildId);
    const Rows = this.BuildLeaderboardRows(await this.GetInviteStats(Interaction.guildId)).slice(0, Config.LeaderboardSize);
    const Description = Rows.length === 0
      ? "No invitations have been tracked yet."
      : Rows.map((Row, Index) => `**${Index + 1}.** <@${Row.UserId}> - **${Row.Score.toLocaleString()}** · ${Row.Regular.toLocaleString()} regular · ${Row.Fake.toLocaleString()} fake · ${Row.Leaves.toLocaleString()} left`).join("\n");
    const Embed = new EmbedBuilder()
      .setColor(this.ParseEmbedColor(Config.EmbedColor))
      .setTitle("Invite leaderboard")
      .setDescription(Description.slice(0, 4096))
      .setTimestamp(new Date());

    await Interaction.reply({ embeds: [Embed] });
  }

  private async RefreshInviteCache(GuildValue: Guild): Promise<void> {
    const Cache = await this.FetchInviteCache(GuildValue);
    await this.Storage.SetGlobalConfig(GuildValue.id, InviteCacheKey, Cache);
  }

  private async FetchInviteCache(GuildValue: Guild): Promise<InviteCache> {
    const BotMember = GuildValue.members.me;

    if (!BotMember?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      throw new Error("Manage Server permission is required to fetch invites.");
    }

    const Invites = await GuildValue.invites.fetch();
    const Cache: InviteCache = {};

    for (const InviteValue of Invites.values()) {
      Cache[InviteValue.code] = this.BuildInviteCacheEntry(InviteValue);
    }

    return Cache;
  }

  private BuildInviteCacheEntry(InviteValue: Invite): InviteCacheEntry {
    return {
      ChannelId: InviteValue.channelId,
      Code: InviteValue.code,
      CreatedAt: InviteValue.createdAt?.toISOString() ?? null,
      InviterId: InviteValue.inviter?.id ?? null,
      Uses: InviteValue.uses ?? 0
    };
  }

  private FindUsedInvite(PreviousCache: InviteCache, CurrentCache: InviteCache): InviteCacheEntry | null {
    const UsedInvites = Object.values(CurrentCache)
      .filter((InviteValue) => InviteValue.Uses > (PreviousCache[InviteValue.Code]?.Uses ?? 0))
      .sort((FirstInvite, SecondInvite) => SecondInvite.Uses - FirstInvite.Uses);

    return UsedInvites[0] ?? null;
  }

  private async TrackUnknownJoin(Member: GuildMember, Config: InviteTrackerConfig): Promise<void> {
    await this.IncrementDailyCounter(Member.guild.id, UnknownInvitesDailyKey, 1);
    await this.SendLog(Member.guild, Config, this.ApplyTemplate(Config.UnknownInviteMessage, {
      Code: "unknown",
      Fake: this.IsFakeAccount(Member, Config),
      InviterId: null,
      MemberId: Member.id,
      Total: 0
    }));
  }

  private BuildLeaderboardRows(Stats: InviteStats): InviteLeaderboardRow[] {
    return Object.entries(Stats)
      .map(([UserId, Row]) => ({
        Fake: Row.Fake,
        Leaves: Row.Leaves,
        Regular: Row.Regular,
        Score: this.CalculateScore(Row),
        Unknown: Row.Unknown,
        UserId
      }))
      .filter((Row) => Row.Score !== 0 || Row.Regular > 0 || Row.Fake > 0 || Row.Leaves > 0)
      .sort((FirstRow, SecondRow) => SecondRow.Score - FirstRow.Score || SecondRow.Regular - FirstRow.Regular || FirstRow.Leaves - SecondRow.Leaves);
  }

  private CalculateScore(Row: InviteStats[string]): number {
    return Row.Regular + Row.Bonus - Row.Leaves;
  }

  private GetStatsRow(Stats: InviteStats, UserId: string): InviteStats[string] {
    return Stats[UserId] ?? {
      Bonus: 0,
      Fake: 0,
      Leaves: 0,
      Regular: 0,
      Unknown: 0
    };
  }

  private async GetInviteCache(GuildId: string): Promise<InviteCache> {
    return (await this.Storage.GetGlobalConfig<InviteCache>(GuildId, InviteCacheKey)) ?? {};
  }

  private async GetInviteStats(GuildId: string): Promise<InviteStats> {
    return (await this.Storage.GetGlobalConfig<InviteStats>(GuildId, InviteStatsKey)) ?? {};
  }

  private async GetJoinLedger(GuildId: string): Promise<InviteJoinLedger> {
    return (await this.Storage.GetGlobalConfig<InviteJoinLedger>(GuildId, InviteJoinLedgerKey)) ?? {};
  }

  private async IncrementDailyCounter(GuildId: string, Key: string, Amount: number): Promise<void> {
    const Counters = (await this.Storage.GetGlobalConfig<DailyCounters>(GuildId, Key)) ?? {};
    const DayKey = new Date().toISOString().slice(0, 10);
    Counters[DayKey] = Math.max(0, (Counters[DayKey] ?? 0) + Amount);
    await this.Storage.SetGlobalConfig(GuildId, Key, Counters);
  }

  private IsFakeAccount(Member: GuildMember, Config: InviteTrackerConfig): boolean {
    const MaxAgeDays = Math.max(0, Config.FakeAccountMaxAgeDays);
    const AccountAgeMilliseconds = Date.now() - Member.user.createdTimestamp;
    return AccountAgeMilliseconds < MaxAgeDays * 24 * 60 * 60 * 1000;
  }

  private async SendLog(GuildValue: Guild, Config: InviteTrackerConfig, Message: string): Promise<void> {
    if (!Config.LogChannelId || !Message.trim()) {
      return;
    }

    const Channel = await GuildValue.channels.fetch(Config.LogChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildText) {
      return;
    }

    await (Channel as TextChannel).send({ content: Message.slice(0, 2000) }).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Invite tracker log message failed.", this.BuildErrorMetadata(GuildValue.id, ErrorValue));
    });
  }

  private ApplyTemplate(Template: string, Values: { Code: string; Fake: boolean; InviterId: string | null; MemberId: string; Total: number }): string {
    return Template
      .replaceAll("%member%", `<@${Values.MemberId}>`)
      .replaceAll("%member_id%", Values.MemberId)
      .replaceAll("%inviter%", Values.InviterId ? `<@${Values.InviterId}>` : "Unknown")
      .replaceAll("%inviter_id%", Values.InviterId ?? "unknown")
      .replaceAll("%invite%", Values.Code === "unknown" ? "unknown" : `discord.gg/${Values.Code}`)
      .replaceAll("%code%", Values.Code)
      .replaceAll("%fake%", Values.Fake ? "yes" : "no")
      .replaceAll("%total%", Values.Total.toLocaleString());
  }

  private async GetConfig(GuildId: string): Promise<InviteTrackerConfig> {
    return {
      TrackBotAccounts: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "TrackBotAccounts")) ?? DefaultConfig.TrackBotAccounts,
      FakeAccountMaxAgeDays: await this.GetNumberConfig(GuildId, "FakeAccountMaxAgeDays", DefaultConfig.FakeAccountMaxAgeDays),
      LeaderboardSize: Math.min(25, Math.max(1, await this.GetNumberConfig(GuildId, "LeaderboardSize", DefaultConfig.LeaderboardSize))),
      LogChannelId: (await this.Storage.GetGlobalConfig<string>(GuildId, "LogChannelId")) ?? DefaultConfig.LogChannelId,
      JoinLogMessage: await this.GetStringConfig(GuildId, "JoinLogMessage", DefaultConfig.JoinLogMessage),
      LeaveLogMessage: await this.GetStringConfig(GuildId, "LeaveLogMessage", DefaultConfig.LeaveLogMessage),
      UnknownInviteMessage: await this.GetStringConfig(GuildId, "UnknownInviteMessage", DefaultConfig.UnknownInviteMessage),
      EmbedColor: await this.GetStringConfig(GuildId, "EmbedColor", DefaultConfig.EmbedColor)
    };
  }

  private async GetNumberConfig(GuildId: string, Key: keyof InviteTrackerConfig, DefaultValue: number): Promise<number> {
    const StoredValue = await this.Storage.GetGlobalConfig<number>(GuildId, Key);
    return Number.isFinite(StoredValue) ? Number(StoredValue) : DefaultValue;
  }

  private async GetStringConfig(GuildId: string, Key: keyof InviteTrackerConfig, DefaultValue: string): Promise<string> {
    const StoredValue = await this.Storage.GetGlobalConfig<string>(GuildId, Key);
    return StoredValue?.trim() || DefaultValue;
  }

  private ParseEmbedColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : DefaultConfig.EmbedColor;
    return Number.parseInt(SafeColor.slice(1), 16);
  }

  private BuildErrorMetadata(GuildId: string, ErrorValue: unknown): Record<string, unknown> {
    return {
      Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
      GuildId
    };
  }
}
