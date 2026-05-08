import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildBasedChannel,
  type GuildMember,
  type Interaction,
  type Message,
  type NewsChannel,
  type TextChannel,
  type VoiceChannel
} from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type GiveawayStatus = "Active" | "Ended";

type GiveawayEntry = {
  UserId: string;
  Weight: number;
  EnteredAt: string;
};

type Giveaway = {
  GuildId: string;
  ChannelId: string;
  MessageId: string;
  Prize: string;
  WinnerCount: number;
  HostId: string;
  HostTag: string;
  Status: GiveawayStatus;
  Entries: Record<string, GiveawayEntry>;
  WinnerIds: string[];
  CreatedAt: string;
  EndsAt: string;
  EndedAt: string | null;
};

type GiveawayStore = Record<string, Giveaway>;

type BonusEntryRule = {
  RoleId: string;
  Entries: number;
};

type GiveawayConfig = {
  DefaultChannelId: string;
  DefaultDuration: string;
  DefaultWinnerCount: number;
  MaxWinnerCount: number;
  RequiredRoleIds: string[];
  BlockedRoleIds: string[];
  BonusEntryRules: string[];
  GiveawayTitle: string;
  GiveawayDescription: string;
  EndedDescription: string;
  GiveawayEmbed: EditableEmbed;
  EndedEmbed: EditableEmbed;
  NoWinnerText: string;
  WinnerAnnouncement: string;
  RerollAnnouncement: string;
  JoinButtonLabel: string;
  LeaveButtonLabel: string;
  EntryAcceptedMessage: string;
  EntryRemovedMessage: string;
  NotEligibleMessage: string;
  GiveawayColor: string;
  EndedColor: string;
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

const GiveawayStorageKey = "Giveaways";

const DefaultConfig: GiveawayConfig = {
  DefaultChannelId: "",
  DefaultDuration: "1d",
  DefaultWinnerCount: 1,
  MaxWinnerCount: 20,
  RequiredRoleIds: [],
  BlockedRoleIds: [],
  BonusEntryRules: [],
  GiveawayTitle: "🎉 Giveaway: %prize%",
  GiveawayDescription: "Click the button below to enter. Ends %endsAt%.",
  EndedDescription: "This giveaway has ended. Winners: %winners%.",
  GiveawayEmbed: {
    Title: "Giveaway: %prize%",
    Description: "Click the button below to enter. Ends %endsAt%.",
    Color: "#5865f2",
    FooterText: "Hosted by %hostTag%",
    Timestamp: true,
    Fields: [
      { Name: "Prize", Value: "%prize%", Inline: true },
      { Name: "Winners", Value: "%winnerCount%", Inline: true },
      { Name: "Entries", Value: "%entries%", Inline: true },
      { Name: "Hosted by", Value: "%host%", Inline: true },
      { Name: "Ends", Value: "%endsAt%", Inline: true }
    ]
  },
  EndedEmbed: {
    Title: "Giveaway: %prize%",
    Description: "This giveaway has ended. Winners: %winners%.",
    Color: "#22c55e",
    FooterText: "Hosted by %hostTag%",
    Timestamp: true,
    Fields: [
      { Name: "Prize", Value: "%prize%", Inline: true },
      { Name: "Winners", Value: "%winnerCount%", Inline: true },
      { Name: "Entries", Value: "%entries%", Inline: true },
      { Name: "Selected winner(s)", Value: "%winners%", Inline: false }
    ]
  },
  NoWinnerText: "No valid winner could be selected.",
  WinnerAnnouncement: "Congratulations %winners%! You won **%prize%**.",
  RerollAnnouncement: "New winner(s) for **%prize%**: %winners%.",
  JoinButtonLabel: "Enter giveaway",
  LeaveButtonLabel: "Leave giveaway",
  EntryAcceptedMessage: "You entered the giveaway.",
  EntryRemovedMessage: "Your giveaway entry was removed.",
  NotEligibleMessage: "You are not eligible for this giveaway.",
  GiveawayColor: "#5865f2",
  EndedColor: "#22c55e"
};

export default class GiveawayPlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.Logger.Info("Giveaway plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Giveaway plugin disabled.");
  }

  public async OnSlashCommand(CommandName: string, InteractionValue: ChatInputCommandInteraction): Promise<void> {
    if (!InteractionValue.guildId || !InteractionValue.inCachedGuild()) {
      await InteractionValue.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    if (CommandName === "giveaway-start") {
      await this.HandleStartCommand(InteractionValue);
      return;
    }

    if (CommandName === "giveaway-end") {
      await this.HandleEndCommand(InteractionValue);
      return;
    }

    if (CommandName === "giveaway-reroll") {
      await this.HandleRerollCommand(InteractionValue);
      return;
    }

    if (CommandName === "giveaway-list") {
      await this.HandleListCommand(InteractionValue);
    }
  }

  public async OnInteraction(InteractionValue: Interaction): Promise<void> {
    if (!InteractionValue.isButton() || !InteractionValue.customId.startsWith("Giveaway:")) {
      return;
    }

    await this.HandleGiveawayButton(InteractionValue);
  }

  public async OnTick(): Promise<void> {
    const Now = Date.now();

    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      const Giveaways = await this.GetGiveaways(Guild.id);

      for (const GiveawayValue of Object.values(Giveaways)) {
        if (GiveawayValue.Status !== "Active" || new Date(GiveawayValue.EndsAt).getTime() > Now) {
          continue;
        }

        await this.EndGiveaway(GiveawayValue, false);
      }
    }
  }

  private async HandleStartCommand(InteractionValue: ChatInputCommandInteraction<"cached">): Promise<void> {
    if (!InteractionValue.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await InteractionValue.reply({ content: "You need Manage Server permission to start giveaways.", ephemeral: true });
      return;
    }

    const Config = await this.GetConfig(InteractionValue.guildId);
    const Prize = InteractionValue.options.getString("prize", true).trim();
    const DurationValue = InteractionValue.options.getString("duration", true).trim() || Config.DefaultDuration;
    const DurationMs = this.ParseDuration(DurationValue);

    if (!Prize) {
      await InteractionValue.reply({ content: "Prize is required.", ephemeral: true });
      return;
    }

    if (!DurationMs) {
      await InteractionValue.reply({ content: "Invalid duration. Use values like 10m, 2h, 3d.", ephemeral: true });
      return;
    }

    const WinnerCount = Math.min(
      Math.max(1, InteractionValue.options.getInteger("winners", true) || Config.DefaultWinnerCount),
      Math.max(1, Config.MaxWinnerCount)
    );
    const Channel = await this.ResolveTargetChannel(InteractionValue, Config);

    if (!Channel) {
      await InteractionValue.reply({ content: "Giveaway channel is missing or not writable.", ephemeral: true });
      return;
    }

    const GiveawayValue: Giveaway = {
      GuildId: InteractionValue.guildId,
      ChannelId: Channel.id,
      MessageId: "",
      Prize: Prize.slice(0, 256),
      WinnerCount,
      HostId: InteractionValue.user.id,
      HostTag: InteractionValue.user.tag,
      Status: "Active",
      Entries: {},
      WinnerIds: [],
      CreatedAt: new Date().toISOString(),
      EndsAt: new Date(Date.now() + DurationMs).toISOString(),
      EndedAt: null
    };

    const InitialEmbed = this.BuildGiveawayEmbed(GiveawayValue, Config);
    const MessageValue = await Channel.send({
      embeds: [InitialEmbed.Embed],
      files: InitialEmbed.Files,
      components: this.BuildGiveawayComponents(GiveawayValue, Config)
    });

    GiveawayValue.MessageId = MessageValue.id;
    await this.SaveGiveaway(GiveawayValue);
    const SavedEmbed = this.BuildGiveawayEmbed(GiveawayValue, Config);
    await MessageValue.edit({
      embeds: [SavedEmbed.Embed],
      files: SavedEmbed.Files,
      components: this.BuildGiveawayComponents(GiveawayValue, Config)
    });

    await InteractionValue.reply({ content: `Giveaway started in <#${Channel.id}>. Message ID: \`${MessageValue.id}\``, ephemeral: true });
  }

  private async HandleEndCommand(InteractionValue: ChatInputCommandInteraction<"cached">): Promise<void> {
    if (!InteractionValue.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await InteractionValue.reply({ content: "You need Manage Server permission to end giveaways.", ephemeral: true });
      return;
    }

    const MessageId = InteractionValue.options.getString("message_id", true).trim();
    const GiveawayValue = await this.GetGiveaway(InteractionValue.guildId, MessageId);

    if (!GiveawayValue) {
      await InteractionValue.reply({ content: "Giveaway not found.", ephemeral: true });
      return;
    }

    if (GiveawayValue.Status === "Ended") {
      await InteractionValue.reply({ content: "This giveaway is already ended.", ephemeral: true });
      return;
    }

    await this.EndGiveaway(GiveawayValue, true);
    await InteractionValue.reply({ content: "Giveaway ended.", ephemeral: true });
  }

  private async HandleRerollCommand(InteractionValue: ChatInputCommandInteraction<"cached">): Promise<void> {
    if (!InteractionValue.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await InteractionValue.reply({ content: "You need Manage Server permission to reroll giveaways.", ephemeral: true });
      return;
    }

    const MessageId = InteractionValue.options.getString("message_id", true).trim();
    const GiveawayValue = await this.GetGiveaway(InteractionValue.guildId, MessageId);

    if (!GiveawayValue) {
      await InteractionValue.reply({ content: "Giveaway not found.", ephemeral: true });
      return;
    }

    if (GiveawayValue.Status !== "Ended") {
      await InteractionValue.reply({ content: "Only ended giveaways can be rerolled.", ephemeral: true });
      return;
    }

    const WinnerIds = this.SelectWinners(GiveawayValue);
    GiveawayValue.WinnerIds = WinnerIds;
    await this.SaveGiveaway(GiveawayValue);
    await this.EditGiveawayMessage(GiveawayValue);
    await this.SendGiveawayAnnouncement(GiveawayValue, true);
    await InteractionValue.reply({ content: "Giveaway rerolled.", ephemeral: true });
  }

  private async HandleListCommand(InteractionValue: ChatInputCommandInteraction<"cached">): Promise<void> {
    const Giveaways = Object.values(await this.GetGiveaways(InteractionValue.guildId))
      .filter((GiveawayValue) => GiveawayValue.Status === "Active")
      .sort((FirstGiveaway, SecondGiveaway) => new Date(FirstGiveaway.EndsAt).getTime() - new Date(SecondGiveaway.EndsAt).getTime());

    const Embed = new EmbedBuilder()
      .setTitle("Active giveaways")
      .setColor(0x5865f2)
      .setDescription(
        Giveaways.length === 0
          ? "No active giveaway."
          : Giveaways.slice(0, 15).map((GiveawayValue) => `• [${GiveawayValue.Prize}](https://discord.com/channels/${GiveawayValue.GuildId}/${GiveawayValue.ChannelId}/${GiveawayValue.MessageId}) ends ${this.FormatTimestamp(GiveawayValue.EndsAt)} · ${this.GetEntryCount(GiveawayValue)} entries`).join("\n")
      );

    await InteractionValue.reply({ embeds: [Embed], ephemeral: true });
  }

  private async HandleGiveawayButton(InteractionValue: ButtonInteraction): Promise<void> {
    const [, Action, MessageId] = InteractionValue.customId.split(":");

    if (!InteractionValue.guildId || !MessageId || (Action !== "Enter" && Action !== "Leave")) {
      return;
    }

    const GiveawayValue = await this.GetGiveaway(InteractionValue.guildId, MessageId);

    if (!GiveawayValue) {
      await InteractionValue.reply({ content: "This giveaway no longer exists.", ephemeral: true });
      return;
    }

    const Config = await this.GetConfig(InteractionValue.guildId);

    if (GiveawayValue.Status !== "Active" || new Date(GiveawayValue.EndsAt).getTime() <= Date.now()) {
      await InteractionValue.reply({ content: "This giveaway is already ended.", ephemeral: true });
      return;
    }

    const Member = InteractionValue.member instanceof Object && "roles" in InteractionValue.member ? InteractionValue.member as GuildMember : null;

    if (!Member || !this.IsMemberEligible(Member, Config)) {
      await InteractionValue.reply({ content: Config.NotEligibleMessage, ephemeral: true });
      return;
    }

    if (Action === "Leave") {
      delete GiveawayValue.Entries[InteractionValue.user.id];
      await this.SaveGiveaway(GiveawayValue);
      const BuiltEmbed = this.BuildGiveawayEmbed(GiveawayValue, Config);
      await InteractionValue.update({
        embeds: [BuiltEmbed.Embed],
        files: BuiltEmbed.Files,
        components: this.BuildGiveawayComponents(GiveawayValue, Config)
      });
      await InteractionValue.followUp({ content: Config.EntryRemovedMessage, ephemeral: true });
      return;
    }

    if (GiveawayValue.Entries[InteractionValue.user.id]) {
      await InteractionValue.reply({ content: Config.EntryAcceptedMessage, ephemeral: true });
      return;
    }

    GiveawayValue.Entries[InteractionValue.user.id] = {
      UserId: InteractionValue.user.id,
      Weight: this.GetEntryWeight(Member, Config),
      EnteredAt: new Date().toISOString()
    };
    await this.SaveGiveaway(GiveawayValue);
    const BuiltEmbed = this.BuildGiveawayEmbed(GiveawayValue, Config);
    await InteractionValue.update({
      embeds: [BuiltEmbed.Embed],
      files: BuiltEmbed.Files,
      components: this.BuildGiveawayComponents(GiveawayValue, Config)
    });
    await InteractionValue.followUp({ content: Config.EntryAcceptedMessage, ephemeral: true });
  }

  private async EndGiveaway(GiveawayValue: Giveaway, ForceNow: boolean): Promise<void> {
    if (GiveawayValue.Status === "Ended") {
      return;
    }

    GiveawayValue.Status = "Ended";
    GiveawayValue.EndedAt = new Date().toISOString();

    if (ForceNow) {
      GiveawayValue.EndsAt = GiveawayValue.EndedAt;
    }

    GiveawayValue.WinnerIds = this.SelectWinners(GiveawayValue);
    await this.SaveGiveaway(GiveawayValue);
    await this.EditGiveawayMessage(GiveawayValue);
    await this.SendGiveawayAnnouncement(GiveawayValue, false);
  }

  private SelectWinners(GiveawayValue: Giveaway): string[] {
    const WeightedEntries = Object.values(GiveawayValue.Entries).flatMap((Entry) =>
      Array.from({ length: Math.max(1, Entry.Weight) }, () => Entry.UserId)
    );
    const WinnerIds: string[] = [];
    const AvailableEntries = [...WeightedEntries];

    while (WinnerIds.length < GiveawayValue.WinnerCount && AvailableEntries.length > 0) {
      const SelectedIndex = Math.floor(Math.random() * AvailableEntries.length);
      const SelectedUserId = AvailableEntries[SelectedIndex];

      if (!SelectedUserId) {
        break;
      }

      WinnerIds.push(SelectedUserId);

      for (let Index = AvailableEntries.length - 1; Index >= 0; Index -= 1) {
        if (AvailableEntries[Index] === SelectedUserId) {
          AvailableEntries.splice(Index, 1);
        }
      }
    }

    return WinnerIds;
  }

  private BuildGiveawayEmbed(GiveawayValue: Giveaway, Config: GiveawayConfig): { Embed: EmbedBuilder; Files: Array<{ attachment: Buffer; name: string }> } {
    const IsEnded = GiveawayValue.Status === "Ended";
    const Winners = this.FormatWinners(GiveawayValue, Config);
    const Source = IsEnded ? Config.EndedEmbed : Config.GiveawayEmbed;
    const BuiltEmbed = this.BuildConfiguredEmbed(Source, GiveawayValue, Winners, IsEnded ? Config.EndedColor : Config.GiveawayColor);

    if (Source.Timestamp !== false) {
      BuiltEmbed.Embed.setTimestamp(new Date(IsEnded ? GiveawayValue.EndedAt ?? GiveawayValue.EndsAt : GiveawayValue.EndsAt));
    }

    return BuiltEmbed;
  }

  private BuildConfiguredEmbed(Source: EditableEmbed, GiveawayValue: Giveaway, Winners: string, FallbackColor: string): { Embed: EmbedBuilder; Files: Array<{ attachment: Buffer; name: string }> } {
    const Files: Array<{ attachment: Buffer; name: string }> = [];
    const Embed = new EmbedBuilder().setColor(this.ParseEmbedColor(Source.Color || FallbackColor));
    const Title = Source.Title ?? DefaultConfig.GiveawayTitle;
    const Description = Source.Description ?? DefaultConfig.GiveawayDescription;

    if (Title.trim()) {
      Embed.setTitle(this.ApplyTemplate(Title, GiveawayValue, { Winners }).slice(0, 256));
    }

    if (Description.trim()) {
      Embed.setDescription(this.ApplyTemplate(Description, GiveawayValue, { Winners }).slice(0, 4096));
    }

    if (Source.Url?.trim()) {
      Embed.setURL(this.ApplyTemplate(Source.Url, GiveawayValue, { Winners }));
    }

    if (Source.AuthorName?.trim()) {
      Embed.setAuthor({
        name: this.ApplyTemplate(Source.AuthorName, GiveawayValue, { Winners }).slice(0, 256),
        iconURL: Source.AuthorIconUrl?.trim() ? this.ApplyTemplate(Source.AuthorIconUrl, GiveawayValue, { Winners }) : undefined
      });
    }

    if (Source.ThumbnailUrl?.trim()) {
      Embed.setThumbnail(this.ApplyTemplate(Source.ThumbnailUrl, GiveawayValue, { Winners }));
    }

    const UploadedImage = this.ParseDataImage(Source.ImageDataUrl, Source.ImageName || "giveaway-image.png");
    if (UploadedImage) {
      Files.push(UploadedImage);
      Embed.setImage(`attachment://${UploadedImage.name}`);
    } else if (Source.ImageUrl?.trim()) {
      Embed.setImage(this.ApplyTemplate(Source.ImageUrl, GiveawayValue, { Winners }));
    }

    if (Source.FooterText?.trim()) {
      Embed.setFooter({
        text: this.ApplyTemplate(Source.FooterText, GiveawayValue, { Winners }).slice(0, 2048),
        iconURL: Source.FooterIconUrl?.trim() ? this.ApplyTemplate(Source.FooterIconUrl, GiveawayValue, { Winners }) : undefined
      });
    }

    for (const Field of Source.Fields ?? []) {
      if (Field.Name.trim() && Field.Value.trim()) {
        Embed.addFields({
          name: this.ApplyTemplate(Field.Name, GiveawayValue, { Winners }).slice(0, 256),
          value: this.ApplyTemplate(Field.Value, GiveawayValue, { Winners }).slice(0, 1024),
          inline: Field.Inline
        });
      }
    }

    return { Embed, Files };
  }

  private BuildGiveawayComponents(GiveawayValue: Giveaway, Config: GiveawayConfig): ActionRowBuilder<ButtonBuilder>[] {
    const IsEnded = GiveawayValue.Status === "Ended";
    const EnterButton = new ButtonBuilder()
      .setCustomId(`Giveaway:Enter:${GiveawayValue.MessageId || "pending"}`)
      .setLabel(IsEnded ? "Giveaway ended" : Config.JoinButtonLabel)
      .setStyle(IsEnded ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(IsEnded || !GiveawayValue.MessageId);
    const LeaveButton = new ButtonBuilder()
      .setCustomId(`Giveaway:Leave:${GiveawayValue.MessageId || "pending"}`)
      .setLabel(Config.LeaveButtonLabel)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(IsEnded || !GiveawayValue.MessageId);

    return [new ActionRowBuilder<ButtonBuilder>().addComponents(EnterButton, LeaveButton)];
  }

  private async EditGiveawayMessage(GiveawayValue: Giveaway): Promise<void> {
    const Config = await this.GetConfig(GiveawayValue.GuildId);
    const Channel = await this.ResolveWritableChannel(GiveawayValue.GuildId, GiveawayValue.ChannelId);

    if (!Channel) {
      return;
    }

    const MessageValue = await Channel.messages.fetch(GiveawayValue.MessageId).catch(() => null) as Message | null;

    if (!MessageValue) {
      return;
    }

    const BuiltEmbed = this.BuildGiveawayEmbed(GiveawayValue, Config);
    await MessageValue.edit({
      embeds: [BuiltEmbed.Embed],
      files: BuiltEmbed.Files,
      components: this.BuildGiveawayComponents(GiveawayValue, Config)
    }).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Could not edit giveaway message.", ErrorValue);
    });
  }

  private async SendGiveawayAnnouncement(GiveawayValue: Giveaway, IsReroll: boolean): Promise<void> {
    const Config = await this.GetConfig(GiveawayValue.GuildId);
    const Channel = await this.ResolveWritableChannel(GiveawayValue.GuildId, GiveawayValue.ChannelId);

    if (!Channel) {
      return;
    }

    const Winners = this.FormatWinners(GiveawayValue, Config);
    const Template = IsReroll ? Config.RerollAnnouncement : Config.WinnerAnnouncement;

    await Channel.send({
      content: this.ApplyTemplate(Template, GiveawayValue, { Winners }),
      allowedMentions: { users: GiveawayValue.WinnerIds }
    }).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Could not send giveaway announcement.", ErrorValue);
    });
  }

  private async ResolveTargetChannel(InteractionValue: ChatInputCommandInteraction<"cached">, Config: GiveawayConfig): Promise<TextChannel | NewsChannel | VoiceChannel | null> {
    const OptionChannel = InteractionValue.options.getChannel("channel");

    if (OptionChannel) {
      return this.AsWritableChannel(OptionChannel);
    }

    if (Config.DefaultChannelId) {
      return this.ResolveWritableChannel(InteractionValue.guildId, Config.DefaultChannelId);
    }

    return this.AsWritableChannel(InteractionValue.channel);
  }

  private async ResolveWritableChannel(GuildId: string, ChannelId: string): Promise<TextChannel | NewsChannel | VoiceChannel | null> {
    const Guild = await this.DiscordClient.guilds.fetch(GuildId).catch(() => null);
    const Channel = (await Guild?.channels.fetch(ChannelId).catch(() => null)) as GuildBasedChannel | null;

    return this.AsWritableChannel(Channel);
  }

  private AsWritableChannel(Channel: unknown): TextChannel | NewsChannel | VoiceChannel | null {
    if (!Channel || typeof Channel !== "object" || !("type" in Channel)) {
      return null;
    }

    const ChannelValue = Channel as GuildBasedChannel;

    if (ChannelValue.type === ChannelType.GuildText || ChannelValue.type === ChannelType.GuildAnnouncement || ChannelValue.type === ChannelType.GuildVoice) {
      return ChannelValue as TextChannel | NewsChannel | VoiceChannel;
    }

    return null;
  }

  private IsMemberEligible(Member: GuildMember, Config: GiveawayConfig): boolean {
    const RequiredRoleIds = Config.RequiredRoleIds.map((RoleId) => RoleId.trim()).filter(Boolean);
    const BlockedRoleIds = Config.BlockedRoleIds.map((RoleId) => RoleId.trim()).filter(Boolean);

    if (RequiredRoleIds.length > 0 && !RequiredRoleIds.some((RoleId) => Member.roles.cache.has(RoleId))) {
      return false;
    }

    if (BlockedRoleIds.some((RoleId) => Member.roles.cache.has(RoleId))) {
      return false;
    }

    return true;
  }

  private GetEntryWeight(Member: GuildMember, Config: GiveawayConfig): number {
    const BonusRules = this.ParseBonusRules(Config.BonusEntryRules);
    let Weight = 1;

    for (const Rule of BonusRules) {
      if (Member.roles.cache.has(Rule.RoleId)) {
        Weight += Rule.Entries;
      }
    }

    return Math.min(100, Math.max(1, Weight));
  }

  private ParseBonusRules(Rules: string[]): BonusEntryRule[] {
    return Rules.map((Rule) => {
      const Match = Rule.trim().match(/^(\d{5,})\s*(?:=|:|x|\*)\s*(\d{1,2})$/u);

      if (!Match) {
        return null;
      }

      return {
        RoleId: Match[1],
        Entries: Math.max(1, Number(Match[2]) - 1)
      };
    }).filter((Rule): Rule is BonusEntryRule => Rule !== null);
  }

  private ParseDuration(Value: string): number | null {
    const Match = Value.trim().match(/^(\d+)\s*(s|m|h|d|w)$/iu);

    if (!Match) {
      return null;
    }

    const Amount = Number(Match[1]);
    const Unit = Match[2]?.toLowerCase();
    const Multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
      w: 604_800_000
    };
    const Duration = Amount * (Multipliers[Unit ?? ""] ?? 0);

    if (!Number.isFinite(Duration) || Duration < 10_000) {
      return null;
    }

    return Duration;
  }

  private GetEntryCount(GiveawayValue: Giveaway): number {
    return Object.keys(GiveawayValue.Entries).length;
  }

  private FormatWinners(GiveawayValue: Giveaway, Config: GiveawayConfig): string {
    if (GiveawayValue.WinnerIds.length === 0) {
      return Config.NoWinnerText;
    }

    return GiveawayValue.WinnerIds.map((UserId) => `<@${UserId}>`).join(", ");
  }

  private FormatTimestamp(IsoDate: string): string {
    return `<t:${Math.floor(new Date(IsoDate).getTime() / 1000)}:R>`;
  }

  private ApplyTemplate(Template: string, GiveawayValue: Giveaway, ExtraValues: { Winners: string }): string {
    return Template
      .replaceAll("%prize%", GiveawayValue.Prize)
      .replaceAll("%winners%", ExtraValues.Winners)
      .replaceAll("%winnerCount%", String(GiveawayValue.WinnerCount))
      .replaceAll("%entries%", String(this.GetEntryCount(GiveawayValue)))
      .replaceAll("%host%", `<@${GiveawayValue.HostId}>`)
      .replaceAll("%hostTag%", GiveawayValue.HostTag)
      .replaceAll("%endsAt%", this.FormatTimestamp(GiveawayValue.EndsAt))
      .replaceAll("%messageId%", GiveawayValue.MessageId)
      .slice(0, 4000);
  }

  private async SaveGiveaway(GiveawayValue: Giveaway): Promise<void> {
    const Giveaways = await this.GetGiveaways(GiveawayValue.GuildId);
    Giveaways[GiveawayValue.MessageId] = GiveawayValue;
    await this.Storage.SetGlobalConfig(GiveawayValue.GuildId, GiveawayStorageKey, Giveaways);
  }

  private async GetGiveaway(GuildId: string, MessageId: string): Promise<Giveaway | null> {
    return (await this.GetGiveaways(GuildId))[MessageId] ?? null;
  }

  private async GetGiveaways(GuildId: string): Promise<GiveawayStore> {
    const StoredGiveaways = await this.Storage.GetGlobalConfig<GiveawayStore>(GuildId, GiveawayStorageKey);

    if (!StoredGiveaways || typeof StoredGiveaways !== "object" || Array.isArray(StoredGiveaways)) {
      return {};
    }

    return StoredGiveaways;
  }

  private async GetConfig(GuildId: string): Promise<GiveawayConfig> {
    return {
      DefaultChannelId: await this.GetStringConfig(GuildId, "DefaultChannelId", DefaultConfig.DefaultChannelId),
      DefaultDuration: await this.GetStringConfig(GuildId, "DefaultDuration", DefaultConfig.DefaultDuration),
      DefaultWinnerCount: await this.GetNumberConfig(GuildId, "DefaultWinnerCount", DefaultConfig.DefaultWinnerCount),
      MaxWinnerCount: await this.GetNumberConfig(GuildId, "MaxWinnerCount", DefaultConfig.MaxWinnerCount),
      RequiredRoleIds: await this.GetStringListConfig(GuildId, "RequiredRoleIds", DefaultConfig.RequiredRoleIds),
      BlockedRoleIds: await this.GetStringListConfig(GuildId, "BlockedRoleIds", DefaultConfig.BlockedRoleIds),
      BonusEntryRules: await this.GetStringListConfig(GuildId, "BonusEntryRules", DefaultConfig.BonusEntryRules),
      GiveawayTitle: await this.GetStringConfig(GuildId, "GiveawayTitle", DefaultConfig.GiveawayTitle),
      GiveawayDescription: await this.GetStringConfig(GuildId, "GiveawayDescription", DefaultConfig.GiveawayDescription),
      EndedDescription: await this.GetStringConfig(GuildId, "EndedDescription", DefaultConfig.EndedDescription),
      GiveawayEmbed: await this.GetEmbedConfig(GuildId, "GiveawayEmbed", DefaultConfig.GiveawayEmbed),
      EndedEmbed: await this.GetEmbedConfig(GuildId, "EndedEmbed", DefaultConfig.EndedEmbed),
      NoWinnerText: await this.GetStringConfig(GuildId, "NoWinnerText", DefaultConfig.NoWinnerText),
      WinnerAnnouncement: await this.GetStringConfig(GuildId, "WinnerAnnouncement", DefaultConfig.WinnerAnnouncement),
      RerollAnnouncement: await this.GetStringConfig(GuildId, "RerollAnnouncement", DefaultConfig.RerollAnnouncement),
      JoinButtonLabel: await this.GetStringConfig(GuildId, "JoinButtonLabel", DefaultConfig.JoinButtonLabel),
      LeaveButtonLabel: await this.GetStringConfig(GuildId, "LeaveButtonLabel", DefaultConfig.LeaveButtonLabel),
      EntryAcceptedMessage: await this.GetStringConfig(GuildId, "EntryAcceptedMessage", DefaultConfig.EntryAcceptedMessage),
      EntryRemovedMessage: await this.GetStringConfig(GuildId, "EntryRemovedMessage", DefaultConfig.EntryRemovedMessage),
      NotEligibleMessage: await this.GetStringConfig(GuildId, "NotEligibleMessage", DefaultConfig.NotEligibleMessage),
      GiveawayColor: await this.GetStringConfig(GuildId, "GiveawayColor", DefaultConfig.GiveawayColor),
      EndedColor: await this.GetStringConfig(GuildId, "EndedColor", DefaultConfig.EndedColor)
    };
  }

  private async GetStringConfig(GuildId: string, Key: keyof GiveawayConfig, DefaultValue: string): Promise<string> {
    return (await this.Storage.GetGlobalConfig<string>(GuildId, Key)) ?? DefaultValue;
  }

  private async GetNumberConfig(GuildId: string, Key: keyof GiveawayConfig, DefaultValue: number): Promise<number> {
    const StoredValue = await this.Storage.GetGlobalConfig<number>(GuildId, Key);
    return Number.isFinite(StoredValue) ? Number(StoredValue) : DefaultValue;
  }

  private async GetStringListConfig(GuildId: string, Key: keyof GiveawayConfig, DefaultValue: string[]): Promise<string[]> {
    const StoredValue = await this.Storage.GetGlobalConfig<string[]>(GuildId, Key);
    return Array.isArray(StoredValue) ? StoredValue.map((Value) => String(Value)) : DefaultValue;
  }

  private async GetEmbedConfig(GuildId: string, Key: keyof GiveawayConfig, DefaultValue: EditableEmbed): Promise<EditableEmbed> {
    const StoredValue = await this.Storage.GetGlobalConfig<unknown>(GuildId, Key);

    if (!StoredValue || typeof StoredValue !== "object" || Array.isArray(StoredValue)) {
      return DefaultValue;
    }

    const RecordValue = StoredValue as Record<string, unknown>;
    return {
      Title: typeof RecordValue.Title === "string" ? RecordValue.Title : DefaultValue.Title,
      Description: typeof RecordValue.Description === "string" ? RecordValue.Description : DefaultValue.Description,
      Color: typeof RecordValue.Color === "string" ? RecordValue.Color : DefaultValue.Color,
      Url: typeof RecordValue.Url === "string" ? RecordValue.Url : "",
      AuthorName: typeof RecordValue.AuthorName === "string" ? RecordValue.AuthorName : "",
      AuthorIconUrl: typeof RecordValue.AuthorIconUrl === "string" ? RecordValue.AuthorIconUrl : "",
      ThumbnailUrl: typeof RecordValue.ThumbnailUrl === "string" ? RecordValue.ThumbnailUrl : "",
      ImageUrl: typeof RecordValue.ImageUrl === "string" ? RecordValue.ImageUrl : "",
      FooterText: typeof RecordValue.FooterText === "string" ? RecordValue.FooterText : DefaultValue.FooterText,
      FooterIconUrl: typeof RecordValue.FooterIconUrl === "string" ? RecordValue.FooterIconUrl : "",
      Timestamp: typeof RecordValue.Timestamp === "boolean" ? RecordValue.Timestamp : DefaultValue.Timestamp,
      ImageDataUrl: typeof RecordValue.ImageDataUrl === "string" ? RecordValue.ImageDataUrl : "",
      ImageName: typeof RecordValue.ImageName === "string" ? RecordValue.ImageName : "",
      Fields: Array.isArray(RecordValue.Fields) ? RecordValue.Fields.filter((Field): Field is Record<string, unknown> => typeof Field === "object" && Field !== null && !Array.isArray(Field)).map((Field) => ({
        Name: typeof Field.Name === "string" ? Field.Name : "",
        Value: typeof Field.Value === "string" ? Field.Value : "",
        Inline: Boolean(Field.Inline)
      })) : DefaultValue.Fields
    };
  }

  private ParseEmbedColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : DefaultConfig.GiveawayColor;
    return Number.parseInt(SafeColor.slice(1), 16);
  }

  private ParseDataImage(Value: string | undefined, Name: string): { attachment: Buffer; name: string } | null {
    const Match = Value?.match(/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,(.+)$/iu);

    if (!Match?.[1]) {
      return null;
    }

    return {
      attachment: Buffer.from(Match[1], "base64"),
      name: Name.replace(/[^a-z0-9._-]/giu, "-") || "giveaway-image.png"
    };
  }
}
