import { NextResponse } from "next/server";
import { Prisma } from "@/src/Core/Clients";
import { HashSessionToken, SessionCookieName, ShouldUseSecureCookies } from "@/src/Web/Auth";

async function Post(Request: Request): Promise<Response> {
  const SessionToken = Request.headers
    .get("cookie")
    ?.split(";")
    .map((Part) => Part.trim())
    .find((Part) => Part.startsWith(`${SessionCookieName}=`))
    ?.slice(SessionCookieName.length + 1);

  if (SessionToken) {
    await Prisma.sessionToken.updateMany({
      where: {
        TokenHash: HashSessionToken(decodeURIComponent(SessionToken)),
        RevokedAt: null
      },
      data: {
        RevokedAt: new Date()
      }
    });
  }

  const ResponseValue = NextResponse.json({ Authenticated: false });
  ResponseValue.cookies.set(SessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: ShouldUseSecureCookies(Request),
    path: "/",
    maxAge: 0
  });

  return ResponseValue;
}

export { Post as POST };
