import Path from "node:path";
import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { ScanPluginManifests } from "@/src/Core/PluginScanner";
import { PluginStorage } from "@/src/Core/Storage";
import { SettingsFieldType, PluginScope, type BotChannelSummary, type BotRoleSummary, type DiscordGuildSummary, type SettingsField } from "@/src/Core/Types";
import { CreateAccessControl, RequireDashboardUser } from "@/src/Web/Auth";

type RouteContext = {
  params: Promise<{ guildId: string }>;
};

async function Get(Request: Request, Context: RouteContext): Promise<Response> {
  const GuildId = await ResolveGuildId(Context);
  const User = await ResolveDashboardUser(Request);

  if (User instanceof Response) {
    return User;
  }

  const AccessControl = CreateAccessControl();
  const Guild = BuildServerTrustedGuildSummary(GuildId);
  const AccessLevel = await AccessControl.GetAccessLevel(User.DiscordId, Guild);

  if (!AccessLevel) {
    return new Response("Insufficient guild permissions.", { status: 403 });
  }

  const PluginDirectory = Path.resolve(process.env.PLUGIN_DIRECTORY ?? "Plugins");
  const ManifestEntries = (await ScanPluginManifests(PluginDirectory)).filter((ManifestEntry) => ManifestEntry.Manifest.Scope !== PluginScope.Global);
  const AvailablePluginIds = new Set(ManifestEntries.map((ManifestEntry) => ManifestEntry.Manifest.Metadata.Id));
  const AllowedManifestEntries = [];

  for (const ManifestEntry of ManifestEntries) {
    if (await AccessControl.CanManagePlugin(User.DiscordId, Guild, ManifestEntry.Manifest.Metadata.Id)) {
      AllowedManifestEntries.push(ManifestEntry);
    }
  }

  const Plugins = await Promise.all(
    AllowedManifestEntries.map(async (ManifestEntry) => {
      const Storage = new PluginStorage(Prisma, RedisClient, ManifestEntry.Manifest.Metadata.Id);
      const Fields = await Promise.all(
        ManifestEntry.Manifest.WebInterface.map(async (Field) => {
          const StoredValue = await Storage.GetGlobalConfig(GuildId, Field.Key);

          return {
            ...(await HydrateSettingsField(GuildId, Field)),
            Value: StoredValue ?? Field.Default
          };
        })
      );

      return {
        Metadata: ManifestEntry.Manifest.Metadata,
        Dependencies: ManifestEntry.Manifest.Dependencies ?? [],
        DependencyErrors: BuildDependencyErrors(ManifestEntry.Manifest.Dependencies ?? [], AvailablePluginIds),
        Commands: ManifestEntry.Manifest.Commands,
        WebInterface: Fields,
        DashboardElements: await Promise.all(
          (ManifestEntry.Manifest.DashboardElements ?? []).map(async (Element) => ({
            ...Element,
            Value: (await Storage.GetGlobalConfig(GuildId, Element.DataSourceKey)) ?? {}
          }))
        )
      };
    })
  );

  return NextResponse.json({ GuildId, Plugins });
}

async function Put(Request: Request, Context: RouteContext): Promise<Response> {
  const GuildId = await ResolveGuildId(Context);
  const User = await ResolveDashboardUser(Request);

  if (User instanceof Response) {
    return User;
  }

  const AccessControl = CreateAccessControl();
  const Guild = BuildServerTrustedGuildSummary(GuildId);
  const Body = (await Request.json()) as { PluginId?: string; Values?: Record<string, unknown> };

  if (!Body.PluginId || !Body.Values) {
    return new Response("PluginId and Values are required.", { status: 400 });
  }

  if (!(await AccessControl.CanManagePlugin(User.DiscordId, Guild, Body.PluginId))) {
    return new Response("Insufficient guild plugin permissions.", { status: 403 });
  }

  const PluginDirectory = Path.resolve(process.env.PLUGIN_DIRECTORY ?? "Plugins");
  const ManifestEntry = (await ScanPluginManifests(PluginDirectory)).find((Entry) => Entry.Manifest.Metadata.Id === Body.PluginId);

  if (!ManifestEntry) {
    return new Response("Plugin not found.", { status: 404 });
  }

  const AvailablePluginIds = new Set((await ScanPluginManifests(PluginDirectory)).map((Entry) => Entry.Manifest.Metadata.Id));
  const DependencyErrors = BuildDependencyErrors(ManifestEntry.Manifest.Dependencies ?? [], AvailablePluginIds);

  if (DependencyErrors.length > 0) {
    return new Response(DependencyErrors.join(" "), { status: 400 });
  }

  for (const Field of ManifestEntry.Manifest.WebInterface.filter((FieldValue) => FieldValue.Type !== SettingsFieldType.Button)) {
    if (Field.Required && !Body.Values[Field.Key]) {
      return new Response(`${Field.Label} is required.`, { status: 400 });
    }
  }

  const Storage = new PluginStorage(Prisma, RedisClient, Body.PluginId);
  const PersistableKeys = new Set(
    ManifestEntry.Manifest.WebInterface.filter((FieldValue) => FieldValue.Type !== SettingsFieldType.Button).map((Field) => Field.Key)
  );

  for (const [Key, Value] of Object.entries(Body.Values)) {
    if (!PersistableKeys.has(Key)) {
      continue;
    }

    await Storage.SetGlobalConfig(GuildId, Key, Value);
  }

  return NextResponse.json({ GuildId, PluginId: Body.PluginId, Saved: true });
}

function BuildDependencyErrors(Dependencies: string[], AvailablePluginIds: Set<string>): string[] {
  return Dependencies
    .filter((DependencyId) => !AvailablePluginIds.has(DependencyId))
    .map((DependencyId) => `Missing required plugin dependency: ${DependencyId}.`);
}

async function HydrateSettingsField(GuildId: string, Field: SettingsField): Promise<SettingsField> {
  if (
    Field.Type !== SettingsFieldType.ChannelPicker &&
    Field.Type !== SettingsFieldType.RolePicker &&
    !(Field.Type === SettingsFieldType.List && (Field.ItemType === "ChannelPicker" || Field.ItemType === "RolePicker"))
  ) {
    return Field;
  }

  if (Field.Type === SettingsFieldType.RolePicker || (Field.Type === SettingsFieldType.List && Field.ItemType === "RolePicker")) {
    const RawRoles = await RedisClient.get(`Bot:Guild:${GuildId}:Roles`);
    const Roles = RawRoles ? (JSON.parse(RawRoles) as BotRoleSummary[]) : [];

    return {
      ...Field,
      Options: Roles.map((Role) => ({
        Label: `@${Role.Name}`,
        Value: Role.Id,
        Description: `Position ${Role.Position}`
      }))
    };
  }

  const RawChannels = await RedisClient.get(`Bot:Guild:${GuildId}:Channels`);
  const Channels = RawChannels ? (JSON.parse(RawChannels) as BotChannelSummary[]) : [];
  const SupportedChannelTypes = new Set(Field.SupportedChannelTypes ?? []);
  const Options = Channels.map((Channel) => {
    const TypeAllowed = SupportedChannelTypes.size === 0 || SupportedChannelTypes.has(Channel.Type);
    const WritableAllowed = !Field.RequireWritable || Channel.IsWritable;
    const Disabled = !TypeAllowed || !WritableAllowed;
    const Description = Disabled
      ? !TypeAllowed
        ? `Unsupported channel type: ${Channel.Type}`
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

function BuildServerTrustedGuildSummary(GuildId: string): DiscordGuildSummary {
  return {
    Id: GuildId,
    Name: GuildId,
    Icon: null,
    Owner: false,
    Permissions: "0"
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

export { Get as GET, Put as PUT };
