import { Prisma as PrismaNamespace } from "@prisma/client";
import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { RequireSuperAdmin } from "@/src/Web/Auth";

const ExportFormat = "HyperBotAdminConfigExport";
const ExportVersion = 1;

type ConfigExport = {
  Format: typeof ExportFormat;
  Version: typeof ExportVersion;
  ExportedAt: string;
  Data: {
    GuildAccess: Array<{
      GuildId: string;
      IsAllowed: boolean;
      RestrictedReason: string | null;
    }>;
    GuildRoleGrants: Array<{
      GuildId: string;
      DiscordId: string;
      Role: "GuildOwner" | "GuildAdmin";
      AllowedPluginIds: unknown;
    }>;
    PluginGlobalConfigs: Array<{
      GuildId: string;
      PluginId: string;
      Key: string;
      Value: unknown;
    }>;
    UserPluginValues: Array<{
      GuildId: string;
      UserId: string;
      PluginId: string;
      Key: string;
      Value: unknown;
    }>;
    SystemSettings: Array<{
      Key: string;
      Value: unknown;
    }>;
  };
};

async function Get(Request: Request): Promise<Response> {
  try {
    await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const [GuildAccessRows, GuildRoleGrantRows, PluginGlobalConfigRows, UserPluginValueRows, SystemSettingRows] = await Promise.all([
    Prisma.guildAccess.findMany({ orderBy: { GuildId: "asc" } }),
    Prisma.guildRoleGrant.findMany({ orderBy: [{ GuildId: "asc" }, { DiscordId: "asc" }] }),
    Prisma.pluginGlobalConfig.findMany({ orderBy: [{ GuildId: "asc" }, { PluginId: "asc" }, { Key: "asc" }] }),
    Prisma.userPluginValue.findMany({ orderBy: [{ GuildId: "asc" }, { UserId: "asc" }, { PluginId: "asc" }, { Key: "asc" }] }),
    Prisma.systemSetting.findMany({ orderBy: { Key: "asc" } })
  ]);

  const Payload: ConfigExport = {
    Format: ExportFormat,
    Version: ExportVersion,
    ExportedAt: new Date().toISOString(),
    Data: {
      GuildAccess: GuildAccessRows.map((Row) => ({
        GuildId: Row.GuildId,
        IsAllowed: Row.IsAllowed,
        RestrictedReason: Row.RestrictedReason
      })),
      GuildRoleGrants: GuildRoleGrantRows.map((Row) => ({
        GuildId: Row.GuildId,
        DiscordId: Row.DiscordId,
        Role: Row.Role,
        AllowedPluginIds: Row.AllowedPluginIds
      })),
      PluginGlobalConfigs: PluginGlobalConfigRows.map((Row) => ({
        GuildId: Row.GuildId,
        PluginId: Row.PluginId,
        Key: Row.Key,
        Value: Row.Value
      })),
      UserPluginValues: UserPluginValueRows.map((Row) => ({
        GuildId: Row.GuildId,
        UserId: Row.UserId,
        PluginId: Row.PluginId,
        Key: Row.Key,
        Value: Row.Value
      })),
      SystemSettings: SystemSettingRows.map((Row) => ({
        Key: Row.Key,
        Value: Row.Value
      }))
    }
  };

  return new Response(JSON.stringify(Payload, null, 2), {
    headers: {
      "Content-Disposition": `attachment; filename="hyperbot-configs-${new Date().toISOString().slice(0, 10)}.json"`,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

async function Post(Request: Request): Promise<Response> {
  const ActorId = await ResolveSuperAdmin(Request);

  if (ActorId instanceof Response) {
    return ActorId;
  }

  const Body = (await Request.json()) as { Export?: unknown; ReplaceExisting?: boolean };
  const ParsedExport = ParseConfigExport(Body.Export);

  if (!ParsedExport) {
    return new Response("Invalid HyperBot config export.", { status: 400 });
  }

  const Counts = {
    GuildAccess: ParsedExport.Data.GuildAccess.length,
    GuildRoleGrants: ParsedExport.Data.GuildRoleGrants.length,
    PluginGlobalConfigs: ParsedExport.Data.PluginGlobalConfigs.length,
    UserPluginValues: ParsedExport.Data.UserPluginValues.length,
    SystemSettings: ParsedExport.Data.SystemSettings.length
  };

  await Prisma.$transaction(async (Transaction) => {
    if (Body.ReplaceExisting === true) {
      await Transaction.userPluginValue.deleteMany();
      await Transaction.pluginGlobalConfig.deleteMany();
      await Transaction.guildRoleGrant.deleteMany();
      await Transaction.guildAccess.deleteMany();
      await Transaction.systemSetting.deleteMany();
    }

    for (const Row of ParsedExport.Data.GuildAccess) {
      await Transaction.guildAccess.upsert({
        where: { GuildId: Row.GuildId },
        create: {
          GuildId: Row.GuildId,
          IsAllowed: Row.IsAllowed,
          RestrictedReason: Row.RestrictedReason
        },
        update: {
          IsAllowed: Row.IsAllowed,
          RestrictedReason: Row.RestrictedReason
        }
      });
    }

    for (const Row of ParsedExport.Data.GuildRoleGrants) {
      await Transaction.guildRoleGrant.upsert({
        where: {
          GuildId_DiscordId: {
            GuildId: Row.GuildId,
            DiscordId: Row.DiscordId
          }
        },
        create: {
          GuildId: Row.GuildId,
          DiscordId: Row.DiscordId,
          Role: Row.Role,
          AllowedPluginIds: SerializeJsonValue(Row.AllowedPluginIds)
        },
        update: {
          Role: Row.Role,
          AllowedPluginIds: SerializeJsonValue(Row.AllowedPluginIds)
        }
      });
    }

    for (const Row of ParsedExport.Data.PluginGlobalConfigs) {
      await Transaction.pluginGlobalConfig.upsert({
        where: {
          GuildId_PluginId_Key: {
            GuildId: Row.GuildId,
            PluginId: Row.PluginId,
            Key: Row.Key
          }
        },
        create: {
          GuildId: Row.GuildId,
          PluginId: Row.PluginId,
          Key: Row.Key,
          Value: SerializeJsonValue(Row.Value)
        },
        update: {
          Value: SerializeJsonValue(Row.Value)
        }
      });
    }

    for (const Row of ParsedExport.Data.UserPluginValues) {
      await Transaction.userPluginValue.upsert({
        where: {
          GuildId_UserId_PluginId_Key: {
            GuildId: Row.GuildId,
            UserId: Row.UserId,
            PluginId: Row.PluginId,
            Key: Row.Key
          }
        },
        create: {
          GuildId: Row.GuildId,
          UserId: Row.UserId,
          PluginId: Row.PluginId,
          Key: Row.Key,
          Value: SerializeJsonValue(Row.Value)
        },
        update: {
          Value: SerializeJsonValue(Row.Value)
        }
      });
    }

    for (const Row of ParsedExport.Data.SystemSettings) {
      await Transaction.systemSetting.upsert({
        where: { Key: Row.Key },
        create: {
          Key: Row.Key,
          Value: SerializeJsonValue(Row.Value)
        },
        update: {
          Value: SerializeJsonValue(Row.Value)
        }
      });
    }

    await Transaction.auditLog.create({
      data: {
        ActorId,
        Action: "AdminConfigsImported",
        Target: "ConfigExport",
        Metadata: {
          ReplaceExisting: Body.ReplaceExisting === true,
          Counts
        }
      }
    });
  });

  await ClearPluginConfigCache();

  return NextResponse.json({
    Imported: true,
    ReplaceExisting: Body.ReplaceExisting === true,
    Counts
  });
}

async function ResolveSuperAdmin(Request: Request): Promise<string | Response> {
  try {
    return await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }
}

function ParseConfigExport(Value: unknown): ConfigExport | null {
  if (!IsRecord(Value) || Value.Format !== ExportFormat || Value.Version !== ExportVersion || !IsRecord(Value.Data)) {
    return null;
  }

  return {
    Format: ExportFormat,
    Version: ExportVersion,
    ExportedAt: typeof Value.ExportedAt === "string" ? Value.ExportedAt : new Date().toISOString(),
    Data: {
      GuildAccess: ParseArray(Value.Data.GuildAccess, ParseGuildAccessRow),
      GuildRoleGrants: ParseArray(Value.Data.GuildRoleGrants, ParseGuildRoleGrantRow),
      PluginGlobalConfigs: ParseArray(Value.Data.PluginGlobalConfigs, ParsePluginGlobalConfigRow),
      UserPluginValues: ParseArray(Value.Data.UserPluginValues, ParseUserPluginValueRow),
      SystemSettings: ParseArray(Value.Data.SystemSettings, ParseSystemSettingRow)
    }
  };
}

function ParseGuildAccessRow(Value: unknown): ConfigExport["Data"]["GuildAccess"][number] | null {
  if (!IsRecord(Value) || typeof Value.GuildId !== "string" || typeof Value.IsAllowed !== "boolean") {
    return null;
  }

  return {
    GuildId: Value.GuildId,
    IsAllowed: Value.IsAllowed,
    RestrictedReason: typeof Value.RestrictedReason === "string" ? Value.RestrictedReason : null
  };
}

function ParseGuildRoleGrantRow(Value: unknown): ConfigExport["Data"]["GuildRoleGrants"][number] | null {
  if (!IsRecord(Value) || typeof Value.GuildId !== "string" || typeof Value.DiscordId !== "string" || (Value.Role !== "GuildOwner" && Value.Role !== "GuildAdmin")) {
    return null;
  }

  return {
    GuildId: Value.GuildId,
    DiscordId: Value.DiscordId,
    Role: Value.Role,
    AllowedPluginIds: Value.AllowedPluginIds ?? null
  };
}

function ParsePluginGlobalConfigRow(Value: unknown): ConfigExport["Data"]["PluginGlobalConfigs"][number] | null {
  if (!IsRecord(Value) || typeof Value.GuildId !== "string" || typeof Value.PluginId !== "string" || typeof Value.Key !== "string") {
    return null;
  }

  return {
    GuildId: Value.GuildId,
    PluginId: Value.PluginId,
    Key: Value.Key,
    Value: Value.Value ?? null
  };
}

function ParseUserPluginValueRow(Value: unknown): ConfigExport["Data"]["UserPluginValues"][number] | null {
  if (!IsRecord(Value) || typeof Value.GuildId !== "string" || typeof Value.UserId !== "string" || typeof Value.PluginId !== "string" || typeof Value.Key !== "string") {
    return null;
  }

  return {
    GuildId: Value.GuildId,
    UserId: Value.UserId,
    PluginId: Value.PluginId,
    Key: Value.Key,
    Value: Value.Value ?? null
  };
}

function ParseSystemSettingRow(Value: unknown): ConfigExport["Data"]["SystemSettings"][number] | null {
  if (!IsRecord(Value) || typeof Value.Key !== "string") {
    return null;
  }

  return {
    Key: Value.Key,
    Value: Value.Value ?? null
  };
}

function ParseArray<T>(Value: unknown, Parser: (Item: unknown) => T | null): T[] {
  return Array.isArray(Value) ? Value.map(Parser).filter((Item): Item is T => Item !== null) : [];
}

function IsRecord(Value: unknown): Value is Record<string, unknown> {
  return typeof Value === "object" && Value !== null && !Array.isArray(Value);
}

function SerializeJsonValue(Value: unknown): PrismaNamespace.InputJsonValue | typeof PrismaNamespace.JsonNull {
  return Value === null ? PrismaNamespace.JsonNull : (Value as PrismaNamespace.InputJsonValue);
}

async function ClearPluginConfigCache(): Promise<void> {
  const Keys = await RedisClient.keys("Plugin:*");

  if (Keys.length > 0) {
    await RedisClient.del(...Keys);
  }
}

export { Get as GET, Post as POST };
