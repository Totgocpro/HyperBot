import { NextResponse } from "next/server";
import { Prisma } from "@/src/Core/Clients";
import { CreateDashboardSession, SessionCookieName, ShouldUseSecureCookies } from "@/src/Web/Auth";
import { VerifyPassword } from "@/src/Web/Password";
import { ClearAuthRateLimit, EnforceAuthRateLimit } from "@/src/Web/RateLimit";
import { GetRequestIpAddress, GetRequestUserAgent } from "@/src/Web/RequestMetadata";

async function Post(Request: Request): Promise<Response> {
  const Body = (await Request.json()) as { Username?: string; Password?: string };
  const Username = Body.Username?.trim() ?? "";
  const RequestMetadata = {
    IpAddress: GetRequestIpAddress(Request),
    UserAgent: GetRequestUserAgent(Request),
    Username
  };

  if (!Body.Username || !Body.Password) {
    return new Response("Username and password are required.", { status: 400 });
  }

  const RateLimitResponse = await EnforceAuthRateLimit(Request, "login", Username);

  if (RateLimitResponse) {
    await Prisma.auditLog.create({
      data: {
        ActorId: Username || "anonymous",
        Action: "DashboardLoginRateLimited",
        Target: Username || "DashboardLogin",
        Metadata: { ...RequestMetadata, Result: "RateLimited" }
      }
    });

    return RateLimitResponse;
  }

  const User = await Prisma.dashboardUser.findUnique({
    where: { Username }
  });

  if (!User || User.IsDashboardBanned || !VerifyPassword(Body.Password, User.PasswordHash, User.PasswordSalt)) {
    await Prisma.auditLog.create({
      data: {
        ActorId: User?.DiscordId ?? (Username || "anonymous"),
        Action: "DashboardLoginFailed",
        Target: User?.DiscordId ?? (Username || "DashboardLogin"),
        Metadata: {
          ...RequestMetadata,
          Result: User?.IsDashboardBanned ? "BannedUser" : "InvalidCredentials"
        }
      }
    });

    return new Response("Invalid credentials.", { status: 401 });
  }

  await ClearAuthRateLimit(Request, "login", Username);

  const Session = await CreateDashboardSession(User.Id);
  await Prisma.auditLog.create({
    data: {
      ActorId: User.DiscordId,
      Action: "DashboardLoginSucceeded",
      Target: User.DiscordId,
      Metadata: { ...RequestMetadata, Result: "Success" }
    }
  });
  const ResponseValue = NextResponse.json({
    Authenticated: true,
    User: {
      Username: User.Username,
      DisplayName: User.DisplayName,
      Role: User.Role,
      DiscordId: User.DiscordId
    }
  });

  ResponseValue.cookies.set(SessionCookieName, Session.SessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: ShouldUseSecureCookies(Request),
    path: "/",
    expires: Session.ExpiresAt
  });

  return ResponseValue;
}

export { Post as POST };
