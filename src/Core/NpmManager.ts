import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import Path from "node:path";
import { ScanPluginManifests } from "./PluginScanner.js";

const CustomPluginDirectory = Path.resolve(process.env.CUSTOM_PLUGIN_DIRECTORY ?? "CustomPlugins");

function GetProjectRoot(): string {
  const PossibleRoots = [Path.resolve("package.json"), Path.resolve("../../package.json"), Path.resolve("../package.json")];
  for (const Candidate of PossibleRoots) {
    if (existsSync(Candidate)) {
      return Path.dirname(Candidate);
    }
  }
  return process.cwd();
}

export async function InstallDependencies(Packages: string[], Context: string): Promise<void> {
  if (Packages.length === 0) {
    return;
  }

  const Root = GetProjectRoot();

  try {
    execSync(`npm install ${Packages.map((P) => `"${P}"`).join(" ")} --save --no-audit --no-fund --loglevel=error`, {
      cwd: Root,
      stdio: "pipe",
      timeout: 120000
    });
  } catch (Raw) {
    const Message = Raw instanceof Error ? Raw.message : String(Raw);
    throw new Error(`Failed to install npm dependencies for plugin "${Context}": ${Message}`);
  }
}

export async function UninstallDependencies(Packages: string[], Context: string): Promise<void> {
  if (Packages.length === 0) {
    return;
  }

  const Root = GetProjectRoot();

  try {
    execSync(`npm uninstall ${Packages.map((P) => `"${P}"`).join(" ")} --save --no-audit --no-fund --loglevel=error`, {
      cwd: Root,
      stdio: "pipe",
      timeout: 120000
    });
  } catch (Raw) {
    const Message = Raw instanceof Error ? Raw.message : String(Raw);
    throw new Error(`Failed to uninstall npm dependencies for plugin "${Context}": ${Message}`);
  }
}

export async function GetNpmDependenciesForPlugin(PluginId: string): Promise<string[]> {
  const Entries = await ScanPluginManifests(CustomPluginDirectory).catch(() => []);
  const Entry = Entries.find((E) => E.Manifest.Metadata.Id === PluginId);
  return Entry?.Manifest.NpmDependencies ?? [];
}

export async function GetOrphanedDependencies(PluginId: string): Promise<string[]> {
  const Entries = (await ScanPluginManifests(CustomPluginDirectory).catch(() => [])).filter(
    (E) => E.Manifest.Metadata.Id !== PluginId
  );

  const AllUsedDeps = new Set<string>();
  for (const Entry of Entries) {
    for (const Dep of Entry.Manifest.NpmDependencies ?? []) {
      AllUsedDeps.add(Dep.toLowerCase());
    }
  }

  const PluginDeps = await GetNpmDependenciesForPlugin(PluginId);

  return PluginDeps.filter((Dep) => !AllUsedDeps.has(Dep.toLowerCase()));
}
