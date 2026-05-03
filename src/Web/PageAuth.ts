import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "../Core/Clients";
import { HashSessionToken, SessionCookieName } from "./Auth";

export async function RequireAuthenticatedPage(NextPath: string): Promise<void> {
  const CookieStore = await cookies();
  const SessionToken = CookieStore.get(SessionCookieName)?.value;

  if (!SessionToken) {
    redirect(`/login?Next=${encodeURIComponent(NextPath)}`);
  }

  const Session = await Prisma.sessionToken.findFirst({
    where: {
      TokenHash: HashSessionToken(SessionToken),
      RevokedAt: null,
      ExpiresAt: {
        gt: new Date()
      },
      DashboardUser: {
        IsDashboardBanned: false
      }
    }
  });

  if (!Session) {
    redirect(`/login?Next=${encodeURIComponent(NextPath)}`);
  }
}

export async function RequireSuperAdminPage(NextPath: string): Promise<void> {
  const CookieStore = await cookies();
  const SessionToken = CookieStore.get(SessionCookieName)?.value;

  if (!SessionToken) {
    redirect(`/login?Next=${encodeURIComponent(NextPath)}`);
  }

  const Session = await Prisma.sessionToken.findFirst({
    where: {
      TokenHash: HashSessionToken(SessionToken),
      RevokedAt: null,
      ExpiresAt: {
        gt: new Date()
      },
      DashboardUser: {
        IsDashboardBanned: false,
        Role: "SuperAdmin"
      }
    }
  });

  if (!Session) {
    redirect(`/login?Next=${encodeURIComponent(NextPath)}`);
  }
}
