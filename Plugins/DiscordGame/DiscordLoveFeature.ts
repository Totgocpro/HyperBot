import { AttachmentBuilder, EmbedBuilder, type ChatInputCommandInteraction, type User } from "discord.js";
import type { PluginLoggerContract, PluginStorageContract } from "../../src/Core/Types.js";
import { DiscordLoveRenderer } from "./DiscordLoveRenderer.js";

type LoveConfig = {
  LoveTitle: string;
  LoveDescription: string;
  LoveImageTitle: string;
  LoveProgressLabel: string;
  LoveLowMessages: string[];
  LoveMediumMessages: string[];
  LoveHighMessages: string[];
  LovePerfectMessages: string[];
  LoveLowColor: string;
  LoveMediumColor: string;
  LoveHighColor: string;
  LovePerfectColor: string;
};

const DefaultLoveConfig: LoveConfig = {
  LoveTitle: "%name1% + %name2%",
  LoveDescription: "Love compatibility result: **%percent%**.",
  LoveImageTitle: "Love meter",
  LoveProgressLabel: "Compatibility",
  LoveLowMessages: [
    "%user1% and %user2% are better as chaotic friends.",
    "%user1% and %user2% need a little more magic."
  ],
  LoveMediumMessages: [
    "%user1% and %user2% have a real spark.",
    "%user1% and %user2% could become something interesting."
  ],
  LoveHighMessages: [
    "%user1% and %user2% are dangerously compatible.",
    "%user1% and %user2% have serious main-character energy."
  ],
  LovePerfectMessages: [
    "%user1% and %user2% are a legendary match.",
    "%user1% and %user2% just broke the love meter."
  ],
  LoveLowColor: "#64748b",
  LoveMediumColor: "#f59e0b",
  LoveHighColor: "#ec4899",
  LovePerfectColor: "#f43f5e"
};

export class DiscordLoveFeature {
  private readonly Renderer: DiscordLoveRenderer;

  public constructor(
    private readonly Storage: PluginStorageContract,
    Logger: PluginLoggerContract
  ) {
    this.Renderer = new DiscordLoveRenderer(Logger);
  }

  public async HandleLoveCommand(InteractionValue: ChatInputCommandInteraction): Promise<void> {
    if (!InteractionValue.guildId) {
      await InteractionValue.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    const FirstUser = InteractionValue.options.getUser("first_member", true);
    const SecondUser = InteractionValue.options.getUser("second_member", true);
    const Config = await this.GetLoveConfig(InteractionValue.guildId);
    const Percent = Math.floor(Math.random() * 101);
    const Color = this.GetLoveColor(Percent, Config);
    const AttachmentName = `love-${FirstUser.id}-${SecondUser.id}.png`;
    const Attachment = new AttachmentBuilder(
      await this.Renderer.BuildLoveImage({
        AccentColor: Color,
        FirstUser,
        Percent,
        ProgressLabel: this.ApplyLoveTemplate(Config.LoveProgressLabel, FirstUser, SecondUser, Percent),
        SecondUser,
        Title: this.ApplyLoveTemplate(Config.LoveImageTitle, FirstUser, SecondUser, Percent)
      }),
      { name: AttachmentName }
    );
    const Message = this.GetLoveMessage(Percent, Config);

    await InteractionValue.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(this.ApplyLoveTemplate(Config.LoveTitle, FirstUser, SecondUser, Percent))
          .setDescription([
            this.ApplyLoveTemplate(Config.LoveDescription, FirstUser, SecondUser, Percent),
            this.ApplyLoveTemplate(Message, FirstUser, SecondUser, Percent)
          ].filter(Boolean).join("\n\n"))
          .setColor(this.ParseColor(Color))
          .setImage(`attachment://${AttachmentName}`)
          .setTimestamp(new Date())
      ],
      files: [Attachment]
    });
  }

  private async GetLoveConfig(GuildId: string): Promise<LoveConfig> {
    return {
      LoveTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "LoveTitle")) ?? DefaultLoveConfig.LoveTitle,
      LoveDescription: (await this.Storage.GetGlobalConfig<string>(GuildId, "LoveDescription")) ?? DefaultLoveConfig.LoveDescription,
      LoveImageTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "LoveImageTitle")) ?? DefaultLoveConfig.LoveImageTitle,
      LoveProgressLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "LoveProgressLabel")) ?? DefaultLoveConfig.LoveProgressLabel,
      LoveLowMessages: this.NormalizeMessages(await this.Storage.GetGlobalConfig<unknown>(GuildId, "LoveLowMessages"), DefaultLoveConfig.LoveLowMessages),
      LoveMediumMessages: this.NormalizeMessages(await this.Storage.GetGlobalConfig<unknown>(GuildId, "LoveMediumMessages"), DefaultLoveConfig.LoveMediumMessages),
      LoveHighMessages: this.NormalizeMessages(await this.Storage.GetGlobalConfig<unknown>(GuildId, "LoveHighMessages"), DefaultLoveConfig.LoveHighMessages),
      LovePerfectMessages: this.NormalizeMessages(await this.Storage.GetGlobalConfig<unknown>(GuildId, "LovePerfectMessages"), DefaultLoveConfig.LovePerfectMessages),
      LoveLowColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "LoveLowColor")) ?? DefaultLoveConfig.LoveLowColor,
      LoveMediumColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "LoveMediumColor")) ?? DefaultLoveConfig.LoveMediumColor,
      LoveHighColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "LoveHighColor")) ?? DefaultLoveConfig.LoveHighColor,
      LovePerfectColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "LovePerfectColor")) ?? DefaultLoveConfig.LovePerfectColor
    };
  }

  private ApplyLoveTemplate(Template: string, FirstUser: User, SecondUser: User, Percent: number): string {
    return Template
      .replaceAll("%user1%", `<@${FirstUser.id}>`)
      .replaceAll("%user2%", `<@${SecondUser.id}>`)
      .replaceAll("%tag1%", FirstUser.tag)
      .replaceAll("%tag2%", SecondUser.tag)
      .replaceAll("%name1%", FirstUser.username)
      .replaceAll("%name2%", SecondUser.username)
      .replaceAll("%percent%", `${Percent}%`);
  }

  private GetLoveMessage(Percent: number, Config: LoveConfig): string {
    if (Percent >= 95) {
      return this.PickRandomMessage(Config.LovePerfectMessages);
    }

    if (Percent >= 70) {
      return this.PickRandomMessage(Config.LoveHighMessages);
    }

    if (Percent >= 35) {
      return this.PickRandomMessage(Config.LoveMediumMessages);
    }

    return this.PickRandomMessage(Config.LoveLowMessages);
  }

  private NormalizeMessages(Value: unknown, Fallback: string[]): string[] {
    if (Array.isArray(Value)) {
      const Messages = Value.map((Item) => String(Item).trim()).filter(Boolean);
      return Messages.length > 0 ? Messages : Fallback;
    }

    if (typeof Value === "string" && Value.trim()) {
      return [Value.trim()];
    }

    return Fallback;
  }

  private PickRandomMessage(Messages: string[]): string {
    return Messages[Math.floor(Math.random() * Messages.length)] ?? Messages[0] ?? "";
  }

  private GetLoveColor(Percent: number, Config: LoveConfig): string {
    if (Percent >= 95) {
      return Config.LovePerfectColor;
    }

    if (Percent >= 70) {
      return Config.LoveHighColor;
    }

    if (Percent >= 35) {
      return Config.LoveMediumColor;
    }

    return Config.LoveLowColor;
  }

  private ParseColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : DefaultLoveConfig.LoveHighColor;
    return Number.parseInt(SafeColor.replace("#", ""), 16);
  }
}
