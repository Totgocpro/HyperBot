import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { type BotChannelSummary, type DiscordGuildSummary } from "@/src/Core/Types";
import { CreateAccessControl, RequireDashboardUser } from "@/src/Web/Auth";

type RouteContext = {
  params: Promise<{ guildId: string }>;
};

type DiscordChannelResponse = {
  id: string;
  name: string;
  type: number;
};

const DiscordChannelTypeNames: Record<number, string> = {
  0: "GuildText",
  2: "GuildVoice",
  5: "GuildAnnouncement",
  13: "GuildStageVoice",
  15: "GuildForum",
  16: "GuildMedia"
};

async function Post(Request: Request, Context: RouteContext): Promise<Response> {
  const GuildId = (await Context.params).guildId;
  const User = await ResolveDashboardUser(Request);

  if (User instanceof Response) {
    return User;
  }

  const AccessControl = CreateAccessControl();
  const AccessLevel = await AccessControl.GetAccessLevel(User.DiscordId, BuildServerTrustedGuildSummary(GuildId));

  if (!AccessLevel) {
    return new Response("Insufficient guild permissions.", { status: 403 });
  }

  const Body = (await Request.json()) as { Name?: string };
  const Name = SanitizeChannelName(Body.Name ?? "");

  if (!Name) {
    return new Response("Channel name is required.", { status: 400 });
  }

  if (!process.env.DISCORD_TOKEN) {
    return new Response("DISCORD_TOKEN is not configured.", { status: 500 });
  }

  const DiscordResponse = await fetch(`https://discord.com/api/v10/guilds/${GuildId}/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      "Content-Type": "application/json",
      "X-Audit-Log-Reason": encodeURIComponent(`Channel created from HyperBot dashboard by ${User.DiscordId}`)
    },
    body: JSON.stringify({
      name: Name,
      type: 0
    })
  });

  if (!DiscordResponse.ok) {
    return new Response(`Discord channel creation failed: ${DiscordResponse.status} ${await DiscordResponse.text()}`, { status: DiscordResponse.status });
  }

  const Channel = (await DiscordResponse.json()) as DiscordChannelResponse;
  const ChannelSummary: BotChannelSummary = {
    Id: Channel.id,
    Name: Channel.name,
    Type: DiscordChannelTypeNames[Channel.type] ?? String(Channel.type),
    IsWritable: true
  };

  await CacheCreatedChannel(GuildId, ChannelSummary);
  await Prisma.auditLog.create({
    data: {
      ActorId: User.DiscordId,
      Action: "DiscordChannelCreated",
      Target: Channel.id,
      Metadata: { GuildId, ChannelId: Channel.id, ChannelName: Channel.name, ChannelType: ChannelSummary.Type }
    }
  });

  return NextResponse.json({ Channel: ChannelSummary });
}

function SanitizeChannelName(Value: string): string {
  return Value
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "")
    .slice(0, 100);
}

async function CacheCreatedChannel(GuildId: string, Channel: BotChannelSummary): Promise<void> {
  const CacheKey = `Bot:Guild:${GuildId}:Channels`;
  const RawChannels = await RedisClient.get(CacheKey);
  const Channels = RawChannels ? (JSON.parse(RawChannels) as BotChannelSummary[]) : [];
  const NextChannels = [Channel, ...Channels.filter((ExistingChannel) => ExistingChannel.Id !== Channel.Id)];

  await RedisClient.set(CacheKey, JSON.stringify(NextChannels), "EX", 30);
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

export { Post as POST };
