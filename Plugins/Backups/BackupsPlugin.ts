import {
  ChannelType,
  OverwriteType,
  PermissionsBitField,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
  type GuildChannel,
  type GuildChannelCreateOptions,
  type ForumChannel,
  type NewsChannel,
  type OverwriteResolvable,
  type Role,
  type TextChannel,
  type VoiceChannel
} from "discord.js";
import { Prisma } from "../../src/Core/Clients.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type BackupArchive = {
  Id: string;
  Name: string;
  GuildId: string;
  GuildName: string;
  CreatedAt: string;
  CreatedBy: string;
  SchemaVersion: 1;
  Snapshot: BackupSnapshot;
};

type BackupSnapshot = {
  Roles: BackupRole[];
  Channels: BackupChannel[];
  PluginConfigs: BackupPluginConfig[];
};

type BackupRole = {
  Id: string;
  Name: string;
  Color: number;
  Hoist: boolean;
  Mentionable: boolean;
  Permissions: string;
  Position: number;
};

type BackupChannel = {
  Id: string;
  Name: string;
  Type: ChannelType.GuildCategory | ChannelType.GuildText | ChannelType.GuildAnnouncement | ChannelType.GuildVoice | ChannelType.GuildForum;
  ParentId: string | null;
  Position: number;
  Topic: string | null;
  Nsfw: boolean;
  RateLimitPerUser: number;
  Bitrate: number | null;
  UserLimit: number | null;
  PermissionOverwrites: BackupPermissionOverwrite[];
};

type BackupPermissionOverwrite = {
  Id: string;
  Type: "Role" | "Member";
  Allow: string;
  Deny: string;
};

type BackupSupportedChannel = CategoryChannel | TextChannel | NewsChannel | VoiceChannel | ForumChannel;

type BackupPluginConfig = {
  PluginId: string;
  Key: string;
  Value: unknown;
};

type BackupActionPayload = {
  BackupId?: string;
  BackupName?: string;
  DeleteUnknownObjects?: boolean;
};

const BackupsStorageKey = "Backups";
const MaxBackups = 15;

export default class BackupsPlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.Logger.Info("Backups plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Backups plugin disabled.");
  }

  public async OnDashboardAction(GuildId: string, ActionKey: string, ActorId: string, Payload?: unknown): Promise<void> {
    if (ActionKey === "CreateBackup") {
      const ParsedPayload = this.ParseActionPayload(Payload);
      await this.CreateBackup(GuildId, ActorId, ParsedPayload.BackupName);
      return;
    }

    if (ActionKey === "RestoreLatestBackup") {
      const Backups = await this.GetBackups(GuildId);
      const LatestBackup = Backups[0];

      if (!LatestBackup) {
        this.Logger.Warn("Restore latest backup ignored because no backup exists.", { GuildId, ActorId });
        return;
      }

      await this.RestoreBackup(GuildId, LatestBackup.Id, ActorId, this.ParseActionPayload(Payload).DeleteUnknownObjects);
      return;
    }

    if (ActionKey === "RestoreBackup") {
      const ParsedPayload = this.ParseActionPayload(Payload);

      if (!ParsedPayload.BackupId) {
        this.Logger.Warn("Restore backup ignored because BackupId is missing.", { GuildId, ActorId });
        return;
      }

      await this.RestoreBackup(GuildId, ParsedPayload.BackupId, ActorId, ParsedPayload.DeleteUnknownObjects);
    }
  }

  private async CreateBackup(GuildId: string, ActorId: string, PayloadBackupName?: string): Promise<void> {
    const Guild = await this.ResolveGuild(GuildId);

    if (!Guild) {
      this.Logger.Warn("Backup creation failed because the guild is unavailable.", { GuildId, ActorId });
      return;
    }

    await Guild.roles.fetch();
    await Guild.channels.fetch();

    const BackupName = (PayloadBackupName ?? (await this.Storage.GetGlobalConfig<string>(GuildId, "BackupName")) ?? "Manual backup").trim() || "Manual backup";
    const Archive: BackupArchive = {
      Id: this.CreateArchiveId(),
      Name: BackupName,
      GuildId,
      GuildName: Guild.name,
      CreatedAt: new Date().toISOString(),
      CreatedBy: ActorId,
      SchemaVersion: 1,
      Snapshot: {
        Roles: this.CaptureRoles(Guild),
        Channels: this.CaptureChannels(Guild),
        PluginConfigs: await this.CapturePluginConfigs(GuildId)
      }
    };

    const Backups = await this.GetBackups(GuildId);
    await this.Storage.SetGlobalConfig(GuildId, BackupsStorageKey, [Archive, ...Backups].slice(0, MaxBackups));
    this.Logger.Info("Backup created.", {
      GuildId,
      BackupId: Archive.Id,
      Roles: Archive.Snapshot.Roles.length,
      Channels: Archive.Snapshot.Channels.length,
      PluginConfigs: Archive.Snapshot.PluginConfigs.length
    });
  }

  private async RestoreBackup(GuildId: string, BackupId: string, ActorId: string, PayloadDeleteUnknownObjects?: boolean): Promise<void> {
    const Guild = await this.ResolveGuild(GuildId);
    const Archive = (await this.GetBackups(GuildId)).find((Backup) => Backup.Id === BackupId);

    if (!Guild || !Archive) {
      this.Logger.Warn("Backup restore failed because the guild or archive is unavailable.", { GuildId, BackupId, ActorId });
      return;
    }

    const BotMember = Guild.members.me ?? (await Guild.members.fetchMe().catch(() => null));

    if (!BotMember?.permissions.has([PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.ManageChannels])) {
      this.Logger.Warn("Backup restore failed because the bot lacks Manage Roles or Manage Channels.", { GuildId, BackupId });
      return;
    }

    await Guild.roles.fetch();
    await Guild.channels.fetch();

    const RoleMap = await this.RestoreRoles(Guild, Archive.Snapshot.Roles);
    await this.RestoreChannels(Guild, Archive.Snapshot.Channels, RoleMap);
    await this.RestorePluginConfigs(GuildId, Archive.Snapshot.PluginConfigs);

    const DeleteUnknownObjects = PayloadDeleteUnknownObjects ?? ((await this.Storage.GetGlobalConfig<boolean>(GuildId, "DeleteUnknownObjects")) ?? false);

    if (DeleteUnknownObjects) {
      await this.DeleteUnknownChannels(Guild, Archive.Snapshot.Channels);
      await this.DeleteUnknownRoles(Guild, Archive.Snapshot.Roles);
    }

    this.Logger.Info("Backup restored.", { GuildId, BackupId, ActorId, DeleteUnknownObjects });
  }

  private CaptureRoles(Guild: Guild): BackupRole[] {
    return Guild.roles.cache
      .filter((RoleValue) => RoleValue.id !== Guild.id && !RoleValue.managed)
      .sort((FirstRole, SecondRole) => FirstRole.position - SecondRole.position)
      .map((RoleValue) => ({
        Id: RoleValue.id,
        Name: RoleValue.name,
        Color: RoleValue.color,
        Hoist: RoleValue.hoist,
        Mentionable: RoleValue.mentionable,
        Permissions: RoleValue.permissions.bitfield.toString(),
        Position: RoleValue.position
      }));
  }

  private CaptureChannels(Guild: Guild): BackupChannel[] {
    return Guild.channels.cache
      .filter((ChannelValue): ChannelValue is BackupSupportedChannel => this.IsBackupSupportedChannel(ChannelValue))
      .sort((FirstChannel, SecondChannel) => FirstChannel.rawPosition - SecondChannel.rawPosition)
      .map((ChannelValue) => this.CaptureChannel(ChannelValue));
  }

  private CaptureChannel(ChannelValue: BackupSupportedChannel): BackupChannel {
    const TextLikeChannel = this.IsTextLikeChannel(ChannelValue) ? ChannelValue : null;
    const VoiceChannelValue = ChannelValue.type === ChannelType.GuildVoice ? ChannelValue : null;

    return {
      Id: ChannelValue.id,
      Name: ChannelValue.name,
      Type: ChannelValue.type,
      ParentId: "parentId" in ChannelValue ? ChannelValue.parentId : null,
      Position: ChannelValue.rawPosition,
      Topic: TextLikeChannel?.topic ?? null,
      Nsfw: "nsfw" in ChannelValue ? ChannelValue.nsfw : false,
      RateLimitPerUser: "rateLimitPerUser" in ChannelValue ? ChannelValue.rateLimitPerUser ?? 0 : 0,
      Bitrate: VoiceChannelValue?.bitrate ?? null,
      UserLimit: VoiceChannelValue?.userLimit ?? null,
      PermissionOverwrites: "permissionOverwrites" in ChannelValue
        ? ChannelValue.permissionOverwrites.cache.map((Overwrite) => ({
            Id: Overwrite.id,
            Type: Overwrite.type === OverwriteType.Role ? "Role" : "Member",
            Allow: Overwrite.allow.bitfield.toString(),
            Deny: Overwrite.deny.bitfield.toString()
          }))
        : []
    };
  }

  private async CapturePluginConfigs(GuildId: string): Promise<BackupPluginConfig[]> {
    const Configs = await Prisma.pluginGlobalConfig.findMany({
      where: { GuildId },
      select: {
        PluginId: true,
        Key: true,
        Value: true
      }
    });

    return Configs.map((Config) => ({
      PluginId: Config.PluginId,
      Key: Config.Key,
      Value: Config.Value
    }));
  }

  private async RestoreRoles(Guild: Guild, Roles: BackupRole[]): Promise<Map<string, string>> {
    const RoleMap = new Map<string, string>([[Guild.id, Guild.id]]);
    const ExistingRoles = new Map(Guild.roles.cache.filter((RoleValue) => !RoleValue.managed).map((RoleValue) => [RoleValue.name, RoleValue]));

    for (const BackupRoleValue of Roles) {
      const ExistingRole = ExistingRoles.get(BackupRoleValue.Name);
      const PermissionBits = BigInt(BackupRoleValue.Permissions);
      const EditableRoleData = {
        name: BackupRoleValue.Name,
        color: BackupRoleValue.Color,
        hoist: BackupRoleValue.Hoist,
        mentionable: BackupRoleValue.Mentionable,
        permissions: new PermissionsBitField(PermissionBits)
      };
      const RestoredRole = ExistingRole
        ? await ExistingRole.edit(EditableRoleData).catch(() => ExistingRole)
        : await Guild.roles.create(EditableRoleData).catch(() => null);

      if (RestoredRole) {
        RoleMap.set(BackupRoleValue.Id, RestoredRole.id);
      }
    }

    await this.ApplyRolePositions(Guild, Roles, RoleMap);
    return RoleMap;
  }

  private async RestoreChannels(Guild: Guild, Channels: BackupChannel[], RoleMap: Map<string, string>): Promise<void> {
    const ChannelMap = new Map<string, string>();
    const Categories = Channels.filter((ChannelValue) => ChannelValue.Type === ChannelType.GuildCategory);
    const NonCategories = Channels.filter((ChannelValue) => ChannelValue.Type !== ChannelType.GuildCategory);

    for (const Category of Categories) {
      const RestoredCategory = await this.RestoreChannel(Guild, Category, RoleMap, null);

      if (RestoredCategory) {
        ChannelMap.set(Category.Id, RestoredCategory.id);
      }
    }

    for (const ChannelValue of NonCategories) {
      const ParentId = ChannelValue.ParentId ? ChannelMap.get(ChannelValue.ParentId) ?? null : null;
      const RestoredChannel = await this.RestoreChannel(Guild, ChannelValue, RoleMap, ParentId);

      if (RestoredChannel) {
        ChannelMap.set(ChannelValue.Id, RestoredChannel.id);
      }
    }

    await this.ApplyChannelPositions(Guild, Channels, ChannelMap);
  }

  private async RestoreChannel(Guild: Guild, ChannelValue: BackupChannel, RoleMap: Map<string, string>, ParentId: string | null): Promise<GuildChannel | null> {
    const ExistingChannel = Guild.channels.cache.find((GuildChannelValue) => GuildChannelValue.name === ChannelValue.Name && GuildChannelValue.type === ChannelValue.Type) as GuildChannel | undefined;
    const PermissionOverwrites = this.BuildPermissionOverwrites(ChannelValue, RoleMap);
    const BaseData: GuildChannelCreateOptions = {
      name: ChannelValue.Name,
      type: ChannelValue.Type,
      parent: ParentId ?? undefined,
      permissionOverwrites: PermissionOverwrites
    };

    const RestoredChannel = ExistingChannel ?? (await Guild.channels.create(BaseData).catch(() => null));

    if (!RestoredChannel) {
      this.Logger.Warn("Channel restore failed.", { GuildId: Guild.id, ChannelName: ChannelValue.Name });
      return null;
    }

    await RestoredChannel.edit({
      name: ChannelValue.Name,
      parent: ParentId ?? undefined,
      permissionOverwrites: PermissionOverwrites,
      topic: ChannelValue.Topic ?? undefined,
      nsfw: ChannelValue.Nsfw,
      rateLimitPerUser: ChannelValue.RateLimitPerUser,
      bitrate: ChannelValue.Bitrate ?? undefined,
      userLimit: ChannelValue.UserLimit ?? undefined
    }).catch(() => null);

    return RestoredChannel;
  }

  private async ApplyRolePositions(Guild: Guild, Roles: BackupRole[], RoleMap: Map<string, string>): Promise<void> {
    const RolesByPosition = [...Roles].sort((FirstRole, SecondRole) => FirstRole.Position - SecondRole.Position);

    for (const BackupRoleValue of RolesByPosition) {
      const RestoredRoleId = RoleMap.get(BackupRoleValue.Id);
      const RestoredRole = RestoredRoleId ? Guild.roles.cache.get(RestoredRoleId) : null;

      if (!RestoredRole || RestoredRole.managed || !RestoredRole.editable) {
        continue;
      }

      await RestoredRole.setPosition(BackupRoleValue.Position).catch((ErrorValue: unknown) => {
        this.Logger.Warn("Role position restore failed.", { GuildId: Guild.id, RoleName: BackupRoleValue.Name, Error: String(ErrorValue) });
      });
    }
  }

  private async ApplyChannelPositions(Guild: Guild, Channels: BackupChannel[], ChannelMap: Map<string, string>): Promise<void> {
    const ChannelsByPosition = [...Channels].sort((FirstChannel, SecondChannel) => FirstChannel.Position - SecondChannel.Position);

    for (const BackupChannelValue of ChannelsByPosition) {
      const RestoredChannelId = ChannelMap.get(BackupChannelValue.Id);
      const RestoredChannel = RestoredChannelId ? Guild.channels.cache.get(RestoredChannelId) : null;

      if (!RestoredChannel || !("setPosition" in RestoredChannel)) {
        continue;
      }

      await RestoredChannel.setPosition(BackupChannelValue.Position).catch((ErrorValue: unknown) => {
        this.Logger.Warn("Channel position restore failed.", { GuildId: Guild.id, ChannelName: BackupChannelValue.Name, Error: String(ErrorValue) });
      });
    }
  }

  private BuildPermissionOverwrites(ChannelValue: BackupChannel, RoleMap: Map<string, string>): OverwriteResolvable[] {
    const PermissionOverwrites: OverwriteResolvable[] = [];

    for (const Overwrite of ChannelValue.PermissionOverwrites) {
      const RestoredId = Overwrite.Type === "Role" ? RoleMap.get(Overwrite.Id) : Overwrite.Id;

      if (!RestoredId) {
        continue;
      }

      PermissionOverwrites.push({
        id: RestoredId,
        type: Overwrite.Type === "Role" ? OverwriteType.Role : OverwriteType.Member,
        allow: BigInt(Overwrite.Allow),
        deny: BigInt(Overwrite.Deny)
      });
    }

    return PermissionOverwrites;
  }

  private async RestorePluginConfigs(GuildId: string, Configs: BackupPluginConfig[]): Promise<void> {
    await Prisma.pluginGlobalConfig.deleteMany({
      where: {
        GuildId,
        NOT: {
          PluginId: "Backups",
          Key: BackupsStorageKey
        }
      }
    });

    for (const Config of Configs) {
      if (Config.PluginId === "Backups" && Config.Key === BackupsStorageKey) {
        continue;
      }

      await Prisma.pluginGlobalConfig.upsert({
        where: {
          GuildId_PluginId_Key: {
            GuildId,
            PluginId: Config.PluginId,
            Key: Config.Key
          }
        },
        update: { Value: Config.Value as never },
        create: {
          GuildId,
          PluginId: Config.PluginId,
          Key: Config.Key,
          Value: Config.Value as never
        }
      });
    }
  }

  private async DeleteUnknownChannels(Guild: Guild, Channels: BackupChannel[]): Promise<void> {
    const KnownChannelKeys = new Set(Channels.map((ChannelValue) => `${ChannelValue.Type}:${ChannelValue.Name}`));

    for (const ChannelValue of Guild.channels.cache.values()) {
      if (KnownChannelKeys.has(`${ChannelValue.type}:${ChannelValue.name}`)) {
        continue;
      }

      await ChannelValue.delete("Removed during backup restore.").catch(() => null);
    }
  }

  private async DeleteUnknownRoles(Guild: Guild, Roles: BackupRole[]): Promise<void> {
    const KnownRoleNames = new Set(Roles.map((RoleValue) => RoleValue.Name));

    for (const RoleValue of Guild.roles.cache.values()) {
      if (RoleValue.id === Guild.id || RoleValue.managed || KnownRoleNames.has(RoleValue.name)) {
        continue;
      }

      await RoleValue.delete("Removed during backup restore.").catch(() => null);
    }
  }

  private async GetBackups(GuildId: string): Promise<BackupArchive[]> {
    const StoredBackups = await this.Storage.GetGlobalConfig<unknown>(GuildId, BackupsStorageKey);

    if (!Array.isArray(StoredBackups)) {
      return [];
    }

    return StoredBackups.filter(this.IsBackupArchive);
  }

  private ParseActionPayload(Payload: unknown): BackupActionPayload {
    if (typeof Payload !== "object" || Payload === null || Array.isArray(Payload)) {
      return {};
    }

    const RecordPayload = Payload as Record<string, unknown>;
    return {
      BackupId: typeof RecordPayload.BackupId === "string" ? RecordPayload.BackupId : undefined,
      BackupName: typeof RecordPayload.BackupName === "string" ? RecordPayload.BackupName : undefined,
      DeleteUnknownObjects: typeof RecordPayload.DeleteUnknownObjects === "boolean" ? RecordPayload.DeleteUnknownObjects : undefined
    };
  }

  private async ResolveGuild(GuildId: string): Promise<Guild | null> {
    return await this.DiscordClient.guilds.fetch(GuildId).catch(() => null);
  }

  private CreateArchiveId(): string {
    return `Backup_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private IsBackupArchive(Value: unknown): Value is BackupArchive {
    return typeof Value === "object" && Value !== null && !Array.isArray(Value) && typeof (Value as BackupArchive).Id === "string";
  }

  private IsBackupSupportedChannel(ChannelValue: GuildBasedChannel): ChannelValue is BackupSupportedChannel {
    return [
      ChannelType.GuildCategory,
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildVoice,
      ChannelType.GuildForum
    ].includes(ChannelValue.type);
  }

  private IsTextLikeChannel(ChannelValue: GuildBasedChannel): ChannelValue is TextChannel | NewsChannel {
    return ChannelValue.type === ChannelType.GuildText || ChannelValue.type === ChannelType.GuildAnnouncement;
  }
}
