import {
  ActionRowBuilder,
  AttachmentBuilder,
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
  type NonThreadGuildBasedChannel,
  type StringSelectMenuInteraction,
  type VoiceChannel,
  type VoiceState
} from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";
import { TempVoiceMusicBusyError, TempVoiceMusicError, TempVoiceMusicPlayer } from "./TempVoiceMusicPlayer.js";
import { TempVoiceMusicPanelRenderer } from "./TempVoiceMusicPanelRenderer.js";
import { TempVoiceTtsBusyError, TempVoiceTtsPlayer } from "./TempVoiceTtsPlayer.js";

type TempVoiceConfig = {
  CreatorChannelId: string;
  ChannelNameTemplate: string;
  DefaultUserLimit: number;
  DefaultBitrateKbps: number;
  LockEnabled: boolean;
  BanEnabled: boolean;
  ProtectedRoleIds: string[];
  ControlPanelTitle: string;
  ControlPanelDescription: string;
  ControlPanelColor: string;
  MusicButtonPlayLabel: string;
  MusicButtonPauseLabel: string;
  MusicButtonResumeLabel: string;
  MusicButtonSkipLabel: string;
  MusicButtonStopLabel: string;
  MusicAskButtonLabel: string;
  MusicModalTitle: string;
  MusicModalUrlLabel: string;
  MusicAskModalTitle: string;
  MusicAskSubmittedMessage: string;
  MusicPanelAddButtonLabel: string;
  MusicPanelEnabled: boolean;
  MusicYoutubeAccountMode: string;
  MusicYoutubeCookiesPath: string;
  MusicRequiresAccountMessage: string;
  MusicStartedMessage: string;
  MusicBusyMessage: string;
  MusicControlAppliedMessage: string;
  MusicPlaybackFailedMessage: string;
  MusicIdleStatus: string;
  MusicPlayingStatus: string;
  MusicPausedStatus: string;
  TTSEnabled: boolean;
  TTSButtonLabel: string;
  TTSModalTitle: string;
  TTSModalTextLabel: string;
  TTSModalLanguageLabel: string;
  TTSDefaultLanguage: string;
  TTSStartedMessage: string;
  TTSBusyMessage: string;
  TTSDisabledMessage: string;
  TTSFailedMessage: string;
};

type TempVoiceSession = {
  GuildId: string;
  ChannelId: string;
  OwnerId: string;
  CreatorId: string;
  CreatedAt: string;
  Locked: boolean;
  SoundboardDisabled: boolean;
  TtsDisabled?: boolean;
  BannedUserIds: string[];
  MemberJoinTimes: Record<string, number>;
  UserLimit: number;
  ControlPanelMessageId?: string;
  MusicPanelMessageId?: string;
};

type TempVoiceSessions = Record<string, TempVoiceSession>;

type TempVoiceMusicRequest = {
  ChannelId: string;
  CreatedAt: string;
  GuildId: string;
  Id: string;
  RequesterId: string;
  Url: string;
};

const DefaultConfig: TempVoiceConfig = {
  CreatorChannelId: "",
  ChannelNameTemplate: "%user%'s voice room",
  DefaultUserLimit: 0,
  DefaultBitrateKbps: 64,
  LockEnabled: true,
  BanEnabled: true,
  ProtectedRoleIds: [],
  ControlPanelTitle: "Temporary voice control panel",
  ControlPanelDescription: "Only the current room owner can use these controls.",
  ControlPanelColor: "#38bdf8",
  MusicButtonPlayLabel: "Play music",
  MusicButtonPauseLabel: "Pause",
  MusicButtonResumeLabel: "Continue",
  MusicButtonSkipLabel: "Skip",
  MusicButtonStopLabel: "Stop",
  MusicAskButtonLabel: "Ask music / playlist",
  MusicModalTitle: "Play YouTube music",
  MusicModalUrlLabel: "YouTube video or playlist URL",
  MusicAskModalTitle: "Ask music / playlist",
  MusicAskSubmittedMessage: "Music request sent to the room owner.",
  MusicPanelAddButtonLabel: "Add to waitlist",
  MusicPanelEnabled: true,
  MusicYoutubeAccountMode: "Environment",
  MusicYoutubeCookiesPath: "",
  MusicRequiresAccountMessage: "This YouTube video is unavailable or requires a linked account.",
  MusicStartedMessage: "Music started: %title%%queued_suffix%.",
  MusicBusyMessage: "Music is already playing in %channel%.",
  MusicControlAppliedMessage: "Music control applied.",
  MusicPlaybackFailedMessage: "Music playback failed: %error%",
  MusicIdleStatus: "Idle",
  MusicPlayingStatus: "Playing: %title%",
  MusicPausedStatus: "Paused: %title%",
  TTSEnabled: true,
  TTSButtonLabel: "TTS",
  TTSModalTitle: "Speak with TTS",
  TTSModalTextLabel: "Text to say",
  TTSModalLanguageLabel: "Language (fr, en, es...)",
  TTSDefaultLanguage: "fr",
  TTSStartedMessage: "TTS started.",
  TTSBusyMessage: "The bot is already connected in %channel%.",
  TTSDisabledMessage: "TTS is disabled on this server.",
  TTSFailedMessage: "TTS failed: %error%"
};

const SessionsStorageKey = "TempVoiceSessions";
const MusicPanelAttachmentName = "tempvoice-music-panel.png";
const MusicPanelGlobalWriteSpacingMs = 900;
const MusicPanelRefreshIntervalMs = 3500;
const MusicPanelSimpleMinWriteIntervalMs = 5000;
const MusicPanelSlowRefreshThresholdMs = 1200;
const DiscordRestRateLimitPaddingMs = 250;

export default class TempVoicePlugin extends BasePlugin {
  private DiscordRestPressureUntilMs = 0;
  private MusicPanelGlobalNextWriteAtMs = 0;
  private readonly MusicPanelActiveChannelIds = new Set<string>();
  private readonly MusicPanelLastWriteAtMs = new Map<string, number>();
  private readonly MusicPanelMessages = new Map<string, Message>();
  private readonly MusicPanelNextWriteAtMs = new Map<string, number>();
  private readonly MusicPanelRefreshes = new Set<string>();
  private readonly MusicPanelRefreshTimers = new Map<string, NodeJS.Timeout>();
  private readonly MusicPanelRenderer = new TempVoiceMusicPanelRenderer(this.Logger);
  private readonly MusicRequests = new Map<string, TempVoiceMusicRequest>();
  private readonly MusicPlayer = new TempVoiceMusicPlayer(this.Logger, async (ChannelId) => {
    await this.RefreshControlPanel(ChannelId);
    await this.RefreshMusicPanel(ChannelId, "state");
  });
  private readonly TtsPlayer = new TempVoiceTtsPlayer(this.Logger, async (ChannelId) => {
    await this.RefreshControlPanel(ChannelId);
  });
  private readonly OnDiscordRestRateLimited = (RateLimitData: unknown): void => {
    const RetryAfter = this.ReadPositiveNumber(RateLimitData, ["retryAfter", "timeToReset", "sublimitTimeout"]);

    if (RetryAfter > 0) {
      this.MarkDiscordRestPressure(RetryAfter, "rateLimited");
    }
  };
  private readonly OnDiscordRestResponse = (_RequestData: unknown, ResponseValue: unknown): void => {
    const Headers = (ResponseValue as { headers?: { get(Name: string): string | null } } | null)?.headers;

    if (!Headers) {
      return;
    }

    const Remaining = Number(Headers.get("X-RateLimit-Remaining") ?? "");
    const ResetAfterSeconds = Number(Headers.get("X-RateLimit-Reset-After") ?? "");

    if (Number.isFinite(Remaining) && Remaining <= 0 && Number.isFinite(ResetAfterSeconds) && ResetAfterSeconds > 0) {
      this.MarkDiscordRestPressure(ResetAfterSeconds * 1000, "headers");
    }
  };

  public async OnEnable(): Promise<void> {
    this.DiscordClient.rest.on("rateLimited", this.OnDiscordRestRateLimited);
    this.DiscordClient.rest.on("response", this.OnDiscordRestResponse);
    this.Logger.Info("Temp Voice plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    for (const ChannelId of this.MusicPanelRefreshTimers.keys()) {
      this.StopMusicPanelRefreshLoop(ChannelId);
    }

    this.DiscordClient.rest.off("rateLimited", this.OnDiscordRestRateLimited);
    this.DiscordClient.rest.off("response", this.OnDiscordRestResponse);
    this.Logger.Info("Temp Voice plugin disabled.");
  }

  public async OnVoiceStateUpdate(OldState: VoiceState, NewState: VoiceState): Promise<void> {
    const GuildId = NewState.guild.id;
    const Config = await this.GetConfig(GuildId);

    if (NewState.channelId === Config.CreatorChannelId && OldState.channelId !== Config.CreatorChannelId && NewState.member && !NewState.member.user.bot) {
      await this.CreateTemporaryChannel(NewState.guild, NewState.member, Config);
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
      bitrate: this.Clamp(Config.DefaultBitrateKbps, 8, 384) * 1000,
      userLimit: this.Clamp(Config.DefaultUserLimit, 0, 99),
      permissionOverwrites: [
        {
          id: Guild.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.UseSoundboard]
        },
        {
          id: Member.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
        }
      ],
      reason: "Temporary voice channel created by HyperBot"
    });

    const VoiceChannelValue = Channel as VoiceChannel;
    await this.MoveTemporaryChannelToCategoryBottom(VoiceChannelValue);

    const Session: TempVoiceSession = {
      GuildId: Guild.id,
      ChannelId: VoiceChannelValue.id,
      OwnerId: Member.id,
      CreatorId: Member.id,
      CreatedAt: new Date().toISOString(),
      Locked: false,
      SoundboardDisabled: false,
      TtsDisabled: false,
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

  private async MoveTemporaryChannelToCategoryBottom(Channel: VoiceChannel): Promise<void> {
    if (!Channel.parentId) {
      return;
    }

    const Channels = await Channel.guild.channels.fetch(undefined, { force: true }).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Could not refresh guild channels before moving temporary voice channel.", ErrorValue);
      return null;
    });

    const CategoryChannels = Array.from((Channels ?? Channel.guild.channels.cache).values())
      .filter((Candidate): Candidate is NonThreadGuildBasedChannel => {
        return Candidate !== null && "parentId" in Candidate && "rawPosition" in Candidate && Candidate.parentId === Channel.parentId;
      })
      .sort((Left, Right) => Left.rawPosition - Right.rawPosition);

    const BottomChannel = CategoryChannels.at(-1);

    if (!BottomChannel || BottomChannel.id === Channel.id) {
      return;
    }

    await Channel.guild.channels.setPositions([{ channel: Channel, position: BottomChannel.rawPosition + 1 }]).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Could not move temporary voice channel to category bottom.", ErrorValue);
    });
  }

  private async TrackMemberJoin(State: VoiceState): Promise<void> {
    const Session = await this.GetSession(State.channelId);

    if (!Session || !State.member || State.member.user.bot) {
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
      await this.DeleteTemporaryChannel(Channel);
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
    const [Prefix, Action, ChannelId, RequestId] = InteractionValue.customId.split(":");

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

    if (Action === "TTS") {
      await this.ShowTtsModal(InteractionValue, Session);
      return;
    }

    if (Action === "MusicAsk") {
      await this.ShowMusicAskModal(InteractionValue, Session);
      return;
    }

    if (Action === "MusicQueue") {
      await this.ShowMusicQueueModal(InteractionValue, Session);
      return;
    }

    if (Action?.startsWith("MusicRequest")) {
      await this.HandleMusicRequestButton(InteractionValue, Session, Action, RequestId);
      return;
    }

    if (!(await this.RequireOwner(InteractionValue, Session))) {
      return;
    }

    if (Action === "Lock") {
      const Config = await this.GetConfig(InteractionValue.guildId);

      if (!Config.LockEnabled) {
        await InteractionValue.reply({ content: "Room lock is disabled on this server.", ephemeral: true });
        await this.SendControlPanelFromSession(InteractionValue.guild, Session, Config, InteractionValue);
        return;
      }

      await this.SetLocked(InteractionValue, Session, !Session.Locked);
      return;
    }

    if (Action === "Soundboard") {
      await this.SetSoundboardDisabled(InteractionValue, Session, !Session.SoundboardDisabled);
      return;
    }

    if (Action === "TtsToggle") {
      await this.SetTtsDisabled(InteractionValue, Session, !Session.TtsDisabled);
      return;
    }

    if (Action === "Transfer") {
      await this.ShowMemberSelect(InteractionValue, Session, "Transfer");
      return;
    }

    if (Action === "Ban") {
      const Config = await this.GetConfig(InteractionValue.guildId);

      if (!Config.BanEnabled) {
        await InteractionValue.reply({ content: "Room bans are disabled on this server.", ephemeral: true });
        await this.SendControlPanelFromSession(InteractionValue.guild, Session, Config, InteractionValue);
        return;
      }

      await this.ShowMemberSelect(InteractionValue, Session, "Ban");
      return;
    }

    if (Action === "Rename") {
      await this.ShowRenameModal(InteractionValue, Session);
      return;
    }

    if (Action === "MusicPlay") {
      await this.ShowMusicModal(InteractionValue, Session);
      return;
    }

    if (["MusicStop", "MusicPause", "MusicResume", "MusicSkip", "MusicToggle"].includes(Action)) {
      await this.HandleMusicButton(InteractionValue, Session, Action);
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

      if (!Config.BanEnabled) {
        await InteractionValue.reply({ content: "Room bans are disabled on this server.", ephemeral: true });
        await this.SendControlPanel(Channel, Session, Config);
        return;
      }

      if (!this.CanBanFromTemporaryRoom(Channel)) {
        await InteractionValue.reply({ content: "The bot cannot ban members from this room.", ephemeral: true });
        await this.SendControlPanel(Channel, Session, Config);
        return;
      }

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

    if (Prefix !== "TempVoiceModal" || !Action || !ChannelId) {
      return;
    }

    const Session = await this.GetSession(ChannelId);

    if (!Session) {
      await InteractionValue.reply({ content: "This temporary channel no longer exists.", ephemeral: true });
      return;
    }

    if (Action === "TTS") {
      await this.HandleTtsModal(InteractionValue, Session);
      return;
    }

    if (Action === "MusicAsk") {
      await this.HandleMusicAskModal(InteractionValue, Session);
      return;
    }

    if (Action === "MusicQueue") {
      await this.HandleMusicQueueModal(InteractionValue, Session);
      return;
    }

    if (!(await this.RequireOwner(InteractionValue, Session))) {
      return;
    }

    if (Action === "MusicPlay") {
      await this.HandleMusicModal(InteractionValue, Session);
      return;
    }

    if (Action !== "Rename") {
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

    if (!this.CanManageTemporaryRoomPermissions(Channel)) {
      await InteractionValue.reply({ content: "The bot cannot manage this room permissions.", ephemeral: true });
      await this.SendControlPanel(Channel, Session, await this.GetConfig(InteractionValue.guildId), InteractionValue);
      return;
    }

    Session.Locked = Locked;
    await Channel.permissionOverwrites.edit(InteractionValue.guild.id, {
      Connect: !Locked
    });
    await this.SaveSession(Session);
    await InteractionValue.reply({ content: Locked ? "Room locked." : "Room unlocked.", ephemeral: true });
    await this.SendControlPanel(Channel, Session, await this.GetConfig(InteractionValue.guildId), InteractionValue);
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
    await this.SendControlPanel(Channel, Session, await this.GetConfig(InteractionValue.guildId), InteractionValue);
  }

  private async SetTtsDisabled(InteractionValue: ButtonInteraction<"cached">, Session: TempVoiceSession, Disabled: boolean): Promise<void> {
    const Channel = await InteractionValue.guild.channels.fetch(Session.ChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildVoice) {
      await InteractionValue.reply({ content: "Temporary channel not found.", ephemeral: true });
      return;
    }

    Session.TtsDisabled = Disabled;
    await this.SaveSession(Session);
    await InteractionValue.reply({ content: Disabled ? "TTS disabled for this room." : "TTS enabled for this room.", ephemeral: true });
    await this.SendControlPanel(Channel, Session, await this.GetConfig(InteractionValue.guildId), InteractionValue);
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
    await this.SendControlPanel(Channel, Session, await this.GetConfig(InteractionValue.guildId), InteractionValue);
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

    if (Action === "Ban" && !Config.BanEnabled) {
      await InteractionValue.reply({ content: "Room bans are disabled on this server.", ephemeral: true });
      await this.SendControlPanel(Channel, Session, Config, InteractionValue);
      return;
    }

    if (Action === "Ban" && !this.CanBanFromTemporaryRoom(Channel)) {
      await InteractionValue.reply({ content: "The bot cannot ban members from this room.", ephemeral: true });
      await this.SendControlPanel(Channel, Session, Config, InteractionValue);
      return;
    }

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
          label: Member.displayName.slice(0, 100),
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

  private async ShowMusicModal(InteractionValue: ButtonInteraction<"cached">, Session: TempVoiceSession): Promise<void> {
    const Config = await this.GetConfig(InteractionValue.guildId);
    const Modal = new ModalBuilder()
      .setCustomId(`TempVoiceModal:MusicPlay:${Session.ChannelId}`)
      .setTitle(Config.MusicModalTitle.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("Url")
            .setLabel(Config.MusicModalUrlLabel.slice(0, 45))
            .setMaxLength(500)
            .setRequired(true)
            .setStyle(TextInputStyle.Short)
        )
      );

    await InteractionValue.showModal(Modal);
  }

  private async ShowMusicAskModal(InteractionValue: ButtonInteraction<"cached">, Session: TempVoiceSession): Promise<void> {
    const Config = await this.GetConfig(InteractionValue.guildId);
    const Channel = await InteractionValue.guild.channels.fetch(Session.ChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildVoice || !Channel.members.has(InteractionValue.user.id)) {
      await InteractionValue.reply({ content: "You must be in this temporary voice room to ask for music.", ephemeral: true });
      return;
    }

    const Modal = new ModalBuilder()
      .setCustomId(`TempVoiceModal:MusicAsk:${Session.ChannelId}`)
      .setTitle(Config.MusicAskModalTitle.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("Url")
            .setLabel(Config.MusicModalUrlLabel.slice(0, 45))
            .setMaxLength(500)
            .setRequired(true)
            .setStyle(TextInputStyle.Short)
        )
      );

    await InteractionValue.showModal(Modal);
  }

  private async ShowMusicQueueModal(InteractionValue: ButtonInteraction<"cached">, Session: TempVoiceSession): Promise<void> {
    const Config = await this.GetConfig(InteractionValue.guildId);
    const Modal = new ModalBuilder()
      .setCustomId(`TempVoiceModal:MusicQueue:${Session.ChannelId}`)
      .setTitle("Add to waitlist")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("Url")
            .setLabel(Config.MusicModalUrlLabel.slice(0, 45))
            .setMaxLength(300)
            .setRequired(true)
            .setStyle(TextInputStyle.Short)
        )
      );

    await InteractionValue.showModal(Modal);
  }

  private async ShowTtsModal(InteractionValue: ButtonInteraction<"cached">, Session: TempVoiceSession): Promise<void> {
    const Config = await this.GetConfig(InteractionValue.guildId);
    const Channel = await InteractionValue.guild.channels.fetch(Session.ChannelId).catch(() => null);

    if (!Config.TTSEnabled) {
      await InteractionValue.reply({ content: Config.TTSDisabledMessage, ephemeral: true });
      return;
    }

    if (Session.TtsDisabled) {
      await InteractionValue.reply({ content: "TTS is disabled for this temporary room.", ephemeral: true });
      return;
    }

    if (!Channel || Channel.type !== ChannelType.GuildVoice || !Channel.members.has(InteractionValue.user.id)) {
      await InteractionValue.reply({ content: "You must be in this temporary voice room to use TTS.", ephemeral: true });
      return;
    }

    const BusyChannelId = this.GetBusyAudioChannelId(InteractionValue.guildId, Session.ChannelId);

    if (BusyChannelId) {
      await InteractionValue.reply({ content: this.ApplyTtsTemplate(Config.TTSBusyMessage, { ChannelId: BusyChannelId, Error: "" }), ephemeral: true });
      return;
    }

    const Modal = new ModalBuilder()
      .setCustomId(`TempVoiceModal:TTS:${Session.ChannelId}`)
      .setTitle(Config.TTSModalTitle.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("Text")
            .setLabel(Config.TTSModalTextLabel.slice(0, 45))
            .setMaxLength(150)
            .setRequired(true)
            .setStyle(TextInputStyle.Paragraph)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("Language")
            .setLabel(Config.TTSModalLanguageLabel.slice(0, 45))
            .setMaxLength(8)
            .setRequired(false)
            .setStyle(TextInputStyle.Short)
            .setValue(Config.TTSDefaultLanguage.slice(0, 8))
        )
      );

    await InteractionValue.showModal(Modal);
  }

  private async HandleMusicModal(InteractionValue: ModalSubmitInteraction<"cached">, Session: TempVoiceSession): Promise<void> {
    const Channel = await InteractionValue.guild.channels.fetch(Session.ChannelId).catch(() => null);
    const Url = InteractionValue.fields.getTextInputValue("Url").trim();
    const Config = await this.GetConfig(InteractionValue.guildId);

    if (!Channel || Channel.type !== ChannelType.GuildVoice) {
      await InteractionValue.reply({ content: "Temporary channel not found.", ephemeral: true });
      return;
    }

    await InteractionValue.deferReply({ ephemeral: true });

    try {
      const Result = await this.MusicPlayer.Play(Channel, Url, {
        YoutubeCookiesPath: this.ResolveYoutubeCookiesPath(Config)
      });
      await InteractionValue.editReply(this.ApplyMusicTemplate(Config.MusicStartedMessage, {
        ChannelId: Session.ChannelId,
        Count: Result.Count,
        Error: "",
        Title: Result.FirstTitle
      }));
      await this.SendControlPanel(Channel, Session, Config);
    } catch (ErrorValue) {
      if (ErrorValue instanceof TempVoiceMusicBusyError) {
        await InteractionValue.editReply(this.ApplyMusicTemplate(Config.MusicBusyMessage, {
          ChannelId: ErrorValue.ChannelId,
          Count: 0,
          Error: ErrorValue.message,
          Title: ""
        }));
        return;
      }

      if (ErrorValue instanceof TempVoiceMusicError) {
        await InteractionValue.editReply(this.ApplyMusicTemplate(Config.MusicPlaybackFailedMessage, {
          ChannelId: Session.ChannelId,
          Count: 0,
          Error: this.GetPublicMusicErrorMessage(ErrorValue, Config),
          Title: ""
        }));
        return;
      }

      this.Logger.Warn("TempVoice music playback failed while handling modal.", ErrorValue);
      await InteractionValue.editReply(this.ApplyMusicTemplate(Config.MusicPlaybackFailedMessage, {
        ChannelId: Session.ChannelId,
        Count: 0,
        Error: "Playback could not be started.",
        Title: ""
      }));
    }
  }

  private async HandleMusicAskModal(InteractionValue: ModalSubmitInteraction<"cached">, Session: TempVoiceSession): Promise<void> {
    const Channel = await InteractionValue.guild.channels.fetch(Session.ChannelId).catch(() => null);
    const Url = InteractionValue.fields.getTextInputValue("Url").trim();
    const Config = await this.GetConfig(InteractionValue.guildId);

    if (!Channel || Channel.type !== ChannelType.GuildVoice || !Channel.members.has(InteractionValue.user.id)) {
      await InteractionValue.reply({ content: "You must be in this temporary voice room to ask for music.", ephemeral: true });
      return;
    }

    if (!Url) {
      await InteractionValue.reply({ content: "Music URL is required.", ephemeral: true });
      return;
    }

    const Request: TempVoiceMusicRequest = {
      ChannelId: Session.ChannelId,
      CreatedAt: new Date().toISOString(),
      GuildId: Session.GuildId,
      Id: this.CreateRequestId(),
      RequesterId: InteractionValue.user.id,
      Url
    };
    this.MusicRequests.set(Request.Id, Request);

    const Embed = new EmbedBuilder()
      .setTitle("Music request")
      .setDescription(`<@${Request.RequesterId}> wants to play this music.`)
      .setColor(this.ParseColor(Config.ControlPanelColor))
      .addFields({ name: "URL", value: this.ClampDiscordFieldValue(Url), inline: false })
      .setTimestamp(new Date());
    const Row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`TempVoice:MusicRequestReject:${Session.ChannelId}:${Request.Id}`)
        .setLabel("Reject")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`TempVoice:MusicRequestPlayNow:${Session.ChannelId}:${Request.Id}`)
        .setLabel("Play now")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`TempVoice:MusicRequestQueue:${Session.ChannelId}:${Request.Id}`)
        .setLabel("Play at end")
        .setStyle(ButtonStyle.Success)
    );
    const TextChannel = Channel as VoiceChannel & {
      send(Options: MessageCreateOptions): Promise<Message>;
    };

    const MessageValue = await TextChannel.send({
      allowedMentions: { users: [Session.OwnerId] },
      components: [Row],
      content: `<@${Session.OwnerId}>`,
      embeds: [Embed]
    }).catch((ErrorValue: unknown) => {
      this.MusicRequests.delete(Request.Id);
      this.Logger.Warn("Could not send temporary voice music request panel.", ErrorValue);
      return null;
    });

    if (!MessageValue) {
      await InteractionValue.reply({ content: "Music request could not be sent.", ephemeral: true });
      return;
    }

    await InteractionValue.reply({ content: Config.MusicAskSubmittedMessage, ephemeral: true });
  }

  private async HandleMusicQueueModal(InteractionValue: ModalSubmitInteraction<"cached">, Session: TempVoiceSession): Promise<void> {
    const Channel = await InteractionValue.guild.channels.fetch(Session.ChannelId).catch(() => null);
    const Url = InteractionValue.fields.getTextInputValue("Url").trim();
    const Config = await this.GetConfig(InteractionValue.guildId);

    if (!Channel || Channel.type !== ChannelType.GuildVoice || !Channel.members.has(InteractionValue.user.id)) {
      await InteractionValue.reply({ content: "You must be in this temporary voice room to add music.", ephemeral: true });
      return;
    }

    if (!Url) {
      await InteractionValue.reply({ content: "Music URL is required.", ephemeral: true });
      return;
    }

    await InteractionValue.deferReply({ ephemeral: true });

    try {
      const Result = await this.MusicPlayer.Enqueue(Channel, Url, {
        YoutubeCookiesPath: this.ResolveYoutubeCookiesPath(Config)
      });
      const Status = Result.Started
        ? this.ApplyMusicTemplate(Config.MusicStartedMessage, {
            ChannelId: Session.ChannelId,
            Count: Result.Count,
            Error: "",
            Title: Result.FirstTitle
          })
        : `Music queued: ${Result.FirstTitle}${Result.Count > 1 ? ` (+${Result.Count - 1} queued)` : ""}.`;

      await InteractionValue.editReply(Status);
      await this.SendControlPanel(Channel, Session, Config);
      await this.RefreshMusicPanel(Session.ChannelId, "state");
    } catch (ErrorValue) {
      const ErrorMessage = ErrorValue instanceof TempVoiceMusicError
        ? this.GetPublicMusicErrorMessage(ErrorValue, Config)
        : ErrorValue instanceof TempVoiceMusicBusyError
          ? this.ApplyMusicTemplate(Config.MusicBusyMessage, {
              ChannelId: ErrorValue.ChannelId,
              Count: 0,
              Error: ErrorValue.message,
              Title: ""
            })
          : "Playback could not be queued.";

      if (!(ErrorValue instanceof TempVoiceMusicError) && !(ErrorValue instanceof TempVoiceMusicBusyError)) {
        this.Logger.Warn("TempVoice music waitlist add failed.", ErrorValue);
      }

      await InteractionValue.editReply(`Music request failed: ${ErrorMessage}`);
    }
  }

  private async HandleTtsModal(InteractionValue: ModalSubmitInteraction<"cached">, Session: TempVoiceSession): Promise<void> {
    const Channel = await InteractionValue.guild.channels.fetch(Session.ChannelId).catch(() => null);
    const Config = await this.GetConfig(InteractionValue.guildId);
    const Text = InteractionValue.fields.getTextInputValue("Text").trim();
    const Language = InteractionValue.fields.getTextInputValue("Language").trim() || Config.TTSDefaultLanguage;

    if (!Config.TTSEnabled) {
      await InteractionValue.reply({ content: Config.TTSDisabledMessage, ephemeral: true });
      return;
    }

    if (Session.TtsDisabled) {
      await InteractionValue.reply({ content: "TTS is disabled for this temporary room.", ephemeral: true });
      return;
    }

    if (!Channel || Channel.type !== ChannelType.GuildVoice || !Channel.members.has(InteractionValue.user.id)) {
      await InteractionValue.reply({ content: "You must be in this temporary voice room to use TTS.", ephemeral: true });
      return;
    }

    const BusyChannelId = this.GetBusyAudioChannelId(InteractionValue.guildId, Session.ChannelId);

    if (BusyChannelId) {
      await InteractionValue.reply({ content: this.ApplyTtsTemplate(Config.TTSBusyMessage, { ChannelId: BusyChannelId, Error: "" }), ephemeral: true });
      return;
    }

    await InteractionValue.deferReply({ ephemeral: true });

    try {
      await this.TtsPlayer.Speak(Channel, Text, Language);
      await InteractionValue.editReply(Config.TTSStartedMessage);
      await this.SendControlPanel(Channel, Session, Config);
    } catch (ErrorValue) {
      if (ErrorValue instanceof TempVoiceTtsBusyError) {
        await InteractionValue.editReply(this.ApplyTtsTemplate(Config.TTSBusyMessage, {
          ChannelId: ErrorValue.ChannelId,
          Error: ErrorValue.message
        }));
        return;
      }

      const ErrorMessage = ErrorValue instanceof Error ? ErrorValue.message : "Unknown error";
      await InteractionValue.editReply(this.ApplyTtsTemplate(Config.TTSFailedMessage, {
        ChannelId: Session.ChannelId,
        Error: ErrorMessage
      }));
    }
  }

  private async HandleMusicButton(InteractionValue: ButtonInteraction<"cached">, Session: TempVoiceSession, Action: string): Promise<void> {
    const Channel = await InteractionValue.guild.channels.fetch(Session.ChannelId).catch(() => null);
    const Config = await this.GetConfig(InteractionValue.guildId);

    if (!Channel || Channel.type !== ChannelType.GuildVoice) {
      await InteractionValue.reply({ content: "Temporary channel not found.", ephemeral: true });
      return;
    }

    if (Action === "MusicStop") this.MusicPlayer.Stop(Session.ChannelId);
    if (Action === "MusicPause") this.MusicPlayer.Pause(Session.ChannelId);
    if (Action === "MusicResume") this.MusicPlayer.Resume(Session.ChannelId);
    if (Action === "MusicToggle") this.MusicPlayer.TogglePause(Session.ChannelId);
    if (Action === "MusicSkip") await this.MusicPlayer.Skip(Session.ChannelId);

    await InteractionValue.reply({ content: Config.MusicControlAppliedMessage, ephemeral: true });
    await this.SendControlPanel(Channel, Session, Config, InteractionValue);
  }

  private async HandleMusicRequestButton(InteractionValue: ButtonInteraction<"cached">, Session: TempVoiceSession, Action: string, RequestId?: string): Promise<void> {
    if (!(await this.RequireOwner(InteractionValue, Session))) {
      return;
    }

    const Request = RequestId ? this.MusicRequests.get(RequestId) : null;

    if (!Request || Request.ChannelId !== Session.ChannelId || Request.GuildId !== Session.GuildId) {
      await InteractionValue.reply({ content: "This music request is no longer available.", ephemeral: true });
      return;
    }

    if (Action === "MusicRequestReject") {
      this.MusicRequests.delete(Request.Id);
      await InteractionValue.deferUpdate();
      await InteractionValue.message.delete().catch((ErrorValue: unknown) => {
        this.Logger.Warn("Could not delete temporary voice music request panel.", ErrorValue);
      });
      await InteractionValue.followUp({
        content: "Music request rejected.",
        ephemeral: true
      });
      return;
    }

    const Channel = await InteractionValue.guild.channels.fetch(Session.ChannelId).catch(() => null);
    const Config = await this.GetConfig(InteractionValue.guildId);

    if (!Channel || Channel.type !== ChannelType.GuildVoice) {
      await InteractionValue.reply({ content: "Temporary channel not found.", ephemeral: true });
      return;
    }

    await InteractionValue.deferUpdate();

    try {
      const Options = { YoutubeCookiesPath: this.ResolveYoutubeCookiesPath(Config) };
      const Result = Action === "MusicRequestQueue"
        ? await this.MusicPlayer.Enqueue(Channel, Request.Url, Options)
        : await this.MusicPlayer.Play(Channel, Request.Url, Options);
      const Status = Action === "MusicRequestQueue" && !("Started" in Result && Result.Started)
        ? `Music queued: ${Result.FirstTitle}${Result.Count > 1 ? ` (+${Result.Count - 1} queued)` : ""}.`
        : this.ApplyMusicTemplate(Config.MusicStartedMessage, {
            ChannelId: Session.ChannelId,
            Count: Result.Count,
            Error: "",
            Title: Result.FirstTitle
          });

      this.MusicRequests.delete(Request.Id);
      await InteractionValue.message.delete().catch((ErrorValue: unknown) => {
        this.Logger.Warn("Could not delete temporary voice music request panel.", ErrorValue);
      });
      await InteractionValue.followUp({
        content: Status,
        ephemeral: true
      });
      await this.SendControlPanel(Channel, Session, Config);
    } catch (ErrorValue) {
      this.MusicRequests.delete(Request.Id);
      const ErrorMessage = ErrorValue instanceof TempVoiceMusicError
        ? this.GetPublicMusicErrorMessage(ErrorValue, Config)
        : ErrorValue instanceof TempVoiceMusicBusyError
          ? this.ApplyMusicTemplate(Config.MusicBusyMessage, {
              ChannelId: ErrorValue.ChannelId,
              Count: 0,
              Error: ErrorValue.message,
              Title: ""
            })
          : "Playback could not be started.";

      if (!(ErrorValue instanceof TempVoiceMusicError) && !(ErrorValue instanceof TempVoiceMusicBusyError)) {
        this.Logger.Warn("TempVoice music request playback failed.", ErrorValue);
      }

      await InteractionValue.message.delete().catch((DeleteError: unknown) => {
        this.Logger.Warn("Could not delete temporary voice music request panel.", DeleteError);
      });
      await InteractionValue.followUp({
        content: `Music request failed: ${ErrorMessage}`,
        ephemeral: true
      });
    }
  }

  private async SendControlPanel(Channel: VoiceChannel, Session: TempVoiceSession, Config: TempVoiceConfig, SourceInteraction?: ButtonInteraction<"cached">): Promise<void> {
    const MusicState = this.MusicPlayer.GetState(Session.ChannelId);
    const MusicStatus = this.GetMusicStatus(MusicState, Config, Session.ChannelId);
    const BusyAudioChannelId = this.GetBusyAudioChannelId(Session.GuildId, Session.ChannelId);
    const CanManagePermissions = Config.LockEnabled && this.CanManageTemporaryRoomPermissions(Channel);
    const CanBanMembers = Config.BanEnabled && this.CanBanFromTemporaryRoom(Channel);
    const Embed = new EmbedBuilder()
      .setTitle(Config.ControlPanelTitle)
      .setDescription(this.ApplyControlTemplate(Config.ControlPanelDescription, Channel, Session))
      .setColor(this.ParseColor(Config.ControlPanelColor))
      .addFields(
        { name: "Owner", value: `<@${Session.OwnerId}>`, inline: true },
        { name: "Lock", value: Session.Locked ? "Locked" : "Open", inline: true },
        { name: "Soundboard", value: Session.SoundboardDisabled ? "Disabled" : "Enabled", inline: true },
        { name: "TTS", value: !Config.TTSEnabled || Session.TtsDisabled ? "Disabled" : "Enabled", inline: true },
        { name: "User limit", value: String(Session.UserLimit || "Unlimited"), inline: true },
        { name: "Bans", value: String(Session.BannedUserIds.length), inline: true },
        { name: "Music", value: MusicStatus.slice(0, 1024), inline: false }
      )
      .setFooter({ text: "Use the buttons below to manage this temporary room." })
      .setTimestamp(new Date());

    const FirstButtons: ButtonBuilder[] = [];

    if (CanManagePermissions) {
      FirstButtons.push(
        new ButtonBuilder()
          .setCustomId(`TempVoice:Lock:${Session.ChannelId}`)
          .setLabel(Session.Locked ? "Unlock" : "Lock")
          .setStyle(Session.Locked ? ButtonStyle.Success : ButtonStyle.Secondary)
      );
    }

    FirstButtons.push(
      new ButtonBuilder()
        .setCustomId(`TempVoice:Soundboard:${Session.ChannelId}`)
        .setLabel(Session.SoundboardDisabled ? "Enable soundboard" : "Disable soundboard")
        .setStyle(Session.SoundboardDisabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`TempVoice:TtsToggle:${Session.ChannelId}`)
        .setDisabled(!Config.TTSEnabled)
        .setLabel(Session.TtsDisabled ? "Enable TTS" : "Disable TTS")
        .setStyle(Session.TtsDisabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`TempVoice:Rename:${Session.ChannelId}`)
        .setLabel("Rename")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`TempVoice:Claim:${Session.ChannelId}`)
        .setLabel("Claim")
        .setStyle(ButtonStyle.Secondary)
    );

    const FirstRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...FirstButtons);
    const SecondButtons: ButtonBuilder[] = [
      new ButtonBuilder().setCustomId(`TempVoice:Transfer:${Session.ChannelId}`).setLabel("Transfer owner").setStyle(ButtonStyle.Primary)
    ];

    if (CanBanMembers) {
      SecondButtons.push(new ButtonBuilder().setCustomId(`TempVoice:Ban:${Session.ChannelId}`).setLabel("Ban member").setStyle(ButtonStyle.Danger));
    }

    SecondButtons.push(
      new ButtonBuilder().setCustomId(`TempVoice:LimitDown:${Session.ChannelId}`).setLabel("- limit").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`TempVoice:LimitUp:${Session.ChannelId}`).setLabel("+ limit").setStyle(ButtonStyle.Secondary)
    );

    const SecondRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...SecondButtons);
    const MusicButtons: ButtonBuilder[] = [];

    if (!MusicState.Active) {
      MusicButtons.push(
        new ButtonBuilder().setCustomId(`TempVoice:MusicPlay:${Session.ChannelId}`).setLabel(Config.MusicButtonPlayLabel.slice(0, 80)).setStyle(ButtonStyle.Success)
      );
    }

    if (MusicState.Active && !Config.MusicPanelEnabled) {
      MusicButtons.push(
        new ButtonBuilder()
          .setCustomId(`TempVoice:MusicToggle:${Session.ChannelId}`)
          .setLabel((MusicState.Paused ? Config.MusicButtonResumeLabel : Config.MusicButtonPauseLabel).slice(0, 80))
          .setStyle(ButtonStyle.Secondary)
      );

      if (MusicState.CanSkip) {
        MusicButtons.push(new ButtonBuilder().setCustomId(`TempVoice:MusicSkip:${Session.ChannelId}`).setLabel(Config.MusicButtonSkipLabel.slice(0, 80)).setStyle(ButtonStyle.Secondary));
      }

      MusicButtons.push(new ButtonBuilder().setCustomId(`TempVoice:MusicStop:${Session.ChannelId}`).setLabel(Config.MusicButtonStopLabel.slice(0, 80)).setStyle(ButtonStyle.Danger));
    }

    const UtilityButtons: ButtonBuilder[] = [
      new ButtonBuilder()
        .setCustomId(`TempVoice:MusicAsk:${Session.ChannelId}`)
        .setLabel(Config.MusicAskButtonLabel.slice(0, 80))
        .setStyle(ButtonStyle.Primary)
    ];

    if (Config.TTSEnabled && !Session.TtsDisabled) {
      UtilityButtons.push(
        new ButtonBuilder()
          .setCustomId(`TempVoice:TTS:${Session.ChannelId}`)
          .setDisabled(Boolean(BusyAudioChannelId))
          .setLabel(Config.TTSButtonLabel.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
      );
    }

    const ThirdRow = MusicButtons.length > 0 ? new ActionRowBuilder<ButtonBuilder>().addComponents(...MusicButtons) : null;
    const FourthRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...UtilityButtons);
    const Rows = [FirstRow, SecondRow, ThirdRow, FourthRow].filter((Row): Row is ActionRowBuilder<ButtonBuilder> => Row !== null);

    const Payload: MessageCreateOptions = { embeds: [Embed], components: Rows };
    const EditPayload: MessageEditOptions = { embeds: [Embed], components: Rows };
    const TextChannel = Channel as VoiceChannel & {
      messages: {
        fetch(MessageId: string): Promise<Message>;
      };
      send(Options: MessageCreateOptions): Promise<Message>;
    };

    if (Session.ControlPanelMessageId) {
      const ExistingMessage = await this.FetchControlPanelMessage(TextChannel, Session.ControlPanelMessageId);

      if (ExistingMessage) {
        let FailedWithUnknownMessage = false;
        const Edited = await ExistingMessage.edit(EditPayload).then(() => true).catch((ErrorValue: unknown) => {
          this.LogDiscordPanelWarning("Could not edit temporary voice control panel.", ErrorValue, {
            ChannelId: Session.ChannelId,
            MessageId: Session.ControlPanelMessageId
          });
          FailedWithUnknownMessage = this.IsDiscordUnknownMessageError(ErrorValue);
          return false;
        });

        if (Edited) {
          return;
        }

        if (!FailedWithUnknownMessage) {
          return;
        }
      }

      Session.ControlPanelMessageId = undefined;
      await this.SaveSession(Session);
    }

    const MessageValue = await TextChannel.send(Payload).catch((ErrorValue: unknown) => {
      this.LogDiscordPanelWarning("Could not send temporary voice control panel.", ErrorValue, {
        ChannelId: Session.ChannelId
      });
      return null;
    });

    if (MessageValue) {
      Session.ControlPanelMessageId = MessageValue.id;
      await this.SaveSession(Session);
    }
  }

  private async RefreshControlPanel(ChannelId: string): Promise<void> {
    const Session = await this.GetSession(ChannelId);

    if (!Session) {
      return;
    }

    const Guild = this.DiscordClient.guilds.cache.get(Session.GuildId);
    const Channel = await Guild?.channels.fetch(ChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildVoice) {
      return;
    }

    await this.SendControlPanel(Channel, Session, await this.GetConfig(Session.GuildId));
  }

  private async RefreshMusicPanel(ChannelId: string, Reason: "state" | "tick" = "state"): Promise<void> {
    if (this.MusicPanelRefreshes.has(ChannelId)) {
      return;
    }

    this.MusicPanelRefreshes.add(ChannelId);

    try {
      const WasSimpleMode = this.IsMusicPanelSimpleMode();
      const Session = await this.GetSession(ChannelId);

      if (!Session) {
        this.ClearMusicPanelRuntimeState(ChannelId);
        this.StopMusicPanelRefreshLoop(ChannelId);
        this.RefreshMusicPanelsAfterModeChange(WasSimpleMode);
        return;
      }

      const Guild = this.DiscordClient.guilds.cache.get(Session.GuildId);
      const Channel = await Guild?.channels.fetch(ChannelId).catch(() => null);

      if (!Channel || Channel.type !== ChannelType.GuildVoice) {
        this.ClearMusicPanelRuntimeState(ChannelId);
        this.StopMusicPanelRefreshLoop(ChannelId);
        this.RefreshMusicPanelsAfterModeChange(WasSimpleMode);
        return;
      }

      const Config = await this.GetConfig(Session.GuildId);
      const MusicState = this.MusicPlayer.GetState(ChannelId);

      if (!Config.MusicPanelEnabled || !MusicState.Active) {
        this.MusicPanelActiveChannelIds.delete(ChannelId);
        this.StopMusicPanelRefreshLoop(ChannelId);
        await this.DeleteMusicPanelMessage(Session);
        this.RefreshMusicPanelsAfterModeChange(WasSimpleMode);
        return;
      }

      this.MusicPanelActiveChannelIds.add(ChannelId);
      this.RefreshMusicPanelsAfterModeChange(WasSimpleMode);

      const SimpleMode = this.IsMusicPanelSimpleMode();

      if (SimpleMode && Reason === "tick") {
        this.StopMusicPanelRefreshLoop(ChannelId);
        return;
      }

      if (MusicState.Paused && Reason === "tick") {
        this.StopMusicPanelRefreshLoop(ChannelId);
        return;
      }

      await this.UpsertMusicPanelMessage(Channel, Session, Config, Reason, SimpleMode);

      if (!this.MusicPanelActiveChannelIds.has(ChannelId)) {
        return;
      }

      if (SimpleMode || MusicState.Paused) {
        this.StopMusicPanelRefreshLoop(ChannelId);
      } else {
        this.EnsureMusicPanelRefreshLoop(ChannelId);
      }
    } finally {
      this.MusicPanelRefreshes.delete(ChannelId);
    }
  }

  private EnsureMusicPanelRefreshLoop(ChannelId: string): void {
    if (this.MusicPanelRefreshTimers.has(ChannelId)) {
      return;
    }

    const Timer = setInterval(() => {
      void this.RefreshMusicPanel(ChannelId, "tick").catch((ErrorValue: unknown) => {
        this.Logger.Warn("TempVoice music panel refresh failed.", ErrorValue);
      });
    }, MusicPanelRefreshIntervalMs);

    Timer.unref?.();
    this.MusicPanelRefreshTimers.set(ChannelId, Timer);
  }

  private StopMusicPanelRefreshLoop(ChannelId: string): void {
    const Timer = this.MusicPanelRefreshTimers.get(ChannelId);

    if (!Timer) {
      return;
    }

    clearInterval(Timer);
    this.MusicPanelRefreshTimers.delete(ChannelId);
  }

  private RefreshMusicPanelsAfterModeChange(WasSimpleMode: boolean): void {
    if (WasSimpleMode === this.IsMusicPanelSimpleMode()) {
      return;
    }

    for (const ActiveChannelId of this.MusicPanelActiveChannelIds) {
      void this.RefreshMusicPanel(ActiveChannelId, "state").catch((ErrorValue: unknown) => {
        this.Logger.Warn("TempVoice music panel mode refresh failed.", ErrorValue);
      });
    }
  }

  private IsMusicPanelSimpleMode(): boolean {
    return this.MusicPanelActiveChannelIds.size >= 2;
  }

  private async ReserveMusicPanelWrite(ChannelId: string, Reason: "state" | "tick", SimpleMode: boolean): Promise<{ HideTiming: boolean }> {
    const Now = Date.now();
    const RestWaitMs = Math.max(this.DiscordRestPressureUntilMs - Now, 0);
    const GlobalWaitMs = Math.max(this.MusicPanelGlobalNextWriteAtMs - Now, 0);
    const ChannelWaitMs = Reason === "tick" || SimpleMode ? Math.max((this.MusicPanelNextWriteAtMs.get(ChannelId) ?? 0) - Now, 0) : 0;
    const WaitMs = Math.max(RestWaitMs, GlobalWaitMs, ChannelWaitMs);
    const HideTiming = SimpleMode || RestWaitMs > MusicPanelSlowRefreshThresholdMs || GlobalWaitMs > MusicPanelSlowRefreshThresholdMs;

    if (WaitMs > 0) {
      await this.Sleep(WaitMs);
    }

    const ReservedAt = Date.now();
    this.MusicPanelNextWriteAtMs.set(ChannelId, ReservedAt + (SimpleMode ? MusicPanelSimpleMinWriteIntervalMs : MusicPanelRefreshIntervalMs));
    this.MusicPanelGlobalNextWriteAtMs = Math.max(this.MusicPanelGlobalNextWriteAtMs, ReservedAt + MusicPanelGlobalWriteSpacingMs);

    return { HideTiming };
  }

  private MarkMusicPanelWrite(ChannelId: string): void {
    this.MusicPanelLastWriteAtMs.set(ChannelId, Date.now());
  }

  private IsMusicPanelRefreshSlow(ChannelId: string): boolean {
    const LastWriteAt = this.MusicPanelLastWriteAtMs.get(ChannelId);

    if (!LastWriteAt) {
      return false;
    }

    return Date.now() - LastWriteAt > MusicPanelRefreshIntervalMs + MusicPanelSlowRefreshThresholdMs;
  }

  private async UpsertMusicPanelMessage(Channel: VoiceChannel, Session: TempVoiceSession, Config: TempVoiceConfig, Reason: "state" | "tick", SimpleMode: boolean): Promise<void> {
    const Reservation = await this.ReserveMusicPanelWrite(Session.ChannelId, Reason, SimpleMode);
    const MusicState = this.MusicPlayer.GetState(Session.ChannelId);

    if (!MusicState.Active) {
      await this.DeleteMusicPanelMessage(Session);
      return;
    }

    const HideTiming = Reservation.HideTiming || (!SimpleMode && this.IsMusicPanelRefreshSlow(Session.ChannelId));
    const Attachment = new AttachmentBuilder(await this.MusicPanelRenderer.BuildPanelImage(MusicState, { HideTiming }), {
      name: MusicPanelAttachmentName
    });
    const Embed = new EmbedBuilder()
      .setColor(this.ParseColor(Config.ControlPanelColor))
      .setImage(`attachment://${MusicPanelAttachmentName}`)
      .setTimestamp(new Date());
    const Buttons: ButtonBuilder[] = [
      new ButtonBuilder()
        .setCustomId(`TempVoice:MusicToggle:${Session.ChannelId}`)
        .setLabel((MusicState.Paused ? Config.MusicButtonResumeLabel : Config.MusicButtonPauseLabel).slice(0, 80))
        .setStyle(ButtonStyle.Secondary)
    ];

    if (MusicState.CanSkip) {
      Buttons.push(new ButtonBuilder().setCustomId(`TempVoice:MusicSkip:${Session.ChannelId}`).setLabel(Config.MusicButtonSkipLabel.slice(0, 80)).setStyle(ButtonStyle.Secondary));
    }

    Buttons.push(
      new ButtonBuilder().setCustomId(`TempVoice:MusicStop:${Session.ChannelId}`).setLabel(Config.MusicButtonStopLabel.slice(0, 80)).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`TempVoice:MusicQueue:${Session.ChannelId}`).setLabel(Config.MusicPanelAddButtonLabel.slice(0, 80)).setStyle(ButtonStyle.Success)
    );

    const Row = new ActionRowBuilder<ButtonBuilder>().addComponents(...Buttons);
    const Payload: MessageCreateOptions = {
      allowedMentions: { parse: [] },
      components: [Row],
      embeds: [Embed],
      files: [Attachment]
    };
    const EditPayload: MessageEditOptions = {
      allowedMentions: { parse: [] },
      attachments: [],
      components: [Row],
      embeds: [Embed],
      files: [Attachment]
    };
    const TextChannel = Channel as VoiceChannel & {
      messages: {
        fetch(MessageId: string): Promise<Message>;
      };
      send(Options: MessageCreateOptions): Promise<Message>;
    };

    if (Session.MusicPanelMessageId) {
      const CachedMessage = this.MusicPanelMessages.get(Session.ChannelId);
      const ExistingMessage = CachedMessage?.id === Session.MusicPanelMessageId
        ? CachedMessage
        : await this.FetchMusicPanelMessage(TextChannel, Session.MusicPanelMessageId);

      if (ExistingMessage) {
        this.MusicPanelMessages.set(Session.ChannelId, ExistingMessage);
        let FailedWithUnknownChannel = false;
        let FailedWithUnknownResource = false;
        let FailedWithRateLimit = false;
        const Edited = await ExistingMessage.edit(EditPayload).then(() => true).catch((ErrorValue: unknown) => {
          this.LogDiscordPanelWarning("Could not edit temporary voice music panel.", ErrorValue, {
            ChannelId: Session.ChannelId,
            MessageId: Session.MusicPanelMessageId
          });
          FailedWithUnknownChannel = this.IsDiscordUnknownChannelError(ErrorValue);
          FailedWithUnknownResource = this.IsDiscordUnknownResourceError(ErrorValue);
          FailedWithRateLimit = this.RecordDiscordRateLimitFromError(ErrorValue);
          return false;
        });

        if (Edited) {
          this.MarkMusicPanelWrite(Session.ChannelId);
          return;
        }

        if (FailedWithRateLimit) {
          return;
        }

        if (FailedWithUnknownChannel) {
          await this.ClearStaleMusicPanel(Session);
          return;
        }

        if (!FailedWithUnknownResource) {
          return;
        }
      }

      Session.MusicPanelMessageId = undefined;
      this.MusicPanelMessages.delete(Session.ChannelId);
      await this.SaveSession(Session);
    }

    const MessageValue = await TextChannel.send(Payload).catch(async (ErrorValue: unknown) => {
      this.LogDiscordPanelWarning("Could not send temporary voice music panel.", ErrorValue, {
        ChannelId: Session.ChannelId
      });
      this.RecordDiscordRateLimitFromError(ErrorValue);

      if (this.IsDiscordUnknownChannelError(ErrorValue)) {
        await this.ClearStaleMusicPanel(Session);
      }

      return null;
    });

    if (MessageValue) {
      Session.MusicPanelMessageId = MessageValue.id;
      this.MusicPanelMessages.set(Session.ChannelId, MessageValue);
      this.MarkMusicPanelWrite(Session.ChannelId);
      await this.SaveSession(Session);
    }
  }

  private async DeleteMusicPanelMessage(Session: TempVoiceSession): Promise<void> {
    if (!Session.MusicPanelMessageId) {
      this.ClearMusicPanelRuntimeState(Session.ChannelId);
      return;
    }

    const Guild = this.DiscordClient.guilds.cache.get(Session.GuildId);
    const Channel = await Guild?.channels.fetch(Session.ChannelId).catch(() => null);
    const MessageId = Session.MusicPanelMessageId;
    Session.MusicPanelMessageId = undefined;
    const CachedMessage = this.MusicPanelMessages.get(Session.ChannelId);
    this.ClearMusicPanelRuntimeState(Session.ChannelId);
    await this.SaveSession(Session);

    if (!Channel || Channel.type !== ChannelType.GuildVoice) {
      return;
    }

    const TextChannel = Channel as VoiceChannel & {
      messages: {
        fetch(MessageIdValue: string): Promise<Message>;
      };
    };
    const MessageValue = CachedMessage?.id === MessageId
      ? CachedMessage
      : await this.FetchMusicPanelMessage(TextChannel, MessageId);

    if (!MessageValue) {
      return;
    }

    await MessageValue.delete().catch((ErrorValue: unknown) => {
      if (!this.IsDiscordUnknownResourceError(ErrorValue)) {
        this.LogDiscordPanelWarning("Could not delete temporary voice music panel.", ErrorValue, {
          ChannelId: Session.ChannelId,
          MessageId
        });
      }

      this.RecordDiscordRateLimitFromError(ErrorValue);
    });
  }

  private async ClearStaleMusicPanel(Session: TempVoiceSession): Promise<void> {
    Session.MusicPanelMessageId = undefined;
    this.ClearMusicPanelRuntimeState(Session.ChannelId);
    this.StopMusicPanelRefreshLoop(Session.ChannelId);
    await this.SaveSession(Session);
  }

  private ClearMusicPanelRuntimeState(ChannelId: string): void {
    this.MusicPanelActiveChannelIds.delete(ChannelId);
    this.MusicPanelLastWriteAtMs.delete(ChannelId);
    this.MusicPanelMessages.delete(ChannelId);
    this.MusicPanelNextWriteAtMs.delete(ChannelId);
  }

  private async SendControlPanelFromSession(Guild: Guild, Session: TempVoiceSession, Config: TempVoiceConfig, SourceInteraction?: ButtonInteraction<"cached">): Promise<void> {
    const Channel = await Guild.channels.fetch(Session.ChannelId).catch(() => null);

    if (!Channel || Channel.type !== ChannelType.GuildVoice) {
      return;
    }

    await this.SendControlPanel(Channel, Session, Config, SourceInteraction);
  }

  private async DeleteTemporaryChannel(Channel: VoiceChannel): Promise<void> {
    await Channel.permissionOverwrites.edit(Channel.guild.id, {
      Connect: true,
      ViewChannel: true
    }).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Could not unlock temporary voice channel before deletion.", ErrorValue);
    });

    await Channel.delete("Temporary voice channel is empty.").catch((ErrorValue: unknown) => {
      this.Logger.Warn("Could not delete empty temporary voice channel.", ErrorValue);
    });
  }

  private CanManageTemporaryRoomPermissions(Channel: VoiceChannel): boolean {
    const BotMember = Channel.guild.members.me;
    const Permissions = BotMember ? Channel.permissionsFor(BotMember) : null;
    return Permissions?.has(PermissionFlagsBits.ManageChannels) ?? false;
  }

  private CanBanFromTemporaryRoom(Channel: VoiceChannel): boolean {
    const BotMember = Channel.guild.members.me;
    const Permissions = BotMember ? Channel.permissionsFor(BotMember) : null;
    return Permissions?.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers]) ?? false;
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
      LockEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "LockEnabled")) ?? DefaultConfig.LockEnabled,
      BanEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "BanEnabled")) ?? DefaultConfig.BanEnabled,
      ProtectedRoleIds: (await this.Storage.GetGlobalConfig<string[]>(GuildId, "ProtectedRoleIds")) ?? DefaultConfig.ProtectedRoleIds,
      ControlPanelTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "ControlPanelTitle")) ?? DefaultConfig.ControlPanelTitle,
      ControlPanelDescription: (await this.Storage.GetGlobalConfig<string>(GuildId, "ControlPanelDescription")) ?? DefaultConfig.ControlPanelDescription,
      ControlPanelColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "ControlPanelColor")) ?? DefaultConfig.ControlPanelColor,
      MusicButtonPlayLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicButtonPlayLabel")) ?? DefaultConfig.MusicButtonPlayLabel,
      MusicButtonPauseLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicButtonPauseLabel")) ?? DefaultConfig.MusicButtonPauseLabel,
      MusicButtonResumeLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicButtonResumeLabel")) ?? DefaultConfig.MusicButtonResumeLabel,
      MusicButtonSkipLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicButtonSkipLabel")) ?? DefaultConfig.MusicButtonSkipLabel,
      MusicButtonStopLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicButtonStopLabel")) ?? DefaultConfig.MusicButtonStopLabel,
      MusicAskButtonLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicAskButtonLabel")) ?? DefaultConfig.MusicAskButtonLabel,
      MusicModalTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicModalTitle")) ?? DefaultConfig.MusicModalTitle,
      MusicModalUrlLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicModalUrlLabel")) ?? DefaultConfig.MusicModalUrlLabel,
      MusicAskModalTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicAskModalTitle")) ?? DefaultConfig.MusicAskModalTitle,
      MusicAskSubmittedMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicAskSubmittedMessage")) ?? DefaultConfig.MusicAskSubmittedMessage,
      MusicPanelAddButtonLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicPanelAddButtonLabel")) ?? DefaultConfig.MusicPanelAddButtonLabel,
      MusicPanelEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "MusicPanelEnabled")) ?? DefaultConfig.MusicPanelEnabled,
      MusicYoutubeAccountMode: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicYoutubeAccountMode")) ?? DefaultConfig.MusicYoutubeAccountMode,
      MusicYoutubeCookiesPath: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicYoutubeCookiesPath")) ?? DefaultConfig.MusicYoutubeCookiesPath,
      MusicRequiresAccountMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicRequiresAccountMessage")) ?? DefaultConfig.MusicRequiresAccountMessage,
      MusicStartedMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicStartedMessage")) ?? DefaultConfig.MusicStartedMessage,
      MusicBusyMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicBusyMessage")) ?? DefaultConfig.MusicBusyMessage,
      MusicControlAppliedMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicControlAppliedMessage")) ?? DefaultConfig.MusicControlAppliedMessage,
      MusicPlaybackFailedMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicPlaybackFailedMessage")) ?? DefaultConfig.MusicPlaybackFailedMessage,
      MusicIdleStatus: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicIdleStatus")) ?? DefaultConfig.MusicIdleStatus,
      MusicPlayingStatus: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicPlayingStatus")) ?? DefaultConfig.MusicPlayingStatus,
      MusicPausedStatus: (await this.Storage.GetGlobalConfig<string>(GuildId, "MusicPausedStatus")) ?? DefaultConfig.MusicPausedStatus,
      TTSEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "TTSEnabled")) ?? DefaultConfig.TTSEnabled,
      TTSButtonLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "TTSButtonLabel")) ?? DefaultConfig.TTSButtonLabel,
      TTSModalTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "TTSModalTitle")) ?? DefaultConfig.TTSModalTitle,
      TTSModalTextLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "TTSModalTextLabel")) ?? DefaultConfig.TTSModalTextLabel,
      TTSModalLanguageLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "TTSModalLanguageLabel")) ?? DefaultConfig.TTSModalLanguageLabel,
      TTSDefaultLanguage: (await this.Storage.GetGlobalConfig<string>(GuildId, "TTSDefaultLanguage")) ?? DefaultConfig.TTSDefaultLanguage,
      TTSStartedMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "TTSStartedMessage")) ?? DefaultConfig.TTSStartedMessage,
      TTSBusyMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "TTSBusyMessage")) ?? DefaultConfig.TTSBusyMessage,
      TTSDisabledMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "TTSDisabledMessage")) ?? DefaultConfig.TTSDisabledMessage,
      TTSFailedMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "TTSFailedMessage")) ?? DefaultConfig.TTSFailedMessage
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
    const Session = await this.GetSession(ChannelId);
    this.StopMusicPanelRefreshLoop(ChannelId);

    if (Session) {
      await this.DeleteMusicPanelMessage(Session);
    }

    this.MusicPlayer.Stop(ChannelId);
    this.ClearMusicRequests(ChannelId);

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
      .replaceAll("%user%", Member.displayName)
      .replaceAll("%username%", Member.user.username)
      .replaceAll("%display_name%", Member.displayName)
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
      .replaceAll("%tts%", Session.TtsDisabled ? "disabled" : "enabled")
      .replaceAll("%limit%", String(Session.UserLimit || "unlimited"));
  }

  private GetMusicStatus(MusicState: ReturnType<TempVoiceMusicPlayer["GetState"]>, Config: TempVoiceConfig, ChannelId: string): string {
    if (!MusicState.Active) {
      return this.ApplyMusicTemplate(Config.MusicIdleStatus, {
        ChannelId,
        Count: 0,
        Error: "",
        Title: ""
      });
    }

    return this.ApplyMusicTemplate(MusicState.Paused ? Config.MusicPausedStatus : Config.MusicPlayingStatus, {
      ChannelId,
      Count: 0,
      Error: "",
      Title: MusicState.TrackTitle
    });
  }

  private GetPublicMusicErrorMessage(ErrorValue: TempVoiceMusicError, Config: TempVoiceConfig): string {
    if (ErrorValue.message.includes("linked account") || ErrorValue.message.includes("unavailable") || ErrorValue.message.includes("cookies")) {
      return Config.MusicRequiresAccountMessage;
    }

    if (ErrorValue.message.includes("Voice connection")) {
      return "The bot could not connect to the voice channel.";
    }

    if (ErrorValue.message.startsWith("Use a valid YouTube") || ErrorValue.message.startsWith("No playable YouTube")) {
      return ErrorValue.message;
    }

    return "Playback could not be started.";
  }

  private ResolveYoutubeCookiesPath(Config: TempVoiceConfig): string | null | undefined {
    if (Config.MusicYoutubeAccountMode === "None") {
      return null;
    }

    if (Config.MusicYoutubeAccountMode === "GuildFile") {
      return Config.MusicYoutubeCookiesPath.trim() || null;
    }

    return undefined;
  }

  private ApplyMusicTemplate(Template: string, Values: { ChannelId: string; Count: number; Error: string; Title: string }): string {
    const QueuedCount = Math.max(Values.Count - 1, 0);
    return Template
      .replaceAll("%title%", Values.Title)
      .replaceAll("%count%", String(Values.Count))
      .replaceAll("%queued%", String(QueuedCount))
      .replaceAll("%queued_suffix%", QueuedCount > 0 ? ` (+${QueuedCount} queued)` : "")
      .replaceAll("%channel%", `<#${Values.ChannelId}>`)
      .replaceAll("%error%", Values.Error);
  }

  private ApplyTtsTemplate(Template: string, Values: { ChannelId: string; Error: string }): string {
    return Template
      .replaceAll("%channel%", `<#${Values.ChannelId}>`)
      .replaceAll("%error%", Values.Error);
  }

  private CreateRequestId(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  private ClearMusicRequests(ChannelId: string): void {
    for (const [RequestId, Request] of this.MusicRequests.entries()) {
      if (Request.ChannelId === ChannelId) {
        this.MusicRequests.delete(RequestId);
      }
    }
  }

  private ClampDiscordFieldValue(Value: string): string {
    const TrimmedValue = Value.trim();
    return TrimmedValue.length > 1024 ? `${TrimmedValue.slice(0, 1021)}...` : TrimmedValue;
  }

  private GetBusyAudioChannelId(GuildId: string, CurrentChannelId: string): string | null {
    const MusicChannelId = this.MusicPlayer.GetGuildActiveChannelId(GuildId);

    if (MusicChannelId) {
      return MusicChannelId;
    }

    const TtsChannelId = this.TtsPlayer.GetGuildActiveChannelId(GuildId);
    return TtsChannelId && TtsChannelId !== CurrentChannelId ? TtsChannelId : null;
  }

  private ParseColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : DefaultConfig.ControlPanelColor;
    return Number.parseInt(SafeColor.replace("#", ""), 16);
  }

  private MarkDiscordRestPressure(DurationMs: number, Source: string): void {
    const SafeDurationMs = this.Clamp(Math.ceil(DurationMs + DiscordRestRateLimitPaddingMs), 0, 60_000);

    if (SafeDurationMs <= 0) {
      return;
    }

    this.DiscordRestPressureUntilMs = Math.max(this.DiscordRestPressureUntilMs, Date.now() + SafeDurationMs);

    if (Source !== "headers" && SafeDurationMs >= MusicPanelSlowRefreshThresholdMs) {
      this.Logger.Warn("TempVoice music panel refresh delayed by Discord REST pressure.", {
        DurationMs: SafeDurationMs,
        Source
      });
    }
  }

  private RecordDiscordRateLimitFromError(ErrorValue: unknown): boolean {
    const Candidate = ErrorValue as {
      code?: unknown;
      headers?: { get(Name: string): string | null };
      rawError?: { retry_after?: unknown };
      retryAfter?: unknown;
      status?: unknown;
    } | null;
    const HeaderRetryAfter = Number(Candidate?.headers?.get("Retry-After") ?? Candidate?.headers?.get("X-RateLimit-Reset-After") ?? "");
    const BodyRetryAfter = typeof Candidate?.rawError?.retry_after === "number"
      ? Candidate.rawError.retry_after * 1000
      : Number.NaN;
    const RetryAfter = this.ReadPositiveNumber(Candidate, ["retryAfter"]) || (Number.isFinite(HeaderRetryAfter) ? HeaderRetryAfter * 1000 : 0) || (Number.isFinite(BodyRetryAfter) ? BodyRetryAfter : 0);
    const IsRateLimited = Candidate?.status === 429 || Candidate?.code === 429 || RetryAfter > 0;

    if (IsRateLimited) {
      this.MarkDiscordRestPressure(RetryAfter || MusicPanelRefreshIntervalMs, "error");
    }

    return IsRateLimited;
  }

  private ReadPositiveNumber(Source: unknown, Keys: string[]): number {
    const Candidate = Source as Record<string, unknown> | null;

    for (const Key of Keys) {
      const Value = Candidate?.[Key];
      const ParsedValue = typeof Value === "number" ? Value : typeof Value === "string" ? Number.parseFloat(Value) : Number.NaN;

      if (Number.isFinite(ParsedValue) && ParsedValue > 0) {
        return ParsedValue;
      }
    }

    return 0;
  }

  private async Sleep(DurationMs: number): Promise<void> {
    await new Promise<void>((Resolve) => {
      const Timer = setTimeout(Resolve, DurationMs);
      Timer.unref?.();
    });
  }

  private Clamp(Value: number, Minimum: number, Maximum: number): number {
    return Math.min(Math.max(Math.trunc(Number.isFinite(Value) ? Value : Minimum), Minimum), Maximum);
  }

  private async FetchControlPanelMessage(
    TextChannel: VoiceChannel & {
      messages: {
        fetch(MessageId: string): Promise<Message>;
      };
    },
    MessageId: string
  ): Promise<Message | null> {
    return await TextChannel.messages.fetch(MessageId).catch((ErrorValue: unknown) => {
      if (!this.IsDiscordUnknownResourceError(ErrorValue)) {
        this.LogDiscordPanelWarning("Could not fetch temporary voice control panel.", ErrorValue, { MessageId });
      }

      return null;
    });
  }

  private async FetchMusicPanelMessage(
    TextChannel: VoiceChannel & {
      messages: {
        fetch(MessageId: string): Promise<Message>;
      };
    },
    MessageId: string
  ): Promise<Message | null> {
    return await TextChannel.messages.fetch(MessageId).catch((ErrorValue: unknown) => {
      if (!this.IsDiscordUnknownResourceError(ErrorValue)) {
        this.LogDiscordPanelWarning("Could not fetch temporary voice music panel.", ErrorValue, { MessageId });
      }

      return null;
    });
  }

  private LogDiscordPanelWarning(Message: string, ErrorValue: unknown, Metadata: Record<string, unknown> = {}): void {
    if (this.IsReleaseMode()) {
      if (this.IsDiscordUnknownResourceError(ErrorValue)) {
        return;
      }

      this.Logger.Warn(Message, {
        ...Metadata,
        DiscordCode: this.GetDiscordErrorCode(ErrorValue),
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        Status: this.GetDiscordErrorStatus(ErrorValue)
      });
      return;
    }

    this.Logger.Warn(Message, ErrorValue);
  }

  private IsReleaseMode(): boolean {
    return process.env.NODE_ENV === "production";
  }

  private IsDiscordUnknownResourceError(ErrorValue: unknown): boolean {
    return this.IsDiscordUnknownMessageError(ErrorValue) || this.IsDiscordUnknownChannelError(ErrorValue);
  }

  private IsDiscordUnknownMessageError(ErrorValue: unknown): boolean {
    const Candidate = ErrorValue as { code?: unknown; rawError?: { code?: unknown } } | null;
    return Candidate?.code === 10008 || Candidate?.rawError?.code === 10008;
  }

  private IsDiscordUnknownChannelError(ErrorValue: unknown): boolean {
    const Candidate = ErrorValue as { code?: unknown; rawError?: { code?: unknown } } | null;
    return Candidate?.code === 10003 || Candidate?.rawError?.code === 10003;
  }

  private GetDiscordErrorCode(ErrorValue: unknown): unknown {
    const Candidate = ErrorValue as { code?: unknown; rawError?: { code?: unknown } } | null;
    return Candidate?.code ?? Candidate?.rawError?.code;
  }

  private GetDiscordErrorStatus(ErrorValue: unknown): unknown {
    const Candidate = ErrorValue as { status?: unknown } | null;
    return Candidate?.status;
  }
}
