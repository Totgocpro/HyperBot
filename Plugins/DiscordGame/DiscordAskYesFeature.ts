import { AttachmentBuilder, EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { PluginStorageContract } from "../../src/Core/Types.js";
import { DiscordAskYesRenderer, type AskYesMentionHighlight } from "./DiscordAskYesRenderer.js";

type AskYesConfig = {
  AskYesTitle: string;
  AskYesDescription: string;
  AskYesImageTitle: string;
  AskYesYesLabel: string;
  AskYesNoLabel: string;
  AskYesYesColor: string;
  AskYesNoColor: string;
};

const DefaultAskYesConfig: AskYesConfig = {
  AskYesTitle: "Ask Yes",
  AskYesDescription: "**Question:** %question%\n**Answer:** %answer%",
  AskYesImageTitle: "The answer is...",
  AskYesYesLabel: "YES",
  AskYesNoLabel: "NO",
  AskYesYesColor: "#22c55e",
  AskYesNoColor: "#ef4444"
};

export class DiscordAskYesFeature {
  private readonly Renderer = new DiscordAskYesRenderer();

  public constructor(private readonly Storage: PluginStorageContract) {}

  public async HandleAskYesCommand(InteractionValue: ChatInputCommandInteraction): Promise<void> {
    if (!InteractionValue.guildId) {
      await InteractionValue.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    const Question = InteractionValue.options.getString("question", true).trim();

    if (!Question) {
      await InteractionValue.reply({ content: "Question is required.", ephemeral: true });
      return;
    }

    const Config = await this.GetAskYesConfig(InteractionValue.guildId);
    const Answer: "YES" | "NO" = Math.random() >= 0.5 ? "YES" : "NO";
    const AnswerLabel = Answer === "YES" ? Config.AskYesYesLabel : Config.AskYesNoLabel;
    const Color = Answer === "YES" ? Config.AskYesYesColor : Config.AskYesNoColor;
    const AttachmentName = `askyes-${InteractionValue.id}.png`;
    const MentionHighlights = await this.ResolveQuestionMentionHighlights(InteractionValue, Question);
    const Attachment = new AttachmentBuilder(
      this.Renderer.BuildAskYesImage({
        AccentColor: Color,
        Answer,
        MentionHighlights,
        NoLabel: Config.AskYesNoLabel,
        Question,
        Title: Config.AskYesImageTitle,
        YesLabel: Config.AskYesYesLabel
      }),
      { name: AttachmentName }
    );

    await InteractionValue.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(Config.AskYesTitle)
          .setDescription(this.ApplyAskYesTemplate(Config.AskYesDescription, Question, AnswerLabel))
          .setColor(this.ParseColor(Color))
          .setImage(`attachment://${AttachmentName}`)
          .setTimestamp(new Date())
      ],
      files: [Attachment]
    });
  }

  private async GetAskYesConfig(GuildId: string): Promise<AskYesConfig> {
    return {
      AskYesTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "AskYesTitle")) ?? DefaultAskYesConfig.AskYesTitle,
      AskYesDescription: (await this.Storage.GetGlobalConfig<string>(GuildId, "AskYesDescription")) ?? DefaultAskYesConfig.AskYesDescription,
      AskYesImageTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "AskYesImageTitle")) ?? DefaultAskYesConfig.AskYesImageTitle,
      AskYesYesLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "AskYesYesLabel")) ?? DefaultAskYesConfig.AskYesYesLabel,
      AskYesNoLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "AskYesNoLabel")) ?? DefaultAskYesConfig.AskYesNoLabel,
      AskYesYesColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "AskYesYesColor")) ?? DefaultAskYesConfig.AskYesYesColor,
      AskYesNoColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "AskYesNoColor")) ?? DefaultAskYesConfig.AskYesNoColor
    };
  }

  private ApplyAskYesTemplate(Template: string, Question: string, Answer: string): string {
    return Template
      .replaceAll("%question%", Question)
      .replaceAll("%answer%", Answer);
  }

  private async ResolveQuestionMentionHighlights(InteractionValue: ChatInputCommandInteraction, Question: string): Promise<AskYesMentionHighlight[]> {
    const UserIds = Array.from(new Set([...Question.matchAll(/<@!?(\d{17,20})>/gu)].map((Match) => Match[1])));

    if (UserIds.length === 0) {
      return [];
    }

    const Highlights = await Promise.all(
      UserIds.map(async (UserId): Promise<AskYesMentionHighlight | null> => {
        let Username = InteractionValue.guild?.members.cache.get(UserId)?.user.username
          ?? InteractionValue.client.users.cache.get(UserId)?.username;

        if (!Username && InteractionValue.guild) {
          const Member = await InteractionValue.guild.members.fetch(UserId).catch(() => null);
          Username = Member?.user.username;
        }

        if (!Username) {
          const User = await InteractionValue.client.users.fetch(UserId).catch(() => null);
          Username = User?.username;
        }

        return Username ? { UserId, Username } : null;
      })
    );

    return Highlights.filter((Highlight): Highlight is AskYesMentionHighlight => Highlight !== null);
  }

  private ParseColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : DefaultAskYesConfig.AskYesYesColor;
    return Number.parseInt(SafeColor.replace("#", ""), 16);
  }
}
