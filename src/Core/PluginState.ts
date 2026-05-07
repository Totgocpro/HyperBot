import type { PrismaClient } from "@prisma/client";

export const DisabledPluginsSettingKey = "DisabledPluginIds";

export async function GetDisabledPluginIds(Prisma: PrismaClient): Promise<string[]> {
  const Setting = await Prisma.systemSetting.findUnique({
    where: { Key: DisabledPluginsSettingKey }
  });
  const Value = Setting?.Value;

  return Array.isArray(Value) ? Value.filter((PluginId): PluginId is string => typeof PluginId === "string") : [];
}

export async function IsPluginDisabled(Prisma: PrismaClient, PluginId: string): Promise<boolean> {
  return (await GetDisabledPluginIds(Prisma)).includes(PluginId);
}

export async function SetPluginDisabled(Prisma: PrismaClient, PluginId: string, IsDisabled: boolean): Promise<void> {
  const DisabledPluginIds = new Set(await GetDisabledPluginIds(Prisma));

  if (IsDisabled) {
    DisabledPluginIds.add(PluginId);
  } else {
    DisabledPluginIds.delete(PluginId);
  }

  await Prisma.systemSetting.upsert({
    where: { Key: DisabledPluginsSettingKey },
    create: {
      Key: DisabledPluginsSettingKey,
      Value: Array.from(DisabledPluginIds)
    },
    update: {
      Value: Array.from(DisabledPluginIds)
    }
  });
}
