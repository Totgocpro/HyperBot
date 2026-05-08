import { createHash, randomBytes } from "node:crypto";
import type { DashboardUser } from "@prisma/client";
import { AccessControl } from "../Core/AccessControl";
import { Prisma } from "../Core/Clients";

export const SessionCookieName = "HyperBotSession";

export function ShouldUseSecureCookies(Request: Request): boolean {
  const ForwardedProto = Request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();

  if (ForwardedProto) {
    return ForwardedProto === "https";
  }

  return new URL(Request.url).protocol === "https:";
}

export function GetRequestDiscordId(Request: Request): string | null {
  return Request.headers.get("X-Discord-User-Id");
}

export function CreateAccessControl(): AccessControl {
  const SuperAdminIds = (process.env.SUPER_ADMIN_IDS ?? "")
    .split(",")
    .map((DiscordId) => DiscordId.trim())
    .filter(Boolean);

  return new AccessControl(Prisma, SuperAdminIds);
}

export async function RequireSuperAdmin(Request: Request): Promise<string> {
  const DashboardUserValue = await RequireDashboardUser(Request);
  const DiscordId = DashboardUserValue.DiscordId;

  if (DashboardUserValue.Role !== "SuperAdmin") {
    throw new Response("SuperAdmin access required.", { status: 403 });
  }

  return DiscordId;
}

export async function RequireDashboardUser(Request: Request): Promise<DashboardUser> {
  const DashboardUserValue = await GetSessionUser(Request);

  if (!DashboardUserValue) {
    throw new Response("Authentication required.", { status: 401 });
  }

  if (DashboardUserValue.IsDashboardBanned) {
    throw new Response("Dashboard user is banned.", { status: 403 });
  }

  return DashboardUserValue;
}

export async function GetSessionUser(Request: Request): Promise<DashboardUser | null> {
  const SessionToken = GetCookieValue(Request, SessionCookieName);

  if (!SessionToken) {
    return null;
  }

  const TokenHash = HashSessionToken(SessionToken);
  const Session = await Prisma.sessionToken.findFirst({
    where: {
      TokenHash,
      RevokedAt: null,
      ExpiresAt: {
        gt: new Date()
      }
    },
    include: {
      DashboardUser: true
    }
  });

  return Session?.DashboardUser ?? null;
}

export async function CreateDashboardSession(UserId: string): Promise<{ SessionToken: string; ExpiresAt: Date }> {
  const SessionToken = randomBytes(48).toString("hex");
  const ExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  await Prisma.sessionToken.create({
    data: {
      UserId,
      TokenHash: HashSessionToken(SessionToken),
      ExpiresAt
    }
  });

  return { SessionToken, ExpiresAt };
}

export function HashSessionToken(SessionToken: string): string {
  return createHash("sha256").update(SessionToken).digest("hex");
}

function GetCookieValue(Request: Request, Key: string): string | null {
  const CookieHeader = Request.headers.get("cookie");

  if (!CookieHeader) {
    return null;
  }

  const Cookie = CookieHeader
    .split(";")
    .map((Part) => Part.trim())
    .find((Part) => Part.startsWith(`${Key}=`));

  return Cookie ? decodeURIComponent(Cookie.slice(Key.length + 1)) : null;
}
