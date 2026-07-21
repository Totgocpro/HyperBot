import Path from "node:path";
import { promises as FileSystem } from "node:fs";
import { NextResponse } from "next/server";

const CustomPluginDirectory = Path.resolve(process.env.CUSTOM_PLUGIN_DIRECTORY ?? "CustomPlugins");

const MimeTypes: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp"
};

async function Get(_Request: Request, { params }: { params: Promise<{ pluginId: string }> }): Promise<Response> {
  const { pluginId } = await params;

  const PluginDirectory = Path.join(CustomPluginDirectory, pluginId);

  try {
    await FileSystem.access(PluginDirectory);
  } catch {
    return new Response("Plugin not found.", { status: 404 });
  }

  const ManifestPath = Path.join(PluginDirectory, "Plugin.json");
  let ManifestRaw: string;

  try {
    ManifestRaw = await FileSystem.readFile(ManifestPath, "utf8");
  } catch {
    return new Response("Plugin manifest not found.", { status: 404 });
  }

  let IconName: string;

  try {
    const Manifest = JSON.parse(ManifestRaw) as { Metadata?: { Icon?: string } };
    IconName = Manifest.Metadata?.Icon ?? "";
  } catch {
    return new Response("Invalid Plugin.json.", { status: 500 });
  }

  if (IconName.endsWith(".svg") || IconName.endsWith(".png")) {
    const RelativePath = IconName.replace(/^\.\//u, "");
    const IconFile = Path.join(PluginDirectory, RelativePath);

    try {
      const Data = await FileSystem.readFile(IconFile);
      const Ext = Path.extname(IconFile).toLowerCase();
      const Mime = MimeTypes[Ext] ?? "application/octet-stream";
      return new NextResponse(Data, {
        status: 200,
        headers: { "Content-Type": Mime, "Cache-Control": "public, max-age=86400" }
      });
    } catch {
      return new Response("Icon file not found.", { status: 404 });
    }
  }

  return new Response("Icon is not a file-based icon.", { status: 400 });
}

export { Get as GET };
