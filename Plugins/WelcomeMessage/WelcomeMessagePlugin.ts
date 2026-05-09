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
import { createCanvas } from "@napi-rs/canvas";
import { randomBytes } from "node:crypto";
import { BasePlugin } from "../../src/Core/BasePlugin.js";
import { WelcomeImageRenderer, type ImageAvatarStyle, type ImageFitMode } from "./WelcomeImageRenderer.js";

type MessageMode = "Embed" | "Image";
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
  private readonly ImageRenderer = new WelcomeImageRenderer(this.Logger);

  public async OnEnable(): Promise<void> {
    this.ImageRenderer.WarnIfCanvasFontsAreMissing();
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
      if (!Config.CaptchaChannelId) {
        throw new Error(`Welcome captcha panel action failed for guild ${GuildId}: CaptchaChannelId is not configured.`);
      }

      await this.SendCaptchaMessage(Member, Config, false);
      return;
    }

    if (ActionKey === "TestWelcome") {
      if (!Config.WelcomeChannelId) {
        throw new Error(`Welcome test action failed for guild ${GuildId}: WelcomeChannelId is not configured.`);
      }

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

    if (!Config.LeaveChannelId) {
      throw new Error(`Leave test action failed for guild ${GuildId}: LeaveChannelId is not configured.`);
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
      throw new Error(`Captcha panel action failed for guild ${Member.guild.id}: channel ${Config.CaptchaChannelId} is missing or is not writable.`);
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
      throw new Error(`${Options.Type} message action failed for guild ${Options.Member.guild.id}: channel ${Options.ChannelId} is missing or is not writable.`);
    }

    const Title = this.ApplyTemplate(Options.Title, Options.Member);
    const Description = this.ApplyTemplate(Options.Message, Options.Member);
    const Content = Options.Config.PingUser ? `<@${Options.Member.user.id}>` : undefined;

    if (Options.Mode === "Image") {
      const Png = await this.ImageRenderer.BuildWelcomePng({
        AccentColor: Options.Config.ImageAccent || Options.Color,
        BackgroundColor: Options.Config.ImageBackground,
        BackgroundFit: Options.Config.ImageBackgroundFit,
        BackgroundImageSource: this.ImageRenderer.ResolveImageBackgroundSource(Options.Config, Options.Type),
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

  private ClampNumber(Value: number, Minimum: number, Maximum: number, Fallback: number): number {
    return Number.isFinite(Value) ? Math.min(Maximum, Math.max(Minimum, Number(Value))) : Fallback;
  }

  private SanitizeColor(ColorValue: string, Fallback: string): string {
    return /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : Fallback;
  }
}
