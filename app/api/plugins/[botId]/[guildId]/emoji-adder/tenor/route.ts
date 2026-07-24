import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { PluginStorage } from "@/src/Core/Storage";
import type { DiscordGuildSummary } from "@/src/Core/Types";
import { CreateAccessControl, RequireDashboardUser } from "@/src/Web/Auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ botId: string; guildId: string }>;
};

type KlipyRendition = {
  url: string;
  width: number;
  height: number;
  size: number;
};

type KlipyFileFormats = {
  gif?: KlipyRendition;
  webp?: KlipyRendition;
  jpg?: KlipyRendition;
  mp4?: KlipyRendition;
  webm?: KlipyRendition;
  png?: KlipyRendition;
};

type KlipyFile = {
  hd: KlipyFileFormats;
  md: KlipyFileFormats;
  sm: KlipyFileFormats;
  xs: KlipyFileFormats;
};

type KlipyItem = {
  id: number;
  slug: string;
  title: string;
  file: KlipyFile;
  tags?: string[];
  type?: string;
  blur_preview?: string;
};

type KlipyPageData = {
  data: KlipyItem[];
  current_page: number;
  per_page: number;
  has_next: boolean;
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

  const Body = await Request.json().catch(() => ({})) as { ApiKey?: string; ContentFilter?: string; Pos?: string; Query?: string };
  const Storage = new PluginStorage(Prisma, RedisClient, botId, "EmojiAdder");
  const StoredKey = await Storage.GetGlobalConfig<string>(guildId, "TenorApiKey").catch(() => "");
  const ApiKey = Body.ApiKey?.trim() || StoredKey || process.env.KLIPY_API_KEY;

  if (!ApiKey) {
    return new Response("No Klipy API key configured. Set KLIPY_API_KEY in .env or configure TenorApiKey in plugin settings. Get a key at https://klipy.com/developers", { status: 400 });
  }

  const ContentFilter = ["off", "low", "medium", "high"].includes(String(Body.ContentFilter)) ? String(Body.ContentFilter) : "medium";
  const Query = Body.Query?.trim() || "";
  const Page = Body.Pos ? Number(Body.Pos) : 1;
  const UrlValue = new URL(`https://api.klipy.com/api/v1/${ApiKey}/gifs/${Query ? "search" : "trending"}`);
  UrlValue.searchParams.set("per_page", "24");
  UrlValue.searchParams.set("page", String(Page));
  UrlValue.searchParams.set("locale", "en_US");

  if (ContentFilter !== "off") {
    UrlValue.searchParams.set("content_filter", ContentFilter);
  }

  if (Query) {
    UrlValue.searchParams.set("q", Query);
  }

  const ResponseValue = await fetch(UrlValue, { headers: { Accept: "application/json" } });
  const ResponseBody = await ResponseValue.text().catch(() => "");

  if (!ResponseValue.ok) {
    return new Response(ResponseBody || `Klipy search failed: ${ResponseValue.status}`, { status: ResponseValue.status });
  }

  type KlipyApiResponse = { result?: boolean; data?: KlipyPageData; errors?: unknown };

  const Json = JSON.parse(ResponseBody) as KlipyApiResponse;

  if (Json.result === false || !Json.data) {
    return new Response("Klipy search failed: invalid API key or request.", { status: 400 });
  }

  const Items = Json.data.data ?? [];
  const Results = Items.map((Item) => {
    const Preview = Item.file?.sm?.gif ?? Item.file?.xs?.gif ?? Item.file?.sm?.webp ?? Item.file?.sm?.mp4;
    const Source = Item.file?.md?.gif ?? Item.file?.hd?.gif ?? Item.file?.sm?.gif ?? Preview;

    return {
      Description: Item.title || "Klipy GIF",
      Id: String(Item.id),
      PreviewUrl: Preview?.url ?? "",
      SourceUrl: Source?.url ?? "",
      SuggestedName: NormalizeEmojiName(Item.title || "emoji")
    };
  }).filter((Result) => Result.Id && Result.PreviewUrl && Result.SourceUrl);

  return NextResponse.json({
    Next: Json.data.has_next ? String(Page + 1) : "",
    Results
  });
}

function NormalizeEmojiName(Value: string): string {
  const NormalizedValue = Value.toLowerCase().replace(/[^a-z0-9_]/giu, "_").replace(/_+/gu, "_").replace(/^_|_$/gu, "");
  return (NormalizedValue || "emoji").slice(0, 32);
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

async function Get(Request: Request, Context: RouteContext): Promise<Response> {
  const { botId, guildId } = await Context.params;
  const User = await ResolveDashboardUser(Request);

  if (User instanceof Response) {
    return User;
  }

  const AccessControl = CreateAccessControl(botId);

  if (!(await AccessControl.CanManagePlugin(User.DiscordId, BuildServerTrustedGuildSummary(guildId), "EmojiAdder"))) {
    return new Response("Insufficient guild plugin permissions.", { status: 403 });
  }

  const Storage = new PluginStorage(Prisma, RedisClient, botId, "EmojiAdder");
  const StoredKey = await Storage.GetGlobalConfig<string>(guildId, "TenorApiKey").catch(() => "");
  const HasKey = !!(StoredKey || process.env.KLIPY_API_KEY);

  return NextResponse.json({ configured: HasKey });
}

export { Post as POST, Get as GET };
