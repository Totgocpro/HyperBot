import { NextResponse } from "next/server";
import { RequireDashboardUser } from "@/src/Web/Auth";

async function Get(Request: Request): Promise<Response> {
  try {
    const User = await RequireDashboardUser(Request);

    return NextResponse.json({
      User: {
        Username: User.Username,
        DisplayName: User.DisplayName,
        Role: User.Role,
        DiscordId: User.DiscordId
      }
    });
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }
}

export { Get as GET };
