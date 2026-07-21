import Path from "node:path";
import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { NormalizeGuildEmojiLimits, type GuildEmojiLimits } from "@/src/Core/DiscordLimits";
import { ScanAllPluginManifests } from "@/src/Core/PluginScanner";
import { IsPluginDisabled } from "@/src/Core/PluginState";
import { PluginScope, SettingsFieldType, type BotEmojiSummary, type DiscordGuildSummary } from "@/src/Core/Types";
import { CreateAccessControl, RequireDashboardUser } from "@/src/Web/Auth";

type RouteContext = {
  params: Promise<{ botId: string; guildId: string }>;
};

async function Post(Request: Request, Context: RouteContext): Promise<Response> {
  const { botId, guildId } = await Context.params;
  const User = await ResolveDashboardUser(Request);

  if (User instanceof Response) {
    return User;
  }

  const Body = (await Request.json()) as { PluginId?: string; ActionKey?: string; Payload?: unknown };

  if (!Body.PluginId || !Body.ActionKey) {
    return new Response("PluginId and ActionKey are required.", { status: 400 });
  }

  const AccessControl = CreateAccessControl(botId);
  const Guild = BuildServerTrustedGuildSummary(guildId);

  if (!(await AccessControl.CanManagePlugin(User.DiscordId, Guild, Body.PluginId))) {
    return new Response("Insufficient guild plugin permissions.", { status: 403 });
  }

  const ManifestEntry = (await ScanAllPluginManifests()).find(
    (Entry) => Entry.Manifest.Metadata.Id === Body.PluginId
  );

  if (!ManifestEntry) {
    return new Response("Plugin not found.", { status: 404 });
  }

  if (ManifestEntry.Manifest.Scope === PluginScope.Global && guildId !== "Global") {
      return new Response("Global plugins can only have actions in Global context.", { status: 400 });
  }

  if (ManifestEntry.Manifest.Scope === PluginScope.Guild && guildId === "Global") {
      return new Response("Guild plugins cannot have actions in Global context.", { status: 400 });
  }

  if (await IsPluginDisabled(Prisma, botId, Body.PluginId)) {
    return new Response("Plugin is disabled.", { status: 404 });
  }

  const ActionExists = ManifestEntry.Manifest.WebInterface.some(
    (Field) => (Field.Type === SettingsFieldType.Button || Field.Type === SettingsFieldType.Custom)
      && ((Field.ActionKey ?? Field.Key) === Body.ActionKey || Field.ActionKeys?.includes(Body.ActionKey ?? "") === true)
  );

  if (!ActionExists) {
    return new Response("Plugin action not found.", { status: 404 });
  }

  if (Body.PluginId === "EmojiAdder" && Body.ActionKey === "AddEmojis") {
    const LimitResponse = await ValidateEmojiAddCapacity(botId, guildId, Body.Payload);

    if (LimitResponse) {
      return LimitResponse;
    }
  }

  await RedisClient.lpush(
    "Dashboard:PluginActions",
    JSON.stringify({
      BotId: botId,
      GuildId: guildId,
      PluginId: Body.PluginId,
      ActionKey: Body.ActionKey,
      ActorId: User.DiscordId,
      Payload: Body.Payload,
      CreatedAt: new Date().toISOString()
    })
  );

  return NextResponse.json({ Queued: true });
}

function BuildServerTrustedGuildSummary(GuildId: string): DiscordGuildSummary {
  return {
    Id: GuildId,
    Name: GuildId,
    Icon: null,
    Owner: false,
    Permissions: "0"
  };
}

async function ValidateEmojiAddCapacity(BotId: string, GuildId: string, Payload: unknown): Promise<Response | null> {
  const RequestedCount = CountRequestedEmojiAdds(Payload);

  if (RequestedCount.Animated === 0 && RequestedCount.Static === 0) {
    return null;
  }

  const [Emojis, EmojiLimits] = await Promise.all([
    ReadCachedArray<BotEmojiSummary>(`Bot:${BotId}:Guild:${GuildId}:Emojis`),
    ReadCachedObject<GuildEmojiLimits>(`Bot:${BotId}:Guild:${GuildId}:EmojiLimits`)
  ]);
  const Limits = NormalizeGuildEmojiLimits(EmojiLimits);
  const CurrentAnimated = Emojis.filter((Emoji) => Emoji.Animated).length;
  const CurrentStatic = Emojis.length - CurrentAnimated;
  const RemainingAnimated = Math.max(0, Limits.MaxAnimatedEmojis - CurrentAnimated);
  const RemainingStatic = Math.max(0, Limits.MaxStaticEmojis - CurrentStatic);

  if (RequestedCount.Animated > RemainingAnimated) {
    return new Response(`Only ${RemainingAnimated} animated Discord emoji slot(s) left; remove ${RequestedCount.Animated - RemainingAnimated} ready animated emoji(s) first.`, { status: 400 });
  }

  if (RequestedCount.Static > RemainingStatic) {
    return new Response(`Only ${RemainingStatic} static Discord emoji slot(s) left; remove ${RequestedCount.Static - RemainingStatic} ready static emoji(s) first.`, { status: 400 });
  }

  return null;
}

function CountRequestedEmojiAdds(Payload: unknown): { Animated: number; Static: number } {
  if (!IsRecord(Payload) || !Array.isArray(Payload.Emojis)) {
    return { Animated: 0, Static: 0 };
  }

  return Payload.Emojis.filter(IsRecord).reduce<{ Animated: number; Static: number }>((Count, Value) => {
    if (typeof Value.DataUrl !== "string" || typeof Value.Name !== "string") {
      return Count;
    }

    if (IsAnimatedEmojiDataUrl(Value.DataUrl)) {
      Count.Animated += 1;
    } else {
      Count.Static += 1;
    }

    return Count;
  }, { Animated: 0, Static: 0 });
}

async function ReadCachedArray<T>(Key: string): Promise<T[]> {
  const RawValue = await RedisClient.get(Key);

  if (!RawValue) {
    return [];
  }

  try {
    const ParsedValue = JSON.parse(RawValue) as unknown;
    return Array.isArray(ParsedValue) ? ParsedValue as T[] : [];
  } catch {
    return [];
  }
}

async function ReadCachedObject<T>(Key: string): Promise<T | null> {
  const RawValue = await RedisClient.get(Key);

  if (!RawValue) {
    return null;
  }

  try {
    const ParsedValue = JSON.parse(RawValue) as unknown;
    return IsRecord(ParsedValue) ? ParsedValue as T : null;
  } catch {
    return null;
  }
}

function IsRecord(Value: unknown): Value is Record<string, unknown> {
  return typeof Value === "object" && Value !== null && !Array.isArray(Value);
}

function IsAnimatedEmojiDataUrl(Value: string): boolean {
  return Value.toLowerCase().startsWith("data:image/gif;");
}

async function ResolveDashboardUser(Request: Request) {
  try {
    return await RequireDashboardUser(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }
}

export { Post as POST };
