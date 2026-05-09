import { NextResponse } from "next/server";
import { Prisma } from "@/src/Core/Clients";
import { RequireDashboardUser } from "@/src/Web/Auth";

type RouteParams = {
  params: Promise<{
    id: string;
  }>;
};

async function Get(Request: Request, { params }: RouteParams): Promise<Response> {
  let User;
  try {
    User = await RequireDashboardUser(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const { id } = await params;

  if (User.Role !== "SuperAdmin") {
    const Access = await Prisma.botAccess.findUnique({
      where: { UserId_BotId: { UserId: User.Id, BotId: id } }
    });

    if (!Access) {
      return new Response("Unauthorized", { status: 403 });
    }
  }

  const Bot = await Prisma.discordBot.findUnique({
    where: { Id: id },
    select: {
      Id: true,
      Name: true,
      AvatarUrl: true
    }
  });

  if (!Bot) {
    return new Response("Bot not found.", { status: 404 });
  }

  return NextResponse.json(Bot);
}

async function Patch(Request: Request, { params }: RouteParams): Promise<Response> {
  let User;
  try {
    User = await RequireDashboardUser(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const { id } = await params;

  // Authorization check
  if (User.Role !== "SuperAdmin") {
      const Access = await Prisma.botAccess.findUnique({
          where: { UserId_BotId: { UserId: User.Id, BotId: id } }
      });
      if (!Access) {
          return new Response("Unauthorized", { status: 403 });
      }
  }

  const Body = await Request.json();
  const UpdateData: any = {};
  
  if (Body.Token !== undefined) UpdateData.Token = Body.Token;
  if (Body.ClientId !== undefined) UpdateData.ClientId = Body.ClientId;
  if (Body.IsEnabled !== undefined) UpdateData.IsEnabled = Body.IsEnabled;

  if (Body.Token) {
      // Re-fetch bot info if token changed
      const DiscordResponse = await fetch("https://discord.com/api/v10/users/@me", {
        headers: {
            Authorization: `Bot ${Body.Token}`
        }
      });
      if (DiscordResponse.ok) {
          const BotInfo = await DiscordResponse.json();
          UpdateData.Name = BotInfo.username;
          UpdateData.AvatarUrl = BotInfo.avatar ? `https://cdn.discordapp.com/avatars/${BotInfo.id}/${BotInfo.avatar}.png` : null;
      }
  }

  const Bot = await Prisma.discordBot.update({
    where: { Id: id },
    data: UpdateData
  });

  return NextResponse.json(Bot);
}

async function Delete(Request: Request, { params }: RouteParams): Promise<Response> {
  let User;
  try {
    User = await RequireDashboardUser(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  if (User.Role !== "SuperAdmin") {
    return new Response("Unauthorized", { status: 403 });
  }

  const { id } = await params;

  await Prisma.discordBot.delete({
    where: { Id: id }
  });

  return new Response(null, { status: 204 });
}

export { Get as GET, Patch as PATCH, Delete as DELETE };
