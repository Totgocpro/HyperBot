import { promises as FileSystem } from "node:fs";
import Path from "node:path";
import { z } from "zod";
import { DashboardElementType, PluginScope, SettingsFieldType, type PluginManifest } from "./Types.js";

const SettingsFieldVisibilityRuleSchema = z.object({
  Key: z.string().min(1),
  Value: z.union([z.string(), z.number(), z.boolean()]),
  Operator: z.enum(["Equals", "NotEquals"]).optional()
});

const SettingsFieldSchema = z.object({
  Key: z.string().min(1),
  Type: z.nativeEnum(SettingsFieldType),
  Label: z.string().min(1),
  Default: z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.record(z.unknown()), z.null()]),
  Description: z.string().optional(),
  Section: z.string().min(1).optional(),
  Group: z.string().min(1).optional(),
  Collapsible: z.boolean().optional(),
  DefaultCollapsed: z.boolean().optional(),
  Required: z.boolean().optional(),
  ReadOnly: z.boolean().optional(),
  ButtonLabel: z.string().min(1).optional(),
  ActionKey: z.string().min(1).optional(),
  ActionKeys: z.array(z.string().min(1)).optional(),
  CustomRenderer: z.string().min(1).optional(),
  ItemType: z.enum(["String", "Number", "ChannelPicker", "RolePicker"]).optional(),
  ValidateAs: z.enum(["Regex"]).optional(),
  SupportedChannelTypes: z.array(z.string()).optional(),
  RequireWritable: z.boolean().optional(),
  VisibleWhen: z.union([SettingsFieldVisibilityRuleSchema, z.array(SettingsFieldVisibilityRuleSchema)]).optional(),
  VisibleWhenAny: z.array(SettingsFieldVisibilityRuleSchema).optional(),
  Options: z
    .array(
      z.object({
        Label: z.string(),
        Value: z.union([z.string(), z.number(), z.boolean()]),
        Disabled: z.boolean().optional(),
        Description: z.string().optional(),
        Color: z.number().optional()
      })
    )
    .optional()
});

const PluginHelpSchema = z.object({
  Description: z.string().min(1).optional(),
  Details: z.array(z.string().min(1)).optional()
});

const CommandHelpSchema = PluginHelpSchema.extend({
  Usage: z.string().min(1).optional()
});

const PluginManifestSchema = z.object({
  Metadata: z.object({
    Id: z.string().min(1),
    DisplayName: z.string().min(1),
    Version: z.string().min(1),
    Author: z.string().min(1),
    Icon: z.string().min(1)
  }),
  Scope: z.nativeEnum(PluginScope).default(PluginScope.Guild),
  Help: PluginHelpSchema.optional(),
  Category: z.string().min(1).optional(),
  Dependencies: z.array(z.string().min(1)).optional(),
  NpmDependencies: z.array(z.string().min(1)).optional(),
  Commands: z.array(
    z.object({
      Name: z.string().min(1),
      Description: z.string().min(1),
      Help: CommandHelpSchema.optional(),
      Options: z
        .array(
          z.object({
            Name: z.string().min(1),
            Description: z.string().min(1),
            Type: z.enum(["String", "Integer", "Boolean", "User", "Channel", "Role"]),
            Required: z.boolean().optional(),
            Choices: z
              .array(
                z.object({
                  Name: z.string(),
                  Value: z.union([z.string(), z.number()])
                })
              )
              .optional()
          })
        )
        .optional()
    })
  ),
  WebInterface: z.array(SettingsFieldSchema),
  DashboardElements: z
    .array(
      z.object({
        Key: z.string().min(1),
        Type: z.nativeEnum(DashboardElementType),
        Label: z.string().min(1),
        DataSourceKey: z.string().min(1),
        Unit: z.string().optional()
      })
    )
    .optional(),
  DashboardEditor: z.string().min(1).optional(),
  EntryPoint: z.string().min(1)
});

export const PluginManifestValidator = PluginManifestSchema;

export function GetPluginDirectories(): string[] {
  const PluginDir = Path.resolve(process.env.PLUGIN_DIRECTORY ?? "Plugins");
  const CustomPluginDir = Path.resolve(process.env.CUSTOM_PLUGIN_DIRECTORY ?? "CustomPlugins");
  return [PluginDir, CustomPluginDir];
}

export async function ScanAllPluginManifests(): Promise<Array<{ Manifest: PluginManifest; Directory: string }>> {
  const Directories = GetPluginDirectories();
  const AllResults = await Promise.all(
    Directories.map((Dir) => ScanPluginManifests(Dir).catch(() => [] as Array<{ Manifest: PluginManifest; Directory: string }>))
  );
  return AllResults.flat().sort((First, Second) => First.Manifest.Metadata.DisplayName.localeCompare(Second.Manifest.Metadata.DisplayName));
}

export async function ScanPluginManifests(PluginDirectory: string): Promise<Array<{ Manifest: PluginManifest; Directory: string }>> {
  const DirectoryEntries = await FileSystem.readdir(PluginDirectory, { withFileTypes: true }).catch(() => []);
  const ManifestEntries = DirectoryEntries.filter((DirectoryEntry) => DirectoryEntry.isDirectory());
  const Manifests: Array<{ Manifest: PluginManifest; Directory: string }> = [];

  for (const ManifestEntry of ManifestEntries) {
    const Directory = Path.join(PluginDirectory, ManifestEntry.name);
    const ManifestPath = Path.join(Directory, "Plugin.json");
    const RawManifest = await FileSystem.readFile(ManifestPath, "utf8").catch(() => null);

    if (!RawManifest) {
      continue;
    }

    const ParsedManifest = PluginManifestSchema.parse(JSON.parse(RawManifest));
    Manifests.push({ Manifest: ParsedManifest, Directory });
  }

  return Manifests.sort((First, Second) => First.Manifest.Metadata.DisplayName.localeCompare(Second.Manifest.Metadata.DisplayName));
}
