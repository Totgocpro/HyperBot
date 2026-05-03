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

  const RawGuilds = await RedisClient.get("Bot:Guilds");
  const Heartbeat = await RedisClient.get("Bot:Heartbeat");
  const AllGuilds = RawGuilds ? (JSON.parse(RawGuilds) as BotGuildSummary[]) : [];
  const GuildGrants =
    User.Role === "SuperAdmin"
      ? []
      : await Prisma.guildRoleGrant.findMany({
          where: { DiscordId: User.DiscordId }
        });
  const GuildAccessIds = new Set(GuildGrants.map((Grant) => Grant.GuildId));
  const Guilds =
    User.Role === "SuperAdmin"
      ? AllGuilds
      : AllGuilds.filter((Guild) => GuildAccessIds.has(Guild.Id));
  const InviteUrl = process.env.DISCORD_CLIENT_ID
    ? `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&scope=bot%20applications.commands&permissions=8`
    : null;

  return NextResponse.json({
    Guilds,
    BotOnline: Boolean(Heartbeat),
    InviteUrl
  });
}

export { Get as GET };
