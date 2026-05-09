import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import type { BotGuildSummary } from "@/src/Core/Types";
import { RequireDashboardUser } from "@/src/Web/Auth";

async function Get(Request: Request): Promise<Response> {
  let User;
  try {
    User = await RequireDashboardUser(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const { searchParams } = new URL(Request.url);
  const BotId = searchParams.get("botId");

  if (!BotId) {
    return new Response("BotId is required.", { status: 400 });
  }

  const Heartbeat = await RedisClient.get(`Bot:${BotId}:Heartbeat`);
  const RawGuilds = await RedisClient.get(`Bot:${BotId}:Guilds`);
  const AllGuilds = (RawGuilds ? JSON.parse(RawGuilds) : []) as BotGuildSummary[];
  const VisibleGuilds = User.Role === "SuperAdmin" ? AllGuilds : await FilterAccessibleGuilds(AllGuilds, User.DiscordId, BotId);

  const Bot = await Prisma.discordBot.findUnique({
    where: { Id: BotId }
  });

  const InviteUrl = Bot
    ? `https://discord.com/api/oauth2/authorize?client_id=${Bot.ClientId}&scope=bot%20applications.commands&permissions=8`
    : null;

  return NextResponse.json({
    Guilds: VisibleGuilds,
    BotOnline: Boolean(Heartbeat),
    InviteUrl
  });
}

async function FilterAccessibleGuilds(Guilds: BotGuildSummary[], DiscordId: string, BotId: string): Promise<BotGuildSummary[]> {
  const Grants = await Prisma.guildRoleGrant.findMany({
    where: {
      BotId,
      DiscordId
    },
    select: {
      GuildId: true
    }
  });
  const AllowedGuildIds = new Set(Grants.map((Grant) => Grant.GuildId));

  return Guilds.filter((Guild) => AllowedGuildIds.has(Guild.Id));
}

export { Get as GET };
