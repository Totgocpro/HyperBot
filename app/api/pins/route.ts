import { NextResponse } from "next/server";
import { Prisma } from "@/src/Core/Clients";
import { RequireDashboardUser } from "@/src/Web/Auth";

async function Get(Request: Request): Promise<Response> {
  let User;
  try {
    User = await RequireDashboardUser(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const Pins = await Prisma.pinnedGuild.findMany({
    where: { UserId: User.Id },
    orderBy: { CreatedAt: "asc" }
  });

  return NextResponse.json(Pins.map((P) => ({ GuildId: P.GuildId, GuildName: P.GuildName })));
}

async function Post(Request: Request): Promise<Response> {
  let User;
  try {
    User = await RequireDashboardUser(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const Body = await Request.json();
  if (!Body.GuildId || !Body.GuildName) {
    return new Response("GuildId and GuildName are required", { status: 400 });
  }

  const Existing = await Prisma.pinnedGuild.findUnique({
    where: { UserId_GuildId: { UserId: User.Id, GuildId: Body.GuildId } }
  });

  if (Existing) {
    await Prisma.pinnedGuild.delete({ where: { Id: Existing.Id } });
    return NextResponse.json({ Pinned: false });
  }

  await Prisma.pinnedGuild.create({
    data: { UserId: User.Id, GuildId: Body.GuildId, GuildName: Body.GuildName }
  });

  return NextResponse.json({ Pinned: true });
}

export { Get as GET, Post as POST };