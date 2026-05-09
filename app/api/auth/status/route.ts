import { NextResponse } from "next/server";
import { Prisma } from "@/src/Core/Clients";
import { GetSessionUser } from "@/src/Web/Auth";

async function Get(Request: Request): Promise<Response> {
  const UserCount = await Prisma.dashboardUser.count();
  const BotCount = await Prisma.discordBot.count();
  const User = await GetSessionUser(Request);

  return NextResponse.json({
    NeedsSetup: UserCount === 0,
    NeedsBot: BotCount === 0 && UserCount > 0,
    Authenticated: Boolean(User),
    User: User
      ? {
          Username: User.Username,
          DisplayName: User.DisplayName,
          Role: User.Role,
          DiscordId: User.DiscordId
        }
      : null
  });
}

export { Get as GET };
