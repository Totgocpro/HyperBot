import { NextResponse } from "next/server";
import { Prisma } from "@/src/Core/Clients";
import { HashSessionToken, RequireDashboardUser, SessionCookieName } from "@/src/Web/Auth";
import { HashPassword, VerifyPassword } from "@/src/Web/Password";

async function Put(Request: Request): Promise<Response> {
  let User;

  try {
    User = await RequireDashboardUser(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const Body = (await Request.json()) as {
    CurrentPassword?: string;
    NewPassword?: string;
  };

  if (!Body.CurrentPassword || !Body.NewPassword || Body.NewPassword.length < 8) {
    return new Response("Current password and new password with at least 8 characters are required.", { status: 400 });
  }

  if (!VerifyPassword(Body.CurrentPassword, User.PasswordHash, User.PasswordSalt)) {
    return new Response("Current password is invalid.", { status: 401 });
  }

  const Password = HashPassword(Body.NewPassword);
  const CurrentSessionToken = GetSessionToken(Request);
  const CurrentTokenHash = CurrentSessionToken ? HashSessionToken(CurrentSessionToken) : null;

  await Prisma.dashboardUser.update({
    where: { Id: User.Id },
    data: {
      PasswordHash: Password.PasswordHash,
      PasswordSalt: Password.PasswordSalt
    }
  });

  await Prisma.sessionToken.updateMany({
    where: {
      UserId: User.Id,
      RevokedAt: null,
      TokenHash: CurrentTokenHash ? { not: CurrentTokenHash } : undefined
    },
    data: {
      RevokedAt: new Date()
    }
  });

  return NextResponse.json({ Updated: true });
}

function GetSessionToken(Request: Request): string | null {
  const CookieHeader = Request.headers.get("cookie");

  if (!CookieHeader) {
    return null;
  }

  const Cookie = CookieHeader
    .split(";")
    .map((Part) => Part.trim())
    .find((Part) => Part.startsWith(`${SessionCookieName}=`));

  return Cookie ? decodeURIComponent(Cookie.slice(SessionCookieName.length + 1)) : null;
}

export { Put as PUT };
