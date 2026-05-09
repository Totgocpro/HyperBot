import { Prisma as PrismaNamespace } from "@prisma/client";
import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { RequireSuperAdmin } from "@/src/Web/Auth";

const ExportFormat = "HyperBotAdminConfigExport";
const ExportVersion = 2;

type ConfigExport = {
  Format: typeof ExportFormat;
  Version: typeof ExportVersion;
  ExportedAt: string;
  Data: {
    DiscordBots: Array<{
      Id: string;
      ClientId: string;
      Token: string;
      Name: string;
      AvatarUrl: string | null;
      IsEnabled: boolean;
    }>;
    BotDisabledPlugins: Array<{
        BotId: string;
        PluginId: string;
    }>;
    GuildAccess: Array<{
      BotId: string;
      GuildId: string;
      IsAllowed: boolean;
      RestrictedReason: string | null;
    }>;
    GuildRoleGrants: Array<{
      BotId: string;
      GuildId: string;
      DiscordId: string;
      Role: "GuildOwner" | "GuildAdmin";
      AllowedPluginIds: unknown;
    }>;
    PluginGlobalConfigs: Array<{
      BotId: string;
      GuildId: string;
      PluginId: string;
      Key: string;
      Value: unknown;
    }>;
    UserPluginValues: Array<{
      BotId: string;
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

  const [
    DiscordBotRows,
    BotDisabledPluginRows,
    GuildAccessRows,
    GuildRoleGrantRows,
    PluginGlobalConfigRows,
    UserPluginValueRows,
    SystemSettingRows
  ] = await Promise.all([
    Prisma.discordBot.findMany({ orderBy: { CreatedAt: "asc" } }),
    Prisma.botDisabledPlugin.findMany({ orderBy: [{ BotId: "asc" }, { PluginId: "asc" }] }),
    Prisma.guildAccess.findMany({ orderBy: [{ BotId: "asc" }, { GuildId: "asc" }] }),
    Prisma.guildRoleGrant.findMany({ orderBy: [{ BotId: "asc" }, { GuildId: "asc" }, { DiscordId: "asc" }] }),
    Prisma.pluginGlobalConfig.findMany({ orderBy: [{ BotId: "asc" }, { GuildId: "asc" }, { PluginId: "asc" }, { Key: "asc" }] }),
    Prisma.userPluginValue.findMany({ orderBy: [{ BotId: "asc" }, { GuildId: "asc" }, { UserId: "asc" }, { PluginId: "asc" }, { Key: "asc" }] }),
    Prisma.systemSetting.findMany({ orderBy: { Key: "asc" } })
  ]);

  const Payload: ConfigExport = {
    Format: ExportFormat,
    Version: ExportVersion,
    ExportedAt: new Date().toISOString(),
    Data: {
      DiscordBots: DiscordBotRows.map((Row) => ({
        Id: Row.Id,
        ClientId: Row.ClientId,
        Token: Row.Token,
        Name: Row.Name,
        AvatarUrl: Row.AvatarUrl,
        IsEnabled: Row.IsEnabled
      })),
      BotDisabledPlugins: BotDisabledPluginRows.map((Row) => ({
          BotId: Row.BotId,
          PluginId: Row.PluginId
      })),
      GuildAccess: GuildAccessRows.map((Row) => ({
        BotId: Row.BotId,
        GuildId: Row.GuildId,
        IsAllowed: Row.IsAllowed,
        RestrictedReason: Row.RestrictedReason
      })),
      GuildRoleGrants: GuildRoleGrantRows.map((Row) => ({
        BotId: Row.BotId,
        GuildId: Row.GuildId,
        DiscordId: Row.DiscordId,
        Role: Row.Role,
        AllowedPluginIds: Row.AllowedPluginIds
      })),
      PluginGlobalConfigs: PluginGlobalConfigRows.map((Row) => ({
        BotId: Row.BotId,
        GuildId: Row.GuildId,
        PluginId: Row.PluginId,
        Key: Row.Key,
        Value: Row.Value
      })),
      UserPluginValues: UserPluginValueRows.map((Row) => ({
        BotId: Row.BotId,
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
    DiscordBots: ParsedExport.Data.DiscordBots.length,
    BotDisabledPlugins: ParsedExport.Data.BotDisabledPlugins.length,
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
      await Transaction.botDisabledPlugin.deleteMany();
      await Transaction.botAccess.deleteMany();
      await Transaction.discordBot.deleteMany();
      await Transaction.systemSetting.deleteMany();
    }

    // 1. Import Bots first (needed for foreign keys)
    for (const Row of ParsedExport.Data.DiscordBots) {
      await Transaction.discordBot.upsert({
        where: { Id: Row.Id },
        create: {
          Id: Row.Id,
          ClientId: Row.ClientId,
          Token: Row.Token,
          Name: Row.Name,
          AvatarUrl: Row.AvatarUrl,
          IsEnabled: Row.IsEnabled
        },
        update: {
          ClientId: Row.ClientId,
          Token: Row.Token,
          Name: Row.Name,
          AvatarUrl: Row.AvatarUrl,
          IsEnabled: Row.IsEnabled
        }
      });
    }

    // Special case: if we are importing legacy data and have no bots yet, 
    // and the export has no bots but has data referencing "Legacy",
    // we need to make sure "Legacy" bot exists.
    const HasLegacyData = 
        ParsedExport.Data.GuildAccess.some(r => r.BotId === "Legacy") ||
        ParsedExport.Data.GuildRoleGrants.some(r => r.BotId === "Legacy") ||
        ParsedExport.Data.PluginGlobalConfigs.some(r => r.BotId === "Legacy") ||
        ParsedExport.Data.UserPluginValues.some(r => r.BotId === "Legacy") ||
        ParsedExport.Data.BotDisabledPlugins.some(r => r.BotId === "Legacy");

    if (HasLegacyData) {
        await Transaction.discordBot.upsert({
            where: { Id: "Legacy" },
            create: {
                Id: "Legacy",
                ClientId: "Legacy",
                Token: "Legacy",
                Name: "Legacy Bot (Placeholder)",
                IsEnabled: false
            },
            update: {}
        });
    }

    for (const Row of ParsedExport.Data.BotDisabledPlugins) {
        await Transaction.botDisabledPlugin.upsert({
            where: { BotId_PluginId: { BotId: Row.BotId, PluginId: Row.PluginId } },
            create: { BotId: Row.BotId, PluginId: Row.PluginId },
            update: {}
        });
    }

    for (const Row of ParsedExport.Data.GuildAccess) {
      await Transaction.guildAccess.upsert({
        where: { BotId_GuildId: { BotId: Row.BotId, GuildId: Row.GuildId } },
        create: {
          BotId: Row.BotId,
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
          BotId_GuildId_DiscordId: {
            BotId: Row.BotId,
            GuildId: Row.GuildId,
            DiscordId: Row.DiscordId
          }
        },
        create: {
          BotId: Row.BotId,
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
          BotId_GuildId_PluginId_Key: {
            BotId: Row.BotId,
            GuildId: Row.GuildId,
            PluginId: Row.PluginId,
            Key: Row.Key
          }
        },
        create: {
          BotId: Row.BotId,
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
          BotId_GuildId_UserId_PluginId_Key: {
            BotId: Row.BotId,
            GuildId: Row.GuildId,
            UserId: Row.UserId,
            PluginId: Row.PluginId,
            Key: Row.Key
          }
        },
        create: {
          BotId: Row.BotId,
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
  if (!IsRecord(Value) || Value.Format !== ExportFormat || !IsRecord(Value.Data)) {
    return null;
  }

  const Version = typeof Value.Version === "number" ? Value.Version : 1;

  return {
    Format: ExportFormat,
    Version: ExportVersion,
    ExportedAt: typeof Value.ExportedAt === "string" ? Value.ExportedAt : new Date().toISOString(),
    Data: {
      DiscordBots: Version >= 2 ? ParseArray(Value.Data.DiscordBots, ParseDiscordBotRow) : [],
      BotDisabledPlugins: Version >= 2 ? ParseArray(Value.Data.BotDisabledPlugins, ParseBotDisabledPluginRow) : [],
      GuildAccess: ParseArray(Value.Data.GuildAccess, (item) => ParseGuildAccessRow(item, Version)),
      GuildRoleGrants: ParseArray(Value.Data.GuildRoleGrants, (item) => ParseGuildRoleGrantRow(item, Version)),
      PluginGlobalConfigs: ParseArray(Value.Data.PluginGlobalConfigs, (item) => ParsePluginGlobalConfigRow(item, Version)),
      UserPluginValues: ParseArray(Value.Data.UserPluginValues, (item) => ParseUserPluginValueRow(item, Version)),
      SystemSettings: ParseArray(Value.Data.SystemSettings, ParseSystemSettingRow)
    }
  };
}

function ParseDiscordBotRow(Value: unknown): ConfigExport["Data"]["DiscordBots"][number] | null {
  if (!IsRecord(Value) || typeof Value.Id !== "string" || typeof Value.Token !== "string" || typeof Value.ClientId !== "string") {
    return null;
  }

  return {
    Id: Value.Id,
    ClientId: Value.ClientId,
    Token: Value.Token,
    Name: typeof Value.Name === "string" ? Value.Name : "Imported Bot",
    AvatarUrl: typeof Value.AvatarUrl === "string" ? Value.AvatarUrl : null,
    IsEnabled: typeof Value.IsEnabled === "boolean" ? Value.IsEnabled : true
  };
}

function ParseBotDisabledPluginRow(Value: unknown): ConfigExport["Data"]["BotDisabledPlugins"][number] | null {
    if (!IsRecord(Value) || typeof Value.BotId !== "string" || typeof Value.PluginId !== "string") {
        return null;
    }
    return {
        BotId: Value.BotId,
        PluginId: Value.PluginId
    };
}

function ParseGuildAccessRow(Value: unknown, Version: number): ConfigExport["Data"]["GuildAccess"][number] | null {
  if (!IsRecord(Value) || typeof Value.GuildId !== "string" || typeof Value.IsAllowed !== "boolean") {
    return null;
  }

  return {
    BotId: Version >= 2 && typeof Value.BotId === "string" ? Value.BotId : "Legacy",
    GuildId: Value.GuildId,
    IsAllowed: Value.IsAllowed,
    RestrictedReason: typeof Value.RestrictedReason === "string" ? Value.RestrictedReason : null
  };
}

function ParseGuildRoleGrantRow(Value: unknown, Version: number): ConfigExport["Data"]["GuildRoleGrants"][number] | null {
  if (!IsRecord(Value) || typeof Value.GuildId !== "string" || typeof Value.DiscordId !== "string" || (Value.Role !== "GuildOwner" && Value.Role !== "GuildAdmin")) {
    return null;
  }

  return {
    BotId: Version >= 2 && typeof Value.BotId === "string" ? Value.BotId : "Legacy",
    GuildId: Value.GuildId,
    DiscordId: Value.DiscordId,
    Role: Value.Role,
    AllowedPluginIds: Value.AllowedPluginIds ?? null
  };
}

function ParsePluginGlobalConfigRow(Value: unknown, Version: number): ConfigExport["Data"]["PluginGlobalConfigs"][number] | null {
  if (!IsRecord(Value) || typeof Value.GuildId !== "string" || typeof Value.PluginId !== "string" || typeof Value.Key !== "string") {
    return null;
  }

  return {
    BotId: Version >= 2 && typeof Value.BotId === "string" ? Value.BotId : "Legacy",
    GuildId: Value.GuildId,
    PluginId: Value.PluginId,
    Key: Value.Key,
    Value: Value.Value ?? null
  };
}

function ParseUserPluginValueRow(Value: unknown, Version: number): ConfigExport["Data"]["UserPluginValues"][number] | null {
  if (!IsRecord(Value) || typeof Value.GuildId !== "string" || typeof Value.UserId !== "string" || typeof Value.PluginId !== "string" || typeof Value.Key !== "string") {
    return null;
  }

  return {
    BotId: Version >= 2 && typeof Value.BotId === "string" ? Value.BotId : "Legacy",
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
  const Keys = await RedisClient.keys("Bot:*:Plugin:*");

  if (Keys.length > 0) {
    await RedisClient.del(...Keys);
  }
}

export { Get as GET, Post as POST };
