import { randomUUID } from "node:crypto";
import { promises as FileSystem } from "node:fs";
import Path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import type { DiscordGuildSummary } from "@/src/Core/Types";
import { CreateAccessControl, RequireDashboardUser } from "@/src/Web/Auth";

export const runtime = "nodejs";

const ExecFile = promisify(execFile);
const DiscordEmojiLimitBytes = 256 * 1024;
const SizeAttempts = [128, 112, 96, 80, 64, 48, 32];
const FpsAttempts = [15, 12, 10, 8];

type CropMode = "Fit" | "Square";
type OutputMode = "Animated" | "StaticFrame";

type RouteContext = {
  params: Promise<{ botId: string; guildId: string }>;
};

type OptimizeInput = {
  CropMode?: string;
  FramePercent?: number;
  Id?: string;
  Name?: string;
  OutputMode?: string;
  SourceUrl?: string;
};

async function Post(Request: Request, Context: RouteContext): Promise<Response> {
  const { botId, guildId } = await Context.params;
  const User = await ResolveDashboardUser(Request);

  if (User instanceof Response) {
    return User;
  }

  const AccessControl = CreateAccessControl(botId);

  if (!(await AccessControl.CanManagePlugin(User.DiscordId, BuildServerTrustedGuildSummary(guildId), "EmojiAdder"))) {
    return new Response("Insufficient guild plugin permissions.", { status: 403 });
  }

  const Body = await Request.json().catch(() => ({})) as { Items?: OptimizeInput[] };
  const Items = Array.isArray(Body.Items) ? Body.Items.slice(0, 50) : [];
  const Results = [];

  for (const Item of Items) {
    try {
      if (!Item.SourceUrl || !Item.Name) {
        throw new Error("Missing source URL or name.");
      }

      const Optimized = await OptimizeEmoji(Item.SourceUrl, {
        CropMode: NormalizeCropMode(Item.CropMode),
        FramePercent: ClampNumber(Item.FramePercent, 0, 100, 0),
        OutputMode: NormalizeOutputMode(Item.OutputMode)
      });
      Results.push({
        Animated: Optimized.Animated,
        DataUrl: `data:${Optimized.Mime};base64,${Optimized.Buffer.toString("base64")}`,
        Height: Optimized.Size,
        Id: Item.Id ?? randomUUID(),
        Name: NormalizeEmojiName(Item.Name),
        SizeBytes: Optimized.Buffer.length,
        SourceUrl: Item.SourceUrl,
        Width: Optimized.Size
      });
    } catch (ErrorValue) {
      Results.push({
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        Id: Item.Id ?? randomUUID(),
        Name: NormalizeEmojiName(Item.Name ?? "emoji"),
        SourceUrl: Item.SourceUrl ?? ""
      });
    }
  }

  return NextResponse.json({ Results });
}

async function OptimizeEmoji(SourceUrl: string, Options: { CropMode: CropMode; FramePercent: number; OutputMode: OutputMode }): Promise<{ Animated: boolean; Buffer: Buffer; Mime: string; Size: number }> {
  const Response = await fetch(SourceUrl);

  if (!Response.ok) {
    throw new Error(`Download failed: ${Response.status}`);
  }

  const SourceBuffer = Buffer.from(await Response.arrayBuffer());
  const WorkDirectory = await FileSystem.mkdtemp(Path.join(tmpdir(), "hyperbot-emoji-"));
  const InputPath = Path.join(WorkDirectory, "source");

  await FileSystem.writeFile(InputPath, SourceBuffer);

  try {
    if (Options.OutputMode === "StaticFrame") {
      return await OptimizeStaticEmoji(InputPath, WorkDirectory, Options.FramePercent, Options.CropMode);
    }

    for (const Speed of [1, 2]) {
      for (const Size of SizeAttempts) {
        for (const Fps of FpsAttempts) {
          const OutputPath = Path.join(WorkDirectory, `emoji-${Speed}-${Size}-${Fps}.gif`);
          await RunFfmpegAnimated(InputPath, OutputPath, Size, Fps, Speed, Options.CropMode).catch(() => null);
          const OutputBuffer = await FileSystem.readFile(OutputPath).catch(() => null);

          if (OutputBuffer && OutputBuffer.length <= DiscordEmojiLimitBytes) {
            return { Animated: true, Buffer: OutputBuffer, Mime: "image/gif", Size };
          }
        }
      }
    }
  } finally {
    await FileSystem.rm(WorkDirectory, { force: true, recursive: true }).catch(() => null);
  }

  throw new Error("Could not optimize below Discord's 256 KB emoji limit.");
}

async function OptimizeStaticEmoji(InputPath: string, WorkDirectory: string, FramePercent: number, CropModeValue: CropMode): Promise<{ Animated: boolean; Buffer: Buffer; Mime: string; Size: number }> {
  const Duration = await ProbeDurationSeconds(InputPath);
  const SeekSeconds = Duration > 0 ? Duration * (FramePercent / 100) : 0;

  for (const Size of SizeAttempts) {
    const OutputPath = Path.join(WorkDirectory, `emoji-static-${Size}.png`);
    await RunFfmpegStatic(InputPath, OutputPath, Size, SeekSeconds, CropModeValue).catch(() => null);
    const OutputBuffer = await FileSystem.readFile(OutputPath).catch(() => null);

    if (OutputBuffer && OutputBuffer.length <= DiscordEmojiLimitBytes) {
      return { Animated: false, Buffer: OutputBuffer, Mime: "image/png", Size };
    }
  }

  throw new Error("Could not optimize static frame below Discord's 256 KB emoji limit.");
}

async function RunFfmpegAnimated(InputPath: string, OutputPath: string, Size: number, Fps: number, Speed: number, CropModeValue: CropMode): Promise<void> {
  const Filters = [
    Speed > 1 ? `setpts=${1 / Speed}*PTS` : null,
    `fps=${Fps}`,
    ...BuildResizeFilters(Size, CropModeValue),
    "split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5"
  ].filter(Boolean).join(",");

  await ExecFile("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    InputPath,
    "-filter_complex",
    Filters,
    "-loop",
    "0",
    OutputPath
  ], { timeout: 25_000 });
}

async function RunFfmpegStatic(InputPath: string, OutputPath: string, Size: number, SeekSeconds: number, CropModeValue: CropMode): Promise<void> {
  await ExecFile("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    SeekSeconds.toFixed(3),
    "-i",
    InputPath,
    "-frames:v",
    "1",
    "-vf",
    [...BuildResizeFilters(Size, CropModeValue), "format=rgba"].join(","),
    OutputPath
  ], { timeout: 25_000 });
}

async function ProbeDurationSeconds(InputPath: string): Promise<number> {
  const { stdout } = await ExecFile("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    InputPath
  ], { timeout: 10_000 }).catch(() => ({ stdout: "0" }));
  const Duration = Number.parseFloat(stdout.trim());
  return Number.isFinite(Duration) && Duration > 0 ? Duration : 0;
}

function BuildResizeFilters(Size: number, CropModeValue: CropMode): string[] {
  if (CropModeValue === "Square") {
    return [
      `scale=${Size}:${Size}:force_original_aspect_ratio=increase:flags=lanczos`,
      `crop=${Size}:${Size}`,
      "setsar=1"
    ];
  }

  return [
    `scale=${Size}:${Size}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${Size}:${Size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
    "setsar=1"
  ];
}

function NormalizeEmojiName(Value: string): string {
  const NormalizedValue = Value.toLowerCase().replace(/[^a-z0-9_]/giu, "_").replace(/_+/gu, "_").replace(/^_|_$/gu, "");
  return (NormalizedValue || "emoji").slice(0, 32);
}

function NormalizeCropMode(Value: string | undefined): CropMode {
  return Value === "Square" || Value === "Crop" ? "Square" : "Fit";
}

function NormalizeOutputMode(Value: string | undefined): OutputMode {
  return Value === "StaticFrame" ? "StaticFrame" : "Animated";
}

function ClampNumber(Value: number | undefined, Minimum: number, Maximum: number, Fallback: number): number {
  if (typeof Value !== "number" || !Number.isFinite(Value)) {
    return Fallback;
  }

  return Math.min(Maximum, Math.max(Minimum, Value));
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

export { Post as POST };
