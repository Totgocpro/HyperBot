import { NextResponse } from "next/server";
import { Prisma as PrismaNamespace } from "@prisma/client";
import { Prisma } from "@/src/Core/Clients";
import { RequireSuperAdmin } from "@/src/Web/Auth";

type AuditLogRow = {
  Id: string;
  BotId: string | null;
  ActorId: string;
  ActorDisplayName: string | null;
  Action: string;
  Target: string;
  Metadata: PrismaNamespace.JsonValue | null;
  CreatedAt: Date;
};

async function Get(Request: Request): Promise<Response> {
  try {
    await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const { searchParams } = new URL(Request.url);
  const Where: PrismaNamespace.AuditLogWhereInput = {};
  const AndFilters: PrismaNamespace.AuditLogWhereInput[] = [];
  const Limit = ClampNumber(Number(searchParams.get("limit") ?? 100), 10, 200);
  const Action = searchParams.get("action")?.trim();
  const ActorId = searchParams.get("actorId")?.trim();
  const Target = searchParams.get("target")?.trim();
  const BotId = searchParams.get("botId")?.trim();
  const IpAddress = searchParams.get("ipAddress")?.trim();
  const Search = searchParams.get("search")?.trim();
  const From = ParseDate(searchParams.get("from"));
  const To = ParseDate(searchParams.get("to"));

  if (Action) {
    AndFilters.push({ Action: { contains: Action, mode: "insensitive" } });
  }

  if (ActorId) {
    AndFilters.push({ ActorId: { contains: ActorId, mode: "insensitive" } });
  }

  if (Target) {
    AndFilters.push({ Target: { contains: Target, mode: "insensitive" } });
  }

  if (BotId) {
    AndFilters.push({ BotId });
  }

  if (IpAddress) {
    AndFilters.push({
      Metadata: {
        path: ["IpAddress"],
        string_contains: IpAddress
      }
    });
  }

  if (From || To) {
    AndFilters.push({
      CreatedAt: {
        ...(From ? { gte: From } : {}),
        ...(To ? { lte: To } : {})
      }
    });
  }

  if (Search) {
    AndFilters.push({
      OR: [
        { ActorId: { contains: Search, mode: "insensitive" } },
        { Action: { contains: Search, mode: "insensitive" } },
        { Target: { contains: Search, mode: "insensitive" } },
        { BotId: { contains: Search, mode: "insensitive" } },
        {
          Metadata: {
            path: ["IpAddress"],
            string_contains: Search
          }
        },
        {
          Metadata: {
            path: ["Username"],
            string_contains: Search
          }
        }
      ]
    });
  }

  if (AndFilters.length > 0) {
    Where.AND = AndFilters;
  }

  const [Logs, Total] = await Promise.all([
    Prisma.auditLog.findMany({
      where: Where,
      orderBy: { CreatedAt: "desc" },
      take: Limit
    }),
    Prisma.auditLog.count({ where: Where })
  ]);
  const ActorIds = Array.from(new Set(Logs.map((Log) => Log.ActorId).filter(Boolean)));
  const ActorUsers = ActorIds.length > 0
    ? await Prisma.dashboardUser.findMany({
        where: {
          DiscordId: {
            in: ActorIds
          }
        },
        select: {
          DiscordId: true,
          DisplayName: true
        }
      })
    : [];
  const ActorNames = new Map(ActorUsers.map((User) => [User.DiscordId, User.DisplayName]));
  const Rows: AuditLogRow[] = Logs.map((Log) => ({
    Id: Log.Id,
    BotId: Log.BotId,
    ActorId: Log.ActorId,
    ActorDisplayName: ActorNames.get(Log.ActorId) ?? null,
    Action: Log.Action,
    Target: Log.Target,
    Metadata: Log.Metadata,
    CreatedAt: Log.CreatedAt
  }));

  return NextResponse.json({ Logs: Rows, Total, Limit });
}

function ClampNumber(Value: number, Minimum: number, Maximum: number): number {
  if (!Number.isFinite(Value)) {
    return Minimum;
  }

  return Math.min(Math.max(Math.trunc(Value), Minimum), Maximum);
}

function ParseDate(Value: string | null): Date | null {
  if (!Value) {
    return null;
  }

  const ParsedDate = new Date(Value);
  return Number.isNaN(ParsedDate.getTime()) ? null : ParsedDate;
}

export { Get as GET };
