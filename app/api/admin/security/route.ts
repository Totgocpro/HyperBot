import { NextResponse } from "next/server";
import { Prisma } from "@/src/Core/Clients";
import { RequireSuperAdmin } from "@/src/Web/Auth";

async function Post(Request: Request): Promise<Response> {
  const ActorId = await ResolveSuperAdmin(Request);

  if (ActorId instanceof Response) {
    return ActorId;
  }

  const Body = (await Request.json()) as { DiscordId?: string; Action?: "ResetPassword" | "ResetSessions" };

  if (!Body.DiscordId || !Body.Action) {
    return new Response("DiscordId and Action are required.", { status: 400 });
  }

  if (Body.DiscordId === ActorId) {
    return new Response("You cannot run destructive security actions on your own account from the admin panel.", { status: 400 });
  }

  const User = await Prisma.dashboardUser.findUnique({
    where: { DiscordId: Body.DiscordId }
  });

  if (!User) {
    return new Response("User not found.", { status: 404 });
  }

  await Prisma.sessionToken.updateMany({
    where: { UserId: User.Id, RevokedAt: null },
    data: { RevokedAt: new Date() }
  });

  await Prisma.auditLog.create({
    data: {
      ActorId,
      Action: Body.Action,
      Target: Body.DiscordId,
      Metadata: { SessionsRevoked: true }
    }
  });

  return NextResponse.json({ Completed: true });
}

async function ResolveSuperAdmin(Request: Request): Promise<string | Response> {
  try {
    return await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }
}

export { Post as POST };
