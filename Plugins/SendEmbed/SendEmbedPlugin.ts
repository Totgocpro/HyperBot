import {
  ChannelType,
  EmbedBuilder,
  type GuildBasedChannel,
  type NewsChannel,
  type TextChannel,
  type VoiceChannel
} from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type SendEmbedPayload = {
  ChannelId?: string;
  Embed?: EditableEmbed;
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
  Fields?: EditableEmbedField[];
  ImageDataUrl?: string;
  ImageName?: string;
};

type EditableEmbedField = {
  Name: string;
  Value: string;
  Inline: boolean;
};

export default class SendEmbedPlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.Logger.Info("Send Embed plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Send Embed plugin disabled.");
  }

  public async OnDashboardAction(GuildId: string, ActionKey: string, ActorId: string, Payload?: unknown): Promise<void> {
    if (ActionKey !== "SendEmbed") {
      return;
    }

    const ParsedPayload = this.ParsePayload(Payload);

    if (!ParsedPayload?.ChannelId || !ParsedPayload.Embed) {
      this.Logger.Warn("Send embed action ignored because payload is incomplete.", { GuildId, ActorId });
      return;
    }

    const Channel = await this.ResolveWritableChannel(GuildId, ParsedPayload.ChannelId);

    if (!Channel) {
      this.Logger.Warn("Send embed channel is missing or not writable.", { GuildId, ChannelId: ParsedPayload.ChannelId, ActorId });
      return;
    }

    const BuiltEmbed = this.BuildEmbed(ParsedPayload.Embed);
    await Channel.send({ embeds: [BuiltEmbed.Embed], files: BuiltEmbed.Files });
  }

  private ParsePayload(Payload: unknown): SendEmbedPayload | null {
    if (!this.IsRecord(Payload)) {
      return null;
    }

    return {
      ChannelId: typeof Payload.ChannelId === "string" ? Payload.ChannelId : undefined,
      Embed: this.IsRecord(Payload.Embed) ? this.ParseEmbed(Payload.Embed) : undefined
    };
  }

  private ParseEmbed(Value: Record<string, unknown>): EditableEmbed {
    const Fields = Array.isArray(Value.Fields)
      ? Value.Fields.filter(this.IsRecord).map((Field) => ({
          Name: typeof Field.Name === "string" ? Field.Name : "",
          Value: typeof Field.Value === "string" ? Field.Value : "",
          Inline: Boolean(Field.Inline)
        }))
      : [];

    return {
      Title: this.GetString(Value.Title),
      Description: this.GetString(Value.Description),
      Color: this.GetString(Value.Color),
      Url: this.GetString(Value.Url),
      AuthorName: this.GetString(Value.AuthorName),
      AuthorIconUrl: this.GetString(Value.AuthorIconUrl),
      ThumbnailUrl: this.GetString(Value.ThumbnailUrl),
      ImageUrl: this.GetString(Value.ImageUrl),
      FooterText: this.GetString(Value.FooterText),
      FooterIconUrl: this.GetString(Value.FooterIconUrl),
      Timestamp: Boolean(Value.Timestamp),
      Fields,
      ImageDataUrl: this.GetString(Value.ImageDataUrl),
      ImageName: this.GetString(Value.ImageName)
    };
  }

  private BuildEmbed(Value: EditableEmbed): { Embed: EmbedBuilder; Files: Array<{ attachment: Buffer; name: string }> } {
    const Embed = new EmbedBuilder();
    const Files: Array<{ attachment: Buffer; name: string }> = [];
    const Color = this.ParseColor(Value.Color ?? "#5865f2");

    Embed.setColor(Color);

    if (Value.Title?.trim()) {
      Embed.setTitle(Value.Title.slice(0, 256));
    }

    if (Value.Description?.trim()) {
      Embed.setDescription(Value.Description.slice(0, 4096));
    }

    if (Value.Url?.trim()) {
      Embed.setURL(Value.Url);
    }

    if (Value.AuthorName?.trim()) {
      Embed.setAuthor({
        name: Value.AuthorName.slice(0, 256),
        iconURL: Value.AuthorIconUrl?.trim() || undefined
      });
    }

    if (Value.ThumbnailUrl?.trim()) {
      Embed.setThumbnail(Value.ThumbnailUrl);
    }

    const UploadedImage = this.ParseDataImage(Value.ImageDataUrl, Value.ImageName || "embed-image.png");

    if (UploadedImage) {
      Files.push(UploadedImage);
      Embed.setImage(`attachment://${UploadedImage.name}`);
    } else if (Value.ImageUrl?.trim()) {
      Embed.setImage(Value.ImageUrl);
    }

    if (Value.FooterText?.trim()) {
      Embed.setFooter({
        text: Value.FooterText.slice(0, 2048),
        iconURL: Value.FooterIconUrl?.trim() || undefined
      });
    }

    if (Value.Timestamp) {
      Embed.setTimestamp(new Date());
    }

    for (const Field of Value.Fields ?? []) {
      if (!Field.Name.trim() || !Field.Value.trim()) {
        continue;
      }

      Embed.addFields({
        name: Field.Name.slice(0, 256),
        value: Field.Value.slice(0, 1024),
        inline: Field.Inline
      });
    }

    return { Embed, Files };
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

    if (!Channel) {
      return null;
    }

    if (Channel.type === ChannelType.GuildText || Channel.type === ChannelType.GuildAnnouncement || Channel.type === ChannelType.GuildVoice) {
      return Channel as TextChannel | NewsChannel | VoiceChannel;
    }

    return null;
  }

  private ParseColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : "#5865f2";
    return Number.parseInt(SafeColor.replace("#", ""), 16);
  }

  private GetString(Value: unknown): string | undefined {
    return typeof Value === "string" ? Value : undefined;
  }

  private IsRecord(Value: unknown): Value is Record<string, unknown> {
    return typeof Value === "object" && Value !== null && !Array.isArray(Value);
  }
}
