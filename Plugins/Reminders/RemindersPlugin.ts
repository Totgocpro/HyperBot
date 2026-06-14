import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildBasedChannel,
  type NewsChannel,
  type TextChannel,
  type VoiceChannel
} from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";
import { EmitPluginChange } from "../../src/Core/PluginChangeBus.js";

type ReminderMode = "Message" | "Embed";

type Reminder = {
  Id: string;
  Name: string;
  ChannelId: string;
  Mode: ReminderMode;
  ScheduleMode?: "Interval" | "Weekly";
  Weekdays?: number[];
  TimeOfDay?: string;
  Message: string;
  Title: string;
  Color: string;
  Embed?: EditableEmbed;
  IntervalMs: number;
  NextRunAt: string;
  Enabled: boolean;
  CreatedBy: string;
  CreatedAt: string;
  LastRunAt: string | null;
  RunCount: number;
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

type ReminderStore = Record<string, Reminder>;

type RemindersConfig = {
  DefaultChannelId: string;
  DefaultEmbed: boolean;
  DefaultInterval: string;
  DefaultColor: string;
  FooterText: string;
  MaxReminders: number;
};

const RemindersStorageKey = "Reminders";

const DefaultConfig: RemindersConfig = {
  DefaultChannelId: "",
  DefaultEmbed: true,
  DefaultInterval: "1d",
  DefaultColor: "#5865f2",
  FooterText: "Scheduled by HyperBot",
  MaxReminders: 25
};

export default class RemindersPlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.Logger.Info("Reminders plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Reminders plugin disabled.");
  }

  public async OnSlashCommand(CommandName: string, Interaction: ChatInputCommandInteraction): Promise<void> {
    if (!Interaction.guildId || !Interaction.inCachedGuild()) {
      await Interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    if (!Interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await Interaction.reply({ content: "You need Manage Server permission to manage reminders.", ephemeral: true });
      return;
    }

    switch (CommandName) {
      case "reminder-list":
        await this.HandleListCommand(Interaction);
        return;
      case "reminder-enable":
        await this.HandleToggleCommand(Interaction, true);
        return;
      case "reminder-disable":
        await this.HandleToggleCommand(Interaction, false);
        return;
      case "reminder-delete":
        await this.HandleDeleteCommand(Interaction);
        return;
      case "reminder-run":
        await this.HandleRunCommand(Interaction);
        return;
    }
  }

  public async OnTick(): Promise<void> {
    const Now = Date.now();

    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      const Reminders = await this.GetReminders(Guild.id);
      let HasChanges = false;

      for (const ReminderValue of Object.values(Reminders)) {
        if (!ReminderValue.Enabled || new Date(ReminderValue.NextRunAt).getTime() > Now) {
          continue;
        }

        const ShouldSend = this.IsDueForSchedule(ReminderValue, Now);

        if (!ShouldSend) {
          const FixedNextRun = this.ComputeNextRun(ReminderValue, Now);
          Reminders[ReminderValue.Id] = {
            ...ReminderValue,
            NextRunAt: FixedNextRun
          };
          HasChanges = true;
          continue;
        }

        const Sent = await this.SendReminder(ReminderValue);
        const NextRunAt = this.ComputeNextRun(ReminderValue, Now);
        Reminders[ReminderValue.Id] = {
          ...ReminderValue,
          LastRunAt: Sent ? new Date(Now).toISOString() : ReminderValue.LastRunAt,
          NextRunAt,
          RunCount: Sent ? ReminderValue.RunCount + 1 : ReminderValue.RunCount
        };
        HasChanges = true;
      }

      if (HasChanges) {
        await this.SetReminders(Guild.id, Reminders);
        EmitPluginChange(this.BotId, Guild.id, "Reminders");
      }
    }
  }

  private IsDueForSchedule(ReminderValue: Reminder, Now: number): boolean {
    if (ReminderValue.ScheduleMode !== "Weekly") {
      return true;
    }

    const [Hours, Minutes] = (ReminderValue.TimeOfDay || "13:00").split(":").map((Part) => Number.parseInt(Part, 10));
    const NextAtDate = new Date(ReminderValue.NextRunAt);
    const NowDate = new Date(Now);

    if (NextAtDate.getUTCFullYear() !== NowDate.getUTCFullYear() || NextAtDate.getUTCMonth() !== NowDate.getUTCMonth() || NextAtDate.getUTCDate() !== NowDate.getUTCDate()) {
      return false;
    }

    const ExpectedDate = new Date(Date.UTC(
      NowDate.getUTCFullYear(),
      NowDate.getUTCMonth(),
      NowDate.getUTCDate(),
      Number.isFinite(Hours) ? Hours : 13,
      Number.isFinite(Minutes) ? Minutes : 0,
      0,
      0
    ));

    return Math.abs(Now - ExpectedDate.getTime()) < 60_000;
  }

  private async HandleCreateCommand(Interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
    const Config = await this.GetConfig(Interaction.guildId);
    const Reminders = await this.GetReminders(Interaction.guildId);

    if (Object.keys(Reminders).length >= Math.max(1, Config.MaxReminders)) {
      await Interaction.reply({ content: `Reminder limit reached (${Config.MaxReminders}).`, ephemeral: true });
      return;
    }

    const Name = Interaction.options.getString("name", true).trim().slice(0, 80);
    const Message = Interaction.options.getString("message", true).trim();
    const IntervalText = Interaction.options.getString("interval", true).trim() || Config.DefaultInterval;
    const DelayText = Interaction.options.getString("delay")?.trim() || IntervalText;
    const IntervalMs = this.ParseDuration(IntervalText);
    const DelayMs = this.ParseDuration(DelayText);

    if (!Name || !Message) {
      await Interaction.reply({ content: "Name and message are required.", ephemeral: true });
      return;
    }

    if (!IntervalMs || !DelayMs) {
      await Interaction.reply({ content: "Invalid interval/delay. Use values like 30m, 6h, 1d, 2w.", ephemeral: true });
      return;
    }

    const ChannelId = Interaction.options.getChannel("channel")?.id ?? (Config.DefaultChannelId || Interaction.channelId);
    const Channel = await this.ResolveWritableChannel(Interaction.guildId, ChannelId);

    if (!Channel) {
      await Interaction.reply({ content: "Reminder channel is missing or not writable.", ephemeral: true });
      return;
    }

    const Id = this.CreateReminderId(Name, Reminders);
    const UsesEmbed = Interaction.options.getBoolean("embed") ?? Config.DefaultEmbed;
    const ReminderValue: Reminder = {
      Id,
      Name,
      ChannelId: Channel.id,
      Mode: UsesEmbed ? "Embed" : "Message",
      Message,
      Title: Interaction.options.getString("title")?.trim().slice(0, 256) || Name,
      Color: Config.DefaultColor,
      IntervalMs,
      NextRunAt: new Date(Date.now() + DelayMs).toISOString(),
      Enabled: true,
      CreatedBy: Interaction.user.id,
      CreatedAt: new Date().toISOString(),
      LastRunAt: null,
      RunCount: 0
    };

    Reminders[Id] = ReminderValue;
    await this.SetReminders(Interaction.guildId, Reminders);
    await Interaction.reply({
      content: `Reminder \`${Id}\` created for <#${Channel.id}>. First run: <t:${Math.floor(new Date(ReminderValue.NextRunAt).getTime() / 1000)}:R>.`,
      ephemeral: true
    });
  }

  private async HandleListCommand(Interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
    const Reminders = Object.values(await this.GetReminders(Interaction.guildId)).sort((First, Second) => new Date(First.NextRunAt).getTime() - new Date(Second.NextRunAt).getTime());

    if (Reminders.length === 0) {
      await Interaction.reply({ content: "No reminders configured.", ephemeral: true });
      return;
    }

    const Lines = Reminders.slice(0, 20).map((ReminderValue) => {
      const NextRunTimestamp = Math.floor(new Date(ReminderValue.NextRunAt).getTime() / 1000);
      return `\`${ReminderValue.Id}\` ${ReminderValue.Enabled ? "enabled" : "disabled"} | <#${ReminderValue.ChannelId}> | every ${this.FormatDuration(ReminderValue.IntervalMs)} | next <t:${NextRunTimestamp}:R>`;
    });

    await Interaction.reply({ content: Lines.join("\n"), ephemeral: true });
  }

  private async HandleToggleCommand(Interaction: ChatInputCommandInteraction<"cached">, Enabled: boolean): Promise<void> {
    const Id = Interaction.options.getString("id", true);
    const Reminders = await this.GetReminders(Interaction.guildId);
    const ReminderValue = Reminders[Id];

    if (!ReminderValue) {
      await Interaction.reply({ content: "Reminder not found.", ephemeral: true });
      return;
    }

    Reminders[Id] = {
      ...ReminderValue,
      Enabled,
      NextRunAt: Enabled && new Date(ReminderValue.NextRunAt).getTime() < Date.now() ? this.ComputeNextRun(ReminderValue, Date.now()) : ReminderValue.NextRunAt
    };
    await this.SetReminders(Interaction.guildId, Reminders);
    await Interaction.reply({ content: `Reminder \`${Id}\` ${Enabled ? "enabled" : "disabled"}.`, ephemeral: true });
  }

  private async HandleDeleteCommand(Interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
    const Id = Interaction.options.getString("id", true);
    const Reminders = await this.GetReminders(Interaction.guildId);

    if (!Reminders[Id]) {
      await Interaction.reply({ content: "Reminder not found.", ephemeral: true });
      return;
    }

    delete Reminders[Id];
    await this.SetReminders(Interaction.guildId, Reminders);
    await Interaction.reply({ content: `Reminder \`${Id}\` deleted.`, ephemeral: true });
  }

  private async HandleRunCommand(Interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
    const Id = Interaction.options.getString("id", true);
    const Reminders = await this.GetReminders(Interaction.guildId);
    const ReminderValue = Reminders[Id];

    if (!ReminderValue) {
      await Interaction.reply({ content: "Reminder not found.", ephemeral: true });
      return;
    }

    await Interaction.deferReply({ ephemeral: true });
    const Sent = await this.SendReminder(ReminderValue);

    if (Sent) {
      Reminders[Id] = {
        ...ReminderValue,
        LastRunAt: new Date().toISOString(),
        RunCount: ReminderValue.RunCount + 1
      };
      await this.SetReminders(Interaction.guildId, Reminders);
    }

    await Interaction.editReply(Sent ? `Reminder \`${Id}\` sent.` : "Reminder could not be sent.");
  }

  private async SendReminder(ReminderValue: Reminder): Promise<boolean> {
    const Channel = await this.ResolveWritableChannelByClient(ReminderValue.ChannelId);

    if (!Channel) {
      this.Logger.Warn("Reminder channel is missing or not writable.", { ReminderId: ReminderValue.Id, ChannelId: ReminderValue.ChannelId });
      return false;
    }

    const Config = await this.GetConfig(Channel.guild.id);
    const EmbedSource = ReminderValue.Embed;
    const RawMessage = ReminderValue.Mode === "Message" ? ReminderValue.Message : (EmbedSource?.Description || ReminderValue.Message);
    const Message = this.ApplyTemplate(RawMessage, ReminderValue, Channel.guild.name);

    if (ReminderValue.Mode === "Embed") {
      const UploadedImage = this.ParseDataImage(EmbedSource?.ImageDataUrl, EmbedSource?.ImageName || "embed-image.png");
      const Embed = new EmbedBuilder()
        .setTitle(this.ApplyTemplate(EmbedSource?.Title || ReminderValue.Title, ReminderValue, Channel.guild.name).slice(0, 256))
        .setDescription(Message)
        .setColor(this.ParseColor(EmbedSource?.Color || ReminderValue.Color || Config.DefaultColor));

      if (EmbedSource?.Url?.trim()) {
        Embed.setURL(EmbedSource.Url);
      }

      if (EmbedSource?.AuthorName?.trim()) {
        Embed.setAuthor({ name: this.ApplyTemplate(EmbedSource.AuthorName, ReminderValue, Channel.guild.name).slice(0, 256), iconURL: EmbedSource.AuthorIconUrl?.trim() || undefined });
      }

      if (EmbedSource?.ThumbnailUrl?.trim()) {
        Embed.setThumbnail(EmbedSource.ThumbnailUrl);
      }

      if (UploadedImage) {
        Embed.setImage(`attachment://${UploadedImage.name}`);
      } else if (EmbedSource?.ImageUrl?.trim()) {
        Embed.setImage(EmbedSource.ImageUrl);
      }

      const FooterText = EmbedSource?.FooterText || Config.FooterText;
      if (FooterText) {
        Embed.setFooter({ text: this.ApplyTemplate(FooterText, ReminderValue, Channel.guild.name).slice(0, 2048), iconURL: EmbedSource?.FooterIconUrl?.trim() || undefined });
      }

      if (EmbedSource?.Timestamp !== false) {
        Embed.setTimestamp(new Date());
      }

      for (const Field of EmbedSource?.Fields ?? []) {
        if (Field.Name.trim() && Field.Value.trim()) {
          Embed.addFields({ name: this.ApplyTemplate(Field.Name, ReminderValue, Channel.guild.name).slice(0, 256), value: this.ApplyTemplate(Field.Value, ReminderValue, Channel.guild.name).slice(0, 1024), inline: Field.Inline });
        }
      }

      await Channel.send({ embeds: [Embed], files: UploadedImage ? [UploadedImage] : [] }).catch((ErrorValue: unknown) => {
        this.Logger.Warn("Reminder embed send failed.", { Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue), ReminderId: ReminderValue.Id });
      });
      return true;
    }

    await Channel.send({ content: Message }).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Reminder message send failed.", { Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue), ReminderId: ReminderValue.Id });
    });
    return true;
  }

  private ComputeNextRun(ReminderValue: Reminder, FromTimestamp: number): string {
    if (ReminderValue.ScheduleMode !== "Weekly") {
      return new Date(FromTimestamp + ReminderValue.IntervalMs).toISOString();
    }

    const [Hours, Minutes] = (ReminderValue.TimeOfDay || "13:00").split(":").map((Part) => Number.parseInt(Part, 10));
    const Weekdays = ReminderValue.Weekdays?.length ? ReminderValue.Weekdays : [1];
    const FromDate = new Date(FromTimestamp);

    for (let Offset = 0; Offset <= 7; Offset += 1) {
      const Candidate = new Date(Date.UTC(
        FromDate.getUTCFullYear(),
        FromDate.getUTCMonth(),
        FromDate.getUTCDate() + Offset,
        Number.isFinite(Hours) ? Hours : 13,
        Number.isFinite(Minutes) ? Minutes : 0,
        0,
        0
      ));

      if (Weekdays.includes(Candidate.getUTCDay()) && Candidate.getTime() > FromTimestamp) {
        return Candidate.toISOString();
      }
    }

    return new Date(FromTimestamp + ReminderValue.IntervalMs).toISOString();
  }

  private ParseDataImage(Value: string | undefined, Name: string): { attachment: Buffer; name: string } | null {
    const Match = Value?.match(/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,(.+)$/iu);

    if (!Match?.[1]) {
      return null;
    }

    return {
      attachment: Buffer.from(Match[1], "base64"),
      name: Name.replace(/[^a-z0-9._-]/giu, "-") || "embed-image.png"
    };
  }

  private async ResolveWritableChannel(GuildId: string, ChannelId: string): Promise<TextChannel | NewsChannel | VoiceChannel | null> {
    const Guild = await this.DiscordClient.guilds.fetch(GuildId).catch(() => null);
    const Channel = (await Guild?.channels.fetch(ChannelId).catch(() => null)) as GuildBasedChannel | null;
    return this.NormalizeWritableChannel(Channel);
  }

  private async ResolveWritableChannelByClient(ChannelId: string): Promise<TextChannel | NewsChannel | VoiceChannel | null> {
    const Channel = (await this.DiscordClient.channels.fetch(ChannelId).catch(() => null)) as GuildBasedChannel | null;
    return this.NormalizeWritableChannel(Channel);
  }

  private NormalizeWritableChannel(Channel: GuildBasedChannel | null): TextChannel | NewsChannel | VoiceChannel | null {
    if (!Channel) {
      return null;
    }

    if (Channel.type === ChannelType.GuildText || Channel.type === ChannelType.GuildAnnouncement || Channel.type === ChannelType.GuildVoice) {
      return Channel as TextChannel | NewsChannel | VoiceChannel;
    }

    return null;
  }

  private async GetReminders(GuildId: string): Promise<ReminderStore> {
    const StoredValue = await this.Storage.GetGlobalConfig<unknown>(GuildId, RemindersStorageKey);

    if (!StoredValue || typeof StoredValue !== "object" || Array.isArray(StoredValue)) {
      return {};
    }

    const Reminders: ReminderStore = {};

    for (const [Id, Value] of Object.entries(StoredValue as Record<string, unknown>)) {
      if (this.IsReminder(Value)) {
        Reminders[Id] = Value;
      }
    }

    return Reminders;
  }

  private async SetReminders(GuildId: string, Reminders: ReminderStore): Promise<void> {
    await this.Storage.SetGlobalConfig(GuildId, RemindersStorageKey, Reminders);
  }

  private IsReminder(Value: unknown): Value is Reminder {
    if (!Value || typeof Value !== "object") {
      return false;
    }

    const ReminderValue = Value as Reminder;
    return typeof ReminderValue.Id === "string" && typeof ReminderValue.ChannelId === "string" && typeof ReminderValue.Message === "string" && typeof ReminderValue.IntervalMs === "number";
  }

  private async GetConfig(GuildId: string): Promise<RemindersConfig> {
    return {
      DefaultChannelId: (await this.Storage.GetGlobalConfig<string>(GuildId, "DefaultChannelId")) ?? DefaultConfig.DefaultChannelId,
      DefaultEmbed: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "DefaultEmbed")) ?? DefaultConfig.DefaultEmbed,
      DefaultInterval: (await this.Storage.GetGlobalConfig<string>(GuildId, "DefaultInterval")) ?? DefaultConfig.DefaultInterval,
      DefaultColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "DefaultColor")) ?? DefaultConfig.DefaultColor,
      FooterText: (await this.Storage.GetGlobalConfig<string>(GuildId, "FooterText")) ?? DefaultConfig.FooterText,
      MaxReminders: (await this.Storage.GetGlobalConfig<number>(GuildId, "MaxReminders")) ?? DefaultConfig.MaxReminders
    };
  }

  private ParseDuration(Value: string): number | null {
    const Match = Value.trim().toLowerCase().match(/^(\d+)\s*([mhdw])$/u);

    if (!Match) {
      return null;
    }

    const Amount = Number.parseInt(Match[1], 10);
    const Unit = Match[2];
    const Multipliers: Record<string, number> = {
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
      w: 604_800_000
    };
    const Duration = Amount * Multipliers[Unit];

    return Duration >= 60_000 ? Duration : null;
  }

  private FormatDuration(DurationMs: number): string {
    if (DurationMs % 604_800_000 === 0) {
      return `${DurationMs / 604_800_000}w`;
    }

    if (DurationMs % 86_400_000 === 0) {
      return `${DurationMs / 86_400_000}d`;
    }

    if (DurationMs % 3_600_000 === 0) {
      return `${DurationMs / 3_600_000}h`;
    }

    return `${Math.round(DurationMs / 60_000)}m`;
  }

  private CreateReminderId(Name: string, Reminders: ReminderStore): string {
    const BaseId = Name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 24) || "reminder";
    let CandidateId = BaseId;
    let Index = 2;

    while (Reminders[CandidateId]) {
      CandidateId = `${BaseId}-${Index}`;
      Index += 1;
    }

    return CandidateId;
  }

  private ApplyTemplate(Template: string, ReminderValue: Reminder, GuildName: string): string {
    return Template
      .replaceAll("%name%", ReminderValue.Name)
      .replaceAll("%id%", ReminderValue.Id)
      .replaceAll("%server%", GuildName)
      .replaceAll("%runCount%", String(ReminderValue.RunCount + 1))
      .replaceAll("%interval%", this.FormatDuration(ReminderValue.IntervalMs))
      .replaceAll("%nextRun%", ReminderValue.NextRunAt);
  }

  private ParseColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : DefaultConfig.DefaultColor;
    return Number.parseInt(SafeColor.replace("#", ""), 16);
  }
}
