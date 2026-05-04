import { ActivityType } from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type PresenceStatus = "online" | "idle" | "dnd" | "invisible";
type ActivityTypeName = "Playing" | "Watching" | "Listening" | "Competing";
type RotationMode = "Sequential" | "Random";
type EmojiPlacement = "Prefix" | "Suffix" | "Disabled";

type CustomStatusConfig = {
  Enabled: boolean;
  PresenceStatus: PresenceStatus;
  ActivityType: ActivityTypeName;
  StatusTexts: string[];
  TextEmoji: string;
  EmojiPlacement: EmojiPlacement;
  RotationMode: RotationMode;
  RotationIntervalSeconds: number;
  AvoidImmediateRepeat: boolean;
  UsePlaceholders: boolean;
  ShowGuildCount: boolean;
  ShowUserCount: boolean;
  ShowPluginCount: boolean;
};

const DefaultConfig: CustomStatusConfig = {
  Enabled: true,
  PresenceStatus: "online",
  ActivityType: "Playing",
  StatusTexts: ["HyperBot Dashboard"],
  TextEmoji: "✨",
  EmojiPlacement: "Prefix",
  RotationMode: "Sequential",
  RotationIntervalSeconds: 60,
  AvoidImmediateRepeat: true,
  UsePlaceholders: true,
  ShowGuildCount: true,
  ShowUserCount: true,
  ShowPluginCount: true
};

const ActivityTypeValues: Record<ActivityTypeName, ActivityType> = {
  Playing: ActivityType.Playing,
  Listening: ActivityType.Listening,
  Watching: ActivityType.Watching,
  Competing: ActivityType.Competing
};

export default class CustomStatusPlugin extends BasePlugin {
  private LastAppliedSignature = "";
  private LastRotationAt = 0;
  private CurrentStatusIndex = 0;

  public async OnEnable(): Promise<void> {
    await this.RefreshStatus(true);
    this.Logger.Info("Custom status plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Custom status plugin disabled.");
  }

  public async OnTick(): Promise<void> {
    await this.RefreshStatus(false);
  }

  private async RefreshStatus(ForceRefresh: boolean): Promise<void> {
    const Config = await this.GetConfig();

    if (!Config.Enabled) {
      const Signature = "disabled";

      if (Signature !== this.LastAppliedSignature) {
        this.LastAppliedSignature = Signature;
        this.DiscordClient.user?.setPresence({ activities: [], status: "invisible" });
      }

      return;
    }

    const StatusTexts = Config.StatusTexts.map((Text) => Text.trim()).filter(Boolean);

    if (StatusTexts.length === 0) {
      StatusTexts.push("HyperBot Dashboard");
    }

    const Now = Date.now();
    const RotationIntervalMilliseconds = Math.max(15, Config.RotationIntervalSeconds) * 1000;
    const ShouldRotate = ForceRefresh || Now - this.LastRotationAt >= RotationIntervalMilliseconds;

    if (ShouldRotate) {
      this.CurrentStatusIndex = this.GetNextStatusIndex(Config, StatusTexts.length);
      this.LastRotationAt = Now;
    }

    const StatusText = await this.BuildStatusText(StatusTexts[this.CurrentStatusIndex] ?? StatusTexts[0] ?? "HyperBot Dashboard", Config);
    const Signature = `${StatusText}:${Config.PresenceStatus}:${Config.ActivityType}`;

    if (Signature === this.LastAppliedSignature && !ForceRefresh) {
      return;
    }

    this.LastAppliedSignature = Signature;
    await this.ApplyStatus(StatusText, Config.PresenceStatus, Config.ActivityType);
  }

  private GetNextStatusIndex(Config: CustomStatusConfig, StatusTextCount: number): number {
    if (StatusTextCount <= 1) {
      return 0;
    }

    if (Config.RotationMode === "Random") {
      const NextIndex = Math.floor(Math.random() * StatusTextCount);

      if (Config.AvoidImmediateRepeat && NextIndex === this.CurrentStatusIndex) {
        return (NextIndex + 1) % StatusTextCount;
      }

      return NextIndex;
    }

    return (this.CurrentStatusIndex + 1) % StatusTextCount;
  }

  private async BuildStatusText(StatusText: string, Config: CustomStatusConfig): Promise<string> {
    const TextWithEmoji = this.ApplyEmoji(StatusText, Config);

    if (!Config.UsePlaceholders) {
      return TextWithEmoji.slice(0, 128);
    }

    const GuildCount = this.DiscordClient.guilds.cache.size;
    const UserCount = this.DiscordClient.guilds.cache.reduce((Total, Guild) => Total + (Guild.memberCount ?? 0), 0);
    const PluginCount = Number(process.env.PLUGIN_COUNT_HINT ?? 0);

    return TextWithEmoji
      .replaceAll("%guilds%", Config.ShowGuildCount ? String(GuildCount) : "")
      .replaceAll("%users%", Config.ShowUserCount ? String(UserCount) : "")
      .replaceAll("%plugins%", Config.ShowPluginCount ? String(PluginCount || "plugins") : "")
      .replaceAll("%bot%", this.DiscordClient.user?.username ?? "HyperBot")
      .slice(0, 128);
  }

  private ApplyEmoji(StatusText: string, Config: CustomStatusConfig): string {
    if (!Config.TextEmoji || Config.EmojiPlacement === "Disabled") {
      return StatusText;
    }

    if (Config.EmojiPlacement === "Suffix") {
      return `${StatusText} ${Config.TextEmoji}`;
    }

    return `${Config.TextEmoji} ${StatusText}`;
  }

  private async ApplyStatus(StatusText: string, PresenceStatusValue: PresenceStatus, ActivityTypeValue: ActivityTypeName): Promise<void> {
    this.DiscordClient.user?.setPresence({
      status: PresenceStatusValue,
      activities: [
        {
          name: StatusText,
          type: ActivityTypeValues[ActivityTypeValue]
        }
      ]
    });
  }

  private async GetConfig(): Promise<CustomStatusConfig> {
    return {
      Enabled: (await this.Storage.GetGlobalConfig<boolean>("Global", "Enabled")) ?? DefaultConfig.Enabled,
      PresenceStatus: (await this.Storage.GetGlobalConfig<PresenceStatus>("Global", "PresenceStatus")) ?? DefaultConfig.PresenceStatus,
      ActivityType: (await this.Storage.GetGlobalConfig<ActivityTypeName>("Global", "ActivityType")) ?? DefaultConfig.ActivityType,
      StatusTexts: (await this.Storage.GetGlobalConfig<string[]>("Global", "StatusTexts")) ?? DefaultConfig.StatusTexts,
      TextEmoji: (await this.Storage.GetGlobalConfig<string>("Global", "TextEmoji")) ?? DefaultConfig.TextEmoji,
      EmojiPlacement: (await this.Storage.GetGlobalConfig<EmojiPlacement>("Global", "EmojiPlacement")) ?? DefaultConfig.EmojiPlacement,
      RotationMode: (await this.Storage.GetGlobalConfig<RotationMode>("Global", "RotationMode")) ?? DefaultConfig.RotationMode,
      RotationIntervalSeconds: (await this.Storage.GetGlobalConfig<number>("Global", "RotationIntervalSeconds")) ?? DefaultConfig.RotationIntervalSeconds,
      AvoidImmediateRepeat: (await this.Storage.GetGlobalConfig<boolean>("Global", "AvoidImmediateRepeat")) ?? DefaultConfig.AvoidImmediateRepeat,
      UsePlaceholders: (await this.Storage.GetGlobalConfig<boolean>("Global", "UsePlaceholders")) ?? DefaultConfig.UsePlaceholders,
      ShowGuildCount: (await this.Storage.GetGlobalConfig<boolean>("Global", "ShowGuildCount")) ?? DefaultConfig.ShowGuildCount,
      ShowUserCount: (await this.Storage.GetGlobalConfig<boolean>("Global", "ShowUserCount")) ?? DefaultConfig.ShowUserCount,
      ShowPluginCount: (await this.Storage.GetGlobalConfig<boolean>("Global", "ShowPluginCount")) ?? DefaultConfig.ShowPluginCount
    };
  }
}
