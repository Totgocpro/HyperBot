import Path from "node:path";
import { Prisma as PrismaNamespace } from "@prisma/client";
import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { ScanPluginManifests } from "@/src/Core/PluginScanner";
import { PluginStorage } from "@/src/Core/Storage";
import { PluginScope } from "@/src/Core/Types";
import { RequireSuperAdmin } from "@/src/Web/Auth";

const GlobalConfigGuildId = "Global";

async function Get(Request: Request): Promise<Response> {
  try {
    await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const PluginDirectory = Path.resolve(process.env.PLUGIN_DIRECTORY ?? "Plugins");
  const ManifestEntries = (await ScanPluginManifests(PluginDirectory)).filter((ManifestEntry) => ManifestEntry.Manifest.Scope === PluginScope.Global);
  const Plugins = await Promise.all(
    ManifestEntries.map(async (ManifestEntry) => {
      const Storage = new PluginStorage(Prisma, RedisClient, ManifestEntry.Manifest.Metadata.Id);
      const Fields = await Promise.all(
        ManifestEntry.Manifest.WebInterface.map(async (Field) => ({
          ...Field,
          Value: (await Storage.GetGlobalConfig(GlobalConfigGuildId, Field.Key)) ?? Field.Default
        }))
      );

      return {
        Metadata: ManifestEntry.Manifest.Metadata,
        Scope: ManifestEntry.Manifest.Scope,
        Commands: ManifestEntry.Manifest.Commands,
        WebInterface: Fields
      };
    })
  );

  return NextResponse.json({ Plugins });
}

async function Put(Request: Request): Promise<Response> {
  const ActorId = await ResolveSuperAdmin(Request);

  if (ActorId instanceof Response) {
    return ActorId;
  }

  const Body = (await Request.json()) as { PluginId?: string; Values?: Record<string, unknown> };

  if (!Body.PluginId || !Body.Values) {
    return new Response("PluginId and Values are required.", { status: 400 });
  }

  const PluginDirectory = Path.resolve(process.env.PLUGIN_DIRECTORY ?? "Plugins");
  const ManifestEntry = (await ScanPluginManifests(PluginDirectory)).find((Entry) => Entry.Manifest.Metadata.Id === Body.PluginId);

  if (!ManifestEntry || ManifestEntry.Manifest.Scope !== PluginScope.Global) {
    return new Response("Global plugin not found.", { status: 404 });
  }

  const Storage = new PluginStorage(Prisma, RedisClient, Body.PluginId);

  for (const [Key, Value] of Object.entries(Body.Values)) {
    await Storage.SetGlobalConfig(GlobalConfigGuildId, Key, Value);
  }

  await Prisma.auditLog.create({
    data: {
      ActorId,
      Action: "GlobalPluginConfigUpdated",
      Target: Body.PluginId,
      Metadata: Body.Values as PrismaNamespace.InputJsonObject
    }
  });

  return NextResponse.json({ PluginId: Body.PluginId, Saved: true });
}

async function ResolveSuperAdmin(Request: Request): Promise<string | Response> {
  try {
    return await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }
}

export { Get as GET, Put as PUT };
