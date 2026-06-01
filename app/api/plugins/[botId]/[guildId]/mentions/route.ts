import { NextResponse } from "next/server";
import { RedisClient } from "@/src/Core/Clients";
import type { BotChannelSummary, BotEmojiSummary, BotMemberSummary, BotRoleSummary, DiscordGuildSummary } from "@/src/Core/Types";
import { CreateAccessControl, RequireDashboardUser } from "@/src/Web/Auth";

type RouteContext = {
  params: Promise<{ botId: string; guildId: string }>;
};

async function Get(Request: Request, Context: RouteContext): Promise<Response> {
  const { botId, guildId } = await Context.params;
  const User = await ResolveDashboardUser(Request);

  if (User instanceof Response) {
    return User;
  }

  const AccessControl = CreateAccessControl(botId);
  const Guild = BuildServerTrustedGuildSummary(guildId);
  const AccessLevel = await AccessControl.GetAccessLevel(User.DiscordId, Guild);

  if (!AccessLevel) {
    return new Response("Insufficient guild permissions.", { status: 403 });
  }

  const [Channels, Roles, Members, Emojis] = await Promise.all([
    ReadCachedArray<BotChannelSummary>(`Bot:${botId}:Guild:${guildId}:Channels`),
    ReadCachedArray<BotRoleSummary>(`Bot:${botId}:Guild:${guildId}:Roles`),
    ReadCachedArray<BotMemberSummary>(`Bot:${botId}:Guild:${guildId}:Members`),
    ReadCachedArray<BotEmojiSummary>(`Bot:${botId}:Guild:${guildId}:Emojis`)
  ]);

  return NextResponse.json({
    Channels,
    Emojis,
    Members,
    Roles
  });
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

function BuildServerTrustedGuildSummary(GuildId: string): DiscordGuildSummary {
  return {
    Id: GuildId,
    Name: GuildId,
    Icon: null,
    Owner: false,
    Permissions: "0"
  };
}

async function ResolveDashboardUser(Request: Request) {
  try {
    return await RequireDashboardUser(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }
}

export { Get as GET };
