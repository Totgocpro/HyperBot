import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { type BotRoleSummary, type DiscordGuildSummary } from "@/src/Core/Types";
import { CreateAccessControl, RequireDashboardUser } from "@/src/Web/Auth";

type RouteContext = {
  params: Promise<{ guildId: string }>;
};

type DiscordRoleResponse = {
  id: string;
  name: string;
  color: number;
  position: number;
  managed?: boolean;
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

  const Body = (await Request.json()) as { Name?: string; Color?: string };
  const Name = Body.Name?.trim();

  if (!Name) {
    return new Response("Role name is required.", { status: 400 });
  }

  if (Name.length > 100) {
    return new Response("Role name must be 100 characters or fewer.", { status: 400 });
  }

  const Color = ParseHexColor(Body.Color ?? "#5865f2");

  if (Color === null) {
    return new Response("Role color must be a valid hex color.", { status: 400 });
  }

  if (!process.env.DISCORD_TOKEN) {
    return new Response("DISCORD_TOKEN is not configured.", { status: 500 });
  }

  const DiscordResponse = await fetch(`https://discord.com/api/v10/guilds/${GuildId}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      "Content-Type": "application/json",
      "X-Audit-Log-Reason": encodeURIComponent(`Role created from HyperBot dashboard by ${User.DiscordId}`)
    },
    body: JSON.stringify({
      name: Name,
      color: Color
    })
  });

  if (!DiscordResponse.ok) {
    return new Response(`Discord role creation failed: ${DiscordResponse.status} ${await DiscordResponse.text()}`, { status: DiscordResponse.status });
  }

  const Role = (await DiscordResponse.json()) as DiscordRoleResponse;
  const RoleSummary: BotRoleSummary = {
    Id: Role.id,
    Name: Role.name,
    Color: Role.color,
    Position: Role.position
  };

  await CacheCreatedRole(GuildId, RoleSummary);
  await Prisma.auditLog.create({
    data: {
      ActorId: User.DiscordId,
      Action: "DiscordRoleCreated",
      Target: Role.id,
      Metadata: { GuildId, RoleId: Role.id, RoleName: Role.name, Color: Role.color }
    }
  });

  return NextResponse.json({ Role: RoleSummary });
}

function ParseHexColor(Value: string): number | null {
  if (!/^#[0-9a-f]{6}$/iu.test(Value)) {
    return null;
  }

  return Number.parseInt(Value.slice(1), 16);
}

async function CacheCreatedRole(GuildId: string, Role: BotRoleSummary): Promise<void> {
  const CacheKey = `Bot:Guild:${GuildId}:Roles`;
  const RawRoles = await RedisClient.get(CacheKey);
  const Roles = RawRoles ? (JSON.parse(RawRoles) as BotRoleSummary[]) : [];
  const NextRoles = [Role, ...Roles.filter((ExistingRole) => ExistingRole.Id !== Role.Id)].sort((FirstRole, SecondRole) => SecondRole.Position - FirstRole.Position);

  await RedisClient.set(CacheKey, JSON.stringify(NextRoles), "EX", 30);
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
