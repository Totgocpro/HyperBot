import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { Prisma } from "../../src/Core/Clients.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type DailyCounters = Record<string, number>;

type LevelingConfig = {
  MessageXp: number;
  VoiceMinuteXp: number;
  LeaderboardSize: number;
  LeaderboardTitle: string;
  LeaderboardDescription: string;
  LeaderboardEmptyText: string;
  LeaderboardFooterText: string;
  LeaderboardEmbedColor: string;
};

type UserXpRow = {
  UserId: string;
  MessageCount: number;
  VoiceSeconds: number;
  Xp: number;
};

const StatisticsPluginId = "Statistics";
const MessagesDailyKey = "MessagesDaily";
const VoiceSecondsDailyKey = "VoiceSecondsDaily";

const DefaultConfig: LevelingConfig = {
  MessageXp: 5,
  VoiceMinuteXp: 2,
  LeaderboardSize: 10,
  LeaderboardTitle: "Server XP leaderboard",
  LeaderboardDescription: "XP is calculated from valid messages and counted voice time.",
  LeaderboardEmptyText: "No XP has been tracked yet.",
  LeaderboardFooterText: "Messages deleted after tracking are removed from XP.",
  LeaderboardEmbedColor: "#f59e0b"
};

export default class LevelingPlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.Logger.Info("Leveling plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Leveling plugin disabled.");
  }

  public async OnSlashCommand(CommandName: string, Interaction: ChatInputCommandInteraction): Promise<void> {
    if (CommandName !== "leaderboard") {
      await super.OnSlashCommand(CommandName, Interaction);
      return;
    }

    if (!Interaction.guildId || !Interaction.guild) {
      await Interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    const Config = await this.GetConfig(Interaction.guildId);
    const Rows = await this.BuildLeaderboardRows(Interaction.guildId, Config);
    const TopRows = Rows.slice(0, Config.LeaderboardSize);
    const Embed = new EmbedBuilder()
      .setColor(this.ParseEmbedColor(Config.LeaderboardEmbedColor))
      .setTitle(Config.LeaderboardTitle)
      .setDescription(this.BuildLeaderboardDescription(TopRows, Config))
      .setTimestamp(new Date());

    if (Config.LeaderboardFooterText.trim()) {
      Embed.setFooter({ text: Config.LeaderboardFooterText });
    }

    await Interaction.reply({ embeds: [Embed] });
  }

  private async BuildLeaderboardRows(GuildId: string, Config: LevelingConfig): Promise<UserXpRow[]> {
    const Guild = this.DiscordClient.guilds.cache.get(GuildId);
    const Members = await Guild?.members.fetch().catch(() => Guild.members.cache);
    const StoredValues = await Prisma.userPluginValue.findMany({
      where: {
        BotId: this.BotId,
        GuildId,
        PluginId: StatisticsPluginId,
        Key: {
          in: [MessagesDailyKey, VoiceSecondsDailyKey]
        }
      },
      select: {
        UserId: true,
        Key: true,
        Value: true
      }
    });
    const Rows = new Map<string, UserXpRow>();

    for (const StoredValue of StoredValues) {
      const Row = Rows.get(StoredValue.UserId) ?? {
        UserId: StoredValue.UserId,
        MessageCount: 0,
        VoiceSeconds: 0,
        Xp: 0
      };
      const Total = this.SumCounters(StoredValue.Value as DailyCounters);

      if (StoredValue.Key === MessagesDailyKey) {
        Row.MessageCount = Total;
      }

      if (StoredValue.Key === VoiceSecondsDailyKey) {
        Row.VoiceSeconds = Total;
      }

      Rows.set(StoredValue.UserId, Row);
    }

    return Array.from(Rows.values())
      .filter((Row) => Members?.get(Row.UserId)?.user.bot !== true)
      .map((Row) => ({
        ...Row,
        Xp: Math.floor(Row.MessageCount * Config.MessageXp + Math.floor(Row.VoiceSeconds / 60) * Config.VoiceMinuteXp)
      }))
      .filter((Row) => Row.Xp > 0)
      .sort((FirstRow, SecondRow) => SecondRow.Xp - FirstRow.Xp || SecondRow.MessageCount - FirstRow.MessageCount || SecondRow.VoiceSeconds - FirstRow.VoiceSeconds);
  }

  private BuildLeaderboardDescription(Rows: UserXpRow[], Config: LevelingConfig): string {
    if (Rows.length === 0) {
      return Config.LeaderboardEmptyText;
    }

    const Lines = Rows.map((Row, Index) =>
      `**${Index + 1}.** <@${Row.UserId}> - **${Row.Xp.toLocaleString()} XP** · ${Row.MessageCount.toLocaleString()} messages · ${this.FormatDuration(Row.VoiceSeconds)}`
    );

    return [Config.LeaderboardDescription, "", ...Lines].join("\n").slice(0, 4096);
  }

  private async GetConfig(GuildId: string): Promise<LevelingConfig> {
    return {
      MessageXp: await this.GetNumberConfig(GuildId, "MessageXp", DefaultConfig.MessageXp),
      VoiceMinuteXp: await this.GetNumberConfig(GuildId, "VoiceMinuteXp", DefaultConfig.VoiceMinuteXp),
      LeaderboardSize: Math.min(25, Math.max(1, await this.GetNumberConfig(GuildId, "LeaderboardSize", DefaultConfig.LeaderboardSize))),
      LeaderboardTitle: await this.GetStringConfig(GuildId, "LeaderboardTitle", DefaultConfig.LeaderboardTitle),
      LeaderboardDescription: await this.GetStringConfig(GuildId, "LeaderboardDescription", DefaultConfig.LeaderboardDescription),
      LeaderboardEmptyText: await this.GetStringConfig(GuildId, "LeaderboardEmptyText", DefaultConfig.LeaderboardEmptyText),
      LeaderboardFooterText: await this.GetStringConfig(GuildId, "LeaderboardFooterText", DefaultConfig.LeaderboardFooterText),
      LeaderboardEmbedColor: await this.GetStringConfig(GuildId, "LeaderboardEmbedColor", DefaultConfig.LeaderboardEmbedColor)
    };
  }

  private async GetNumberConfig(GuildId: string, Key: keyof LevelingConfig, DefaultValue: number): Promise<number> {
    const StoredValue = await this.Storage.GetGlobalConfig<number>(GuildId, Key);
    return Number.isFinite(StoredValue) ? Number(StoredValue) : DefaultValue;
  }

  private async GetStringConfig(GuildId: string, Key: keyof LevelingConfig, DefaultValue: string): Promise<string> {
    const StoredValue = await this.Storage.GetGlobalConfig<string>(GuildId, Key);
    return StoredValue?.trim() || DefaultValue;
  }

  private SumCounters(Counters: DailyCounters): number {
    if (typeof Counters !== "object" || Counters === null || Array.isArray(Counters)) {
      return 0;
    }

    return Object.values(Counters).reduce((Total, Value) => Total + (typeof Value === "number" ? Value : 0), 0);
  }

  private FormatDuration(SecondsValue: number): string {
    const Hours = Math.floor(SecondsValue / 3600);
    const Minutes = Math.floor((SecondsValue % 3600) / 60);

    if (Hours <= 0) {
      return `${Minutes}m voice`;
    }

    return `${Hours}h ${Minutes}m voice`;
  }

  private ParseEmbedColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : DefaultConfig.LeaderboardEmbedColor;
    return Number.parseInt(SafeColor.slice(1), 16);
  }
}
