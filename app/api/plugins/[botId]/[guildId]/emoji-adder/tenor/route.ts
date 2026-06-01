import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { PluginStorage } from "@/src/Core/Storage";
import type { DiscordGuildSummary } from "@/src/Core/Types";
import { CreateAccessControl, RequireDashboardUser } from "@/src/Web/Auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ botId: string; guildId: string }>;
};

type TenorMedia = {
  dims?: number[];
  size?: number;
  url?: string;
};

type TenorResult = {
  content_description?: string;
  id?: string;
  media?: Array<Record<string, TenorMedia>>;
  media_formats?: Record<string, TenorMedia>;
  title?: string;
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
  const ApiKey = Body.ApiKey?.trim() || StoredKey || process.env.TENOR_API_KEY || "LIVDSRZULELA";
  const ContentFilter = ["off", "low", "medium", "high"].includes(String(Body.ContentFilter)) ? String(Body.ContentFilter) : "medium";
  const Query = Body.Query?.trim() || "trending";
  const Endpoint = Body.Query?.trim() ? "search" : "trending";
  const UrlValue = new URL(`https://g.tenor.com/v1/${Endpoint}`);
  UrlValue.searchParams.set("key", ApiKey);
  UrlValue.searchParams.set("limit", "24");
  UrlValue.searchParams.set("media_filter", "basic");
  UrlValue.searchParams.set("contentfilter", ContentFilter);
  UrlValue.searchParams.set("ar_range", "standard");

  if (Endpoint === "search") {
    UrlValue.searchParams.set("q", Query);
  }

  if (Body.Pos) {
    UrlValue.searchParams.set("pos", Body.Pos);
  }

  const ResponseValue = await fetch(UrlValue, { headers: { Accept: "application/json" } });

  if (!ResponseValue.ok) {
    return new Response(`Tenor search failed: ${ResponseValue.status}`, { status: ResponseValue.status });
  }

  const Payload = await ResponseValue.json() as { next?: string | number; results?: TenorResult[] };
  const Results = (Payload.results ?? []).map((Result) => {
    const Media = Result.media_formats ?? Result.media?.[0] ?? {};
    const Preview = Media.tinygif ?? Media.nanogif ?? Media.tinymp4 ?? Media.gif ?? Media.mp4;
    const Source = Media.gif ?? Media.tinygif ?? Media.mp4 ?? Preview;

    return {
      Description: Result.content_description || Result.title || "Tenor GIF",
      Id: Result.id ?? "",
      PreviewUrl: Preview?.url ?? "",
      SourceUrl: Source?.url ?? "",
      SuggestedName: NormalizeEmojiName(Result.content_description || Result.title || "emoji")
    };
  }).filter((Result) => Result.Id && Result.PreviewUrl && Result.SourceUrl);

  return NextResponse.json({
    Next: Payload.next && String(Payload.next) !== "0" ? String(Payload.next) : "",
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

export { Post as POST };
