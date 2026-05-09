import type { PrismaClient } from "@prisma/client";

export async function GetDisabledPluginIds(Prisma: PrismaClient, BotId: string): Promise<string[]> {
  const DisabledPlugins = await Prisma.botDisabledPlugin.findMany({
    where: { BotId }
  });

  return DisabledPlugins.map((Plugin) => Plugin.PluginId);
}

export async function IsPluginDisabled(Prisma: PrismaClient, BotId: string, PluginId: string): Promise<boolean> {
  const DisabledPlugin = await Prisma.botDisabledPlugin.findUnique({
    where: {
      BotId_PluginId: {
        BotId,
        PluginId
      }
    }
  });

  return !!DisabledPlugin;
}

export async function SetPluginDisabled(Prisma: PrismaClient, BotId: string, PluginId: string, IsDisabled: boolean): Promise<void> {
  if (IsDisabled) {
    await Prisma.botDisabledPlugin.upsert({
      where: {
        BotId_PluginId: {
          BotId,
          PluginId
        }
      },
      create: {
        BotId,
        PluginId
      },
      update: {}
    });
  } else {
    await Prisma.botDisabledPlugin.deleteMany({
      where: {
        BotId,
        PluginId
      }
    });
  }
}
