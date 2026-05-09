import type { PrismaClient } from "@prisma/client";
import { AccessLevel, type DiscordGuildSummary } from "./Types.js";

const AdministratorPermission = BigInt(0x8);
const ManageGuildPermission = BigInt(0x20);

export class AccessControl {
  private readonly Prisma: PrismaClient;
  private readonly SuperAdminIds: Set<string>;
  private readonly BotId?: string;

  public constructor(Prisma: PrismaClient, SuperAdminIds: string[], BotId?: string) {
    this.Prisma = Prisma;
    this.SuperAdminIds = new Set(SuperAdminIds.filter(Boolean));
    this.BotId = BotId;
  }

  public async IsSuperAdmin(DiscordId: string): Promise<boolean> {
    if (this.SuperAdminIds.has(DiscordId)) {
      return true;
    }

    const DashboardUser = await this.Prisma.dashboardUser.findUnique({
      where: { DiscordId }
    });

    return DashboardUser?.Role === "SuperAdmin";
  }

  public async CanManageBot(UserId: string, BotId: string): Promise<boolean> {
      const User = await this.Prisma.dashboardUser.findUnique({
          where: { Id: UserId }
      });
      return User?.Role === "SuperAdmin";
  }

  public HasDiscordGuildManagementPermission(Guild: DiscordGuildSummary): boolean {
    if (Guild.Owner) {
      return true;
    }

    const Permissions = BigInt(Guild.Permissions);
    return (Permissions & AdministratorPermission) === AdministratorPermission || (Permissions & ManageGuildPermission) === ManageGuildPermission;
  }

  public async CanUseGuild(GuildId: string): Promise<boolean> {
    if (!this.BotId) return true;
    const GuildAccess = await this.Prisma.guildAccess.findUnique({
      where: { BotId_GuildId: { BotId: this.BotId, GuildId } }
    });

    return GuildAccess?.IsAllowed ?? true;
  }

  public async GetAccessLevel(DiscordId: string, Guild: DiscordGuildSummary): Promise<AccessLevel | null> {
    if (await this.IsSuperAdmin(DiscordId)) {
      return AccessLevel.SuperAdmin;
    }

    if (!(await this.CanUseGuild(Guild.Id))) {
      return null;
    }

    if (this.BotId) {
        const GuildRoleGrant = await this.Prisma.guildRoleGrant.findUnique({
            where: {
              BotId_GuildId_DiscordId: {
                BotId: this.BotId,
                GuildId: Guild.Id,
                DiscordId
              }
            }
          });
      
          if (GuildRoleGrant?.Role === "GuildAdmin") {
            return AccessLevel.GuildAdmin;
          }
    }

    if (!this.HasDiscordGuildManagementPermission(Guild)) {
      return null;
    }

    if (Guild.Owner) {
      return AccessLevel.GuildOwner;
    }

    return null;
  }

  public async CanManagePlugin(DiscordId: string, Guild: DiscordGuildSummary, PluginId: string): Promise<boolean> {
    const AccessLevelValue = await this.GetAccessLevel(DiscordId, Guild);

    if (AccessLevelValue === AccessLevel.SuperAdmin || AccessLevelValue === AccessLevel.GuildOwner) {
      return true;
    }

    if (AccessLevelValue !== AccessLevel.GuildAdmin || !this.BotId) {
      return false;
    }

    const GuildRoleGrant = await this.Prisma.guildRoleGrant.findUnique({
      where: {
        BotId_GuildId_DiscordId: {
          BotId: this.BotId,
          GuildId: Guild.Id,
          DiscordId
        }
      }
    });

    const AllowedPluginIds = GuildRoleGrant?.AllowedPluginIds;
    return Array.isArray(AllowedPluginIds) && AllowedPluginIds.includes(PluginId);
  }

  public async SetGuildAllowed(GuildId: string, IsAllowed: boolean, RestrictedReason?: string): Promise<void> {
    if (!this.BotId) throw new Error("BotId is required to set guild allowed status.");
    await this.Prisma.guildAccess.upsert({
      where: { BotId_GuildId: { BotId: this.BotId, GuildId } },
      update: { IsAllowed, RestrictedReason },
      create: { BotId: this.BotId, GuildId, IsAllowed, RestrictedReason }
    });
  }
}
