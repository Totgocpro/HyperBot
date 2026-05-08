import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type GuildBasedChannel,
  type GuildMember,
  type Interaction,
  type ModalSubmitInteraction,
  type NewsChannel,
  type PartialGuildMember,
  type TextChannel,
  type VoiceChannel
} from "discord.js";
import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type MessageMode = "Embed" | "Image";
type ImageFitMode = "Cover" | "Contain" | "Stretch";
type ImageAvatarStyle = "Circle" | "Rounded" | "Square";

type WelcomeMessageConfig = {
  WelcomeEnabled: boolean;
  WelcomeChannelId: string;
  WelcomeMode: MessageMode;
  WelcomeTitle: string;
  WelcomeMessage: string;
  WelcomeColor: string;
  WelcomeEmbedAuthor: boolean;
  WelcomeEmbed: EditableEmbed;
  LeaveEnabled: boolean;
  LeaveChannelId: string;
  LeaveMode: MessageMode;
  LeaveTitle: string;
  LeaveMessage: string;
  LeaveColor: string;
  LeaveEmbedAuthor: boolean;
  LeaveEmbed: EditableEmbed;
  ImageBackground: string;
  ImageBackgroundImage: string;
  WelcomeImageBackgroundImage: string;
  LeaveImageBackgroundImage: string;
  ImageBackgroundFit: ImageFitMode;
  ImageBackgroundOpacity: number;
  ImageOverlayOpacity: number;
  ImageAccent: string;
  ImageTextColor: string;
  ImageMutedTextColor: string;
  ImageFooter: string;
  ImageFooterEnabled: boolean;
  ImageBadgeText: string;
  ImageBadgeEnabled: boolean;
  ImagePanelEnabled: boolean;
  ImagePanelOpacity: number;
  ImageAvatarStyle: ImageAvatarStyle;
  ImageAvatarSize: number;
  ImageTitleFontSize: number;
  ImageDescriptionFontSize: number;
  ImageShowInitialsAvatar: boolean;
  PingUser: boolean;
  CaptchaEnabled: boolean;
  CaptchaChannelId: string;
  CaptchaRoleIds: string[];
  CaptchaTitle: string;
  CaptchaMessage: string;
  CaptchaEmbed: EditableEmbed;
  CaptchaButtonLabel: string;
  CaptchaVerificationLevels: number;
  CaptchaDmMessage: string;
  CaptchaDmSentMessage: string;
  CaptchaDmFailedMessage: string;
  CaptchaAlreadyVerifiedMessage: string;
  CaptchaExpiredMessage: string;
  CaptchaFailedMessage: string;
  CaptchaNextLevelMessage: string;
  CaptchaNoRoleGrantedMessage: string;
  CaptchaAnswerButtonLabel: string;
  CaptchaModalTitle: string;
  CaptchaModalInputLabel: string;
  CaptchaSuccessMessage: string;
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

const DefaultConfig: WelcomeMessageConfig = {
  WelcomeEnabled: true,
  WelcomeChannelId: "",
  WelcomeMode: "Embed",
  WelcomeTitle: "Welcome %user%",
  WelcomeMessage: "You are member #%memberCount% on %server%.",
  WelcomeColor: "#2563eb",
  WelcomeEmbedAuthor: true,
  WelcomeEmbed: {
    Title: "Welcome %user%",
    Description: "You are member #%memberCount% on %server%.",
    Color: "#2563eb",
    AuthorName: "%user%",
    AuthorIconUrl: "%avatar%",
    ThumbnailUrl: "%avatar%",
    FooterText: "%server% • %memberCount% members",
    Timestamp: true,
    Fields: []
  },
  LeaveEnabled: true,
  LeaveChannelId: "",
  LeaveMode: "Embed",
  LeaveTitle: "%user% left the server",
  LeaveMessage: "Goodbye from %server%.",
  LeaveColor: "#ef4444",
  LeaveEmbedAuthor: true,
  LeaveEmbed: {
    Title: "%user% left the server",
    Description: "Goodbye from %server%.",
    Color: "#ef4444",
    AuthorName: "%user%",
    AuthorIconUrl: "%avatar%",
    ThumbnailUrl: "%avatar%",
    FooterText: "%server% • %memberCount% members",
    Timestamp: true,
    Fields: []
  },
  ImageBackground: "#020617",
  ImageBackgroundImage: "",
  WelcomeImageBackgroundImage: "",
  LeaveImageBackgroundImage: "",
  ImageBackgroundFit: "Cover",
  ImageBackgroundOpacity: 100,
  ImageOverlayOpacity: 55,
  ImageAccent: "#38bdf8",
  ImageTextColor: "#f8fafc",
  ImageMutedTextColor: "#cbd5e1",
  ImageFooter: "%server% • %memberCount% members",
  ImageFooterEnabled: true,
  ImageBadgeText: "%type%",
  ImageBadgeEnabled: true,
  ImagePanelEnabled: true,
  ImagePanelOpacity: 86,
  ImageAvatarStyle: "Circle",
  ImageAvatarSize: 140,
  ImageTitleFontSize: 40,
  ImageDescriptionFontSize: 15,
  ImageShowInitialsAvatar: true,
  PingUser: false,
  CaptchaEnabled: false,
  CaptchaChannelId: "",
  CaptchaRoleIds: [],
  CaptchaTitle: "Server verification",
  CaptchaMessage: "Complete the captcha to unlock the server.",
  CaptchaEmbed: {
    Title: "Server verification",
    Description: "Complete the captcha to unlock the server.",
    Color: "#2563eb",
    FooterText: "%server%",
    Timestamp: true,
    Fields: []
  },
  CaptchaButtonLabel: "Verify",
  CaptchaVerificationLevels: 2,
  CaptchaDmMessage: "Verification level %level%/%levels%. Enter the code shown in the image.",
  CaptchaDmSentMessage: "I sent your captcha in DM. Complete every level there to unlock the server.",
  CaptchaDmFailedMessage: "I could not send you a DM. Enable direct messages for this server and try again.",
  CaptchaAlreadyVerifiedMessage: "You are already verified.",
  CaptchaExpiredMessage: "This captcha session expired. Start verification again from the server.",
  CaptchaFailedMessage: "Captcha failed. Use the latest DM image and try again.",
  CaptchaNextLevelMessage: "Level %level%/%levels% passed. Here is the next captcha.",
  CaptchaNoRoleGrantedMessage: "Captcha complete. No new role was granted.",
  CaptchaAnswerButtonLabel: "Enter captcha code",
  CaptchaModalTitle: "Captcha verification",
  CaptchaModalInputLabel: "Enter the code from image %level%/%levels%",
  CaptchaSuccessMessage: "Verification complete. Roles granted."
};

type CaptchaSession = {
  GuildId: string;
  UserId: string;
  CurrentCode: string;
  CurrentLevel: number;
  TotalLevels: number;
  CreatedAt: number;
};

const CaptchaSessions = new Map<string, CaptchaSession>();
const CaptchaSessionTtlMilliseconds = 10 * 60 * 1000;

export default class WelcomeMessagePlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.WarnIfCanvasFontsAreMissing();
    this.Logger.Info("Welcome Message plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Welcome Message plugin disabled.");
  }

  public async OnGuildMemberAdd(Member: GuildMember): Promise<void> {
    const Config = await this.GetConfig(Member.guild.id);

    if (Config.WelcomeEnabled && Config.WelcomeChannelId) {
      await this.SendMemberMessage({
        ChannelId: Config.WelcomeChannelId,
        Color: Config.WelcomeColor,
        Config,
        Member,
        Mode: Config.WelcomeMode,
        Title: Config.WelcomeTitle,
        Message: Config.WelcomeMessage,
        Type: "Welcome"
      });
    }

    if (Config.CaptchaEnabled && Config.CaptchaChannelId && Config.CaptchaRoleIds.length > 0) {
      await this.SendCaptchaMessage(Member, Config, true);
    }
  }

  public async OnGuildMemberRemove(Member: GuildMember | PartialGuildMember): Promise<void> {
    const Config = await this.GetConfig(Member.guild.id);

    if (!Config.LeaveEnabled || !Config.LeaveChannelId) {
      return;
    }

    await this.SendMemberMessage({
      ChannelId: Config.LeaveChannelId,
      Color: Config.LeaveColor,
      Config,
      Member,
      Mode: Config.LeaveMode,
      Title: Config.LeaveTitle,
      Message: Config.LeaveMessage,
      Type: "Leave"
    });
  }

  public async OnDashboardAction(GuildId: string, ActionKey: string, ActorId: string): Promise<void> {
    if (ActionKey !== "TestWelcome" && ActionKey !== "TestLeave" && ActionKey !== "PublishCaptchaPanel") {
      return;
    }

    const Guild = await this.DiscordClient.guilds.fetch(GuildId).catch(() => null);
    const Member = await Guild?.members.fetchMe().catch(() => null);

    if (!Guild || !Member) {
      this.Logger.Warn("Welcome test action failed because the guild or bot member cannot be fetched.", { GuildId, ActorId });
      return;
    }

    const Config = await this.GetConfig(GuildId);

    if (ActionKey === "PublishCaptchaPanel") {
      await this.SendCaptchaMessage(Member, Config, false);
      return;
    }

    if (ActionKey === "TestWelcome") {
      await this.SendMemberMessage({
        ChannelId: Config.WelcomeChannelId,
        Color: Config.WelcomeColor,
        Config,
        Member,
        Mode: Config.WelcomeMode,
        Title: Config.WelcomeTitle,
        Message: Config.WelcomeMessage,
        Type: "Welcome"
      });
      return;
    }

    await this.SendMemberMessage({
      ChannelId: Config.LeaveChannelId,
      Color: Config.LeaveColor,
      Config,
      Member,
      Mode: Config.LeaveMode,
      Title: Config.LeaveTitle,
      Message: Config.LeaveMessage,
      Type: "Leave"
    });
  }

  public async OnInteraction(InteractionValue: Interaction): Promise<void> {
    if (InteractionValue.isButton() && InteractionValue.customId.startsWith("WelcomeCaptcha:")) {
      await this.HandleCaptchaButton(InteractionValue);
      return;
    }

    if (InteractionValue.isModalSubmit() && InteractionValue.customId.startsWith("WelcomeCaptchaModal:")) {
      await this.HandleCaptchaSubmit(InteractionValue);
    }
  }

  private async SendCaptchaMessage(Member: GuildMember, Config: WelcomeMessageConfig, IsPersonalized: boolean): Promise<void> {
    const Channel = await this.ResolveWritableChannel(Member.guild.id, Config.CaptchaChannelId);

    if (!Channel) {
      this.Logger.Warn("Captcha channel is missing or not writable.", { GuildId: Member.guild.id, ChannelId: Config.CaptchaChannelId });
      return;
    }

    const BuiltEmbed = this.BuildConfiguredEmbed(Config.CaptchaEmbed, Member, {
      Title: Config.CaptchaTitle,
      Description: Config.CaptchaMessage,
      Color: Config.WelcomeColor,
      Footer: "%server%",
      ShowAuthor: false
    });
    const CustomId = IsPersonalized ? `WelcomeCaptcha:Start:${Member.user.id}` : "WelcomeCaptcha:Start";
    const Components = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(CustomId)
          .setLabel(Config.CaptchaButtonLabel || DefaultConfig.CaptchaButtonLabel)
          .setStyle(ButtonStyle.Primary)
      )
    ];

    await Channel.send({
      content: IsPersonalized ? `<@${Member.user.id}>` : undefined,
      embeds: [BuiltEmbed.Embed],
      files: BuiltEmbed.Files,
      components: Components
    });
  }

  private async HandleCaptchaButton(InteractionValue: ButtonInteraction): Promise<void> {
    const [, Action, TargetValue] = InteractionValue.customId.split(":");

    if (Action === "Answer") {
      await this.ShowCaptchaAnswerModal(InteractionValue, TargetValue);
      return;
    }

    if (Action !== "Start") {
      return;
    }

    if (!InteractionValue.guildId) {
      await InteractionValue.reply({ content: "Start verification from the server verification channel.", ephemeral: true });
      return;
    }

    if (TargetValue && TargetValue !== InteractionValue.user.id) {
      await InteractionValue.reply({ content: "This captcha is not for your account.", ephemeral: true });
      return;
    }

    const Config = await this.GetConfig(InteractionValue.guildId);

    if (!Config.CaptchaEnabled || Config.CaptchaRoleIds.length === 0) {
      await InteractionValue.reply({ content: "Captcha verification is not configured.", ephemeral: true });
      return;
    }

    const Guild = await this.DiscordClient.guilds.fetch(InteractionValue.guildId).catch(() => null);
    const Member = await Guild?.members.fetch(InteractionValue.user.id).catch(() => null);

    if (Member && this.HasAllCaptchaRoles(Member, Config)) {
      await InteractionValue.reply({ content: Config.CaptchaAlreadyVerifiedMessage, ephemeral: true });
      return;
    }

    const SessionId = this.CreateCaptchaSession(InteractionValue.guildId, InteractionValue.user.id, Config);
    const Session = CaptchaSessions.get(SessionId);

    if (!Session) {
      await InteractionValue.reply({ content: "Captcha session could not be created.", ephemeral: true });
      return;
    }

    try {
      await InteractionValue.user.send(this.BuildCaptchaDmMessage(Session, Config));
      await InteractionValue.reply({ content: Config.CaptchaDmSentMessage, ephemeral: true });
    } catch (ErrorValue) {
      CaptchaSessions.delete(SessionId);
      this.Logger.Warn("Captcha DM could not be sent.", {
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        GuildId: InteractionValue.guildId,
        UserId: InteractionValue.user.id
      });
      await InteractionValue.reply({ content: Config.CaptchaDmFailedMessage, ephemeral: true });
    }
  }

  private async ShowCaptchaAnswerModal(InteractionValue: ButtonInteraction, SessionId: string | undefined): Promise<void> {
    this.PruneCaptchaSessions();
    const Session = SessionId ? CaptchaSessions.get(SessionId) : null;

    if (!Session || Session.UserId !== InteractionValue.user.id) {
      await InteractionValue.reply({ content: DefaultConfig.CaptchaExpiredMessage, ephemeral: Boolean(InteractionValue.guildId) });
      return;
    }

    const Config = await this.GetConfig(Session.GuildId);

    const Modal = new ModalBuilder()
      .setCustomId(`WelcomeCaptchaModal:${SessionId}`)
      .setTitle(Config.CaptchaModalTitle.slice(0, 45) || DefaultConfig.CaptchaModalTitle)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("Answer")
            .setLabel(this.ApplyCaptchaSessionTemplate(Config.CaptchaModalInputLabel, Session).slice(0, 45))
            .setMaxLength(12)
            .setRequired(true)
            .setStyle(TextInputStyle.Short)
        )
      );

    await InteractionValue.showModal(Modal);
  }

  private async HandleCaptchaSubmit(InteractionValue: ModalSubmitInteraction): Promise<void> {
    this.PruneCaptchaSessions();
    const [, SessionId] = InteractionValue.customId.split(":");
    const Session = CaptchaSessions.get(SessionId);

    if (!Session || Session.UserId !== InteractionValue.user.id) {
      await InteractionValue.reply({ content: DefaultConfig.CaptchaExpiredMessage });
      return;
    }

    const Config = await this.GetConfig(Session.GuildId);

    const SubmittedAnswer = InteractionValue.fields.getTextInputValue("Answer").trim().toUpperCase();

    if (SubmittedAnswer !== Session.CurrentCode) {
      await InteractionValue.reply({ content: Config.CaptchaFailedMessage });
      return;
    }

    if (!Config.CaptchaEnabled || Config.CaptchaRoleIds.length === 0) {
      CaptchaSessions.delete(SessionId);
      await InteractionValue.reply({ content: "Captcha verification is not configured anymore." });
      return;
    }

    if (Session.CurrentLevel < Session.TotalLevels) {
      Session.CurrentLevel += 1;
      Session.CurrentCode = this.GenerateCaptchaCode(Session.CurrentLevel);
      Session.CreatedAt = Date.now();
      await InteractionValue.reply(this.BuildCaptchaDmMessage(Session, Config, Config.CaptchaNextLevelMessage));
      return;
    }

    const Guild = await this.DiscordClient.guilds.fetch(Session.GuildId).catch(() => null);
    const Member = await Guild?.members.fetch(Session.UserId).catch(() => null);

    if (!Member) {
      CaptchaSessions.delete(SessionId);
      await InteractionValue.reply({ content: "Member not found in the server." });
      return;
    }

    if (this.HasAllCaptchaRoles(Member, Config)) {
      CaptchaSessions.delete(SessionId);
      await InteractionValue.reply({ content: Config.CaptchaAlreadyVerifiedMessage });
      return;
    }

    const GrantedRoleIds: string[] = [];

    for (const RoleId of Config.CaptchaRoleIds) {
      if (!RoleId || Member.roles.cache.has(RoleId)) {
        continue;
      }

      await Member.roles.add(RoleId, "Welcome captcha completed").then(() => {
        GrantedRoleIds.push(RoleId);
      }).catch((ErrorValue: unknown) => {
        this.Logger.Warn("Captcha role could not be granted.", {
          Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
          GuildId: Session.GuildId,
          RoleId,
          UserId: Session.UserId
        });
      });
    }

    CaptchaSessions.delete(SessionId);
    await InteractionValue.reply({
      content: GrantedRoleIds.length > 0 ? Config.CaptchaSuccessMessage : Config.CaptchaNoRoleGrantedMessage
    });
  }

  private CreateCaptchaSession(GuildId: string, UserId: string, Config: WelcomeMessageConfig): string {
    this.PruneCaptchaSessions();
    const SessionId = randomBytes(8).toString("hex");
    const TotalLevels = this.ClampNumber(Config.CaptchaVerificationLevels, 1, 5, DefaultConfig.CaptchaVerificationLevels);

    CaptchaSessions.set(SessionId, {
      GuildId,
      UserId,
      CurrentCode: this.GenerateCaptchaCode(1),
      CurrentLevel: 1,
      TotalLevels,
      CreatedAt: Date.now()
    });

    return SessionId;
  }

  private BuildCaptchaDmMessage(Session: CaptchaSession, Config: WelcomeMessageConfig, HeaderMessage?: string) {
    const Attachment = new AttachmentBuilder(this.BuildCaptchaImage(Session.CurrentCode, Session.CurrentLevel, Session.TotalLevels), {
      name: `captcha-${Session.CurrentLevel}.png`
    });

    return {
      content: [
        this.ApplyCaptchaSessionTemplate(HeaderMessage ?? Config.CaptchaDmMessage, Session)
      ].join("\n"),
      files: [Attachment],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`WelcomeCaptcha:Answer:${this.FindCaptchaSessionId(Session)}`)
            .setLabel(Config.CaptchaAnswerButtonLabel.slice(0, 80) || DefaultConfig.CaptchaAnswerButtonLabel)
            .setStyle(ButtonStyle.Primary)
        )
      ]
    };
  }

  private FindCaptchaSessionId(Session: CaptchaSession): string {
    for (const [SessionId, SessionValue] of CaptchaSessions.entries()) {
      if (SessionValue === Session) {
        return SessionId;
      }
    }

    return "";
  }

  private GenerateCaptchaCode(Level: number): string {
    const Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const Length = this.ClampNumber(4 + Level, 5, 8, 5);
    let Code = "";

    for (let Index = 0; Index < Length; Index += 1) {
      Code += Alphabet[Math.floor(Math.random() * Alphabet.length)];
    }

    return Code;
  }

  private BuildCaptchaImage(Code: string, Level: number, TotalLevels: number): Buffer {
    const Width = 360;
    const Height = 140;
    const Canvas = createCanvas(Width, Height);
    const Context = Canvas.getContext("2d");
    const Background = Context.createLinearGradient(0, 0, Width, Height);
    Background.addColorStop(0, "#0f172a");
    Background.addColorStop(1, "#1e293b");
    Context.fillStyle = Background;
    Context.fillRect(0, 0, Width, Height);

    for (let Index = 0; Index < 76 + Level * 26; Index += 1) {
      Context.fillStyle = `rgba(${80 + Math.random() * 120}, ${120 + Math.random() * 90}, ${180 + Math.random() * 60}, ${0.18 + Math.random() * 0.28})`;
      Context.beginPath();
      Context.arc(Math.random() * Width, Math.random() * Height, 1 + Math.random() * (2 + Level), 0, Math.PI * 2);
      Context.fill();
    }

    for (let Index = 0; Index < 9 + Level * 5; Index += 1) {
      Context.strokeStyle = `rgba(${90 + Math.random() * 130}, ${120 + Math.random() * 90}, ${170 + Math.random() * 70}, ${0.2 + Math.random() * 0.28})`;
      Context.lineWidth = 1 + Math.random() * 2;
      Context.beginPath();
      Context.moveTo(Math.random() * Width, Math.random() * Height);
      Context.bezierCurveTo(Math.random() * Width, Math.random() * Height, Math.random() * Width, Math.random() * Height, Math.random() * Width, Math.random() * Height);
      Context.stroke();
    }

    Context.globalAlpha = 0.18;
    Context.strokeStyle = "#e2e8f0";
    Context.lineWidth = 1;
    for (let X = -Height; X < Width; X += 18) {
      Context.beginPath();
      Context.moveTo(X, 0);
      Context.lineTo(X + Height, Height);
      Context.stroke();
    }
    Context.globalAlpha = 1;

    Context.textAlign = "center";
    Context.textBaseline = "middle";
    const Spacing = Width / (Code.length + 1);

    for (let Index = 0; Index < Code.length; Index += 1) {
      const Character = Code[Index];
      const X = Spacing * (Index + 1);
      const Y = Height / 2 + (Math.random() * 20 - 10);
      Context.save();
      Context.translate(X, Y);
      Context.rotate((Math.random() - 0.5) * (0.42 + Level * 0.12));
      Context.transform(1, (Math.random() - 0.5) * 0.34, (Math.random() - 0.5) * 0.26, 1, 0, 0);
      Context.font = `bold ${36 + Math.random() * 11}px "DejaVu Sans", "Noto Sans", "Liberation Sans", sans-serif`;
      const CharacterOpacity = Math.max(0.42, 0.92 - Level * 0.08 - Math.random() * 0.38);
      Context.globalAlpha = CharacterOpacity;
      Context.fillStyle = Index % 2 === 0 ? "#f8fafc" : "#bfdbfe";
      Context.shadowColor = "rgba(0, 0, 0, 0.45)";
      Context.shadowBlur = 8;
      Context.fillText(Character, 0, 0);
      Context.globalAlpha = Math.max(0.18, CharacterOpacity - 0.22);
      Context.strokeStyle = Index % 2 === 0 ? "#93c5fd" : "#e2e8f0";
      Context.lineWidth = 1 + Math.random() * 1.2;
      Context.strokeText(Character, 0, 0);
      Context.restore();
    }

    Context.globalAlpha = 1;

    const Decoys = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    Context.font = "bold 18px \"DejaVu Sans\", \"Noto Sans\", \"Liberation Sans\", sans-serif";
    for (let Index = 0; Index < 8 + Level * 3; Index += 1) {
      Context.fillStyle = `rgba(226, 232, 240, ${0.1 + Math.random() * 0.16})`;
      Context.fillText(Decoys[Math.floor(Math.random() * Decoys.length)], 18 + Math.random() * (Width - 36), 22 + Math.random() * (Height - 34));
    }

    Context.font = "600 12px \"DejaVu Sans\", \"Noto Sans\", \"Liberation Sans\", sans-serif";
    Context.fillStyle = "rgba(226, 232, 240, 0.82)";
    Context.textAlign = "left";
    Context.fillText(`Level ${Level}/${TotalLevels}`, 22, 32);
    return Canvas.encodeSync("png");
  }

  private HasAllCaptchaRoles(Member: GuildMember, Config: WelcomeMessageConfig): boolean {
    const RoleIds = Config.CaptchaRoleIds.filter(Boolean);
    return RoleIds.length > 0 && RoleIds.every((RoleId) => Member.roles.cache.has(RoleId));
  }

  private ApplyCaptchaSessionTemplate(Template: string, Session: CaptchaSession): string {
    return Template
      .replaceAll("%level%", String(Session.CurrentLevel))
      .replaceAll("%levels%", String(Session.TotalLevels))
      .replaceAll("%serverId%", Session.GuildId)
      .replaceAll("%userId%", Session.UserId);
  }

  private PruneCaptchaSessions(): void {
    const Now = Date.now();

    for (const [SessionId, Session] of CaptchaSessions.entries()) {
      if (Now - Session.CreatedAt > CaptchaSessionTtlMilliseconds) {
        CaptchaSessions.delete(SessionId);
      }
    }
  }

  private async SendMemberMessage(Options: {
    ChannelId: string;
    Color: string;
    Config: WelcomeMessageConfig;
    Member: GuildMember | PartialGuildMember;
    Mode: MessageMode;
    Title: string;
    Message: string;
    Type: "Welcome" | "Leave";
  }): Promise<void> {
    const Channel = await this.ResolveWritableChannel(Options.Member.guild.id, Options.ChannelId);

    if (!Channel) {
      this.Logger.Warn("Welcome channel is missing or not writable.", { GuildId: Options.Member.guild.id, ChannelId: Options.ChannelId });
      return;
    }

    const Title = this.ApplyTemplate(Options.Title, Options.Member);
    const Description = this.ApplyTemplate(Options.Message, Options.Member);
    const Content = Options.Config.PingUser ? `<@${Options.Member.user.id}>` : undefined;

    if (Options.Mode === "Image") {
      const Png = await this.BuildWelcomePng({
        AccentColor: Options.Config.ImageAccent || Options.Color,
        BackgroundColor: Options.Config.ImageBackground,
        BackgroundFit: Options.Config.ImageBackgroundFit,
        BackgroundImageSource: this.ResolveImageBackgroundSource(Options.Config, Options.Type),
        BackgroundOpacity: Options.Config.ImageBackgroundOpacity,
        Description,
        DescriptionFontSize: Options.Config.ImageDescriptionFontSize,
        MutedTextColor: Options.Config.ImageMutedTextColor,
        Footer: Options.Config.ImageFooterEnabled ? this.ApplyTemplate(Options.Config.ImageFooter, Options.Member) : "",
        BadgeText: Options.Config.ImageBadgeEnabled ? this.ApplyTemplate(Options.Config.ImageBadgeText, Options.Member).replaceAll("%type%", Options.Type) : "",
        OverlayOpacity: Options.Config.ImageOverlayOpacity,
        PanelEnabled: Options.Config.ImagePanelEnabled,
        PanelOpacity: Options.Config.ImagePanelOpacity,
        AvatarSize: Options.Config.ImageAvatarSize,
        AvatarStyle: Options.Config.ImageAvatarStyle,
        Member: Options.Member,
        ShowInitialsAvatar: Options.Config.ImageShowInitialsAvatar,
        TextColor: Options.Config.ImageTextColor,
        Title,
        TitleFontSize: Options.Config.ImageTitleFontSize,
        Type: Options.Type
      });
      const Attachment = new AttachmentBuilder(Png, { name: `${Options.Type.toLowerCase()}-${Options.Member.user.id}.png` });

      await Channel.send({ content: Content, files: [Attachment] });
      return;
    }

    const EmbedSource = Options.Type === "Welcome" ? Options.Config.WelcomeEmbed : Options.Config.LeaveEmbed;
    const BuiltEmbed = this.BuildConfiguredEmbed(EmbedSource, Options.Member, {
      Title,
      Description,
      Color: Options.Color,
      ShowAuthor: (Options.Type === "Welcome" && Options.Config.WelcomeEmbedAuthor) || (Options.Type === "Leave" && Options.Config.LeaveEmbedAuthor),
      Footer: Options.Config.ImageFooter
    });

    await Channel.send({ content: Content, embeds: [BuiltEmbed.Embed], files: BuiltEmbed.Files });
  }

  private BuildConfiguredEmbed(Source: EditableEmbed, Member: GuildMember | PartialGuildMember, Fallback: { Title: string; Description: string; Color: string; Footer: string; ShowAuthor: boolean }): { Embed: EmbedBuilder; Files: Array<{ attachment: Buffer; name: string }> } {
    const Files: Array<{ attachment: Buffer; name: string }> = [];
    const Embed = new EmbedBuilder().setColor(this.ParseColor(Source.Color || Fallback.Color));
    const Title = Source.Title ?? Fallback.Title;
    const Description = Source.Description ?? Fallback.Description;

    if (Title.trim()) {
      Embed.setTitle(this.ApplyTemplate(Title, Member).slice(0, 256));
    }

    if (Description.trim()) {
      Embed.setDescription(this.ApplyTemplate(Description, Member).slice(0, 4096));
    }

    if (Source.Url?.trim()) {
      Embed.setURL(this.ApplyTemplate(Source.Url, Member));
    }

    const AuthorName = Source.AuthorName || (Fallback.ShowAuthor ? "%user%" : "");
    if (AuthorName.trim()) {
      Embed.setAuthor({
        name: this.ApplyTemplate(AuthorName, Member).slice(0, 256),
        iconURL: this.ApplyTemplate(Source.AuthorIconUrl || "%avatar%", Member) || undefined
      });
    }

    const ThumbnailUrl = Source.ThumbnailUrl || "%avatar%";
    if (ThumbnailUrl.trim()) {
      Embed.setThumbnail(this.ApplyTemplate(ThumbnailUrl, Member));
    }

    const UploadedImage = this.ParseDataImage(Source.ImageDataUrl, Source.ImageName || "embed-image.png");
    if (UploadedImage) {
      Files.push(UploadedImage);
      Embed.setImage(`attachment://${UploadedImage.name}`);
    } else if (Source.ImageUrl?.trim()) {
      Embed.setImage(this.ApplyTemplate(Source.ImageUrl, Member));
    }

    const FooterText = Source.FooterText || Fallback.Footer;
    if (FooterText.trim()) {
      Embed.setFooter({
        text: this.ApplyTemplate(FooterText, Member).slice(0, 2048),
        iconURL: Source.FooterIconUrl?.trim() ? this.ApplyTemplate(Source.FooterIconUrl, Member) : undefined
      });
    }

    if (Source.Timestamp !== false) {
      Embed.setTimestamp(new Date());
    }

    for (const Field of Source.Fields ?? []) {
      if (Field.Name.trim() && Field.Value.trim()) {
        Embed.addFields({
          name: this.ApplyTemplate(Field.Name, Member).slice(0, 256),
          value: this.ApplyTemplate(Field.Value, Member).slice(0, 1024),
          inline: Field.Inline
        });
      }
    }

    return { Embed, Files };
  }

  private async BuildWelcomePng(Options: {
    AccentColor: string;
    BackgroundColor: string;
    BackgroundFit: ImageFitMode;
    BackgroundImageSource: string;
    BackgroundOpacity: number;
    BadgeText: string;
    Description: string;
    DescriptionFontSize: number;
    Footer: string;
    Member: GuildMember | PartialGuildMember;
    MutedTextColor: string;
    OverlayOpacity: number;
    PanelEnabled: boolean;
    PanelOpacity: number;
    AvatarSize: number;
    AvatarStyle: ImageAvatarStyle;
    ShowInitialsAvatar: boolean;
    TextColor: string;
    Title: string;
    TitleFontSize: number;
    Type: "Welcome" | "Leave";
  }): Promise<Buffer> {
    const Width = 1000;
    const Height = 320;
    const Canvas = createCanvas(Width, Height);
    const Context = Canvas.getContext("2d");
    const AccentColor = this.HexToRgb(this.SanitizeColor(Options.AccentColor, "#38bdf8"));
    const BackgroundColor = this.HexToRgb(this.SanitizeColor(Options.BackgroundColor, "#020617"));
    const TextColor = this.HexToRgb(this.SanitizeColor(Options.TextColor, "#f8fafc"));
    const MutedTextColor = this.HexToRgb(this.SanitizeColor(Options.MutedTextColor, "#cbd5e1"));
    const PanelColor = "#0f172a";
    const DarkPanelColor = `rgba(2, 6, 23, ${this.ClampPercent(Options.PanelOpacity, 86) / 100})`;
    const Username = Options.Member.user.tag;
    const Initials = this.BuildInitials(Options.Member.user.username);
    const Accent = this.ToCssColor(AccentColor);
    const Background = this.ToCssColor(BackgroundColor);
    const Text = this.ToCssColor(TextColor);
    const MutedText = this.ToCssColor(MutedTextColor);
    const TextX = 242;
    const ContentWidth = 690;
    const AvatarImage = await this.LoadMemberAvatar(Options.Member);

    const BackgroundGradient = Context.createLinearGradient(0, 0, Width, Height);
    BackgroundGradient.addColorStop(0, Background);
    BackgroundGradient.addColorStop(1, PanelColor);
    Context.fillStyle = BackgroundGradient;
    Context.fillRect(0, 0, Width, Height);

    const BackgroundImage = await this.LoadConfiguredImage(Options.BackgroundImageSource);

    if (BackgroundImage) {
      Context.save();
      Context.globalAlpha = this.ClampPercent(Options.BackgroundOpacity, 100) / 100;
      this.DrawFittedImage(Context, BackgroundImage, 0, 0, Width, Height, Options.BackgroundFit);
      Context.restore();
    }

    const OverlayOpacity = this.ClampPercent(Options.OverlayOpacity, 55) / 100;
    const OverlayGradient = Context.createLinearGradient(0, 0, Width, Height);
    OverlayGradient.addColorStop(0, `rgba(2, 6, 23, ${OverlayOpacity})`);
    OverlayGradient.addColorStop(1, `rgba(15, 23, 42, ${Math.min(0.9, OverlayOpacity + 0.16)})`);
    Context.fillStyle = OverlayGradient;
    Context.fillRect(0, 0, Width, Height);

    if (Options.PanelEnabled) {
      Context.shadowColor = "rgba(0, 0, 0, 0.36)";
      Context.shadowBlur = 18;
      Context.shadowOffsetY = 10;
      this.DrawRoundedRect(Context, 34, 34, 932, 252, 26, DarkPanelColor);
      Context.shadowColor = "transparent";
      Context.lineWidth = 2;
      Context.strokeStyle = this.ToCssColor({ ...AccentColor, Alpha: 160 });
      this.StrokeRoundedRect(Context, 34, 34, 932, 252, 26);
    }

    this.DrawAvatar(Context, 134, 160, this.ClampNumber(Options.AvatarSize, 64, 190, 140) / 2, Accent, Text, Initials, Options.ShowInitialsAvatar, AvatarImage, Options.AvatarStyle);

    const BadgeText = this.TruncateText(Context, this.NormalizeCardText(Options.BadgeText.replaceAll("%type%", Options.Type).toUpperCase()), 210, 13, 700);

    if (BadgeText) {
      this.DrawBadge(Context, TextX, 72, BadgeText, Accent);
    }

    const TitleFontSize = this.ResolveAdaptiveFontSize(Options.Title, this.ClampNumber(Options.TitleFontSize, 20, 58, 40), 17, 44, 92);
    const TitleLineHeight = Math.round(TitleFontSize * 1.45);
    const TitleLines = this.WrapText(Context, Options.Title, ContentWidth, TitleFontSize, 700, 2);
    this.FillTextBlock(Context, {
      Color: Text,
      FontSize: TitleFontSize,
      FontWeight: 700,
      LineHeight: TitleLineHeight,
      Lines: TitleLines,
      X: TextX,
      Y: 145
    });

    const DescriptionFontSize = this.ResolveAdaptiveFontSize(Options.Description, this.ClampNumber(Options.DescriptionFontSize, 11, 26, 15), 12, 70, 150);
    const DescriptionLineHeight = Math.round(DescriptionFontSize * 1.62);
    const DescriptionY = 122 + TitleLines.length * TitleLineHeight;
    const DescriptionLines = this.WrapText(Context, Options.Description, ContentWidth, DescriptionFontSize, 400, 3);
    this.FillTextBlock(Context, {
      Color: MutedText,
      FontSize: DescriptionFontSize,
      FontWeight: 400,
      LineHeight: DescriptionLineHeight,
      Lines: DescriptionLines,
      X: TextX,
      Y: DescriptionY
    });

    const MetadataY = 260;
    Context.font = this.FormatFont(11, 600);
    Context.fillStyle = "rgba(148, 163, 184, 0.94)";
    Context.fillText(this.TruncateText(Context, Username, 300, 11, 600), TextX, MetadataY);

    Context.font = this.FormatFont(11, 400);
    Context.fillStyle = "rgba(148, 163, 184, 0.86)";
    if (Options.Footer) {
      Context.fillText(this.TruncateText(Context, this.NormalizeCardText(Options.Footer), 360, 11, 400), 570, MetadataY);
    }

    return Canvas.encodeSync("png");
  }

  private ResolveImageBackgroundSource(Config: WelcomeMessageConfig, Type: "Welcome" | "Leave"): string {
    const SpecificSource = Type === "Welcome" ? Config.WelcomeImageBackgroundImage : Config.LeaveImageBackgroundImage;
    return SpecificSource.trim() || Config.ImageBackgroundImage.trim();
  }

  private async LoadConfiguredImage(Source: string): Promise<Image | null> {
    const TrimmedSource = Source.trim();

    if (!TrimmedSource) {
      return null;
    }

    if (TrimmedSource.startsWith("data:image/")) {
      const Match = TrimmedSource.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/iu);

      if (!Match?.[1]) {
        return null;
      }

      return await loadImage(Buffer.from(Match[1], "base64")).catch((ErrorValue: unknown) => {
        this.Logger.Warn("Uploaded welcome background could not be loaded.", {
          Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue)
        });
        return null;
      });
    }

    if (!/^https?:\/\//iu.test(TrimmedSource)) {
      return null;
    }

    return await loadImage(TrimmedSource).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Remote welcome background could not be loaded.", {
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue)
      });
      return null;
    });
  }

  private DrawFittedImage(Context: SKRSContext2D, ImageValue: Image, X: number, Y: number, Width: number, Height: number, Fit: ImageFitMode): void {
    if (Fit === "Stretch") {
      Context.drawImage(ImageValue, X, Y, Width, Height);
      return;
    }

    const ImageWidth = ImageValue.width;
    const ImageHeight = ImageValue.height;
    const Scale = Fit === "Contain" ? Math.min(Width / ImageWidth, Height / ImageHeight) : Math.max(Width / ImageWidth, Height / ImageHeight);
    const DrawWidth = ImageWidth * Scale;
    const DrawHeight = ImageHeight * Scale;
    const DrawX = X + (Width - DrawWidth) / 2;
    const DrawY = Y + (Height - DrawHeight) / 2;

    Context.drawImage(ImageValue, DrawX, DrawY, DrawWidth, DrawHeight);
  }

  private async LoadMemberAvatar(Member: GuildMember | PartialGuildMember): Promise<Image | null> {
    const AvatarUrl = Member.user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true });

    return await loadImage(AvatarUrl).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Avatar image could not be loaded for welcome card.", {
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        UserId: Member.user.id
      });
      return null;
    });
  }

  private DrawAvatar(
    Context: SKRSContext2D,
    CenterX: number,
    CenterY: number,
    Radius: number,
    Accent: string,
    Text: string,
    Initials: string,
    ShowInitialsAvatar: boolean,
    AvatarImage: Image | null,
    AvatarStyle: ImageAvatarStyle
  ): void {
    Context.save();
    this.DrawAvatarFrame(Context, CenterX, CenterY, Radius + 12, AvatarStyle, "rgba(255, 255, 255, 0.05)");
    this.DrawAvatarFrame(Context, CenterX, CenterY, Radius + 6, AvatarStyle, Accent);
    this.DrawAvatarFrame(Context, CenterX, CenterY, Radius, AvatarStyle, "rgba(2, 6, 23, 0.92)");

    if (AvatarImage) {
      Context.save();
      this.BuildAvatarPath(Context, CenterX, CenterY, Radius - 7, AvatarStyle);
      Context.clip();
      Context.imageSmoothingEnabled = true;
      Context.imageSmoothingQuality = "high";
      Context.drawImage(AvatarImage, CenterX - Radius + 7, CenterY - Radius + 7, (Radius - 7) * 2, (Radius - 7) * 2);
      Context.restore();
    } else if (ShowInitialsAvatar) {
      const AvatarGradient = Context.createLinearGradient(CenterX - Radius, CenterY - Radius, CenterX + Radius, CenterY + Radius);
      AvatarGradient.addColorStop(0, Accent);
      AvatarGradient.addColorStop(1, "rgba(15, 23, 42, 0.82)");
      this.DrawAvatarFrame(Context, CenterX, CenterY, Radius - 7, AvatarStyle, AvatarGradient);
      Context.font = this.FormatFont(38, 900);
      Context.fillStyle = Text;
      Context.textAlign = "center";
      Context.textBaseline = "middle";
      Context.fillText(Initials, CenterX, CenterY + 2);
      Context.textAlign = "start";
      Context.textBaseline = "alphabetic";
    }

    Context.restore();
  }

  private DrawAvatarFrame(Context: SKRSContext2D, CenterX: number, CenterY: number, Radius: number, AvatarStyle: ImageAvatarStyle, FillStyle: SKRSContext2D["fillStyle"]): void {
    this.BuildAvatarPath(Context, CenterX, CenterY, Radius, AvatarStyle);
    Context.fillStyle = FillStyle;
    Context.fill();
  }

  private BuildAvatarPath(Context: SKRSContext2D, CenterX: number, CenterY: number, Radius: number, AvatarStyle: ImageAvatarStyle): void {
    if (AvatarStyle === "Circle") {
      Context.beginPath();
      Context.arc(CenterX, CenterY, Radius, 0, Math.PI * 2);
      return;
    }

    const Size = Radius * 2;
    const RadiusValue = AvatarStyle === "Rounded" ? Math.max(12, Radius * 0.25) : 4;
    this.BuildRoundedRectPath(Context, CenterX - Radius, CenterY - Radius, Size, Size, RadiusValue);
  }

  private DrawCircle(Context: SKRSContext2D, CenterX: number, CenterY: number, Radius: number, FillStyle: SKRSContext2D["fillStyle"]): void {
    Context.beginPath();
    Context.arc(CenterX, CenterY, Radius, 0, Math.PI * 2);
    Context.fillStyle = FillStyle;
    Context.fill();
  }

  private DrawBadge(Context: SKRSContext2D, X: number, Y: number, Text: string, Accent: string): void {
    Context.font = this.FormatFont(13, 700);
    const Width = Math.min(240, Math.max(86, Context.measureText(Text).width + 28));
    this.DrawRoundedRect(Context, X, Y, Width, 30, 15, this.ApplyCssOpacity(Accent, 0.18));
    Context.strokeStyle = this.ApplyCssOpacity(Accent, 0.75);
    Context.lineWidth = 1.5;
    this.StrokeRoundedRect(Context, X, Y, Width, 30, 15);
    Context.fillStyle = Accent;
    Context.fillText(this.TruncateText(Context, Text, Width - 28, 13, 700), X + 14, Y + 20);
  }

  private DrawRoundedRect(Context: SKRSContext2D, X: number, Y: number, Width: number, Height: number, Radius: number, FillStyle: SKRSContext2D["fillStyle"]): void {
    this.BuildRoundedRectPath(Context, X, Y, Width, Height, Radius);
    Context.fillStyle = FillStyle;
    Context.fill();
  }

  private StrokeRoundedRect(Context: SKRSContext2D, X: number, Y: number, Width: number, Height: number, Radius: number): void {
    this.BuildRoundedRectPath(Context, X, Y, Width, Height, Radius);
    Context.stroke();
  }

  private BuildRoundedRectPath(Context: SKRSContext2D, X: number, Y: number, Width: number, Height: number, Radius: number): void {
    const SafeRadius = Math.min(Radius, Width / 2, Height / 2);
    Context.beginPath();
    Context.moveTo(X + SafeRadius, Y);
    Context.lineTo(X + Width - SafeRadius, Y);
    Context.quadraticCurveTo(X + Width, Y, X + Width, Y + SafeRadius);
    Context.lineTo(X + Width, Y + Height - SafeRadius);
    Context.quadraticCurveTo(X + Width, Y + Height, X + Width - SafeRadius, Y + Height);
    Context.lineTo(X + SafeRadius, Y + Height);
    Context.quadraticCurveTo(X, Y + Height, X, Y + Height - SafeRadius);
    Context.lineTo(X, Y + SafeRadius);
    Context.quadraticCurveTo(X, Y, X + SafeRadius, Y);
    Context.closePath();
  }

  private FillTextBlock(Context: SKRSContext2D, Options: PngTextBlock): void {
    Context.font = this.FormatFont(Options.FontSize, Options.FontWeight);
    Context.fillStyle = Options.Color;

    for (let Index = 0; Index < Options.Lines.length; Index += 1) {
      Context.fillText(Options.Lines[Index], Options.X, Options.Y + Index * Options.LineHeight);
    }
  }

  private WrapText(Context: SKRSContext2D, Text: string, MaxWidth: number, FontSize: number, FontWeight: number, MaxLines: number): string[] {
    Context.font = this.FormatFont(FontSize, FontWeight);
    const Words = this.NormalizeCardText(Text).split(" ").filter(Boolean);
    const Lines: string[] = [];
    let CurrentLine = "";

    for (const Word of Words) {
      const WordParts = this.SplitOversizedWord(Context, Word, MaxWidth, FontSize, FontWeight);

      for (const WordPart of WordParts) {
        const CandidateLine = CurrentLine ? `${CurrentLine} ${WordPart}` : WordPart;

        if (Context.measureText(CandidateLine).width <= MaxWidth) {
          CurrentLine = CandidateLine;
          continue;
        }

        if (CurrentLine) {
          Lines.push(CurrentLine);
        }

        CurrentLine = WordPart;

        if (Lines.length === MaxLines) {
          break;
        }
      }

      if (Lines.length === MaxLines) {
        break;
      }
    }

    if (CurrentLine && Lines.length < MaxLines) {
      Lines.push(CurrentLine);
    }

    if (Lines.length === 0) {
      Lines.push("");
    }

    const LastIndex = Lines.length - 1;
    Lines[LastIndex] = this.TruncateText(Context, Lines[LastIndex], MaxWidth, FontSize, FontWeight);
    return Lines;
  }

  private SplitOversizedWord(Context: SKRSContext2D, Word: string, MaxWidth: number, FontSize: number, FontWeight: number): string[] {
    Context.font = this.FormatFont(FontSize, FontWeight);

    if (Context.measureText(Word).width <= MaxWidth) {
      return [Word];
    }

    const Parts: string[] = [];
    let CurrentPart = "";

    for (const Character of Word) {
      const CandidatePart = `${CurrentPart}${Character}`;

      if (Context.measureText(CandidatePart).width <= MaxWidth) {
        CurrentPart = CandidatePart;
        continue;
      }

      if (CurrentPart) {
        Parts.push(CurrentPart);
      }

      CurrentPart = Character;
    }

    if (CurrentPart) {
      Parts.push(CurrentPart);
    }

    return Parts;
  }

  private TruncateText(Context: SKRSContext2D, Text: string, MaxWidth: number, FontSize: number, FontWeight: number): string {
    Context.font = this.FormatFont(FontSize, FontWeight);

    if (Context.measureText(Text).width <= MaxWidth) {
      return Text;
    }

    let TruncatedText = Text;

    while (TruncatedText.length > 1 && Context.measureText(`${TruncatedText}...`).width > MaxWidth) {
      TruncatedText = TruncatedText.slice(0, -1);
    }

    return `${TruncatedText.trimEnd()}...`;
  }

  private ResolveAdaptiveFontSize(Text: string, MaxFontSize: number, MinFontSize: number, ShortTextLength: number, LongTextLength: number): number {
    const NormalizedLength = this.NormalizeCardText(Text).length;

    if (NormalizedLength <= ShortTextLength) {
      return MaxFontSize;
    }

    if (NormalizedLength >= LongTextLength) {
      return MinFontSize;
    }

    const Ratio = (NormalizedLength - ShortTextLength) / (LongTextLength - ShortTextLength);
    return Math.round(MaxFontSize - (MaxFontSize - MinFontSize) * Ratio);
  }

  private ClampPercent(Value: number, Fallback: number): number {
    return this.ClampNumber(Value, 0, 100, Fallback);
  }

  private ClampNumber(Value: number, Minimum: number, Maximum: number, Fallback: number): number {
    return Number.isFinite(Value) ? Math.min(Maximum, Math.max(Minimum, Number(Value))) : Fallback;
  }

  private FormatFont(FontSize: number, FontWeight: number): string {
    const SafeWeight = FontWeight >= 700 ? "bold" : FontWeight >= 600 ? "600" : "normal";
    return `${SafeWeight} ${FontSize}px "DejaVu Sans", "Noto Sans", "Liberation Sans", sans-serif`;
  }

  private WarnIfCanvasFontsAreMissing(): void {
    const RequiredFontFamilies = ["DejaVu Sans", "Noto Sans", "Liberation Sans"];

    if (RequiredFontFamilies.some((FontFamily) => GlobalFonts.has(FontFamily))) {
      return;
    }

    this.Logger.Warn("No expected canvas font family is available. Welcome image cards may render without text.", {
      ExpectedFontFamilies: RequiredFontFamilies,
      AvailableFontFamilies: GlobalFonts.families.slice(0, 12).map((FontFamily) => FontFamily.family)
    });
  }

  private NormalizeCardText(Text: string): string {
    return Text.replace(/[`*_~|>#]/gu, "").replace(/\s+/gu, " ").trim();
  }

  private ToCssColor(Color: PngColor): string {
    return `rgba(${Color.Red}, ${Color.Green}, ${Color.Blue}, ${Color.Alpha / 255})`;
  }

  private ApplyCssOpacity(Color: string, Opacity: number): string {
    const Match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/iu.exec(Color);

    if (!Match) {
      return Color;
    }

    return `rgba(${Match[1]}, ${Match[2]}, ${Match[3]}, ${Opacity})`;
  }

  private async ResolveWritableChannel(GuildId: string, ChannelId: string): Promise<TextChannel | NewsChannel | VoiceChannel | null> {
    const Guild = await this.DiscordClient.guilds.fetch(GuildId).catch(() => null);
    const Channel = (await Guild?.channels.fetch(ChannelId).catch(() => null)) as GuildBasedChannel | null;

    if (!Channel) {
      return null;
    }

    if (Channel.type === ChannelType.GuildText || Channel.type === ChannelType.GuildAnnouncement || Channel.type === ChannelType.GuildVoice) {
      return Channel as TextChannel | NewsChannel | VoiceChannel;
    }

    return null;
  }

  private async GetConfig(GuildId: string): Promise<WelcomeMessageConfig> {
    return {
      WelcomeEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "WelcomeEnabled")) ?? DefaultConfig.WelcomeEnabled,
      WelcomeChannelId: (await this.Storage.GetGlobalConfig<string>(GuildId, "WelcomeChannelId")) ?? DefaultConfig.WelcomeChannelId,
      WelcomeMode: (await this.Storage.GetGlobalConfig<MessageMode>(GuildId, "WelcomeMode")) ?? DefaultConfig.WelcomeMode,
      WelcomeTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "WelcomeTitle")) ?? DefaultConfig.WelcomeTitle,
      WelcomeMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "WelcomeMessage")) ?? DefaultConfig.WelcomeMessage,
      WelcomeColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "WelcomeColor")) ?? DefaultConfig.WelcomeColor,
      WelcomeEmbedAuthor: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "WelcomeEmbedAuthor")) ?? DefaultConfig.WelcomeEmbedAuthor,
      WelcomeEmbed: await this.GetEmbedConfig(GuildId, "WelcomeEmbed", DefaultConfig.WelcomeEmbed),
      LeaveEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "LeaveEnabled")) ?? DefaultConfig.LeaveEnabled,
      LeaveChannelId: (await this.Storage.GetGlobalConfig<string>(GuildId, "LeaveChannelId")) ?? DefaultConfig.LeaveChannelId,
      LeaveMode: (await this.Storage.GetGlobalConfig<MessageMode>(GuildId, "LeaveMode")) ?? DefaultConfig.LeaveMode,
      LeaveTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "LeaveTitle")) ?? DefaultConfig.LeaveTitle,
      LeaveMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "LeaveMessage")) ?? DefaultConfig.LeaveMessage,
      LeaveColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "LeaveColor")) ?? DefaultConfig.LeaveColor,
      LeaveEmbedAuthor: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "LeaveEmbedAuthor")) ?? DefaultConfig.LeaveEmbedAuthor,
      LeaveEmbed: await this.GetEmbedConfig(GuildId, "LeaveEmbed", DefaultConfig.LeaveEmbed),
      ImageBackground: (await this.Storage.GetGlobalConfig<string>(GuildId, "ImageBackground")) ?? DefaultConfig.ImageBackground,
      ImageBackgroundImage: (await this.Storage.GetGlobalConfig<string>(GuildId, "ImageBackgroundImage")) ?? DefaultConfig.ImageBackgroundImage,
      WelcomeImageBackgroundImage: (await this.Storage.GetGlobalConfig<string>(GuildId, "WelcomeImageBackgroundImage")) ?? DefaultConfig.WelcomeImageBackgroundImage,
      LeaveImageBackgroundImage: (await this.Storage.GetGlobalConfig<string>(GuildId, "LeaveImageBackgroundImage")) ?? DefaultConfig.LeaveImageBackgroundImage,
      ImageBackgroundFit: (await this.Storage.GetGlobalConfig<ImageFitMode>(GuildId, "ImageBackgroundFit")) ?? DefaultConfig.ImageBackgroundFit,
      ImageBackgroundOpacity: (await this.Storage.GetGlobalConfig<number>(GuildId, "ImageBackgroundOpacity")) ?? DefaultConfig.ImageBackgroundOpacity,
      ImageOverlayOpacity: (await this.Storage.GetGlobalConfig<number>(GuildId, "ImageOverlayOpacity")) ?? DefaultConfig.ImageOverlayOpacity,
      ImageAccent: (await this.Storage.GetGlobalConfig<string>(GuildId, "ImageAccent")) ?? DefaultConfig.ImageAccent,
      ImageTextColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "ImageTextColor")) ?? DefaultConfig.ImageTextColor,
      ImageMutedTextColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "ImageMutedTextColor")) ?? DefaultConfig.ImageMutedTextColor,
      ImageFooter: (await this.Storage.GetGlobalConfig<string>(GuildId, "ImageFooter")) ?? DefaultConfig.ImageFooter,
      ImageFooterEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "ImageFooterEnabled")) ?? DefaultConfig.ImageFooterEnabled,
      ImageBadgeText: (await this.Storage.GetGlobalConfig<string>(GuildId, "ImageBadgeText")) ?? DefaultConfig.ImageBadgeText,
      ImageBadgeEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "ImageBadgeEnabled")) ?? DefaultConfig.ImageBadgeEnabled,
      ImagePanelEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "ImagePanelEnabled")) ?? DefaultConfig.ImagePanelEnabled,
      ImagePanelOpacity: (await this.Storage.GetGlobalConfig<number>(GuildId, "ImagePanelOpacity")) ?? DefaultConfig.ImagePanelOpacity,
      ImageAvatarStyle: (await this.Storage.GetGlobalConfig<ImageAvatarStyle>(GuildId, "ImageAvatarStyle")) ?? DefaultConfig.ImageAvatarStyle,
      ImageAvatarSize: (await this.Storage.GetGlobalConfig<number>(GuildId, "ImageAvatarSize")) ?? DefaultConfig.ImageAvatarSize,
      ImageTitleFontSize: (await this.Storage.GetGlobalConfig<number>(GuildId, "ImageTitleFontSize")) ?? DefaultConfig.ImageTitleFontSize,
      ImageDescriptionFontSize: (await this.Storage.GetGlobalConfig<number>(GuildId, "ImageDescriptionFontSize")) ?? DefaultConfig.ImageDescriptionFontSize,
      ImageShowInitialsAvatar: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "ImageShowInitialsAvatar")) ?? DefaultConfig.ImageShowInitialsAvatar,
      PingUser: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "PingUser")) ?? DefaultConfig.PingUser,
      CaptchaEnabled: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "CaptchaEnabled")) ?? DefaultConfig.CaptchaEnabled,
      CaptchaChannelId: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaChannelId")) ?? DefaultConfig.CaptchaChannelId,
      CaptchaRoleIds: await this.GetStringListConfig(GuildId, "CaptchaRoleIds", DefaultConfig.CaptchaRoleIds),
      CaptchaTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaTitle")) ?? DefaultConfig.CaptchaTitle,
      CaptchaMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaMessage")) ?? DefaultConfig.CaptchaMessage,
      CaptchaEmbed: await this.GetEmbedConfig(GuildId, "CaptchaEmbed", DefaultConfig.CaptchaEmbed),
      CaptchaButtonLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaButtonLabel")) ?? DefaultConfig.CaptchaButtonLabel,
      CaptchaVerificationLevels: (await this.Storage.GetGlobalConfig<number>(GuildId, "CaptchaVerificationLevels")) ?? DefaultConfig.CaptchaVerificationLevels,
      CaptchaDmMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaDmMessage")) ?? DefaultConfig.CaptchaDmMessage,
      CaptchaDmSentMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaDmSentMessage")) ?? DefaultConfig.CaptchaDmSentMessage,
      CaptchaDmFailedMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaDmFailedMessage")) ?? DefaultConfig.CaptchaDmFailedMessage,
      CaptchaAlreadyVerifiedMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaAlreadyVerifiedMessage")) ?? DefaultConfig.CaptchaAlreadyVerifiedMessage,
      CaptchaExpiredMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaExpiredMessage")) ?? DefaultConfig.CaptchaExpiredMessage,
      CaptchaFailedMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaFailedMessage")) ?? DefaultConfig.CaptchaFailedMessage,
      CaptchaNextLevelMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaNextLevelMessage")) ?? DefaultConfig.CaptchaNextLevelMessage,
      CaptchaNoRoleGrantedMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaNoRoleGrantedMessage")) ?? DefaultConfig.CaptchaNoRoleGrantedMessage,
      CaptchaAnswerButtonLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaAnswerButtonLabel")) ?? DefaultConfig.CaptchaAnswerButtonLabel,
      CaptchaModalTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaModalTitle")) ?? DefaultConfig.CaptchaModalTitle,
      CaptchaModalInputLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaModalInputLabel")) ?? DefaultConfig.CaptchaModalInputLabel,
      CaptchaSuccessMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "CaptchaSuccessMessage")) ?? DefaultConfig.CaptchaSuccessMessage
    };
  }

  private async GetStringListConfig(GuildId: string, Key: string, Fallback: string[]): Promise<string[]> {
    const Value = await this.Storage.GetGlobalConfig<unknown>(GuildId, Key);
    return Array.isArray(Value) ? Value.map((Item) => String(Item)).filter(Boolean) : Fallback;
  }

  private async GetEmbedConfig(GuildId: string, Key: string, Fallback: EditableEmbed): Promise<EditableEmbed> {
    const Value = await this.Storage.GetGlobalConfig<unknown>(GuildId, Key);

    if (!Value || typeof Value !== "object" || Array.isArray(Value)) {
      return Fallback;
    }

    const RecordValue = Value as Record<string, unknown>;
    return {
      Title: typeof RecordValue.Title === "string" ? RecordValue.Title : Fallback.Title,
      Description: typeof RecordValue.Description === "string" ? RecordValue.Description : Fallback.Description,
      Color: typeof RecordValue.Color === "string" ? RecordValue.Color : Fallback.Color,
      Url: typeof RecordValue.Url === "string" ? RecordValue.Url : "",
      AuthorName: typeof RecordValue.AuthorName === "string" ? RecordValue.AuthorName : Fallback.AuthorName,
      AuthorIconUrl: typeof RecordValue.AuthorIconUrl === "string" ? RecordValue.AuthorIconUrl : Fallback.AuthorIconUrl,
      ThumbnailUrl: typeof RecordValue.ThumbnailUrl === "string" ? RecordValue.ThumbnailUrl : Fallback.ThumbnailUrl,
      ImageUrl: typeof RecordValue.ImageUrl === "string" ? RecordValue.ImageUrl : "",
      FooterText: typeof RecordValue.FooterText === "string" ? RecordValue.FooterText : Fallback.FooterText,
      FooterIconUrl: typeof RecordValue.FooterIconUrl === "string" ? RecordValue.FooterIconUrl : "",
      Timestamp: typeof RecordValue.Timestamp === "boolean" ? RecordValue.Timestamp : Fallback.Timestamp,
      ImageDataUrl: typeof RecordValue.ImageDataUrl === "string" ? RecordValue.ImageDataUrl : "",
      ImageName: typeof RecordValue.ImageName === "string" ? RecordValue.ImageName : "",
      Fields: Array.isArray(RecordValue.Fields) ? RecordValue.Fields.filter((Field): Field is Record<string, unknown> => typeof Field === "object" && Field !== null && !Array.isArray(Field)).map((Field) => ({
        Name: typeof Field.Name === "string" ? Field.Name : "",
        Value: typeof Field.Value === "string" ? Field.Value : "",
        Inline: Boolean(Field.Inline)
      })) : Fallback.Fields
    };
  }

  private ApplyTemplate(Template: string, Member: GuildMember | PartialGuildMember): string {
    return Template
      .replaceAll("%user%", Member.user.tag)
      .replaceAll("%mention%", `<@${Member.user.id}>`)
      .replaceAll("%avatar%", Member.user.displayAvatarURL())
      .replaceAll("%server%", Member.guild.name)
      .replaceAll("%memberCount%", String(Member.guild.memberCount ?? "?"))
      .replaceAll("%id%", Member.user.id);
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

  private ParseColor(ColorValue: string): number {
    return Number.parseInt(this.SanitizeColor(ColorValue, "#2563eb").replace("#", ""), 16);
  }

  private HexToRgb(ColorValue: string): PngColor {
    const SafeColor = this.SanitizeColor(ColorValue, "#020617").replace("#", "");
    return {
      Red: Number.parseInt(SafeColor.slice(0, 2), 16),
      Green: Number.parseInt(SafeColor.slice(2, 4), 16),
      Blue: Number.parseInt(SafeColor.slice(4, 6), 16),
      Alpha: 255
    };
  }

  private SanitizeColor(ColorValue: string, Fallback: string): string {
    return /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : Fallback;
  }

  private BuildInitials(Username: string): string {
    const CleanUsername = Username.replace(/[^a-z0-9]/giu, "").toUpperCase();
    return (CleanUsername.slice(0, 2) || "HB").padEnd(2, " ");
  }
}

type PngColor = {
  Red: number;
  Green: number;
  Blue: number;
  Alpha: number;
};

type PngTextBlock = {
  Color: string;
  FontSize: number;
  FontWeight: number;
  LineHeight: number;
  Lines: string[];
  X: number;
  Y: number;
};

class PngCanvas {
  private readonly Width: number;
  private readonly Height: number;
  private readonly Pixels: Buffer;

  public constructor(Width: number, Height: number, Background: PngColor) {
    this.Width = Width;
    this.Height = Height;
    this.Pixels = Buffer.alloc(Width * Height * 4);
    this.FillRect(0, 0, Width, Height, Background);
  }

  public FillGradient(TopColor: PngColor, BottomColor: PngColor): void {
    for (let Y = 0; Y < this.Height; Y += 1) {
      const Ratio = Y / Math.max(1, this.Height - 1);
      const Color = {
        Red: Math.round(TopColor.Red * (1 - Ratio) + BottomColor.Red * Ratio),
        Green: Math.round(TopColor.Green * (1 - Ratio) + BottomColor.Green * Ratio),
        Blue: Math.round(TopColor.Blue * (1 - Ratio) + BottomColor.Blue * Ratio),
        Alpha: 255
      };
      this.FillRect(0, Y, this.Width, 1, Color);
    }
  }

  public FillRect(X: number, Y: number, Width: number, Height: number, Color: PngColor): void {
    for (let DrawY = Math.max(0, Y); DrawY < Math.min(this.Height, Y + Height); DrawY += 1) {
      for (let DrawX = Math.max(0, X); DrawX < Math.min(this.Width, X + Width); DrawX += 1) {
        this.SetPixel(DrawX, DrawY, Color);
      }
    }
  }

  public FillRoundedRect(X: number, Y: number, Width: number, Height: number, Radius: number, Color: PngColor): void {
    for (let DrawY = Y; DrawY < Y + Height; DrawY += 1) {
      for (let DrawX = X; DrawX < X + Width; DrawX += 1) {
        const CornerX = DrawX < X + Radius ? X + Radius : DrawX >= X + Width - Radius ? X + Width - Radius - 1 : DrawX;
        const CornerY = DrawY < Y + Radius ? Y + Radius : DrawY >= Y + Height - Radius ? Y + Height - Radius - 1 : DrawY;
        const Distance = Math.hypot(DrawX - CornerX, DrawY - CornerY);

        if (Distance <= Radius) {
          this.SetPixel(DrawX, DrawY, Color);
        }
      }
    }
  }

  public StrokeRoundedRect(X: number, Y: number, Width: number, Height: number, Radius: number, Color: PngColor, Thickness: number): void {
    this.FillRoundedRect(X, Y, Width, Height, Radius, Color);
    this.FillRoundedRect(X + Thickness, Y + Thickness, Width - Thickness * 2, Height - Thickness * 2, Math.max(0, Radius - Thickness), { Red: 2, Green: 6, Blue: 23, Alpha: 180 });
  }

  public FillCircle(CenterX: number, CenterY: number, Radius: number, Color: PngColor): void {
    for (let Y = CenterY - Radius; Y <= CenterY + Radius; Y += 1) {
      for (let X = CenterX - Radius; X <= CenterX + Radius; X += 1) {
        if (Math.hypot(X - CenterX, Y - CenterY) <= Radius) {
          this.SetPixel(X, Y, Color);
        }
      }
    }
  }

  public StrokeCircle(CenterX: number, CenterY: number, Radius: number, Color: PngColor, Thickness: number): void {
    for (let Y = CenterY - Radius - Thickness; Y <= CenterY + Radius + Thickness; Y += 1) {
      for (let X = CenterX - Radius - Thickness; X <= CenterX + Radius + Thickness; X += 1) {
        const Distance = Math.hypot(X - CenterX, Y - CenterY);

        if (Distance >= Radius - Thickness / 2 && Distance <= Radius + Thickness / 2) {
          this.SetPixel(X, Y, Color);
        }
      }
    }
  }

  public ToPng(): Buffer {
    const Scanlines = Buffer.alloc((this.Width * 4 + 1) * this.Height);

    for (let Y = 0; Y < this.Height; Y += 1) {
      const ScanlineOffset = Y * (this.Width * 4 + 1);
      Scanlines[ScanlineOffset] = 0;
      this.Pixels.copy(Scanlines, ScanlineOffset + 1, Y * this.Width * 4, (Y + 1) * this.Width * 4);
    }

    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      this.BuildChunk("IHDR", this.BuildIhdr()),
      this.BuildChunk("IDAT", deflateSync(Scanlines)),
      this.BuildChunk("IEND", Buffer.alloc(0))
    ]);
  }

  private SetPixel(X: number, Y: number, Color: PngColor): void {
    if (X < 0 || Y < 0 || X >= this.Width || Y >= this.Height) {
      return;
    }

    const Offset = (Y * this.Width + X) * 4;
    const Alpha = Color.Alpha / 255;
    const InverseAlpha = 1 - Alpha;

    this.Pixels[Offset] = Math.round(Color.Red * Alpha + this.Pixels[Offset] * InverseAlpha);
    this.Pixels[Offset + 1] = Math.round(Color.Green * Alpha + this.Pixels[Offset + 1] * InverseAlpha);
    this.Pixels[Offset + 2] = Math.round(Color.Blue * Alpha + this.Pixels[Offset + 2] * InverseAlpha);
    this.Pixels[Offset + 3] = 255;
  }

  private BuildIhdr(): Buffer {
    const BufferValue = Buffer.alloc(13);
    BufferValue.writeUInt32BE(this.Width, 0);
    BufferValue.writeUInt32BE(this.Height, 4);
    BufferValue[8] = 8;
    BufferValue[9] = 6;
    BufferValue[10] = 0;
    BufferValue[11] = 0;
    BufferValue[12] = 0;
    return BufferValue;
  }

  private BuildChunk(Type: string, Data: Buffer): Buffer {
    const TypeBuffer = Buffer.from(Type, "ascii");
    const LengthBuffer = Buffer.alloc(4);
    const CrcBuffer = Buffer.alloc(4);
    LengthBuffer.writeUInt32BE(Data.length, 0);
    CrcBuffer.writeUInt32BE(this.Crc32(Buffer.concat([TypeBuffer, Data])), 0);
    return Buffer.concat([LengthBuffer, TypeBuffer, Data, CrcBuffer]);
  }

  private Crc32(BufferValue: Buffer): number {
    let Crc = 0xffffffff;

    for (const Byte of BufferValue) {
      Crc ^= Byte;

      for (let Bit = 0; Bit < 8; Bit += 1) {
        Crc = (Crc >>> 1) ^ (0xedb88320 & -(Crc & 1));
      }
    }

    return (Crc ^ 0xffffffff) >>> 0;
  }
}
