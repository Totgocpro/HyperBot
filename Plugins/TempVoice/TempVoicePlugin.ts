import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type Interaction,
  type Message,
  type MessageCreateOptions,
  type MessageEditOptions,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type VoiceChannel,
  type VoiceState
} from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type TempVoiceConfig = {
  CreatorChannelId: string;
  ChannelNameTemplate: string;
  DefaultUserLimit: number;
  DefaultBitrateKbps: number;
  ProtectedRoleIds: string[];
  ControlPanelTitle: string;
  ControlPanelDescription: string;
  ControlPanelColor: string;
};

type TempVoiceSession = {
  GuildId: string;
  ChannelId: string;
  OwnerId: string;
  CreatorId: string;
  CreatedAt: string;
  Locked: boolean;
  SoundboardDisabled: boolean;
  BannedUserIds: string[];
  MemberJoinTimes: Record<string, number>;
  UserLimit: number;
  ControlPanelMessageId?: string;
};

type TempVoiceSessions = Record<string, TempVoiceSession>;

const DefaultConfig: TempVoiceConfig = {
  CreatorChannelId: "",
  ChannelNameTemplate: "%user%'s voice room",
  DefaultUserLimit: 0,
  DefaultBitrateKbps: 64,
  ProtectedRoleIds: [],
  ControlPanelTitle: "Temporary voice control panel",
  ControlPanelDescription: "Only the current room owner can use these controls.",
  ControlPanelColor: "#38bdf8"
};

const SessionsStorageKey = "TempVoiceSessions";

export default class TempVoicePlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.Logger.Info("Temp Voice plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Temp Voice plugin disabled.");
  }

  public async OnVoiceStateUpdate(OldState: VoiceState, NewState: VoiceState): Promise<void> {
    const GuildId = NewState.guild.id;
    const Config = await this.GetConfig(GuildId);

    if (NewState.channelId === Config.CreatorChannelId && OldState.channelId !== Config.CreatorChannelId && NewState.member) {
      await this.CreateTemporaryChannel(NewState.guild, NewState.member, Config);
      return;
    }

    if (NewState.channelId) {
      await this.TrackMemberJoin(NewState);
    }

    if (OldState.channelId) {
      await this.HandlePossibleTempChannelUpdate(OldState.guild, OldState.channelId);
    }
  }

  public async OnInteraction(InteractionValue: Interaction): Promise<void> {
    if (!InteractionValue.inCachedGuild()) {
      return;
    }

    if (InteractionValue.isButton() && InteractionValue.customId.startsWith("TempVoice:")) {
      await this.HandleButton(InteractionValue);
      return;
    }

    if (InteractionValue.isStringSelectMenu() && InteractionValue.customId.startsWith("TempVoiceSelect:")) {
      await this.HandleSelect(InteractionValue);
      return;
    }

    if (InteractionValue.isModalSubmit() && InteractionValue.customId.startsWith("TempVoiceModal:")) {
      await this.HandleModal(InteractionValue);
    }
  }

  private async CreateTemporaryChannel(Guild: Guild, Member: GuildMember, Config: TempVoiceConfig): Promise<void> {
    const CreatorChannel = Guild.channels.cache.get(Config.CreatorChannelId);

    if (!CreatorChannel || CreatorChannel.type !== ChannelType.GuildVoice) {
      return;
    }

    const ChannelName = this.ApplyTemplate(Config.ChannelNameTemplate, Member);
    const Channel = await Guild.channels.create({
      name: ChannelName.slice(0, 100),
      type: ChannelType.GuildVoice,
      parent: CreatorChannel.parentId,
      position: CreatorChannel.position + 1,
      bitrate: this.Clamp(Config.DefaultBitrateKbps, 8, 384) * 1000,
      userLimit: this.Clamp(Config.DefaultUserLimit, 0, 99),
      permissionOverwrites: [
        {
          id: Guild.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.UseSoundboard]
        },
        {
          id: Member.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers]
        }
      ],
      reason: "Temporary voice channel created by HyperBot"
    });

    const VoiceChannelValue = Channel as VoiceChannel;
    const Session: TempVoiceSession = {
      GuildId: Guild.id,
      ChannelId: VoiceChannelValue.id,
      OwnerId: Member.id,
      CreatorId: Member.id,
      CreatedAt: new Date().toISOString(),
      Locked: false,
      SoundboardDisabled: false,
      BannedUserIds: [],
      MemberJoinTimes: {
        [Member.id]: Date.now()
      },
      UserLimit: this.Clamp(Config.DefaultUserLimit, 0, 99)
    };

    await this.SaveSession(Session);
    await Member.voice.setChannel(VoiceChannelValue, "Temporary voice channel created.");
    await this.SendControlPanel(VoiceChannelValue, Session, Config);
  }

  private async TrackMemberJoin(State: VoiceState): Promise<void> {
    const Session = await this.GetSession(State.channelId);

    if (!Session || !State.member) {
      return;
    }

    Session.MemberJoinTimes[State.member.id] = Session.MemberJoinTimes[State.member.id] ?? Date.now();
    await this.SaveSession(Session);
  }

  private async HandlePossibleTempChannelUpdate(Guild: Guild, ChannelId: string): Promise<void> {
    const Session = await this.GetSession(ChannelId);

    if (!Session) {
      return;
    }

    const Channel = await Guild.channels.fetch(ChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildVoice) {
      await this.DeleteSession(ChannelId);
      return;
    }

    const Members = Array.from(Channel.members.values()).filter((Member) => !Member.user.bot);

    if (Members.length === 0) {
      await this.DeleteSession(ChannelId);
      await Channel.delete("Temporary voice channel is empty.").catch(() => null);
      return;
    }

    const OwnerStillPresent = Members.some((Member) => Member.id === Session.OwnerId);

    if (!OwnerStillPresent) {
      const NewOwner = this.GetOldestMember(Members, Session);
      Session.OwnerId = NewOwner.id;
      await this.SaveSession(Session);
      await this.SendControlPanel(Channel, Session, await this.GetConfig(Guild.id));
    }
  }

  private async HandleButton(InteractionValue: ButtonInteraction<"cached">): Promise<void> {
    const [Prefix, Action, ChannelId] = InteractionValue.customId.split(":");

    if (Prefix !== "TempVoice" || !Action || !ChannelId) {
      return;
    }

    const Session = await this.GetSession(ChannelId);

    if (!Session) {
      await InteractionValue.reply({ content: "This temporary channel no longer exists.", ephemeral: true });
      return;
    }

    if (Action === "Claim") {
      await this.HandleClaim(InteractionValue, Session);
      return;
    }

    if (!(await this.RequireOwner(InteractionValue, Session))) {
      return;
    }

    if (Action === "Lock") {
      await this.SetLocked(InteractionValue, Session, !Session.Locked);
      return;
    }

    if (Action === "Soundboard") {
      await this.SetSoundboardDisabled(InteractionValue, Session, !Session.SoundboardDisabled);
      return;
    }

    if (Action === "Transfer") {
      await this.ShowMemberSelect(InteractionValue, Session, "Transfer");
      return;
    }

    if (Action === "Ban") {
      await this.ShowMemberSelect(InteractionValue, Session, "Ban");
      return;
    }

    if (Action === "Rename") {
      await this.ShowRenameModal(InteractionValue, Session);
      return;
    }

    if (Action === "LimitUp" || Action === "LimitDown") {
      await this.ChangeUserLimit(InteractionValue, Session, Action === "LimitUp" ? 1 : -1);
    }
  }

  private async HandleSelect(InteractionValue: StringSelectMenuInteraction<"cached">): Promise<void> {
    const [Prefix, Action, ChannelId] = InteractionValue.customId.split(":");

    if (Prefix !== "TempVoiceSelect" || !Action || !ChannelId) {
      return;
    }

    const Session = await this.GetSession(ChannelId);

    if (!Session || !(await this.RequireOwner(InteractionValue, Session))) {
      return;
    }

    const TargetMemberId = InteractionValue.values[0];
    const Channel = await InteractionValue.guild.channels.fetch(ChannelId).catch(() => null);

    if (!TargetMemberId || !Channel || Channel.type !== ChannelType.GuildVoice) {
      await InteractionValue.reply({ content: "Target member is not available anymore.", ephemeral: true });
      return;
    }

    if (Action === "Transfer") {
      Session.OwnerId = TargetMemberId;
      await this.SaveSession(Session);
      await InteractionValue.update({ content: `<@${TargetMemberId}> is now the room owner.`, components: [] });
      await this.SendControlPanel(Channel, Session, await this.GetConfig(InteractionValue.guildId));
      return;
    }

    if (Action === "Ban") {
      const Config = await this.GetConfig(InteractionValue.guildId);
      const Member = await InteractionValue.guild.members.fetch(TargetMemberId).catch(() => null);

      if (!Member || this.HasProtectedRole(Member, Config.ProtectedRoleIds)) {
        await InteractionValue.reply({ content: "This member cannot be banned from the room.", ephemeral: true });
        return;
      }

      Session.BannedUserIds = Array.from(new Set([...Session.BannedUserIds, TargetMemberId]));
      await Channel.permissionOverwrites.edit(TargetMemberId, {
        Connect: false,
        ViewChannel: false
      });
      await Member.voice.disconnect("Banned from temporary voice channel.").catch(() => null);
      await this.SaveSession(Session);
      await InteractionValue.update({ content: `<@${TargetMemberId}> has been banned from this room.`, components: [] });
    }
  }

  private async HandleModal(InteractionValue: ModalSubmitInteraction<"cached">): Promise<void> {
    const [Prefix, Action, ChannelId] = InteractionValue.customId.split(":");

    if (Prefix !== "TempVoiceModal" || Action !== "Rename" || !ChannelId) {
      return;
    }

    const Session = await this.GetSession(ChannelId);

    if (!Session || !(await this.RequireOwner(InteractionValue, Session))) {
      return;
    }

    const Channel = await InteractionValue.guild.channels.fetch(ChannelId).catch(() => null);
    const Name = InteractionValue.fields.getTextInputValue("Name").trim();

    if (!Channel || Channel.type !== ChannelType.GuildVoice || !Name) {
      await InteractionValue.reply({ content: "Invalid channel name.", ephemeral: true });
      return;
    }

    await Channel.setName(Name.slice(0, 100), "Temporary voice channel renamed by owner.");
    await InteractionValue.reply({ content: "Room renamed.", ephemeral: true });
    await this.SendControlPanel(Channel, Session, await this.GetConfig(InteractionValue.guildId));
  }

  private async SetLocked(InteractionValue: ButtonInteraction<"cached">, Session: TempVoiceSession, Locked: boolean): Promise<void> {
    const Channel = await InteractionValue.guild.channels.fetch(Session.ChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildVoice) {
      await InteractionValue.reply({ content: "Temporary channel not found.", ephemeral: true });
      return;
    }

    Session.Locked = Locked;
    await Channel.permissionOverwrites.edit(InteractionValue.guild.id, {
      Connect: !Locked
    });
    await this.SaveSession(Session);
    await InteractionValue.reply({ content: Locked ? "Room locked." : "Room unlocked.", ephemeral: true });
    await this.SendControlPanel(Channel, Session, await this.GetConfig(InteractionValue.guildId));
  }

  private async SetSoundboardDisabled(InteractionValue: ButtonInteraction<"cached">, Session: TempVoiceSession, Disabled: boolean): Promise<void> {
    const Channel = await InteractionValue.guild.channels.fetch(Session.ChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildVoice) {
      await InteractionValue.reply({ content: "Temporary channel not found.", ephemeral: true });
      return;
    }

    Session.SoundboardDisabled = Disabled;
    await Channel.permissionOverwrites.edit(InteractionValue.guild.id, {
      UseSoundboard: !Disabled,
      UseExternalSounds: !Disabled
    });
    await this.SaveSession(Session);
    await InteractionValue.reply({ content: Disabled ? "Soundboard disabled." : "Soundboard enabled.", ephemeral: true });
    await this.SendControlPanel(Channel, Session, await this.GetConfig(InteractionValue.guildId));
  }

  private async ChangeUserLimit(InteractionValue: ButtonInteraction<"cached">, Session: TempVoiceSession, Delta: number): Promise<void> {
    const Channel = await InteractionValue.guild.channels.fetch(Session.ChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildVoice) {
      await InteractionValue.reply({ content: "Temporary channel not found.", ephemeral: true });
      return;
    }

    Session.UserLimit = this.Clamp((Session.UserLimit || 0) + Delta, 0, 99);
    await Channel.setUserLimit(Session.UserLimit, "Temporary voice user limit changed by owner.");
    await this.SaveSession(Session);
    await InteractionValue.reply({ content: `User limit set to ${Session.UserLimit || "unlimited"}.`, ephemeral: true });
    await this.SendControlPanel(Channel, Session, await this.GetConfig(InteractionValue.guildId));
  }

  private async HandleClaim(InteractionValue: ButtonInteraction<"cached">, Session: TempVoiceSession): Promise<void> {
    const Channel = await InteractionValue.guild.channels.fetch(Session.ChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildVoice || !Channel.members.has(InteractionValue.user.id)) {
      await InteractionValue.reply({ content: "You must be in the room to claim it.", ephemeral: true });
      return;
    }

    if (Channel.members.has(Session.OwnerId)) {
      await InteractionValue.reply({ content: "The current owner is still in the room.", ephemeral: true });
      return;
    }

    Session.OwnerId = InteractionValue.user.id;
    await this.SaveSession(Session);
    await InteractionValue.reply({ content: "You are now the room owner.", ephemeral: true });
    await this.SendControlPanel(Channel, Session, await this.GetConfig(InteractionValue.guildId));
  }

  private async ShowMemberSelect(InteractionValue: ButtonInteraction<"cached">, Session: TempVoiceSession, Action: "Transfer" | "Ban"): Promise<void> {
    const Channel = await InteractionValue.guild.channels.fetch(Session.ChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildVoice) {
      await InteractionValue.reply({ content: "Temporary channel not found.", ephemeral: true });
      return;
    }

    const Config = await this.GetConfig(InteractionValue.guildId);
    const Members = Array.from(Channel.members.values())
      .filter((Member) => !Member.user.bot)
      .filter((Member) => Member.id !== InteractionValue.user.id)
      .filter((Member) => Action !== "Ban" || !this.HasProtectedRole(Member, Config.ProtectedRoleIds))
      .slice(0, 25);

    if (Members.length === 0) {
      await InteractionValue.reply({ content: "No eligible member found in this room.", ephemeral: true });
      return;
    }

    const Select = new StringSelectMenuBuilder()
      .setCustomId(`TempVoiceSelect:${Action}:${Session.ChannelId}`)
      .setPlaceholder(Action === "Transfer" ? "Select the new owner" : "Select a member to ban")
      .addOptions(
        Members.map((Member) => ({
          label: Member.user.username.slice(0, 100),
          description: Member.user.tag.slice(0, 100),
          value: Member.id
        }))
      );

    const Row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(Select);
    await InteractionValue.reply({
      content: Action === "Transfer" ? "Choose the new room owner." : "Choose the member to ban from this room.",
      components: [Row],
      ephemeral: true
    });
  }

  private async ShowRenameModal(InteractionValue: ButtonInteraction<"cached">, Session: TempVoiceSession): Promise<void> {
    const Modal = new ModalBuilder()
      .setCustomId(`TempVoiceModal:Rename:${Session.ChannelId}`)
      .setTitle("Rename temporary voice room")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("Name")
            .setLabel("New room name")
            .setMaxLength(100)
            .setRequired(true)
            .setStyle(TextInputStyle.Short)
        )
      );

    await InteractionValue.showModal(Modal);
  }

  private async SendControlPanel(Channel: VoiceChannel, Session: TempVoiceSession, Config: TempVoiceConfig): Promise<void> {
    const Embed = new EmbedBuilder()
      .setTitle(Config.ControlPanelTitle)
      .setDescription(this.ApplyControlTemplate(Config.ControlPanelDescription, Channel, Session))
      .setColor(this.ParseColor(Config.ControlPanelColor))
      .addFields(
        { name: "Owner", value: `<@${Session.OwnerId}>`, inline: true },
        { name: "Lock", value: Session.Locked ? "Locked" : "Open", inline: true },
        { name: "Soundboard", value: Session.SoundboardDisabled ? "Disabled" : "Enabled", inline: true },
        { name: "User limit", value: String(Session.UserLimit || "Unlimited"), inline: true },
        { name: "Bans", value: String(Session.BannedUserIds.length), inline: true }
      )
      .setFooter({ text: "Use the buttons below to manage this temporary room." })
      .setTimestamp(new Date());

    const FirstRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`TempVoice:Lock:${Session.ChannelId}`)
        .setLabel(Session.Locked ? "Unlock" : "Lock")
        .setStyle(Session.Locked ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`TempVoice:Soundboard:${Session.ChannelId}`)
        .setLabel(Session.SoundboardDisabled ? "Enable soundboard" : "Disable soundboard")
        .setStyle(Session.SoundboardDisabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`TempVoice:Rename:${Session.ChannelId}`)
        .setLabel("Rename")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`TempVoice:Claim:${Session.ChannelId}`)
        .setLabel("Claim")
        .setStyle(ButtonStyle.Secondary)
    );
    const SecondRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`TempVoice:Transfer:${Session.ChannelId}`).setLabel("Transfer owner").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`TempVoice:Ban:${Session.ChannelId}`).setLabel("Ban member").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`TempVoice:LimitDown:${Session.ChannelId}`).setLabel("- limit").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`TempVoice:LimitUp:${Session.ChannelId}`).setLabel("+ limit").setStyle(ButtonStyle.Secondary)
    );

    const Payload: MessageCreateOptions = { embeds: [Embed], components: [FirstRow, SecondRow] };
    const EditPayload: MessageEditOptions = { embeds: [Embed], components: [FirstRow, SecondRow] };
    const TextChannel = Channel as VoiceChannel & {
      messages: {
        fetch(MessageId: string): Promise<Message>;
      };
      send(Options: MessageCreateOptions): Promise<Message>;
    };

    if (Session.ControlPanelMessageId) {
      const ExistingMessage = await TextChannel.messages.fetch(Session.ControlPanelMessageId).catch(() => null);

      if (ExistingMessage) {
        await ExistingMessage.edit(EditPayload).catch((ErrorValue: unknown) => {
          this.Logger.Warn("Could not edit temporary voice control panel.", ErrorValue);
        });
        return;
      }
    }

    const MessageValue = await TextChannel.send(Payload).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Could not send temporary voice control panel.", ErrorValue);
      return null;
    });

    if (MessageValue) {
      Session.ControlPanelMessageId = MessageValue.id;
      await this.SaveSession(Session);
    }
  }

  private async RequireOwner(InteractionValue: ButtonInteraction<"cached"> | StringSelectMenuInteraction<"cached"> | ModalSubmitInteraction<"cached">, Session: TempVoiceSession): Promise<boolean> {
    if (InteractionValue.user.id === Session.OwnerId) {
      return true;
    }

    await InteractionValue.reply({ content: "Only the current room owner can use this control.", ephemeral: true });
    return false;
  }

  private GetOldestMember(Members: GuildMember[], Session: TempVoiceSession): GuildMember {
    return [...Members].sort((FirstMember, SecondMember) => {
      const FirstJoinTime = Session.MemberJoinTimes[FirstMember.id] ?? Date.now();
      const SecondJoinTime = Session.MemberJoinTimes[SecondMember.id] ?? Date.now();
      return FirstJoinTime - SecondJoinTime;
    })[0];
  }

  private async GetConfig(GuildId: string): Promise<TempVoiceConfig> {
    return {
      CreatorChannelId: (await this.Storage.GetGlobalConfig<string>(GuildId, "CreatorChannelId")) ?? DefaultConfig.CreatorChannelId,
      ChannelNameTemplate: (await this.Storage.GetGlobalConfig<string>(GuildId, "ChannelNameTemplate")) ?? DefaultConfig.ChannelNameTemplate,
      DefaultUserLimit: (await this.Storage.GetGlobalConfig<number>(GuildId, "DefaultUserLimit")) ?? DefaultConfig.DefaultUserLimit,
      DefaultBitrateKbps: (await this.Storage.GetGlobalConfig<number>(GuildId, "DefaultBitrateKbps")) ?? DefaultConfig.DefaultBitrateKbps,
      ProtectedRoleIds: (await this.Storage.GetGlobalConfig<string[]>(GuildId, "ProtectedRoleIds")) ?? DefaultConfig.ProtectedRoleIds,
      ControlPanelTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "ControlPanelTitle")) ?? DefaultConfig.ControlPanelTitle,
      ControlPanelDescription: (await this.Storage.GetGlobalConfig<string>(GuildId, "ControlPanelDescription")) ?? DefaultConfig.ControlPanelDescription,
      ControlPanelColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "ControlPanelColor")) ?? DefaultConfig.ControlPanelColor
    };
  }

  private async GetSessions(GuildId: string): Promise<TempVoiceSessions> {
    return (await this.Storage.GetGlobalConfig<TempVoiceSessions>(GuildId, SessionsStorageKey)) ?? {};
  }

  private async GetSession(ChannelId: string | null): Promise<TempVoiceSession | null> {
    if (!ChannelId) {
      return null;
    }

    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      const Sessions = await this.GetSessions(Guild.id);

      if (Sessions[ChannelId]) {
        return Sessions[ChannelId];
      }
    }

    return null;
  }

  private async SaveSession(Session: TempVoiceSession): Promise<void> {
    const Sessions = await this.GetSessions(Session.GuildId);
    Sessions[Session.ChannelId] = Session;
    await this.Storage.SetGlobalConfig(Session.GuildId, SessionsStorageKey, Sessions);
  }

  private async DeleteSession(ChannelId: string): Promise<void> {
    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      const Sessions = await this.GetSessions(Guild.id);

      if (!Sessions[ChannelId]) {
        continue;
      }

      delete Sessions[ChannelId];
      await this.Storage.SetGlobalConfig(Guild.id, SessionsStorageKey, Sessions);
      return;
    }
  }

  private HasProtectedRole(Member: GuildMember, ProtectedRoleIds: string[]): boolean {
    return ProtectedRoleIds.some((RoleId) => Member.roles.cache.has(RoleId));
  }

  private ApplyTemplate(Template: string, Member: GuildMember): string {
    return Template
      .replaceAll("%user%", Member.user.username)
      .replaceAll("%tag%", Member.user.tag)
      .replaceAll("%mention%", `<@${Member.id}>`)
      .replaceAll("%server%", Member.guild.name);
  }

  private ApplyControlTemplate(Template: string, Channel: VoiceChannel, Session: TempVoiceSession): string {
    return Template
      .replaceAll("%owner%", `<@${Session.OwnerId}>`)
      .replaceAll("%channel%", Channel.name)
      .replaceAll("%locked%", Session.Locked ? "locked" : "open")
      .replaceAll("%soundboard%", Session.SoundboardDisabled ? "disabled" : "enabled")
      .replaceAll("%limit%", String(Session.UserLimit || "unlimited"));
  }

  private ParseColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : DefaultConfig.ControlPanelColor;
    return Number.parseInt(SafeColor.replace("#", ""), 16);
  }

  private Clamp(Value: number, Minimum: number, Maximum: number): number {
    return Math.min(Math.max(Math.trunc(Number.isFinite(Value) ? Value : Minimum), Minimum), Maximum);
  }
}
