import Path from "node:path";
import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { ScanPluginManifests } from "@/src/Core/PluginScanner";
import { PluginStorage } from "@/src/Core/Storage";
import { PluginScope, type DiscordGuildSummary } from "@/src/Core/Types";
import { CreateAccessControl, RequireDashboardUser } from "@/src/Web/Auth";

type RouteContext = {
  params: Promise<{ guildId: string }>;
};

async function Get(Request: Request, Context: RouteContext): Promise<Response> {
  const GuildId = await ResolveGuildId(Context);
  const User = await ResolveDashboardUser(Request);

  if (User instanceof Response) {
    return User;
  }

  const AccessControl = CreateAccessControl();
  const Guild = BuildGuildSummaryFromHeaders(Request, GuildId);
  const AccessLevel = await AccessControl.GetAccessLevel(User.DiscordId, Guild);

  if (!AccessLevel) {
    return new Response("Insufficient guild permissions.", { status: 403 });
  }

  const PluginDirectory = Path.resolve(process.env.PLUGIN_DIRECTORY ?? "Plugins");
  const ManifestEntries = (await ScanPluginManifests(PluginDirectory)).filter((ManifestEntry) => ManifestEntry.Manifest.Scope !== PluginScope.Global);
  const AllowedManifestEntries = [];

  for (const ManifestEntry of ManifestEntries) {
    if (await AccessControl.CanManagePlugin(User.DiscordId, Guild, ManifestEntry.Manifest.Metadata.Id)) {
      AllowedManifestEntries.push(ManifestEntry);
    }
  }

  const Plugins = await Promise.all(
    AllowedManifestEntries.map(async (ManifestEntry) => {
      const Storage = new PluginStorage(Prisma, RedisClient, ManifestEntry.Manifest.Metadata.Id);
      const Fields = await Promise.all(
        ManifestEntry.Manifest.WebInterface.map(async (Field) => {
          const StoredValue = await Storage.GetGlobalConfig(GuildId, Field.Key);

          return {
            ...Field,
            Value: StoredValue ?? Field.Default
          };
        })
      );

      return {
        Metadata: ManifestEntry.Manifest.Metadata,
        Commands: ManifestEntry.Manifest.Commands,
        WebInterface: Fields
      };
    })
  );

  return NextResponse.json({ GuildId, Plugins });
}

async function Put(Request: Request, Context: RouteContext): Promise<Response> {
  const GuildId = await ResolveGuildId(Context);
  const User = await ResolveDashboardUser(Request);

  if (User instanceof Response) {
    return User;
  }

  const AccessControl = CreateAccessControl();
  const Guild = BuildGuildSummaryFromHeaders(Request, GuildId);
  const Body = (await Request.json()) as { PluginId?: string; Values?: Record<string, unknown> };

  if (!Body.PluginId || !Body.Values) {
    return new Response("PluginId and Values are required.", { status: 400 });
  }

  if (!(await AccessControl.CanManagePlugin(User.DiscordId, Guild, Body.PluginId))) {
    return new Response("Insufficient guild plugin permissions.", { status: 403 });
  }

  const Storage = new PluginStorage(Prisma, RedisClient, Body.PluginId);

  for (const [Key, Value] of Object.entries(Body.Values)) {
    await Storage.SetGlobalConfig(GuildId, Key, Value);
  }

  return NextResponse.json({ GuildId, PluginId: Body.PluginId, Saved: true });
}

function BuildGuildSummaryFromHeaders(Request: Request, GuildId: string): DiscordGuildSummary {
  return {
    Id: GuildId,
    Name: Request.headers.get("X-Discord-Guild-Name") ?? GuildId,
    Icon: null,
    Owner: Request.headers.get("X-Discord-Guild-Owner") === "true",
    Permissions: Request.headers.get("X-Discord-Guild-Permissions") ?? "0"
  };
}

async function ResolveGuildId(Context: RouteContext): Promise<string> {
  const ResolvedParams = await Context.params;
  return ResolvedParams.guildId;
}

async function ResolveDashboardUser(Request: Request) {
  try {
    return await RequireDashboardUser(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }
}

export { Get as GET, Put as PUT };
