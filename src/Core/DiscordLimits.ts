export type GuildEmojiLimits = {
  MaxAnimatedEmojis: number;
  MaxStaticEmojis: number;
  PremiumTier: number;
};

export function GetGuildEmojiLimits(PremiumTier: number | string | null | undefined): GuildEmojiLimits {
  const Tier = Number(PremiumTier ?? 0);

  if (Tier >= 3) {
    return { MaxAnimatedEmojis: 250, MaxStaticEmojis: 250, PremiumTier: 3 };
  }

  if (Tier === 2) {
    return { MaxAnimatedEmojis: 150, MaxStaticEmojis: 150, PremiumTier: 2 };
  }

  if (Tier === 1) {
    return { MaxAnimatedEmojis: 100, MaxStaticEmojis: 100, PremiumTier: 1 };
  }

  return { MaxAnimatedEmojis: 50, MaxStaticEmojis: 50, PremiumTier: 0 };
}

export function NormalizeGuildEmojiLimits(Value: unknown): GuildEmojiLimits {
  if (typeof Value !== "object" || Value === null || Array.isArray(Value)) {
    return GetGuildEmojiLimits(0);
  }

  const RecordValue = Value as Record<string, unknown>;

  if (typeof RecordValue.MaxAnimatedEmojis === "number" && typeof RecordValue.MaxStaticEmojis === "number") {
    return {
      MaxAnimatedEmojis: RecordValue.MaxAnimatedEmojis,
      MaxStaticEmojis: RecordValue.MaxStaticEmojis,
      PremiumTier: typeof RecordValue.PremiumTier === "number" ? RecordValue.PremiumTier : GetGuildEmojiLimits(0).PremiumTier
    };
  }

  return GetGuildEmojiLimits(typeof RecordValue.PremiumTier === "number" || typeof RecordValue.PremiumTier === "string" ? RecordValue.PremiumTier : 0);
}
