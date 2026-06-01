import { execFile } from "node:child_process";
import { promises as FileSystem } from "node:fs";
import { tmpdir } from "node:os";
import Path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import type { DiscordGuildSummary } from "@/src/Core/Types";
import { CreateAccessControl, RequireDashboardUser } from "@/src/Web/Auth";

export const runtime = "nodejs";

const ExecFile = promisify(execFile);

type CropMode = "Fit" | "Square";

type RouteContext = {
  params: Promise<{ botId: string; guildId: string }>;
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

  const Body = await Request.json().catch(() => ({})) as { CropMode?: string; FramePercent?: number; SourceUrl?: string };

  if (!Body.SourceUrl) {
    return new Response("SourceUrl is required.", { status: 400 });
  }

  const Preview = await BuildFramePreview(Body.SourceUrl, ClampNumber(Body.FramePercent, 0, 100, 0), NormalizeCropMode(Body.CropMode));
  return NextResponse.json({ DataUrl: `data:image/png;base64,${Preview.toString("base64")}` });
}

async function BuildFramePreview(SourceUrl: string, FramePercent: number, CropModeValue: CropMode): Promise<Buffer> {
  const Response = await fetch(SourceUrl);

  if (!Response.ok) {
    throw new Error(`Download failed: ${Response.status}`);
  }

  const WorkDirectory = await FileSystem.mkdtemp(Path.join(tmpdir(), "hyperbot-emoji-frame-"));
  const InputPath = Path.join(WorkDirectory, "source");
  const OutputPath = Path.join(WorkDirectory, "frame.png");

  await FileSystem.writeFile(InputPath, Buffer.from(await Response.arrayBuffer()));

  try {
    const Duration = await ProbeDurationSeconds(InputPath);
    const SeekSeconds = Duration > 0 ? Duration * (FramePercent / 100) : 0;
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
      [...BuildResizeFilters(128, CropModeValue), "format=rgba"].join(","),
      OutputPath
    ], { timeout: 15_000 });

    return await FileSystem.readFile(OutputPath);
  } finally {
    await FileSystem.rm(WorkDirectory, { force: true, recursive: true }).catch(() => null);
  }
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

function NormalizeCropMode(Value: string | undefined): CropMode {
  return Value === "Square" || Value === "Crop" ? "Square" : "Fit";
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
