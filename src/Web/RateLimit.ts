import { createHash } from "node:crypto";
import { RedisClient } from "../Core/Clients";

const AuthRateLimitWindowSeconds = 15 * 60;
const AuthRateLimitMaxAttempts = 8;

export async function EnforceAuthRateLimit(Request: Request, Scope: string, Identifier?: string): Promise<Response | null> {
  const Keys = BuildRateLimitKeys(Request, Scope, Identifier);
  const Counts = await Promise.all(
    Keys.map(async (Key) => {
      const Count = await RedisClient.incr(Key);

      if (Count === 1) {
        await RedisClient.expire(Key, AuthRateLimitWindowSeconds);
      }

      return Count;
    })
  );

  if (Counts.some((Count) => Count > AuthRateLimitMaxAttempts)) {
    return new Response("Too many attempts. Try again later.", {
      status: 429,
      headers: {
        "Retry-After": String(AuthRateLimitWindowSeconds)
      }
    });
  }

  return null;
}

export async function ClearAuthRateLimit(Request: Request, Scope: string, Identifier?: string): Promise<void> {
  const Keys = BuildRateLimitKeys(Request, Scope, Identifier);

  if (Keys.length > 0) {
    await RedisClient.del(...Keys);
  }
}

function BuildRateLimitKeys(Request: Request, Scope: string, Identifier?: string): string[] {
  const IpAddress = GetClientIpAddress(Request);
  const Keys = [`DashboardAuthRateLimit:${Scope}:Ip:${HashRateLimitPart(IpAddress)}`];
  const NormalizedIdentifier = Identifier?.trim().toLowerCase();

  if (NormalizedIdentifier) {
    Keys.push(`DashboardAuthRateLimit:${Scope}:Identifier:${HashRateLimitPart(NormalizedIdentifier)}`);
  }

  return Keys;
}

function GetClientIpAddress(Request: Request): string {
  const ForwardedFor = Request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ForwardedFor || Request.headers.get("x-real-ip") || "unknown";
}

function HashRateLimitPart(Value: string): string {
  return createHash("sha256").update(Value).digest("hex");
}
