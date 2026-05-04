import Path from "node:path";
import { NextResponse } from "next/server";
import { RedisClient } from "@/src/Core/Clients";
import { ScanPluginManifests } from "@/src/Core/PluginScanner";
import { PluginScope, SettingsFieldType, type DiscordGuildSummary } from "@/src/Core/Types";
import { CreateAccessControl, RequireDashboardUser } from "@/src/Web/Auth";

type RouteContext = {
  params: Promise<{ guildId: string }>;
};

async function Post(Request: Request, Context: RouteContext): Promise<Response> {
  const GuildId = await ResolveGuildId(Context);
  const User = await ResolveDashboardUser(Request);

  if (User instanceof Response) {
    return User;
  }

  const Body = (await Request.json()) as { PluginId?: string; ActionKey?: string; Payload?: unknown };

  if (!Body.PluginId || !Body.ActionKey) {
    return new Response("PluginId and ActionKey are required.", { status: 400 });
  }

  const AccessControl = CreateAccessControl();
  const Guild = BuildGuildSummaryFromHeaders(Request, GuildId);

  if (!(await AccessControl.CanManagePlugin(User.DiscordId, Guild, Body.PluginId))) {
    return new Response("Insufficient guild plugin permissions.", { status: 403 });
  }

  const PluginDirectory = Path.resolve(process.env.PLUGIN_DIRECTORY ?? "Plugins");
  const ManifestEntry = (await ScanPluginManifests(PluginDirectory)).find(
    (Entry) => Entry.Manifest.Scope !== PluginScope.Global && Entry.Manifest.Metadata.Id === Body.PluginId
  );

  if (!ManifestEntry) {
    return new Response("Plugin not found.", { status: 404 });
  }

  const ActionExists = ManifestEntry.Manifest.WebInterface.some(
    (Field) => Field.Type === SettingsFieldType.Button && (Field.ActionKey ?? Field.Key) === Body.ActionKey
  );

  if (!ActionExists) {
    return new Response("Plugin action not found.", { status: 404 });
  }

  await RedisClient.lpush(
    "Dashboard:PluginActions",
    JSON.stringify({
      GuildId,
      PluginId: Body.PluginId,
      ActionKey: Body.ActionKey,
      ActorId: User.DiscordId,
      Payload: Body.Payload,
      CreatedAt: new Date().toISOString()
    })
  );

  return NextResponse.json({ Queued: true });
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

export { Post as POST };
