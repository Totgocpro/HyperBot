import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
  type Message,
  type VoiceState
} from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type AchievementType = "send_messages" | "send_images" | "daily_streak_messages" | "daily_streak_voice" | "voice_minutes_total";

type AchievementDefinition = {
  id: string;
  name: string;
  description: string;
  type: AchievementType;
  target: number;
};

type AchievementProgress = {
  current: number;
  completed: boolean;
  completedAt: string | null;
};

type TrackingData = {
  totalMessages: number;
  totalImages: number;
  lastMessageDate: string | null;
  messageStreak: number;
  lastVoiceDate: string | null;
  voiceStreak: number;
  totalVoiceMinutes: number;
  voiceMinutesToday: number;
  voiceSessionStart: number | null;
  voiceSessionChannel: string | null;
  achievementProgress: Record<string, AchievementProgress>;
};

type AchievementConfig = {
  AnnouncementChannel: string;
  DmOnCompletion: boolean;
};

const TrackingDataKey = "TrackingData";
const AchievementsStorageKey = "Achievements";

const DefaultConfig: AchievementConfig = {
  AnnouncementChannel: "",
  DmOnCompletion: true
};

const ValidAchievementTypes: AchievementType[] = [
  "send_messages",
  "send_images",
  "daily_streak_messages",
  "daily_streak_voice",
  "voice_minutes_total"
];

const AchievementTypeLabels: Record<AchievementType, string> = {
  send_messages: "Send Messages",
  send_images: "Send Images",
  daily_streak_messages: "Daily Message Streak",
  daily_streak_voice: "Daily Voice Streak",
  voice_minutes_total: "Total Voice Minutes"
};

const MinVoiceMinutesForDay = 1;

export default class AchievementPlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.Logger.Info("Achievement plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Achievement plugin disabled.");
  }

  public async OnMessage(Message: Message): Promise<void> {
    if (!Message.guildId) return;

    const GuildId = Message.guildId;
    const UserId = Message.author.id;
    const HasImage = Message.attachments.size > 0;

    const Achievements = await this.GetAchievements(GuildId);
    if (Achievements.length === 0) return;

    const Data = await this.GetTrackingData(GuildId, UserId);
    const Today = this.GetToday();

    Data.totalMessages += 1;
    if (HasImage) Data.totalImages += 1;

    if (Data.lastMessageDate !== Today) {
      if (Data.lastMessageDate === this.GetYesterday()) {
        Data.messageStreak += 1;
      } else {
        Data.messageStreak = 1;
      }
      Data.lastMessageDate = Today;
    }

    await this.CheckAchievements(GuildId, UserId, Achievements, Data);
    await this.SaveTrackingData(GuildId, UserId, Data);
  }

  public async OnVoiceStateUpdate(OldState: VoiceState, NewState: VoiceState): Promise<void> {
    const GuildId = NewState.guild?.id ?? OldState.guild?.id;
    if (!GuildId) return;

    const Member = NewState.member ?? OldState.member;
    if (!Member || Member.user.bot) return;

    const UserId = Member.id;
    const OldChannelId = OldState.channelId;
    const NewChannelId = NewState.channelId;

    if (OldChannelId === NewChannelId) return;

    const Achievements = await this.GetAchievements(GuildId);
    if (Achievements.length === 0) return;

    const Data = await this.GetTrackingData(GuildId, UserId);
    const Now = Date.now();

    if (!OldChannelId && NewChannelId) {
      Data.voiceSessionStart = Now;
      Data.voiceSessionChannel = NewChannelId;
    } else if (OldChannelId && !NewChannelId) {
      this.AccumulateVoice(Data, Now);
    } else if (OldChannelId && NewChannelId) {
      this.AccumulateVoice(Data, Now);
    }

    await this.CheckAchievements(GuildId, UserId, Achievements, Data);
    await this.SaveTrackingData(GuildId, UserId, Data);
  }

  public async OnTick(): Promise<void> {
  }

  public async OnSlashCommand(CommandName: string, Interaction: ChatInputCommandInteraction): Promise<void> {
    if (!Interaction.guildId) {
      await Interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (CommandName === "achievements") {
      await this.HandleListCommand(Interaction);
      return;
    }

    if (CommandName === "progress") {
      await this.HandleProgressCommand(Interaction);
    }
  }

  private async HandleListCommand(Interaction: ChatInputCommandInteraction): Promise<void> {
    const GuildId = Interaction.guildId!;
    const Achievements = await this.GetAchievements(GuildId);

    if (Achievements.length === 0) {
      await Interaction.reply({ content: "No achievements have been configured for this server.", flags: MessageFlags.Ephemeral });
      return;
    }

    const Lines = Achievements.map((Achievement, Index) =>
      `**${Index + 1}.** ${Achievement.name}${Achievement.description ? `\n${Achievement.description}` : ""}\nGoal: \`${AchievementTypeLabels[Achievement.type]}\` · ${Achievement.target}`
    );

    const Embed = new EmbedBuilder()
      .setTitle("Available Achievements")
      .setColor(0x9b59b6)
      .setDescription(Lines.join("\n\n"));

    await Interaction.reply({ embeds: [Embed], flags: MessageFlags.Ephemeral });
  }

  private async HandleProgressCommand(Interaction: ChatInputCommandInteraction): Promise<void> {
    const GuildId = Interaction.guildId!;
    const UserId = Interaction.user.id;
    const Achievements = await this.GetAchievements(GuildId);

    if (Achievements.length === 0) {
      await Interaction.reply({ content: "No achievements have been configured for this server.", flags: MessageFlags.Ephemeral });
      return;
    }

    const Data = await this.GetTrackingData(GuildId, UserId);
    const Lines: string[] = [];

    for (const Achievement of Achievements) {
      const Progress = Data.achievementProgress[Achievement.id];
      const Current = Progress?.current ?? this.ComputeProgress(Achievement, Data);
      const Completed = Progress?.completed ?? false;
      const Icon = Completed ? "✅" : "⬜";
      const Bar = this.ProgressBar(Current, Achievement.target);
      Lines.push(`${Icon} **${Achievement.name}**\n${Bar} ${Current}/${Achievement.target}`);
    }

    const Embed = new EmbedBuilder()
      .setTitle("Your Achievement Progress")
      .setColor(0x9b59b6)
      .setDescription(Lines.join("\n\n"));

    await Interaction.reply({ embeds: [Embed], flags: MessageFlags.Ephemeral });
}

  private async CheckAchievements(GuildId: string, UserId: string, Achievements: AchievementDefinition[], Data: TrackingData): Promise<void> {
    for (const Achievement of Achievements) {
      const Existing = Data.achievementProgress[Achievement.id];
      if (Existing?.completed) continue;

      const Current = this.ComputeProgress(Achievement, Data);
      const Progress = Existing ?? { current: 0, completed: false, completedAt: null };
      Progress.current = Current;

      if (Current >= Achievement.target && !Progress.completed) {
        Progress.completed = true;
        Progress.completedAt = new Date().toISOString();
        this.Logger.Info(`User ${UserId} completed achievement "${Achievement.name}" in guild ${GuildId}.`);
        await this.OnAchievementCompleted(GuildId, UserId, Achievement);
      }

      Data.achievementProgress[Achievement.id] = Progress;
    }
  }

  private ComputeProgress(Achievement: AchievementDefinition, Data: TrackingData): number {
    switch (Achievement.type) {
      case "send_messages": return Data.totalMessages;
      case "send_images": return Data.totalImages;
      case "daily_streak_messages": return Data.messageStreak;
      case "daily_streak_voice": return Data.voiceStreak;
      case "voice_minutes_total": return Math.floor(Data.totalVoiceMinutes);
      default: return 0;
    }
  }

  private AccumulateVoice(Data: TrackingData, Now: number): void {
    if (Data.voiceSessionStart === null) return;

    const ElapsedMinutes = (Now - Data.voiceSessionStart) / 60000;
    if (ElapsedMinutes <= 0) return;

    Data.totalVoiceMinutes += ElapsedMinutes;
    Data.voiceMinutesToday += ElapsedMinutes;
    Data.voiceSessionStart = Now;

    const Today = this.GetToday();
    if (Data.voiceMinutesToday >= MinVoiceMinutesForDay && Data.lastVoiceDate !== Today) {
      if (Data.lastVoiceDate === this.GetYesterday()) {
        Data.voiceStreak += 1;
      } else {
        Data.voiceStreak = 1;
      }
      Data.lastVoiceDate = Today;
    }
  }

  private async OnAchievementCompleted(GuildId: string, UserId: string, Achievement: AchievementDefinition): Promise<void> {
    const Config = await this.GetConfig(GuildId);
    const User = await this.DiscordClient.users.fetch(UserId).catch(() => null);

    if (Config.DmOnCompletion && User) {
      const DmEmbed = new EmbedBuilder()
        .setTitle("Achievement Completed!")
        .setDescription(`You completed **${Achievement.name}**!`)
        .setColor(0x22c55e)
        .setTimestamp();

      await User.send({ embeds: [DmEmbed] }).catch(() => {
        this.Logger.Warn(`Could not DM user ${UserId} about achievement completion.`);
      });
    }

    if (Config.AnnouncementChannel) {
      const Channel = await this.DiscordClient.channels.fetch(Config.AnnouncementChannel).catch(() => null);
      if (Channel?.type === ChannelType.GuildText) {
        const AnnounceEmbed = new EmbedBuilder()
          .setTitle("Achievement Completed!")
          .setDescription(`<@${UserId}> completed **${Achievement.name}**!`)
          .setColor(0x22c55e)
          .setTimestamp();

        await (Channel as GuildTextBasedChannel).send({ embeds: [AnnounceEmbed] }).catch(() => {
          this.Logger.Warn(`Could not announce achievement completion in channel ${Config.AnnouncementChannel}.`);
        });
      }
    }
  }

  private async GetAchievements(GuildId: string): Promise<AchievementDefinition[]> {
    const Raw = await this.Storage.GetGlobalConfig<string[]>(GuildId, AchievementsStorageKey);
    if (!Array.isArray(Raw)) return [];

    const Achievements: AchievementDefinition[] = [];
    const SeenIds = new Set<string>();

    for (const Item of Raw) {
      if (typeof Item !== "string") continue;
      const Parsed = this.ParseAchievementString(Item);
      if (Parsed && !SeenIds.has(Parsed.id)) {
        Achievements.push(Parsed);
        SeenIds.add(Parsed.id);
      }
    }

    return Achievements;
  }

  private ParseAchievementString(Raw: string): AchievementDefinition | null {
    try {
      const Parsed = JSON.parse(Raw) as Record<string, unknown>;
      const Name = typeof Parsed.name === "string" ? Parsed.name.trim() : "";
      const Type = Parsed.type as AchievementType;
      const Target = typeof Parsed.target === "number" ? Parsed.target : Number(Parsed.target);
      const Id = typeof Parsed.id === "string" ? Parsed.id : "";

      if (!Name || !ValidAchievementTypes.includes(Type) || !Number.isFinite(Target) || Target < 1) return null;

      const SafeId = Id || Name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || `a-${Math.random().toString(36).slice(2, 8)}`;
      const Description = typeof Parsed.description === "string" ? Parsed.description.trim() : "";

      return { id: SafeId, name: Name, description: Description, type: Type, target: Math.floor(Target) };
    } catch {
      return null;
    }
  }

  private async GetTrackingData(GuildId: string, UserId: string): Promise<TrackingData> {
    const Stored = await this.Storage.GetUserValue<TrackingData>(GuildId, UserId, TrackingDataKey);

    if (Stored && typeof Stored === "object") {
      return {
        totalMessages: typeof Stored.totalMessages === "number" ? Stored.totalMessages : 0,
        totalImages: typeof Stored.totalImages === "number" ? Stored.totalImages : 0,
        lastMessageDate: typeof Stored.lastMessageDate === "string" ? Stored.lastMessageDate : null,
        messageStreak: typeof Stored.messageStreak === "number" ? Stored.messageStreak : 0,
        lastVoiceDate: typeof Stored.lastVoiceDate === "string" ? Stored.lastVoiceDate : null,
        voiceStreak: typeof Stored.voiceStreak === "number" ? Stored.voiceStreak : 0,
        totalVoiceMinutes: typeof Stored.totalVoiceMinutes === "number" ? Stored.totalVoiceMinutes : 0,
        voiceMinutesToday: typeof Stored.voiceMinutesToday === "number" ? Stored.voiceMinutesToday : 0,
        voiceSessionStart: typeof Stored.voiceSessionStart === "number" ? Stored.voiceSessionStart : null,
        voiceSessionChannel: typeof Stored.voiceSessionChannel === "string" ? Stored.voiceSessionChannel : null,
        achievementProgress: Stored.achievementProgress && typeof Stored.achievementProgress === "object" ? Stored.achievementProgress : {}
      };
    }

    return {
      totalMessages: 0,
      totalImages: 0,
      lastMessageDate: null,
      messageStreak: 0,
      lastVoiceDate: null,
      voiceStreak: 0,
      totalVoiceMinutes: 0,
      voiceMinutesToday: 0,
      voiceSessionStart: null,
      voiceSessionChannel: null,
      achievementProgress: {}
    };
  }

  private async SaveTrackingData(GuildId: string, UserId: string, Data: TrackingData): Promise<void> {
    await this.Storage.SetUserValue(GuildId, UserId, TrackingDataKey, Data);
  }

  private async GetConfig(GuildId: string): Promise<AchievementConfig> {
    const AnnouncementChannel = await this.Storage.GetGlobalConfig<string>(GuildId, "AnnouncementChannel");
    const DmOnCompletion = await this.Storage.GetGlobalConfig<boolean>(GuildId, "DmOnCompletion");

    return {
      AnnouncementChannel: AnnouncementChannel ?? DefaultConfig.AnnouncementChannel,
      DmOnCompletion: typeof DmOnCompletion === "boolean" ? DmOnCompletion : DefaultConfig.DmOnCompletion
    };
  }

  private GetToday(): string {
    const Now = new Date();
    return `${Now.getFullYear()}-${String(Now.getMonth() + 1).padStart(2, "0")}-${String(Now.getDate()).padStart(2, "0")}`;
  }

  private GetYesterday(): string {
    const Now = new Date();
    Now.setDate(Now.getDate() - 1);
    return `${Now.getFullYear()}-${String(Now.getMonth() + 1).padStart(2, "0")}-${String(Now.getDate()).padStart(2, "0")}`;
  }

  private ProgressBar(Current: number, Target: number): string {
    const Filled = Math.min(10, Math.max(0, Math.round((Current / Target) * 10)));
    return "█".repeat(Filled) + "░".repeat(10 - Filled);
  }
}
