import Path from "node:path";
import { NextResponse } from "next/server";
import { Prisma } from "@/src/Core/Clients";
import { ScanPluginManifests } from "@/src/Core/PluginScanner";
import { PluginScope } from "@/src/Core/Types";
import { RequireSuperAdmin } from "@/src/Web/Auth";

async function Get(Request: Request): Promise<Response> {
  try {
    await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const PluginDirectory = Path.resolve(process.env.PLUGIN_DIRECTORY ?? "Plugins");
  const Plugins = (await ScanPluginManifests(PluginDirectory))
    .filter((Entry) => Entry.Manifest.Scope === PluginScope.Guild)
    .map((Entry) => ({
      Id: Entry.Manifest.Metadata.Id,
      DisplayName: Entry.Manifest.Metadata.DisplayName
    }));
  const Grants = await Prisma.guildRoleGrant.findMany({
    orderBy: [{ GuildId: "asc" }, { DiscordId: "asc" }]
  });

  return NextResponse.json({
    Plugins,
    Grants
  });
}

async function Put(Request: Request): Promise<Response> {
  const ActorId = await ResolveSuperAdmin(Request);

  if (ActorId instanceof Response) {
    return ActorId;
  }

  const Body = (await Request.json()) as {
    GuildId?: string;
    DiscordId?: string;
    AllowedPluginIds?: string[];
  };

  if (!Body.GuildId || !Body.DiscordId || !Array.isArray(Body.AllowedPluginIds)) {
    return new Response("GuildId, DiscordId and AllowedPluginIds are required.", { status: 400 });
  }

  const Grant = await Prisma.guildRoleGrant.upsert({
    where: {
      GuildId_DiscordId: {
        GuildId: Body.GuildId,
        DiscordId: Body.DiscordId
      }
    },
    update: {
      Role: "GuildAdmin",
      AllowedPluginIds: Body.AllowedPluginIds
    },
    create: {
      GuildId: Body.GuildId,
      DiscordId: Body.DiscordId,
      Role: "GuildAdmin",
      AllowedPluginIds: Body.AllowedPluginIds
    }
  });

  await Prisma.auditLog.create({
    data: {
      ActorId,
      Action: "GuildRoleGrantUpdated",
      Target: `${Body.GuildId}:${Body.DiscordId}`,
      Metadata: { AllowedPluginIds: Body.AllowedPluginIds }
    }
  });

  return NextResponse.json({ Grant });
}

async function Delete(Request: Request): Promise<Response> {
  const ActorId = await ResolveSuperAdmin(Request);

  if (ActorId instanceof Response) {
    return ActorId;
  }

  const Body = (await Request.json()) as { GuildId?: string; DiscordId?: string };

  if (!Body.GuildId || !Body.DiscordId) {
    return new Response("GuildId and DiscordId are required.", { status: 400 });
  }

  await Prisma.guildRoleGrant.deleteMany({
    where: {
      GuildId: Body.GuildId,
      DiscordId: Body.DiscordId
    }
  });
  await Prisma.auditLog.create({
    data: {
      ActorId,
      Action: "GuildRoleGrantDeleted",
      Target: `${Body.GuildId}:${Body.DiscordId}`
    }
  });

  return NextResponse.json({ Deleted: true });
}

async function ResolveSuperAdmin(Request: Request): Promise<string | Response> {
  try {
    return await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }
}

export { Delete as DELETE, Get as GET, Put as PUT };
