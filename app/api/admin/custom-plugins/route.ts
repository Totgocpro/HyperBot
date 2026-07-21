import Path from "node:path";
import { promises as FileSystem } from "node:fs";
import AdmZip from "adm-zip";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ScanPluginManifests, PluginManifestValidator } from "@/src/Core/PluginScanner";
import { InstallDependencies, GetOrphanedDependencies, UninstallDependencies } from "@/src/Core/NpmManager";
import { RequireSuperAdmin } from "@/src/Web/Auth";

const CustomPluginDirectory = Path.resolve(process.env.CUSTOM_PLUGIN_DIRECTORY ?? "CustomPlugins");

async function Get(): Promise<Response> {
  const Entries = await ScanPluginManifests(CustomPluginDirectory).catch(() => []);
  const Plugins = Entries.map((Entry) => ({
    Id: Entry.Manifest.Metadata.Id,
    DisplayName: Entry.Manifest.Metadata.DisplayName,
    Version: Entry.Manifest.Metadata.Version,
    Author: Entry.Manifest.Metadata.Author,
    Description: Entry.Manifest.Help?.Description ?? "",
    Category: Entry.Manifest.Category ?? "",
    Icon: Entry.Manifest.Metadata.Icon
  }));

  return NextResponse.json({ Plugins });
}

async function Post(Request: Request): Promise<Response> {
  let ActorId: string;

  try {
    ActorId = await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const FormData = await Request.formData();
  const FileField = FormData.get("plugin");

  if (!FileField || typeof FileField === "string") {
    return new Response("A plugin zip file is required.", { status: 400 });
  }

  const FileValue = FileField as Blob;
  const BufferValue = Buffer.from(await FileValue.arrayBuffer());

  let Zip: AdmZip;

  try {
    Zip = new AdmZip(BufferValue);
  } catch {
    return new Response("Invalid zip file.", { status: 400 });
  }

  const ZipEntries = Zip.getEntries();
  const PluginJsonEntry = ZipEntries.find((Entry) =>
    !Entry.isDirectory && Entry.entryName.endsWith("Plugin.json")
  );

  if (!PluginJsonEntry) {
    return new Response("Zip file must contain a Plugin.json manifest.", { status: 400 });
  }

  let Manifest: Record<string, unknown>;

  try {
    Manifest = JSON.parse(PluginJsonEntry.getData().toString("utf8")) as Record<string, unknown>;
  } catch {
    return new Response("Invalid Plugin.json in zip.", { status: 400 });
  }

  const ValidationResult = PluginManifestValidator.safeParse(Manifest);

  if (!ValidationResult.success) {
    const Issues = ValidationResult.error.issues.map((Issue) => `${Issue.path.join(".")}: ${Issue.message}`);
    return new Response(`Plugin.json validation failed:\n${Issues.join("\n")}`, { status: 400 });
  }

  const ValidManifest = ValidationResult.data;
  const PluginId = ValidManifest.Metadata.Id;

  const ExistingPlugin = (await ScanPluginManifests(CustomPluginDirectory)).find(
    (Entry) => Entry.Manifest.Metadata.Id === PluginId
  );

  if (ExistingPlugin) {
    return new Response(`Plugin "${PluginId}" already exists. Delete it first or rename the plugin.`, { status: 409 });
  }

    const IconValue = ValidManifest.Metadata.Icon;

  if (IconValue.endsWith(".svg") || IconValue.endsWith(".png")) {
    const IconNormalized = IconValue.replace(/^\.\//u, "");
    const IconEntry = ZipEntries.find((Entry) =>
      !Entry.isDirectory && (Entry.entryName.endsWith(IconNormalized) || Entry.entryName.endsWith(`/${IconNormalized}`))
    );

    if (!IconEntry) {
      return new Response(`Icon file "${IconValue}" not found in the zip archive.`, { status: 400 });
    }
  }

  const EntryPointNormalized = ValidManifest.EntryPoint.replace(/^\.\//u, "");
  const EntryPointEntry = ZipEntries.find((Entry) =>
    !Entry.isDirectory && (Entry.entryName.endsWith(EntryPointNormalized) || Entry.entryName.endsWith(EntryPointNormalized.replace(/\.ts$/u, ".js")))
  );

  if (!EntryPointEntry) {
    return new Response(`Entry point "${ValidManifest.EntryPoint}" not found in the zip archive.`, { status: 400 });
  }

  const PluginDirectory = Path.join(CustomPluginDirectory, PluginId);
  await FileSystem.mkdir(PluginDirectory, { recursive: true });

  for (const Entry of ZipEntries) {
    if (Entry.isDirectory) {
      continue;
    }

    const RelativePath = Entry.entryName.replace(/^[^/]*\//u, "");
    
    if (!RelativePath) {
      continue;
    }

    const OutputPath = Path.join(PluginDirectory, RelativePath);
    await FileSystem.mkdir(Path.dirname(OutputPath), { recursive: true });
    await FileSystem.writeFile(OutputPath, Entry.getData());
  }

  const NpmDeps = ValidManifest.NpmDependencies ?? [];

  if (NpmDeps.length > 0) {
    try {
      await InstallDependencies(NpmDeps, PluginId);
    } catch (Error) {
      await FileSystem.rm(PluginDirectory, { recursive: true, force: true });
      return new Response((Error as Error).message, { status: 500 });
    }
  }

  await PrismaAuditLog({
    ActorId,
    Action: "CustomPluginImported",
    Target: PluginId,
    Metadata: {
      DisplayName: ValidManifest.Metadata.DisplayName,
      Version: ValidManifest.Metadata.Version,
      NpmDependencies: NpmDeps
    }
  }).catch(() => undefined);

  return NextResponse.json({ PluginId, Imported: true, NpmDependenciesInstalled: NpmDeps });
}

async function Del(Request: Request): Promise<Response> {
  let ActorId: string;

  try {
    ActorId = await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const { searchParams } = new URL(Request.url);
  const PluginId = searchParams.get("pluginId");

  if (!PluginId) {
    return new Response("pluginId is required.", { status: 400 });
  }

  const PluginDirectory = Path.join(CustomPluginDirectory, PluginId);

  try {
    await FileSystem.access(PluginDirectory);
  } catch {
    return new Response("Plugin not found.", { status: 404 });
  }

  const OrphanedDeps = await GetOrphanedDependencies(PluginId);

  await FileSystem.rm(PluginDirectory, { recursive: true, force: true });

  if (OrphanedDeps.length > 0) {
    try {
      await UninstallDependencies(OrphanedDeps, PluginId);
    } catch {
      // Best-effort: plugin is already removed, non-critical
    }
  }

  await PrismaAuditLog({
    ActorId,
    Action: "CustomPluginDeleted",
    Target: PluginId,
    Metadata: OrphanedDeps.length > 0 ? { NpmDependenciesUninstalled: OrphanedDeps } : undefined
  }).catch(() => undefined);

  return NextResponse.json({ PluginId, Deleted: true, NpmDependenciesUninstalled: OrphanedDeps.length > 0 ? OrphanedDeps : undefined });
}

async function PrismaAuditLog(Data: { ActorId: string; Action: string; Target: string; Metadata?: Record<string, unknown> }) {
  try {
    const Clients = await import("@/src/Core/Clients");
    await Clients.Prisma.auditLog.create({
      data: {
        ActorId: Data.ActorId,
        Action: Data.Action,
        Target: Data.Target,
        Metadata: (Data.Metadata ?? {}) as Prisma.InputJsonObject
      }
    });
  } catch {
    // Audit log is best-effort
  }
}

export { Get as GET, Post as POST, Del as DELETE };
