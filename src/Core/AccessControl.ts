import type { PrismaClient } from "@prisma/client";
import { AccessLevel, type DiscordGuildSummary } from "./Types.js";

const AdministratorPermission = BigInt(0x8);
const ManageGuildPermission = BigInt(0x20);

export class AccessControl {
  private readonly Prisma: PrismaClient;
  private readonly SuperAdminIds: Set<string>;

  public constructor(Prisma: PrismaClient, SuperAdminIds: string[]) {
    this.Prisma = Prisma;
    this.SuperAdminIds = new Set(SuperAdminIds.filter(Boolean));
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

  public HasDiscordGuildManagementPermission(Guild: DiscordGuildSummary): boolean {
    if (Guild.Owner) {
      return true;
    }

    const Permissions = BigInt(Guild.Permissions);
    return (Permissions & AdministratorPermission) === AdministratorPermission || (Permissions & ManageGuildPermission) === ManageGuildPermission;
  }

  public async CanUseGuild(GuildId: string): Promise<boolean> {
    const GuildAccess = await this.Prisma.guildAccess.findUnique({
      where: { GuildId }
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

    const GuildRoleGrant = await this.Prisma.guildRoleGrant.findUnique({
      where: {
        GuildId_DiscordId: {
          GuildId: Guild.Id,
          DiscordId
        }
      }
    });

    if (GuildRoleGrant?.Role === "GuildAdmin") {
      return AccessLevel.GuildAdmin;
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

    if (AccessLevelValue !== AccessLevel.GuildAdmin) {
      return false;
    }

    const GuildRoleGrant = await this.Prisma.guildRoleGrant.findUnique({
      where: {
        GuildId_DiscordId: {
          GuildId: Guild.Id,
          DiscordId
        }
      }
    });

    const AllowedPluginIds = GuildRoleGrant?.AllowedPluginIds;
    return Array.isArray(AllowedPluginIds) && AllowedPluginIds.includes(PluginId);
  }

  public async SetGuildAllowed(GuildId: string, IsAllowed: boolean, RestrictedReason?: string): Promise<void> {
    await this.Prisma.guildAccess.upsert({
      where: { GuildId },
      update: { IsAllowed, RestrictedReason },
      create: { GuildId, IsAllowed, RestrictedReason }
    });
  }
}
