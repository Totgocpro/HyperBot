import { Prisma as PrismaNamespace } from "@prisma/client";
import { NextResponse } from "next/server";
import { Prisma } from "@/src/Core/Clients";
import { CreateDashboardSession, SessionCookieName, ShouldUseSecureCookies } from "@/src/Web/Auth";
import { HashPassword } from "@/src/Web/Password";
import { ClearAuthRateLimit, EnforceAuthRateLimit } from "@/src/Web/RateLimit";
import { GetRequestIpAddress, GetRequestUserAgent } from "@/src/Web/RequestMetadata";

async function Post(Request: Request): Promise<Response> {
  const UserCount = await Prisma.dashboardUser.count();

  if (UserCount > 0) {
    return new Response("Initial setup is already completed.", { status: 409 });
  }

  const Body = (await Request.json()) as {
    Username?: string;
    Password?: string;
    DisplayName?: string;
    DiscordId?: string;
  };

  if (!Body.Username || !Body.Password || Body.Password.length < 8) {
    return new Response("Username and password with at least 8 characters are required.", { status: 400 });
  }

  const RateLimitResponse = await EnforceAuthRateLimit(Request, "setup", Body.Username);

  if (RateLimitResponse) {
    return RateLimitResponse;
  }

  const Username = Body.Username.trim();
  const DiscordId = Body.DiscordId?.trim() || Username;
  const DisplayName = Body.DisplayName?.trim() || Username;

  const User = await Prisma.$transaction(
    async (Transaction) => {
      const TransactionUserCount = await Transaction.dashboardUser.count();

      if (TransactionUserCount > 0) {
        throw new Response("Initial setup is already completed.", { status: 409 });
      }

      const Password = HashPassword(Body.Password as string);
      return Transaction.dashboardUser.create({
        data: {
          Username,
          DiscordId,
          DisplayName,
          PasswordHash: Password.PasswordHash,
          PasswordSalt: Password.PasswordSalt,
          Role: "SuperAdmin"
        }
      });
    },
    {
      isolationLevel: PrismaNamespace.TransactionIsolationLevel.Serializable
    }
  ).catch((ErrorValue: unknown) => {
    if (ErrorValue instanceof Response) {
      return ErrorValue;
    }

    throw ErrorValue;
  });

  if (User instanceof Response) {
    return User;
  }

  await ClearAuthRateLimit(Request, "setup", Body.Username);

  const Session = await CreateDashboardSession(User.Id);
  await Prisma.auditLog.create({
    data: {
      ActorId: User.DiscordId,
      Action: "DashboardSetupCompleted",
      Target: User.DiscordId,
      Metadata: {
        IpAddress: GetRequestIpAddress(Request),
        UserAgent: GetRequestUserAgent(Request),
        Username,
        Result: "Success"
      }
    }
  });
  const ResponseValue = NextResponse.json({ Created: true });

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
