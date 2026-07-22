import { NextResponse } from "next/server";
import { RedisClient } from "@/src/Core/Clients";
import { RequireSuperAdmin } from "@/src/Web/Auth";

type RouteParams = {
  params: Promise<{
    id: string;
    guildId: string;
  }>;
};

async function Post(Request: Request, { params }: RouteParams): Promise<Response> {
  try {
    await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const { id, guildId } = await params;

  await RedisClient.lpush(
    `Bot:${id}:Commands`,
    JSON.stringify({ type: "LeaveGuild", guildId })
  );

  return NextResponse.json({ success: true });
}

export { Post as POST };
