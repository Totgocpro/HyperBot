import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type Interaction,
  type ModalSubmitInteraction,
  type TextChannel
} from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type TicketConfig = {
  PanelChannelId: string;
  PanelTitle: string;
  PanelDescription: string;
  PanelEmbed: EditableEmbed;
  OpenButtonLabel: string;
  TicketCategoryId: string;
  SupportRoleIds: string[];
  TicketNameTemplate: string;
  MaxOpenTicketsPerUser: number;
  WelcomeMessage: string;
  TicketEmbed: EditableEmbed;
  RequireOpenReason: boolean;
  SaveTranscriptOnClose: boolean;
  TranscriptMessageLimit: number;
  LogChannelId: string;
  EmbedColor: string;
};

type TicketRecord = {
  ChannelId: string;
  ClaimedBy: string | null;
  ClosedAt: string | null;
  ClosedBy: string | null;
  CreatedAt: string;
  Id: number;
  OwnerId: string;
  Reason: string;
  Status: "Open" | "Closed";
};

type TicketRecords = Record<string, TicketRecord>;
type DailyCounters = Record<string, number>;

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

const TicketRecordsKey = "TicketRecords";
const TicketSequenceKey = "TicketSequence";
const TicketsOpenedDailyKey = "TicketsOpenedDaily";
const TicketsClosedDailyKey = "TicketsClosedDaily";

const DefaultConfig: TicketConfig = {
  PanelChannelId: "",
  PanelTitle: "Support tickets",
  PanelDescription: "Open a private ticket with the support team.",
  PanelEmbed: {
    Title: "Support tickets",
    Description: "Open a private ticket with the support team.",
    Color: "#38bdf8",
    Url: "",
    AuthorName: "",
    AuthorIconUrl: "",
    ThumbnailUrl: "",
    ImageUrl: "",
    FooterText: "",
    FooterIconUrl: "",
    Timestamp: true,
    Fields: [],
    ImageDataUrl: "",
    ImageName: ""
  },
  OpenButtonLabel: "Open ticket",
  TicketCategoryId: "",
  SupportRoleIds: [],
  TicketNameTemplate: "ticket-%username%",
  MaxOpenTicketsPerUser: 1,
  WelcomeMessage: "%user%, thanks for opening a ticket. A support member will answer soon.",
  TicketEmbed: {
    Title: "Ticket #%id%",
    Description: "%reason%",
    Color: "#38bdf8",
    Url: "",
    AuthorName: "%username%",
    AuthorIconUrl: "%avatar%",
    ThumbnailUrl: "%avatar%",
    ImageUrl: "",
    FooterText: "Opened at %created_at%",
    FooterIconUrl: "",
    Timestamp: true,
    Fields: [
      {
        Name: "Owner",
        Value: "%user%",
        Inline: true
      },
      {
        Name: "Status",
        Value: "%status%",
        Inline: true
      },
      {
        Name: "Claimed by",
        Value: "%claimed_by%",
        Inline: true
      }
    ],
    ImageDataUrl: "",
    ImageName: ""
  },
  RequireOpenReason: true,
  SaveTranscriptOnClose: true,
  TranscriptMessageLimit: 100,
  LogChannelId: "",
  EmbedColor: "#38bdf8"
};

export default class TicketsPlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.Logger.Info("Tickets plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Tickets plugin disabled.");
  }

  public async OnDashboardAction(GuildId: string, ActionKey: string): Promise<void> {
    if (ActionKey !== "PublishTicketPanel") {
      return;
    }

    const GuildValue = await this.DiscordClient.guilds.fetch(GuildId).catch(() => null);

    if (!GuildValue) {
      throw new Error("Guild is not available.");
    }

    await this.PublishTicketPanel(GuildValue, await this.GetConfig(GuildId));
  }

  public async OnInteraction(InteractionValue: Interaction): Promise<void> {
    if (InteractionValue.isButton() && InteractionValue.customId.startsWith("Tickets:")) {
      await this.HandleButton(InteractionValue);
      return;
    }

    if (InteractionValue.isModalSubmit() && InteractionValue.customId.startsWith("TicketsModal:")) {
      await this.HandleModal(InteractionValue);
    }
  }

  private async PublishTicketPanel(GuildValue: Guild, Config: TicketConfig): Promise<void> {
    const Channel = await GuildValue.channels.fetch(Config.PanelChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildText) {
      throw new Error("Ticket panel channel is not configured or is not a text channel.");
    }

    const BuiltEmbed = this.BuildConfiguredEmbed(Config.PanelEmbed, {});
    const Row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("Tickets:Create")
        .setLabel(Config.OpenButtonLabel.slice(0, 80) || DefaultConfig.OpenButtonLabel)
        .setStyle(ButtonStyle.Primary)
    );

    await Channel.send({ embeds: [BuiltEmbed.Embed], files: BuiltEmbed.Files, components: [Row] });
  }

  private async HandleButton(InteractionValue: ButtonInteraction): Promise<void> {
    const [, Action, ChannelId] = InteractionValue.customId.split(":");

    if (!InteractionValue.inCachedGuild()) {
      await InteractionValue.reply({ content: "Tickets can only be used in a server.", ephemeral: true });
      return;
    }

    if (Action === "Create") {
      await this.ShowCreateModal(InteractionValue);
      return;
    }

    if (!ChannelId) {
      return;
    }

    const Ticket = await this.GetTicket(InteractionValue.guildId, ChannelId);

    if (!Ticket) {
      await InteractionValue.reply({ content: "This ticket is no longer tracked.", ephemeral: true });
      return;
    }

    const Config = await this.GetConfig(InteractionValue.guildId);

    if (Action === "Claim") {
      await this.ClaimTicket(InteractionValue, Ticket, Config);
      return;
    }

    if (Action === "Close") {
      await this.ShowCloseModal(InteractionValue, Ticket, Config);
      return;
    }

    if (Action === "Reopen") {
      await this.ReopenTicket(InteractionValue, Ticket, Config);
      return;
    }

    if (Action === "Transcript") {
      await this.SendTranscript(InteractionValue, Ticket, Config, true);
      return;
    }

    if (Action === "Delete") {
      await this.DeleteTicket(InteractionValue, Ticket, Config);
    }
  }

  private async HandleModal(InteractionValue: ModalSubmitInteraction): Promise<void> {
    const [, Action, ChannelId] = InteractionValue.customId.split(":");

    if (!InteractionValue.inCachedGuild()) {
      await InteractionValue.reply({ content: "Tickets can only be used in a server.", ephemeral: true });
      return;
    }

    if (Action === "Create") {
      await this.CreateTicket(InteractionValue, await this.GetConfig(InteractionValue.guildId));
      return;
    }

    if (Action === "Close" && ChannelId) {
      const Ticket = await this.GetTicket(InteractionValue.guildId, ChannelId);

      if (!Ticket) {
        await InteractionValue.reply({ content: "This ticket is no longer tracked.", ephemeral: true });
        return;
      }

      await this.CloseTicket(InteractionValue, Ticket, await this.GetConfig(InteractionValue.guildId));
    }
  }

  private async ShowCreateModal(InteractionValue: ButtonInteraction<"cached">): Promise<void> {
    const Config = await this.GetConfig(InteractionValue.guildId);
    const Modal = new ModalBuilder()
      .setCustomId("TicketsModal:Create")
      .setTitle("Open a ticket")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("Subject")
            .setLabel("Subject")
            .setMaxLength(80)
            .setRequired(Config.RequireOpenReason)
            .setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("Details")
            .setLabel("Details")
            .setMaxLength(800)
            .setRequired(false)
            .setStyle(TextInputStyle.Paragraph)
        )
      );

    await InteractionValue.showModal(Modal);
  }

  private async CreateTicket(InteractionValue: ModalSubmitInteraction<"cached">, Config: TicketConfig): Promise<void> {
    const ExistingTickets = Object.values(await this.GetTickets(InteractionValue.guildId))
      .filter((Ticket) => Ticket.OwnerId === InteractionValue.user.id && Ticket.Status === "Open");
    const MaxOpenTickets = Math.max(1, Config.MaxOpenTicketsPerUser);

    if (ExistingTickets.length >= MaxOpenTickets) {
      await InteractionValue.reply({ content: `You already have ${ExistingTickets.length} open ticket(s).`, ephemeral: true });
      return;
    }

    const Subject = InteractionValue.fields.getTextInputValue("Subject").trim();
    const Details = InteractionValue.fields.getTextInputValue("Details").trim();
    const Reason = [Subject, Details].filter(Boolean).join("\n\n").slice(0, 1000) || "No reason provided.";
    const Member = await InteractionValue.guild.members.fetch(InteractionValue.user.id).catch(() => null);

    if (!Member) {
      await InteractionValue.reply({ content: "Could not resolve your server member.", ephemeral: true });
      return;
    }

    await InteractionValue.deferReply({ ephemeral: true });

    const TicketId = await this.NextTicketId(InteractionValue.guildId);
    const ChannelName = this.BuildTicketChannelName(Config.TicketNameTemplate, Member, TicketId);
    const PermissionOverwrites = [
      {
        id: InteractionValue.guild.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: InteractionValue.client.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels]
      },
      {
        id: InteractionValue.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles]
      },
      ...Config.SupportRoleIds.filter(Boolean).map((RoleId) => ({
        id: RoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles]
      }))
    ];
    const Channel = await InteractionValue.guild.channels.create({
      name: ChannelName,
      type: ChannelType.GuildText,
      parent: Config.TicketCategoryId || undefined,
      permissionOverwrites: PermissionOverwrites,
      reason: "Ticket opened"
    }).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Ticket channel creation failed.", {
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        GuildId: InteractionValue.guildId,
        UserId: InteractionValue.user.id
      });
      return null;
    });

    if (!Channel) {
      await InteractionValue.editReply("Ticket channel could not be created. Check the bot permissions and category ID.");
      return;
    }
    const Ticket: TicketRecord = {
      ChannelId: Channel.id,
      ClaimedBy: null,
      ClosedAt: null,
      ClosedBy: null,
      CreatedAt: new Date().toISOString(),
      Id: TicketId,
      OwnerId: InteractionValue.user.id,
      Reason,
      Status: "Open"
    };
    const Tickets = await this.GetTickets(InteractionValue.guildId);
    Tickets[Channel.id] = Ticket;
    await this.Storage.SetGlobalConfig(InteractionValue.guildId, TicketRecordsKey, Tickets);
    await this.IncrementDailyCounter(InteractionValue.guildId, TicketsOpenedDailyKey, 1);
    await this.SendTicketIntro(Channel, Ticket, Config);
    await this.SendLog(InteractionValue.guild, Config, `Ticket #${Ticket.Id} opened by <@${Ticket.OwnerId}> in <#${Ticket.ChannelId}>.`);
    await InteractionValue.editReply(`Ticket created: <#${Channel.id}>`);
  }

  private async ShowCloseModal(InteractionValue: ButtonInteraction<"cached">, Ticket: TicketRecord, Config: TicketConfig): Promise<void> {
    if (!(await this.CanManageTicket(InteractionValue.member, Ticket, Config))) {
      await InteractionValue.reply({ content: "You cannot close this ticket.", ephemeral: true });
      return;
    }

    const Modal = new ModalBuilder()
      .setCustomId(`TicketsModal:Close:${Ticket.ChannelId}`)
      .setTitle("Close ticket")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("Reason")
            .setLabel("Close reason")
            .setMaxLength(500)
            .setRequired(false)
            .setStyle(TextInputStyle.Paragraph)
        )
      );

    await InteractionValue.showModal(Modal);
  }

  private async CloseTicket(InteractionValue: ModalSubmitInteraction<"cached">, Ticket: TicketRecord, Config: TicketConfig): Promise<void> {
    if (!(await this.CanManageTicket(InteractionValue.member, Ticket, Config))) {
      await InteractionValue.reply({ content: "You cannot close this ticket.", ephemeral: true });
      return;
    }

    const Channel = await InteractionValue.guild.channels.fetch(Ticket.ChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildText) {
      await InteractionValue.reply({ content: "Ticket channel not found.", ephemeral: true });
      return;
    }

    await InteractionValue.deferReply({ ephemeral: true });
    Ticket.Status = "Closed";
    Ticket.ClosedAt = new Date().toISOString();
    Ticket.ClosedBy = InteractionValue.user.id;
    await Channel.permissionOverwrites.edit(Ticket.OwnerId, { SendMessages: false }).catch(() => null);
    await Channel.setName(`closed-${Ticket.Id}`).catch(() => null);
    await this.SaveTicket(InteractionValue.guildId, Ticket);
    await this.IncrementDailyCounter(InteractionValue.guildId, TicketsClosedDailyKey, 1);

    if (Config.SaveTranscriptOnClose) {
      await this.SendTranscriptToLog(InteractionValue.guild, Ticket, Config);
    }

    await Channel.send({
      content: `Ticket closed by <@${InteractionValue.user.id}>.${this.FormatOptionalReason(InteractionValue.fields.getTextInputValue("Reason"))}`,
      components: [this.BuildClosedTicketControls(Ticket)]
    });
    await this.SendLog(InteractionValue.guild, Config, `Ticket #${Ticket.Id} closed by <@${InteractionValue.user.id}>.`);
    await InteractionValue.editReply("Ticket closed.");
  }

  private async ClaimTicket(InteractionValue: ButtonInteraction<"cached">, Ticket: TicketRecord, Config: TicketConfig): Promise<void> {
    if (!(await this.IsSupportMember(InteractionValue.member, Config))) {
      await InteractionValue.reply({ content: "Only support members can claim tickets.", ephemeral: true });
      return;
    }

    Ticket.ClaimedBy = InteractionValue.user.id;
    await this.SaveTicket(InteractionValue.guildId, Ticket);
    await InteractionValue.reply({ content: `Ticket claimed by <@${InteractionValue.user.id}>.` });
  }

  private async ReopenTicket(InteractionValue: ButtonInteraction<"cached">, Ticket: TicketRecord, Config: TicketConfig): Promise<void> {
    if (!(await this.CanManageTicket(InteractionValue.member, Ticket, Config))) {
      await InteractionValue.reply({ content: "You cannot reopen this ticket.", ephemeral: true });
      return;
    }

    const Channel = await InteractionValue.guild.channels.fetch(Ticket.ChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildText) {
      await InteractionValue.reply({ content: "Ticket channel not found.", ephemeral: true });
      return;
    }

    Ticket.Status = "Open";
    Ticket.ClosedAt = null;
    Ticket.ClosedBy = null;
    await Channel.permissionOverwrites.edit(Ticket.OwnerId, { SendMessages: true, ViewChannel: true }).catch(() => null);
    const Owner = await InteractionValue.guild.members.fetch(Ticket.OwnerId).catch(() => null);

    if (Owner) {
      await Channel.setName(this.BuildTicketChannelName(Config.TicketNameTemplate, Owner, Ticket.Id)).catch(() => null);
    }
    await this.SaveTicket(InteractionValue.guildId, Ticket);
    await InteractionValue.reply({ content: "Ticket reopened." });
  }

  private async DeleteTicket(InteractionValue: ButtonInteraction<"cached">, Ticket: TicketRecord, Config: TicketConfig): Promise<void> {
    if (!(await this.CanManageTicket(InteractionValue.member, Ticket, Config))) {
      await InteractionValue.reply({ content: "You cannot delete this ticket.", ephemeral: true });
      return;
    }

    await InteractionValue.deferReply({ ephemeral: true });
    const Channel = await InteractionValue.guild.channels.fetch(Ticket.ChannelId).catch(() => null);
    await this.SendTranscriptToLog(InteractionValue.guild, Ticket, Config);
    await this.DeleteTicketRecord(InteractionValue.guildId, Ticket.ChannelId);
    await this.SendLog(InteractionValue.guild, Config, `Ticket #${Ticket.Id} deleted by <@${InteractionValue.user.id}>.`);
    await InteractionValue.editReply("Ticket will be deleted.");

    if (Channel?.type === ChannelType.GuildText) {
      await Channel.delete("Ticket deleted").catch(() => null);
    }
  }

  private async SendTranscript(InteractionValue: ButtonInteraction<"cached">, Ticket: TicketRecord, Config: TicketConfig, Ephemeral: boolean): Promise<void> {
    if (!(await this.CanManageTicket(InteractionValue.member, Ticket, Config))) {
      await InteractionValue.reply({ content: "You cannot export this ticket.", ephemeral: true });
      return;
    }

    const Attachment = await this.BuildTranscriptAttachment(InteractionValue.guild, Ticket, Config);

    if (!Attachment) {
      await InteractionValue.reply({ content: "Transcript could not be generated.", ephemeral: true });
      return;
    }

    await InteractionValue.reply({ content: `Transcript for ticket #${Ticket.Id}.`, files: [Attachment], ephemeral: Ephemeral });
  }

  private async SendTicketIntro(Channel: TextChannel, Ticket: TicketRecord, Config: TicketConfig): Promise<void> {
    const Owner = await Channel.guild.members.fetch(Ticket.OwnerId).catch(() => null);
    const TemplateValues = this.BuildTicketTemplateValues(Ticket, Owner);
    const BuiltEmbed = this.BuildConfiguredEmbed(Config.TicketEmbed, TemplateValues);

    await Channel.send({
      content: this.ApplyTemplate(Config.WelcomeMessage, TemplateValues).slice(0, 2000),
      embeds: [BuiltEmbed.Embed],
      files: BuiltEmbed.Files,
      components: [this.BuildOpenTicketControls(Ticket)]
    });
  }

  private BuildOpenTicketControls(Ticket: TicketRecord): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`Tickets:Claim:${Ticket.ChannelId}`).setLabel("Claim").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`Tickets:Close:${Ticket.ChannelId}`).setLabel("Close").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`Tickets:Transcript:${Ticket.ChannelId}`).setLabel("Transcript").setStyle(ButtonStyle.Secondary)
    );
  }

  private BuildClosedTicketControls(Ticket: TicketRecord): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`Tickets:Reopen:${Ticket.ChannelId}`).setLabel("Reopen").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`Tickets:Transcript:${Ticket.ChannelId}`).setLabel("Transcript").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`Tickets:Delete:${Ticket.ChannelId}`).setLabel("Delete").setStyle(ButtonStyle.Danger)
    );
  }

  private async BuildTranscriptAttachment(GuildValue: Guild, Ticket: TicketRecord, Config: TicketConfig): Promise<AttachmentBuilder | null> {
    const Channel = await GuildValue.channels.fetch(Ticket.ChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildText) {
      return null;
    }

    const Messages = await Channel.messages.fetch({ limit: this.Clamp(Config.TranscriptMessageLimit, 1, 100) }).catch(() => null);

    if (!Messages) {
      return null;
    }

    const Lines = [...Messages.values()].reverse().map((MessageValue) => {
      const Attachments = MessageValue.attachments.size > 0 ? ` ${MessageValue.attachments.map((Attachment) => Attachment.url).join(" ")}` : "";
      return `[${MessageValue.createdAt.toISOString()}] ${MessageValue.author.tag}: ${MessageValue.cleanContent}${Attachments}`;
    });
    const Header = [
      `Ticket #${Ticket.Id}`,
      `Owner: ${Ticket.OwnerId}`,
      `Status: ${Ticket.Status}`,
      `Created: ${Ticket.CreatedAt}`,
      ""
    ].join("\n");

    return new AttachmentBuilder(Buffer.from(`${Header}${Lines.join("\n")}`, "utf8"), {
      name: `ticket-${Ticket.Id}-transcript.txt`
    });
  }

  private async SendTranscriptToLog(GuildValue: Guild, Ticket: TicketRecord, Config: TicketConfig): Promise<void> {
    if (!Config.LogChannelId) {
      return;
    }

    const LogChannel = await GuildValue.channels.fetch(Config.LogChannelId).catch(() => null);
    const Attachment = await this.BuildTranscriptAttachment(GuildValue, Ticket, Config);

    if (!LogChannel || LogChannel.type !== ChannelType.GuildText || !Attachment) {
      return;
    }

    await LogChannel.send({ content: `Transcript for ticket #${Ticket.Id}.`, files: [Attachment] }).catch(() => null);
  }

  private async SendLog(GuildValue: Guild, Config: TicketConfig, Content: string): Promise<void> {
    if (!Config.LogChannelId) {
      return;
    }

    const Channel = await GuildValue.channels.fetch(Config.LogChannelId).catch(() => null);

    if (Channel?.type !== ChannelType.GuildText) {
      return;
    }

    await Channel.send({ content: Content.slice(0, 2000) }).catch(() => null);
  }

  private async CanManageTicket(Member: GuildMember, Ticket: TicketRecord, Config: TicketConfig): Promise<boolean> {
    return Ticket.OwnerId === Member.id || Member.permissions.has(PermissionFlagsBits.ManageChannels) || this.IsSupportMember(Member, Config);
  }

  private IsSupportMember(Member: GuildMember, Config: TicketConfig): boolean {
    return Config.SupportRoleIds.some((RoleId) => Member.roles.cache.has(RoleId)) || Member.permissions.has(PermissionFlagsBits.ManageChannels);
  }

  private async GetTicket(GuildId: string, ChannelId: string): Promise<TicketRecord | null> {
    return (await this.GetTickets(GuildId))[ChannelId] ?? null;
  }

  private async GetTickets(GuildId: string): Promise<TicketRecords> {
    return (await this.Storage.GetGlobalConfig<TicketRecords>(GuildId, TicketRecordsKey)) ?? {};
  }

  private async SaveTicket(GuildId: string, Ticket: TicketRecord): Promise<void> {
    const Tickets = await this.GetTickets(GuildId);
    Tickets[Ticket.ChannelId] = Ticket;
    await this.Storage.SetGlobalConfig(GuildId, TicketRecordsKey, Tickets);
  }

  private async DeleteTicketRecord(GuildId: string, ChannelId: string): Promise<void> {
    const Tickets = await this.GetTickets(GuildId);
    delete Tickets[ChannelId];
    await this.Storage.SetGlobalConfig(GuildId, TicketRecordsKey, Tickets);
  }

  private async NextTicketId(GuildId: string): Promise<number> {
    const Current = (await this.Storage.GetGlobalConfig<number>(GuildId, TicketSequenceKey)) ?? 0;
    const Next = Current + 1;
    await this.Storage.SetGlobalConfig(GuildId, TicketSequenceKey, Next);
    return Next;
  }

  private async IncrementDailyCounter(GuildId: string, Key: string, Amount: number): Promise<void> {
    const Counters = (await this.Storage.GetGlobalConfig<DailyCounters>(GuildId, Key)) ?? {};
    const DayKey = new Date().toISOString().slice(0, 10);
    Counters[DayKey] = Math.max(0, (Counters[DayKey] ?? 0) + Amount);
    await this.Storage.SetGlobalConfig(GuildId, Key, Counters);
  }

  private async GetConfig(GuildId: string): Promise<TicketConfig> {
    return {
      PanelChannelId: await this.GetStringConfig(GuildId, "PanelChannelId", DefaultConfig.PanelChannelId),
      PanelTitle: await this.GetStringConfig(GuildId, "PanelTitle", DefaultConfig.PanelTitle),
      PanelDescription: await this.GetStringConfig(GuildId, "PanelDescription", DefaultConfig.PanelDescription),
      PanelEmbed: await this.GetEmbedConfig(GuildId, "PanelEmbed", DefaultConfig.PanelEmbed),
      OpenButtonLabel: await this.GetStringConfig(GuildId, "OpenButtonLabel", DefaultConfig.OpenButtonLabel),
      TicketCategoryId: await this.GetStringConfig(GuildId, "TicketCategoryId", DefaultConfig.TicketCategoryId),
      SupportRoleIds: (await this.Storage.GetGlobalConfig<string[]>(GuildId, "SupportRoleIds")) ?? DefaultConfig.SupportRoleIds,
      TicketNameTemplate: await this.GetStringConfig(GuildId, "TicketNameTemplate", DefaultConfig.TicketNameTemplate),
      MaxOpenTicketsPerUser: await this.GetNumberConfig(GuildId, "MaxOpenTicketsPerUser", DefaultConfig.MaxOpenTicketsPerUser),
      WelcomeMessage: await this.GetStringConfig(GuildId, "WelcomeMessage", DefaultConfig.WelcomeMessage),
      TicketEmbed: await this.GetEmbedConfig(GuildId, "TicketEmbed", DefaultConfig.TicketEmbed),
      RequireOpenReason: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "RequireOpenReason")) ?? DefaultConfig.RequireOpenReason,
      SaveTranscriptOnClose: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "SaveTranscriptOnClose")) ?? DefaultConfig.SaveTranscriptOnClose,
      TranscriptMessageLimit: await this.GetNumberConfig(GuildId, "TranscriptMessageLimit", DefaultConfig.TranscriptMessageLimit),
      LogChannelId: await this.GetStringConfig(GuildId, "LogChannelId", DefaultConfig.LogChannelId),
      EmbedColor: await this.GetStringConfig(GuildId, "EmbedColor", DefaultConfig.EmbedColor)
    };
  }

  private async GetNumberConfig(GuildId: string, Key: keyof TicketConfig, DefaultValue: number): Promise<number> {
    const StoredValue = await this.Storage.GetGlobalConfig<number>(GuildId, Key);
    return Number.isFinite(StoredValue) ? Number(StoredValue) : DefaultValue;
  }

  private async GetStringConfig(GuildId: string, Key: keyof TicketConfig, DefaultValue: string): Promise<string> {
    const StoredValue = await this.Storage.GetGlobalConfig<string>(GuildId, Key);
    return StoredValue?.trim() || DefaultValue;
  }

  private async GetEmbedConfig(GuildId: string, Key: keyof TicketConfig, DefaultValue: EditableEmbed): Promise<EditableEmbed> {
    const StoredValue = await this.Storage.GetGlobalConfig<unknown>(GuildId, Key);
    return this.IsRecord(StoredValue) ? this.ParseEditableEmbed(StoredValue, DefaultValue) : DefaultValue;
  }

  private BuildTicketChannelName(Template: string, Member: GuildMember, TicketId: number): string {
    return Template
      .replaceAll("%user%", Member.displayName)
      .replaceAll("%username%", Member.user.username)
      .replaceAll("%id%", String(TicketId))
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/gu, "-")
      .replace(/-+/gu, "-")
      .replace(/^-|-$/gu, "")
      .slice(0, 90) || `ticket-${TicketId}`;
  }

  private BuildConfiguredEmbed(Source: EditableEmbed, TemplateValues: Record<string, string>): { Embed: EmbedBuilder; Files: AttachmentBuilder[] } {
    const Embed = new EmbedBuilder().setColor(this.ParseEmbedColor(this.ApplyTemplate(Source.Color, TemplateValues)));
    const Files: AttachmentBuilder[] = [];
    const Title = this.ApplyTemplate(Source.Title, TemplateValues).trim();
    const Description = this.ApplyTemplate(Source.Description, TemplateValues).trim();
    const Url = this.ApplyTemplate(Source.Url, TemplateValues).trim();
    const AuthorName = this.ApplyTemplate(Source.AuthorName, TemplateValues).trim();
    const AuthorIconUrl = this.ApplyTemplate(Source.AuthorIconUrl, TemplateValues).trim();
    const ThumbnailUrl = this.ApplyTemplate(Source.ThumbnailUrl, TemplateValues).trim();
    const ImageUrl = this.ApplyTemplate(Source.ImageUrl, TemplateValues).trim();
    const FooterText = this.ApplyTemplate(Source.FooterText, TemplateValues).trim();
    const FooterIconUrl = this.ApplyTemplate(Source.FooterIconUrl, TemplateValues).trim();

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

    const UploadedImage = this.ParseDataImage(Source.ImageDataUrl, Source.ImageName);

    if (UploadedImage) {
      Files.push(UploadedImage);
      Embed.setImage(`attachment://${UploadedImage.name}`);
    } else if (ImageUrl) {
      Embed.setImage(ImageUrl);
    }

    if (FooterText) {
      Embed.setFooter({ text: FooterText.slice(0, 2048), iconURL: FooterIconUrl || undefined });
    }

    if (Source.Timestamp) {
      Embed.setTimestamp(new Date());
    }

    for (const Field of Source.Fields) {
      const Name = this.ApplyTemplate(Field.Name, TemplateValues).trim();
      const Value = this.ApplyTemplate(Field.Value, TemplateValues).trim();

      if (!Name || !Value) {
        continue;
      }

      Embed.addFields({
        name: Name.slice(0, 256),
        value: Value.slice(0, 1024),
        inline: Field.Inline
      });
    }

    return { Embed, Files };
  }

  private BuildTicketTemplateValues(Ticket: TicketRecord, Owner: GuildMember | null): Record<string, string> {
    return {
      "%avatar%": Owner?.displayAvatarURL() ?? "",
      "%channel%": `<#${Ticket.ChannelId}>`,
      "%claimed_by%": Ticket.ClaimedBy ? `<@${Ticket.ClaimedBy}>` : "Nobody",
      "%created_at%": Ticket.CreatedAt,
      "%id%": String(Ticket.Id),
      "%reason%": Ticket.Reason,
      "%status%": Ticket.Status,
      "%ticket%": `#${Ticket.Id}`,
      "%user%": `<@${Ticket.OwnerId}>`,
      "%user_id%": Ticket.OwnerId,
      "%username%": Owner?.displayName ?? Owner?.user.username ?? Ticket.OwnerId
    };
  }

  private ApplyTemplate(Value: string, TemplateValues: Record<string, string>): string {
    return Object.entries(TemplateValues).reduce((CurrentValue, [Key, Replacement]) => CurrentValue.replaceAll(Key, Replacement), Value);
  }

  private ParseEditableEmbed(Value: Record<string, unknown>, DefaultValue: EditableEmbed): EditableEmbed {
    return {
      Title: this.GetRecordString(Value, "Title", DefaultValue.Title),
      Description: this.GetRecordString(Value, "Description", DefaultValue.Description),
      Color: this.GetRecordString(Value, "Color", DefaultValue.Color),
      Url: this.GetRecordString(Value, "Url", DefaultValue.Url),
      AuthorName: this.GetRecordString(Value, "AuthorName", DefaultValue.AuthorName),
      AuthorIconUrl: this.GetRecordString(Value, "AuthorIconUrl", DefaultValue.AuthorIconUrl),
      ThumbnailUrl: this.GetRecordString(Value, "ThumbnailUrl", DefaultValue.ThumbnailUrl),
      ImageUrl: this.GetRecordString(Value, "ImageUrl", DefaultValue.ImageUrl),
      FooterText: this.GetRecordString(Value, "FooterText", DefaultValue.FooterText),
      FooterIconUrl: this.GetRecordString(Value, "FooterIconUrl", DefaultValue.FooterIconUrl),
      Timestamp: typeof Value.Timestamp === "boolean" ? Value.Timestamp : DefaultValue.Timestamp,
      Fields: this.ParseEmbedFields(Value.Fields, DefaultValue.Fields),
      ImageDataUrl: this.GetRecordString(Value, "ImageDataUrl", DefaultValue.ImageDataUrl),
      ImageName: this.GetRecordString(Value, "ImageName", DefaultValue.ImageName)
    };
  }

  private ParseEmbedFields(Value: unknown, DefaultFields: EditableEmbedField[]): EditableEmbedField[] {
    if (!Array.isArray(Value)) {
      return DefaultFields;
    }

    return Value.filter((Item): Item is Record<string, unknown> => this.IsRecord(Item)).map((Item) => ({
      Name: typeof Item.Name === "string" ? Item.Name : "",
      Value: typeof Item.Value === "string" ? Item.Value : "",
      Inline: Item.Inline === true
    })).filter((Field) => Field.Name.trim() || Field.Value.trim());
  }

  private ParseDataImage(Value: string, Name: string): AttachmentBuilder | null {
    const Match = /^data:image\/(png|jpe?g|gif|webp);base64,([a-z0-9+/=]+)$/iu.exec(Value);

    if (!Match) {
      return null;
    }

    const Extension = Match[1].toLowerCase() === "jpeg" ? "jpg" : Match[1].toLowerCase();
    const SafeBaseName = Name.replace(/\.[^.]+$/u, "").replace(/[^a-z0-9_-]/giu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "").slice(0, 40) || "ticket-embed";
    return new AttachmentBuilder(Buffer.from(Match[2], "base64"), {
      name: `${SafeBaseName}.${Extension}`
    });
  }

  private IsRecord(Value: unknown): Value is Record<string, unknown> {
    return typeof Value === "object" && Value !== null && !Array.isArray(Value);
  }

  private GetRecordString(Value: Record<string, unknown>, Key: string, Fallback: string): string {
    return typeof Value[Key] === "string" ? Value[Key] : Fallback;
  }

  private FormatOptionalReason(Reason: string): string {
    const SafeReason = Reason.trim();
    return SafeReason ? `\nReason: ${SafeReason.slice(0, 500)}` : "";
  }

  private ParseEmbedColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : DefaultConfig.EmbedColor;
    return Number.parseInt(SafeColor.slice(1), 16);
  }

  private Clamp(Value: number, Minimum: number, Maximum: number): number {
    return Math.min(Math.max(Math.trunc(Number.isFinite(Value) ? Value : Minimum), Minimum), Maximum);
  }
}
