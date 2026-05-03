import { promises as FileSystem } from "node:fs";
import Path from "node:path";
import { z } from "zod";
import { PluginScope, SettingsFieldType, type PluginManifest } from "./Types.js";

const SettingsFieldSchema = z.object({
  Key: z.string().min(1),
  Type: z.nativeEnum(SettingsFieldType),
  Label: z.string().min(1),
  Default: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  Options: z
    .array(
      z.object({
        Label: z.string(),
        Value: z.union([z.string(), z.number(), z.boolean()])
      })
    )
    .optional()
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
  Commands: z.array(
    z.object({
      Name: z.string().min(1),
      Description: z.string().min(1),
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
  EntryPoint: z.string().min(1)
});

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

  return Manifests;
}
