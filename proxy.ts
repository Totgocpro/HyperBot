import { NextResponse, type NextRequest } from "next/server";

const SessionCookieName = "HyperBotSession";
const PublicPaths = ["/login", "/api/auth/login", "/api/auth/setup", "/api/auth/status"];

export function proxy(Request: NextRequest) {
  const Pathname = Request.nextUrl.pathname;

  if (IsPublicPath(Pathname) || Pathname.startsWith("/_next") || Pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const HasSession = Boolean(Request.cookies.get(SessionCookieName)?.value);

  if (!HasSession && Pathname.startsWith("/api")) {
    return new Response("Authentication required.", { status: 401 });
  }

  if (!HasSession) {
    const LoginUrl = Request.nextUrl.clone();
    LoginUrl.pathname = "/login";
    LoginUrl.searchParams.set("Next", Pathname);

    return NextResponse.redirect(LoginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\.).*)"]
};

function IsPublicPath(Pathname: string): boolean {
  return PublicPaths.some((PublicPath) => Pathname === PublicPath || Pathname.startsWith(`${PublicPath}/`));
}
