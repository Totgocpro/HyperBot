import { NextResponse } from "next/server";
import { Prisma } from "@/src/Core/Clients";
import { CreateDashboardSession, SessionCookieName } from "@/src/Web/Auth";
import { VerifyPassword } from "@/src/Web/Password";

async function Post(Request: Request): Promise<Response> {
  const Body = (await Request.json()) as { Username?: string; Password?: string };

  if (!Body.Username || !Body.Password) {
    return new Response("Username and password are required.", { status: 400 });
  }

  const User = await Prisma.dashboardUser.findUnique({
    where: { Username: Body.Username.trim() }
  });

  if (!User || User.IsDashboardBanned || !VerifyPassword(Body.Password, User.PasswordHash, User.PasswordSalt)) {
    return new Response("Invalid credentials.", { status: 401 });
  }

  const Session = await CreateDashboardSession(User.Id);
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
    path: "/",
    expires: Session.ExpiresAt
  });

  return ResponseValue;
}

export { Post as POST };
