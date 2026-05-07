import Path from "node:path";
import { Prisma as PrismaNamespace } from "@prisma/client";
import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { ScanPluginManifests } from "@/src/Core/PluginScanner";
import { GetDisabledPluginIds, SetPluginDisabled } from "@/src/Core/PluginState";
import { PluginStorage } from "@/src/Core/Storage";
import { PluginScope } from "@/src/Core/Types";
import { RequireSuperAdmin } from "@/src/Web/Auth";

const GlobalConfigGuildId = "Global";

type PluginControlAction = "Enable" | "Disable" | "Reload";

type BotPluginState = {
  Id: string;
  Loaded: boolean;
  Disabled: boolean;
};

async function Get(Request: Request): Promise<Response> {
  try {
    await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const PluginDirectory = Path.resolve(process.env.PLUGIN_DIRECTORY ?? "Plugins");
  const AllManifestEntries = await ScanPluginManifests(PluginDirectory);
  const ManifestEntries = AllManifestEntries.filter((ManifestEntry) => ManifestEntry.Manifest.Scope === PluginScope.Global);
  const DisabledPluginIds = new Set(await GetDisabledPluginIds(Prisma));
  const BotPluginStates = await GetBotPluginStates();
  const Commands = AllManifestEntries.flatMap((ManifestEntry) =>
    ManifestEntry.Manifest.Scope !== PluginScope.Global && DisabledPluginIds.has(ManifestEntry.Manifest.Metadata.Id)
      ? []
      : ManifestEntry.Manifest.Commands.map((Command) => ({
          Name: Command.Name,
          Description: Command.Description,
          PluginId: ManifestEntry.Manifest.Metadata.Id,
          PluginName: ManifestEntry.Manifest.Metadata.DisplayName
        }))
  );
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
        Loaded: BotPluginStates.get(ManifestEntry.Manifest.Metadata.Id)?.Loaded ?? false,
        Disabled: false,
        Commands: ManifestEntry.Manifest.Commands,
        WebInterface: Fields
      };
    })
  );

  const ManageablePlugins = AllManifestEntries.map((ManifestEntry) => {
    const PluginId = ManifestEntry.Manifest.Metadata.Id;
    const BotState = BotPluginStates.get(PluginId);

    return {
      Metadata: ManifestEntry.Manifest.Metadata,
      Scope: ManifestEntry.Manifest.Scope,
      Loaded: BotState?.Loaded ?? false,
      Disabled: ManifestEntry.Manifest.Scope === PluginScope.Global ? false : DisabledPluginIds.has(PluginId) || BotState?.Disabled === true,
      Commands: ManifestEntry.Manifest.Commands,
      Dependencies: ManifestEntry.Manifest.Dependencies ?? []
    };
  });

  return NextResponse.json({ Plugins, Commands, ManageablePlugins });
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

async function Post(Request: Request): Promise<Response> {
  const ActorId = await ResolveSuperAdmin(Request);

  if (ActorId instanceof Response) {
    return ActorId;
  }

  const Body = (await Request.json()) as { PluginId?: string; Action?: PluginControlAction };

  if (!Body.PluginId || !Body.Action) {
    return new Response("PluginId and Action are required.", { status: 400 });
  }

  if (!["Enable", "Disable", "Reload"].includes(Body.Action)) {
    return new Response("Unsupported plugin action.", { status: 400 });
  }

  const PluginDirectory = Path.resolve(process.env.PLUGIN_DIRECTORY ?? "Plugins");
  const ManifestEntry = (await ScanPluginManifests(PluginDirectory)).find((Entry) => Entry.Manifest.Metadata.Id === Body.PluginId);

  if (!ManifestEntry) {
    return new Response("Plugin not found.", { status: 404 });
  }

  if (ManifestEntry.Manifest.Scope === PluginScope.Global && (Body.Action === "Enable" || Body.Action === "Disable")) {
    return new Response("Global plugins cannot be enabled or disabled from the admin panel.", { status: 400 });
  }

  if (Body.Action === "Disable") {
    await SetPluginDisabled(Prisma, Body.PluginId, true);
  } else if (Body.Action === "Enable") {
    await SetPluginDisabled(Prisma, Body.PluginId, false);
  }

  await RedisClient.lpush(
    "Dashboard:PluginControlActions",
    JSON.stringify({
      PluginId: Body.PluginId,
      Action: Body.Action,
      ActorId,
      CreatedAt: new Date().toISOString()
    })
  );

  await Prisma.auditLog.create({
    data: {
      ActorId,
      Action: `Plugin${Body.Action}Queued`,
      Target: Body.PluginId,
      Metadata: {
        DisplayName: ManifestEntry.Manifest.Metadata.DisplayName
      }
    }
  });

  return NextResponse.json({ PluginId: Body.PluginId, Action: Body.Action, Queued: true });
}

async function ResolveSuperAdmin(Request: Request): Promise<string | Response> {
  try {
    return await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }
}

async function GetBotPluginStates(): Promise<Map<string, BotPluginState>> {
  const RawPluginStates = await RedisClient.get("Bot:Plugins");

  if (!RawPluginStates) {
    return new Map();
  }

  const ParsedStates = JSON.parse(RawPluginStates) as BotPluginState[];
  return new Map(ParsedStates.map((State) => [State.Id, State]));
}

export { Get as GET, Put as PUT, Post as POST };
