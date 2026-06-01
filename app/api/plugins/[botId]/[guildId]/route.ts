import Path from "node:path";
import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { ScanPluginManifests } from "@/src/Core/PluginScanner";
import { GetDisabledPluginIds } from "@/src/Core/PluginState";
import { PluginStorage } from "@/src/Core/Storage";
import { SettingsFieldType, PluginScope, type BotChannelSummary, type BotRoleSummary, type DiscordGuildSummary, type SettingsField } from "@/src/Core/Types";
import { CreateAccessControl, RequireDashboardUser } from "@/src/Web/Auth";

type RouteContext = {
  params: Promise<{ botId: string; guildId: string }>;
};

async function Get(Request: Request, Context: RouteContext): Promise<Response> {
  const { botId, guildId } = await Context.params;
  const User = await ResolveDashboardUser(Request);

  if (User instanceof Response) {
    return User;
  }

  const AccessControl = CreateAccessControl(botId);
  const IsGlobal = guildId === "Global";

  if (IsGlobal) {
      if (!(await AccessControl.CanManageBot(User.Id, botId))) {
          return new Response("Insufficient bot management permissions.", { status: 403 });
      }
  } else {
      const Guild = BuildServerTrustedGuildSummary(guildId);
      const AccessLevel = await AccessControl.GetAccessLevel(User.DiscordId, Guild);
      if (!AccessLevel) {
          return new Response("Insufficient guild permissions.", { status: 403 });
      }
  }

  const PluginDirectory = Path.resolve(process.env.PLUGIN_DIRECTORY ?? "Plugins");
  const DisabledPluginIds = new Set(await GetDisabledPluginIds(Prisma, botId));
  
  const AllManifestEntries = await ScanPluginManifests(PluginDirectory);
  const ManifestEntries = AllManifestEntries.filter((ManifestEntry) => {
      const MatchesScope = IsGlobal 
        ? ManifestEntry.Manifest.Scope === PluginScope.Global 
        : ManifestEntry.Manifest.Scope !== PluginScope.Global;
      return MatchesScope && !DisabledPluginIds.has(ManifestEntry.Manifest.Metadata.Id);
  });

  const AvailablePluginIds = new Set(AllManifestEntries.map((ManifestEntry) => ManifestEntry.Manifest.Metadata.Id));
  const AllowedManifestEntries = [];

  for (const ManifestEntry of ManifestEntries) {
    if (IsGlobal) {
        AllowedManifestEntries.push(ManifestEntry);
    } else {
        const Guild = BuildServerTrustedGuildSummary(guildId);
        if (await AccessControl.CanManagePlugin(User.DiscordId, Guild, ManifestEntry.Manifest.Metadata.Id)) {
            AllowedManifestEntries.push(ManifestEntry);
        }
    }
  }

  const Plugins = await Promise.all(
    AllowedManifestEntries.map(async (ManifestEntry) => {
      const Storage = new PluginStorage(Prisma, RedisClient, botId, ManifestEntry.Manifest.Metadata.Id);
      const Fields = await Promise.all(
        ManifestEntry.Manifest.WebInterface.map(async (Field) => {
          const StoredValue = await Storage.GetGlobalConfig(guildId, Field.Key);

          return {
            ...(await HydrateSettingsField(botId, guildId, Field)),
            Value: StoredValue ?? Field.Default
          };
        })
      );

      return {
        Metadata: ManifestEntry.Manifest.Metadata,
        Category: ManifestEntry.Manifest.Category,
        Dependencies: ManifestEntry.Manifest.Dependencies ?? [],
        DependencyErrors: BuildDependencyErrors(ManifestEntry.Manifest.Dependencies ?? [], AvailablePluginIds),
        Commands: ManifestEntry.Manifest.Commands,
        WebInterface: Fields,
        DashboardElements: await Promise.all(
          (ManifestEntry.Manifest.DashboardElements ?? []).map(async (Element) => ({
            ...Element,
            Value: (await Storage.GetGlobalConfig(guildId, Element.DataSourceKey)) ?? {}
          }))
        )
      };
    })
  );

  return NextResponse.json({ GuildId: guildId, Plugins });
}

async function Put(Request: Request, Context: RouteContext): Promise<Response> {
  const { botId, guildId } = await Context.params;
  const User = await ResolveDashboardUser(Request);

  if (User instanceof Response) {
    return User;
  }

  const AccessControl = CreateAccessControl(botId);
  const IsGlobal = guildId === "Global";
  const Body = (await Request.json()) as { PluginId?: string; Values?: Record<string, unknown> };

  if (!Body.PluginId || !Body.Values) {
    return new Response("PluginId and Values are required.", { status: 400 });
  }

  if (IsGlobal) {
      if (!(await AccessControl.CanManageBot(User.Id, botId))) {
          return new Response("Insufficient bot management permissions.", { status: 403 });
      }
  } else {
      const Guild = BuildServerTrustedGuildSummary(guildId);
      if (!(await AccessControl.CanManagePlugin(User.DiscordId, Guild, Body.PluginId))) {
        return new Response("Insufficient guild plugin permissions.", { status: 403 });
      }
  }

  const PluginDirectory = Path.resolve(process.env.PLUGIN_DIRECTORY ?? "Plugins");
  const DisabledPluginIds = new Set(await GetDisabledPluginIds(Prisma, botId));
  const ManifestEntry = (await ScanPluginManifests(PluginDirectory)).find((Entry) => Entry.Manifest.Metadata.Id === Body.PluginId);

  if (!ManifestEntry || DisabledPluginIds.has(Body.PluginId)) {
    return new Response("Plugin not found.", { status: 404 });
  }

  if (IsGlobal && ManifestEntry.Manifest.Scope !== PluginScope.Global) {
      return new Response("Only global plugins can be updated in global context.", { status: 400 });
  }

  if (!IsGlobal && ManifestEntry.Manifest.Scope === PluginScope.Global) {
      return new Response("Global plugins cannot be updated in guild context.", { status: 400 });
  }

  const AvailablePluginIds = new Set(
    (await ScanPluginManifests(PluginDirectory))
      .filter((Entry) => !DisabledPluginIds.has(Entry.Manifest.Metadata.Id))
      .map((Entry) => Entry.Manifest.Metadata.Id)
  );
  const DependencyErrors = BuildDependencyErrors(ManifestEntry.Manifest.Dependencies ?? [], AvailablePluginIds);

  if (DependencyErrors.length > 0) {
    return new Response(DependencyErrors.join(" "), { status: 400 });
  }

  for (const Field of ManifestEntry.Manifest.WebInterface.filter((FieldValue) => FieldValue.Type !== SettingsFieldType.Button && FieldValue.Type !== SettingsFieldType.Custom)) {
    if (Field.Required && !Body.Values[Field.Key]) {
      return new Response(`${Field.Label} is required.`, { status: 400 });
    }
  }

  const Storage = new PluginStorage(Prisma, RedisClient, botId, Body.PluginId);
  const PersistableKeys = new Set(
    ManifestEntry.Manifest.WebInterface.filter((FieldValue) => FieldValue.Type !== SettingsFieldType.Button && FieldValue.Type !== SettingsFieldType.Custom).map((Field) => Field.Key)
  );

  for (const [Key, Value] of Object.entries(Body.Values)) {
    if (!PersistableKeys.has(Key)) {
      continue;
    }

    await Storage.SetGlobalConfig(guildId, Key, Value);
  }

  return NextResponse.json({ GuildId: guildId, PluginId: Body.PluginId, Saved: true });
}

function BuildDependencyErrors(Dependencies: string[], AvailablePluginIds: Set<string>): string[] {
  return Dependencies
    .filter((DependencyId) => !AvailablePluginIds.has(DependencyId))
    .map((DependencyId) => `Missing required plugin dependency: ${DependencyId}.`);
}

async function HydrateSettingsField(BotId: string, GuildId: string, Field: SettingsField): Promise<SettingsField> {
  if (
    Field.Type !== SettingsFieldType.ChannelPicker &&
    Field.Type !== SettingsFieldType.RolePicker &&
    !(Field.Type === SettingsFieldType.List && (Field.ItemType === "ChannelPicker" || Field.ItemType === "RolePicker"))
  ) {
    return Field;
  }

  if (Field.Type === SettingsFieldType.RolePicker || (Field.Type === SettingsFieldType.List && Field.ItemType === "RolePicker")) {
    const RawRoles = await RedisClient.get(`Bot:${BotId}:Guild:${GuildId}:Roles`);
    const Roles = RawRoles ? (JSON.parse(RawRoles) as BotRoleSummary[]) : [];

    return {
      ...Field,
      Options: Roles.map((Role) => ({
        Label: `@${Role.Name}`,
        Value: Role.Id,
        Description: `Position ${Role.Position}`,
        Color: Role.Color
      }))
    };
  }

  const RawChannels = await RedisClient.get(`Bot:${BotId}:Guild:${GuildId}:Channels`);
  const Channels = RawChannels ? (JSON.parse(RawChannels) as BotChannelSummary[]) : [];
  const SupportedChannelTypes = new Set(Field.SupportedChannelTypes ?? []);
  const Options = Channels.map((Channel) => {
    const TypeAllowed = IsChannelTypeAllowed(SupportedChannelTypes, Channel);
    const WritableAllowed = !Field.RequireWritable || Channel.IsWritable;
    const Disabled = !TypeAllowed || !WritableAllowed;
    const Description = Disabled
      ? !TypeAllowed
        ? GetUnsupportedChannelDescription(SupportedChannelTypes, Channel)
        : "The bot cannot write in this channel."
      : Channel.Type;

    return {
      Label: `#${Channel.Name} (${Channel.Type})`,
      Value: Channel.Id,
      Disabled,
      Description
    };
  });

  return {
    ...Field,
    Options
  };
}

function IsChannelTypeAllowed(SupportedChannelTypes: Set<string>, Channel: BotChannelSummary): boolean {
  if (SupportedChannelTypes.size === 0 || SupportedChannelTypes.has(Channel.Type)) {
    return true;
  }

  if (SupportedChannelTypes.has("GuildText") && IsAnnouncementChannelType(Channel.Type)) {
    return Channel.IsWritable;
  }

  return false;
}

function GetUnsupportedChannelDescription(SupportedChannelTypes: Set<string>, Channel: BotChannelSummary): string {
  if (SupportedChannelTypes.has("GuildText") && IsAnnouncementChannelType(Channel.Type) && !Channel.IsWritable) {
    return "The bot cannot write in this announcement channel.";
  }

  return `Unsupported channel type: ${Channel.Type}`;
}

function IsAnnouncementChannelType(ChannelType: string): boolean {
  return ChannelType === "GuildAnnouncement" || ChannelType === "GuildNews";
}

function BuildServerTrustedGuildSummary(GuildId: string): DiscordGuildSummary {
  return {
    Id: GuildId,
    Name: GuildId,
    Icon: null,
    Owner: false,
    Permissions: "0"
  };
}

async function ResolveDashboardUser(Request: Request) {
  try {
    return await RequireDashboardUser(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }
}

export { Get as GET, Put as PUT };
