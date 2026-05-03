import { NextResponse } from "next/server";
import { Prisma } from "@/src/Core/Clients";
import { CreateDashboardSession, SessionCookieName } from "@/src/Web/Auth";
import { HashPassword } from "@/src/Web/Password";

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

  const Password = HashPassword(Body.Password);
  const User = await Prisma.dashboardUser.create({
    data: {
      Username: Body.Username.trim(),
      DiscordId: (Body.DiscordId?.trim() || Body.Username.trim()),
      DisplayName: Body.DisplayName?.trim() || Body.Username.trim(),
      PasswordHash: Password.PasswordHash,
      PasswordSalt: Password.PasswordSalt,
      Role: "SuperAdmin"
    }
  });
  const Session = await CreateDashboardSession(User.Id);
  const ResponseValue = NextResponse.json({ Created: true });

  ResponseValue.cookies.set(SessionCookieName, Session.SessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: Session.ExpiresAt
  });

  return ResponseValue;
}

export { Post as POST };
