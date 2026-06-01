import { PermissionFlagsBits, type Guild } from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";
import { RedisClient } from "../../src/Core/Clients.js";
import { GetGuildEmojiLimits } from "../../src/Core/DiscordLimits.js";
import type { BotEmojiLimitSummary, BotEmojiSummary } from "../../src/Core/Types.js";

type AddEmojiPayload = {
  Emojis?: unknown;
};

type DeleteEmojiPayload = {
  EmojiId?: unknown;
  Name?: unknown;
};

type EmojiUpload = {
  DataUrl: string;
  Name: string;
};

export default class EmojiAdderPlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.Logger.Info("Emoji Adder plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Emoji Adder plugin disabled.");
  }

  public async OnDashboardAction(GuildId: string, ActionKey: string, ActorId: string, Payload?: unknown): Promise<void> {
    if (ActionKey === "AddEmojis") {
      await this.AddEmojis(GuildId, ActorId, Payload);
      return;
    }

    if (ActionKey === "DeleteEmoji") {
      await this.DeleteEmoji(GuildId, ActorId, Payload);
    }
  }

  private async AddEmojis(GuildId: string, ActorId: string, Payload?: unknown): Promise<void> {
    const GuildValue = await this.DiscordClient.guilds.fetch(GuildId).catch(() => null);

    if (!GuildValue) {
      throw new Error(`Emoji add failed: guild ${GuildId} is not available.`);
    }

    if (!this.CanManageEmojis(GuildValue)) {
      throw new Error(`Emoji add failed: bot cannot manage emojis in guild ${GuildId}.`);
    }

    const Emojis = this.ParsePayload(Payload);

    if (Emojis.length === 0) {
      this.Logger.Warn("Emoji add action ignored because payload contains no emojis.", { GuildId, ActorId });
      return;
    }

    await GuildValue.emojis.fetch().catch(() => null);
    const EmojiLimits = GetGuildEmojiLimits(GuildValue.premiumTier);
    const CurrentAnimated = GuildValue.emojis.cache.filter((Emoji) => Emoji.animated === true).size;
    const CurrentStatic = GuildValue.emojis.cache.size - CurrentAnimated;
    let AvailableAnimatedSlots = Math.max(0, EmojiLimits.MaxAnimatedEmojis - CurrentAnimated);
    let AvailableStaticSlots = Math.max(0, EmojiLimits.MaxStaticEmojis - CurrentStatic);

    if (AvailableAnimatedSlots <= 0 && AvailableStaticSlots <= 0) {
      this.Logger.Warn("Emoji add action ignored because the guild emoji limit is reached.", {
        GuildId,
        ActorId,
        CurrentAnimated,
        CurrentStatic,
        MaxAnimatedEmojis: EmojiLimits.MaxAnimatedEmojis,
        MaxStaticEmojis: EmojiLimits.MaxStaticEmojis,
        PremiumTier: EmojiLimits.PremiumTier
      });
      return;
    }

    const EmojisToAdd: EmojiUpload[] = [];

    for (const EmojiValue of Emojis.slice(0, 50)) {
      const ParsedDataUrl = this.ParseDataUrl(EmojiValue.DataUrl);

      if (!ParsedDataUrl) {
        EmojisToAdd.push(EmojiValue);
        continue;
      }

      if (this.IsAnimatedMime(ParsedDataUrl.Mime)) {
        if (AvailableAnimatedSlots <= 0) {
          continue;
        }

        AvailableAnimatedSlots -= 1;
      } else {
        if (AvailableStaticSlots <= 0) {
          continue;
        }

        AvailableStaticSlots -= 1;
      }

      EmojisToAdd.push(EmojiValue);
    }

    if (EmojisToAdd.length < Emojis.length) {
      this.Logger.Warn("Emoji add action trimmed to remaining Discord emoji slots.", {
        GuildId,
        ActorId,
        Requested: Emojis.length,
        Accepted: EmojisToAdd.length,
        RemainingAnimatedSlots: Math.max(0, EmojiLimits.MaxAnimatedEmojis - CurrentAnimated),
        RemainingStaticSlots: Math.max(0, EmojiLimits.MaxStaticEmojis - CurrentStatic)
      });
    }

    const Results: Array<{ Name: string; Status: "Added" | "Failed"; Error?: string }> = [];

    for (const EmojiValue of EmojisToAdd) {
      try {
        const ParsedDataUrl = this.ParseDataUrl(EmojiValue.DataUrl);

        if (!ParsedDataUrl) {
          throw new Error("Invalid image data.");
        }

        await GuildValue.emojis.create({
          attachment: ParsedDataUrl.Buffer,
          name: this.NormalizeEmojiName(EmojiValue.Name),
          reason: `Emoji added by ${ActorId} from HyperBot dashboard.`
        });
        Results.push({ Name: EmojiValue.Name, Status: "Added" });
      } catch (ErrorValue) {
        Results.push({
          Name: EmojiValue.Name,
          Status: "Failed",
          Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue)
        });
      }
    }

    await this.CacheEmojiState(GuildValue);
    this.Logger.Info("Emoji add action completed.", { GuildId, ActorId, Results });
  }

  private async DeleteEmoji(GuildId: string, ActorId: string, Payload?: unknown): Promise<void> {
    const GuildValue = await this.DiscordClient.guilds.fetch(GuildId).catch(() => null);

    if (!GuildValue) {
      throw new Error(`Emoji delete failed: guild ${GuildId} is not available.`);
    }

    if (!this.CanManageEmojis(GuildValue)) {
      throw new Error(`Emoji delete failed: bot cannot manage emojis in guild ${GuildId}.`);
    }

    const EmojiId = this.ParseDeleteEmojiId(Payload);

    if (!EmojiId) {
      this.Logger.Warn("Emoji delete action ignored because payload is missing an emoji id.", { GuildId, ActorId });
      return;
    }

    await GuildValue.emojis.fetch().catch(() => null);
    const EmojiValue = GuildValue.emojis.cache.get(EmojiId);

    if (!EmojiValue) {
      this.Logger.Warn("Emoji delete action ignored because emoji does not exist.", { GuildId, ActorId, EmojiId });
      await this.CacheEmojiState(GuildValue);
      return;
    }

    await EmojiValue.delete(`Emoji deleted by ${ActorId} from HyperBot dashboard.`);
    await GuildValue.emojis.fetch().catch(() => null);
    await this.CacheEmojiState(GuildValue);
    this.Logger.Info("Emoji delete action completed.", { GuildId, ActorId, EmojiId, Name: EmojiValue.name });
  }

  private CanManageEmojis(GuildValue: Guild): boolean {
    return GuildValue.members.me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions) ?? false;
  }

  private ParsePayload(Payload: unknown): EmojiUpload[] {
    if (!this.IsRecord(Payload)) {
      return [];
    }

    const Body = Payload as AddEmojiPayload;

    if (!Array.isArray(Body.Emojis)) {
      return [];
    }

    return Body.Emojis
      .filter(this.IsRecord)
      .map((Value) => ({
        DataUrl: typeof Value.DataUrl === "string" ? Value.DataUrl : "",
        Name: typeof Value.Name === "string" ? Value.Name : ""
      }))
      .filter((Value) => Value.DataUrl && Value.Name);
  }

  private ParseDeleteEmojiId(Payload: unknown): string | null {
    if (!this.IsRecord(Payload)) {
      return null;
    }

    const Body = Payload as DeleteEmojiPayload;
    return typeof Body.EmojiId === "string" && Body.EmojiId.length > 0 ? Body.EmojiId : null;
  }

  private ParseDataUrl(Value: string): { Buffer: Buffer; Mime: string } | null {
    const Match = /^data:(image\/(?:gif|png|jpeg|webp));base64,([a-z0-9+/=]+)$/iu.exec(Value);

    if (!Match) {
      return null;
    }

    return {
      Buffer: Buffer.from(Match[2], "base64"),
      Mime: Match[1]
    };
  }

  private NormalizeEmojiName(Value: string): string {
    const NormalizedValue = Value.trim().replace(/[^a-z0-9_]/giu, "_").replace(/_+/gu, "_").replace(/^_|_$/gu, "");
    return (NormalizedValue || "emoji").slice(0, 32);
  }

  private IsAnimatedMime(Value: string): boolean {
    return Value.toLowerCase() === "image/gif";
  }

  private async CacheEmojiState(GuildValue: Guild): Promise<void> {
    const Emojis = GuildValue.emojis.cache
      .sort((FirstEmoji, SecondEmoji) => (FirstEmoji.name ?? "").localeCompare(SecondEmoji.name ?? ""))
      .map<BotEmojiSummary>((Emoji) => ({
        Id: Emoji.id,
        Name: Emoji.name ?? Emoji.id,
        Animated: Emoji.animated ?? false
      }));
    const EmojiLimits: BotEmojiLimitSummary = GetGuildEmojiLimits(GuildValue.premiumTier);

    await RedisClient.set(`Bot:${this.BotId}:Guild:${GuildValue.id}:Emojis`, JSON.stringify(Emojis), "EX", 30);
    await RedisClient.set(`Bot:${this.BotId}:Guild:${GuildValue.id}:EmojiLimits`, JSON.stringify(EmojiLimits), "EX", 30);
  }

  private IsRecord(Value: unknown): Value is Record<string, unknown> {
    return typeof Value === "object" && Value !== null && !Array.isArray(Value);
  }
}
