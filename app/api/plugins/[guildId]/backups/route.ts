import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { PluginStorage } from "@/src/Core/Storage";
import type { DiscordGuildSummary } from "@/src/Core/Types";
import { CreateAccessControl, RequireDashboardUser } from "@/src/Web/Auth";

type RouteContext = {
  params: Promise<{ guildId: string }>;
};

type BackupArchive = {
  Id: string;
  Name: string;
  GuildId: string;
  GuildName: string;
  CreatedAt: string;
  CreatedBy: string;
  Snapshot?: {
    Roles?: unknown[];
    Channels?: unknown[];
    PluginConfigs?: unknown[];
  };
};

const PluginId = "Backups";
const BackupsStorageKey = "Backups";

async function Get(Request: Request, Context: RouteContext): Promise<Response> {
  const GuildId = await ResolveGuildId(Context);
  const User = await ResolveDashboardUser(Request);

  if (User instanceof Response) {
    return User;
  }

  const AccessControl = CreateAccessControl();
  const Guild = BuildGuildSummaryFromHeaders(Request, GuildId);

  if (!(await AccessControl.CanManagePlugin(User.DiscordId, Guild, PluginId))) {
    return new Response("Insufficient guild plugin permissions.", { status: 403 });
  }

  const Url = new URL(Request.url);
  const BackupId = Url.searchParams.get("backupId");
  const Storage = new PluginStorage(Prisma, RedisClient, PluginId);
  const Backups = await GetBackups(Storage, GuildId);

  if (BackupId) {
    const Backup = Backups.find((BackupValue) => BackupValue.Id === BackupId);

    if (!Backup) {
      return new Response("Backup not found.", { status: 404 });
    }

    return new Response(JSON.stringify(Backup, null, 2), {
      headers: {
        "Content-Disposition": `attachment; filename="${SanitizeFileName(Backup.Name)}-${Backup.Id}.json"`,
        "Content-Type": "application/json; charset=utf-8"
      }
    });
  }

  return NextResponse.json({
    Backups: Backups.map((Backup) => ({
      Id: Backup.Id,
      Name: Backup.Name,
      GuildName: Backup.GuildName,
      CreatedAt: Backup.CreatedAt,
      CreatedBy: Backup.CreatedBy,
      Roles: Backup.Snapshot?.Roles?.length ?? 0,
      Channels: Backup.Snapshot?.Channels?.length ?? 0,
      PluginConfigs: Backup.Snapshot?.PluginConfigs?.length ?? 0
    }))
  });
}

async function Delete(Request: Request, Context: RouteContext): Promise<Response> {
  const GuildId = await ResolveGuildId(Context);
  const User = await ResolveDashboardUser(Request);

  if (User instanceof Response) {
    return User;
  }

  const AccessControl = CreateAccessControl();
  const Guild = BuildGuildSummaryFromHeaders(Request, GuildId);

  if (!(await AccessControl.CanManagePlugin(User.DiscordId, Guild, PluginId))) {
    return new Response("Insufficient guild plugin permissions.", { status: 403 });
  }

  const Body = (await Request.json().catch(() => ({}))) as { BackupId?: string };

  if (!Body.BackupId) {
    return new Response("BackupId is required.", { status: 400 });
  }

  const Storage = new PluginStorage(Prisma, RedisClient, PluginId);
  const Backups = await GetBackups(Storage, GuildId);
  const NextBackups = Backups.filter((Backup) => Backup.Id !== Body.BackupId);

  if (NextBackups.length === Backups.length) {
    return new Response("Backup not found.", { status: 404 });
  }

  await Storage.SetGlobalConfig(GuildId, BackupsStorageKey, NextBackups);

  return NextResponse.json({ Deleted: true, BackupId: Body.BackupId });
}

async function GetBackups(Storage: PluginStorage, GuildId: string): Promise<BackupArchive[]> {
  const StoredValue = await Storage.GetGlobalConfig<unknown>(GuildId, BackupsStorageKey);

  if (!Array.isArray(StoredValue)) {
    return [];
  }

  return StoredValue.filter(IsBackupArchive);
}

function IsBackupArchive(Value: unknown): Value is BackupArchive {
  return typeof Value === "object" && Value !== null && !Array.isArray(Value) && typeof (Value as BackupArchive).Id === "string";
}

function SanitizeFileName(Value: string): string {
  return Value.replace(/[^a-z0-9_-]+/giu, "-").replace(/^-|-$/gu, "") || "backup";
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

export { Delete as DELETE, Get as GET };
