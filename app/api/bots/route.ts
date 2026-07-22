import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { RequireDashboardUser } from "@/src/Web/Auth";

async function Get(Request: Request): Promise<Response> {
  let User;
  try {
    User = await RequireDashboardUser(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  let Bots;
  if (User.Role === "SuperAdmin") {
    Bots = await Prisma.discordBot.findMany({
      orderBy: { CreatedAt: "desc" }
    });
  } else {
    const Accesses = await Prisma.botAccess.findMany({
      where: { UserId: User.Id },
      include: { Bot: true }
    });
    Bots = Accesses.map(a => a.Bot);
  }

  const BotsWithStatus = await Promise.all(
    Bots.map(async (Bot) => {
      const Heartbeat = await RedisClient.get(`Bot:${Bot.Id}:Heartbeat`);
      const RawGuilds = await RedisClient.get(`Bot:${Bot.Id}:Guilds`);
      const Guilds = RawGuilds ? JSON.parse(RawGuilds) : [];
      return {
        Id: Bot.Id,
        ClientId: Bot.ClientId,
        Name: Bot.Name,
        AvatarUrl: Bot.AvatarUrl,
        IsEnabled: Bot.IsEnabled,
        AllowInvite: Bot.AllowInvite,
        CreatedAt: Bot.CreatedAt,
        UpdatedAt: Bot.UpdatedAt,
        HasToken: Boolean(Bot.Token),
        IsOnline: Boolean(Heartbeat),
        GuildCount: Guilds.length,
        Guilds: Guilds
      };
    })
  );

  return NextResponse.json(BotsWithStatus);
}

async function Post(Request: Request): Promise<Response> {
  let User;
  try {
    User = await RequireDashboardUser(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  if (User.Role !== "SuperAdmin") {
    return new Response("Unauthorized", { status: 403 });
  }

  const Body = await Request.json();
  if (!Body.Token || !Body.ClientId) {
    return new Response("Token and ClientId are required", { status: 400 });
  }

  // Fetch bot info from Discord
  const DiscordResponse = await fetch("https://discord.com/api/v10/users/@me", {
    headers: {
        Authorization: `Bot ${Body.Token}`
    }
  });

  if (!DiscordResponse.ok) {
      return new Response(`Failed to fetch bot info from Discord: ${DiscordResponse.status} ${await DiscordResponse.text()}`, { status: 400 });
  }

  const BotInfo = await DiscordResponse.json();

  const Bot = await Prisma.discordBot.create({
    data: {
      Token: Body.Token,
      ClientId: Body.ClientId,
      Name: BotInfo.username,
      AvatarUrl: BotInfo.avatar ? `https://cdn.discordapp.com/avatars/${BotInfo.id}/${BotInfo.avatar}.png` : null
    }
  });

  return NextResponse.json(Bot);
}

export { Get as GET, Post as POST };
