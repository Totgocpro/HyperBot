import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import type { BotGuildSummary } from "@/src/Core/Types";
import { CreateAccessControl, RequireSuperAdmin } from "@/src/Web/Auth";

async function Get(Request: Request): Promise<Response> {
  try {
    await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const AccessRows = await Prisma.guildAccess.findMany({
    orderBy: { UpdatedAt: "desc" }
  });
  const RawBotGuilds = await RedisClient.get("Bot:Guilds");
  const BotGuilds = RawBotGuilds ? (JSON.parse(RawBotGuilds) as BotGuildSummary[]) : [];
  const AccessByGuildId = new Map(AccessRows.map((AccessRow) => [AccessRow.GuildId, AccessRow]));
  const GuildIds = new Set([...BotGuilds.map((Guild) => Guild.Id), ...AccessRows.map((AccessRow) => AccessRow.GuildId)]);
  const Guilds = Array.from(GuildIds).map((GuildId) => {
    const BotGuild = BotGuilds.find((Guild) => Guild.Id === GuildId);
    const AccessRow = AccessByGuildId.get(GuildId);

    return {
      GuildId,
      Name: BotGuild?.Name ?? GuildId,
      Icon: BotGuild?.Icon ?? null,
      MemberCount: BotGuild?.MemberCount ?? null,
      IsBotPresent: Boolean(BotGuild),
      IsBanned: AccessRow?.IsAllowed === false,
      RestrictedReason: AccessRow?.RestrictedReason ?? null,
      UpdatedAt: AccessRow?.UpdatedAt ?? null
    };
  });

  return NextResponse.json({ Guilds });
}

async function Put(Request: Request): Promise<Response> {
  const ActorId = await ResolveSuperAdmin(Request);

  if (ActorId instanceof Response) {
    return ActorId;
  }

  const Body = (await Request.json()) as { GuildId?: string; IsAllowed?: boolean; RestrictedReason?: string };

  if (!Body.GuildId || typeof Body.IsAllowed !== "boolean") {
    return new Response("GuildId and IsAllowed are required.", { status: 400 });
  }

  const AccessControl = CreateAccessControl();
  await AccessControl.SetGuildAllowed(Body.GuildId, Body.IsAllowed, Body.RestrictedReason ?? undefined);
  await Prisma.auditLog.create({
    data: {
      ActorId,
      Action: "GuildAccessUpdated",
      Target: Body.GuildId,
      Metadata: { IsAllowed: Body.IsAllowed, RestrictedReason: Body.RestrictedReason ?? null }
    }
  });

  return NextResponse.json({ Saved: true });
}

async function ResolveSuperAdmin(Request: Request): Promise<string | Response> {
  try {
    return await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }
}

export { Get as GET, Put as PUT };
