import { AttachmentBuilder, type ChatInputCommandInteraction } from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type CatConfig = {
  MaxTextLength: number;
  MaxCategoryLength: number;
  RequestTimeoutMs: number;
  ErrorMessage: string;
};

const DefaultConfig: CatConfig = {
  MaxTextLength: 80,
  MaxCategoryLength: 60,
  RequestTimeoutMs: 15_000,
  ErrorMessage: "Impossible de recuperer une image de chat pour le moment."
};

const CataasBaseUrl = "https://cataas.com";
const AllowedContentTypes = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"]
]);

export default class CatPlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.Logger.Info("Cat plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Cat plugin disabled.");
  }

  public async OnSlashCommand(CommandName: string, InteractionValue: ChatInputCommandInteraction): Promise<void> {
    if (CommandName !== "cat") {
      await super.OnSlashCommand(CommandName, InteractionValue);
      return;
    }

    if (!InteractionValue.guildId) {
      await InteractionValue.reply({ content: "Cette commande ne peut etre utilisee que dans un serveur.", ephemeral: true });
      return;
    }

    const Config = await this.GetConfig(InteractionValue.guildId);
    const TextValue = InteractionValue.options.getString("texte")?.trim() ?? "";
    const CategoryValue = InteractionValue.options.getString("categorie")?.trim() ?? "";
    const MaxTextLength = this.Clamp(Config.MaxTextLength, 0, 300);
    const MaxCategoryLength = this.Clamp(Config.MaxCategoryLength, 0, 120);

    if (TextValue.length > MaxTextLength || CategoryValue.length > MaxCategoryLength || !this.IsValidCategory(CategoryValue)) {
      await InteractionValue.reply({ content: Config.ErrorMessage, ephemeral: true });
      return;
    }

    await InteractionValue.deferReply();

    try {
      const CatResponse = await this.FetchCatImage(this.BuildCatUrl(CategoryValue, TextValue), Config.RequestTimeoutMs);
      const Attachment = new AttachmentBuilder(CatResponse.BufferValue, { name: `cat.${CatResponse.Extension}` });

      await InteractionValue.editReply({
        files: [Attachment],
        allowedMentions: { parse: [] }
      });
    } catch (ErrorValue) {
      this.Logger.Warn("Failed to fetch a CATAAS image.", ErrorValue);
      await InteractionValue.editReply({ content: Config.ErrorMessage });
    }
  }

  private BuildCatUrl(Category: string, Text: string): string {
    const UrlParts = [CataasBaseUrl, "cat"];
    const EncodedCategory = this.EncodeCategory(Category);

    if (EncodedCategory) {
      UrlParts.push(EncodedCategory);
    }

    if (Text) {
      UrlParts.push("says", encodeURIComponent(Text));
    }

    return UrlParts.join("/");
  }

  private async FetchCatImage(UrlValue: string, TimeoutMs: number): Promise<{ BufferValue: Buffer; Extension: string }> {
    const SafeTimeoutMs = this.Clamp(TimeoutMs, 1_000, 30_000);
    const ResponseValue = await fetch(UrlValue, {
      headers: {
        Accept: "image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8"
      },
      signal: AbortSignal.timeout(SafeTimeoutMs)
    });

    if (!ResponseValue.ok) {
      throw new Error(`CATAAS returned ${ResponseValue.status}.`);
    }

    const ContentType = ResponseValue.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    const Extension = AllowedContentTypes.get(ContentType);

    if (!Extension) {
      throw new Error(`CATAAS returned an unsupported content type: ${ContentType || "unknown"}.`);
    }

    return {
      BufferValue: Buffer.from(await ResponseValue.arrayBuffer()),
      Extension
    };
  }

  private EncodeCategory(Category: string): string {
    return Category
      .split(",")
      .map((Part) => Part.trim())
      .filter(Boolean)
      .map((Part) => encodeURIComponent(Part))
      .join(",");
  }

  private IsValidCategory(Category: string): boolean {
    return !Category || /^[a-z0-9_, -]+$/iu.test(Category);
  }

  private async GetConfig(GuildId: string): Promise<CatConfig> {
    return {
      MaxTextLength: await this.GetNumberConfig(GuildId, "MaxTextLength"),
      MaxCategoryLength: await this.GetNumberConfig(GuildId, "MaxCategoryLength"),
      RequestTimeoutMs: await this.GetNumberConfig(GuildId, "RequestTimeoutMs"),
      ErrorMessage: await this.GetStringConfig(GuildId, "ErrorMessage")
    };
  }

  private async GetStringConfig(GuildId: string, Key: keyof CatConfig): Promise<string> {
    const Value = await this.Storage.GetGlobalConfig<string>(GuildId, Key);
    return Value ?? String(DefaultConfig[Key]);
  }

  private async GetNumberConfig(GuildId: string, Key: keyof CatConfig): Promise<number> {
    const Value = await this.Storage.GetGlobalConfig<number>(GuildId, Key);
    const DefaultValue = Number(DefaultConfig[Key]);
    return typeof Value === "number" && Number.isFinite(Value) ? Value : DefaultValue;
  }

  private Clamp(Value: number, Min: number, Max: number): number {
    return Math.min(Max, Math.max(Min, Math.trunc(Value)));
  }
}
