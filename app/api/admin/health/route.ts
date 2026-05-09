import { NextResponse } from "next/server";
import { Prisma, RedisClient } from "@/src/Core/Clients";
import { RequireSuperAdmin } from "@/src/Web/Auth";
import type { HealthReport } from "@/src/Core/Types";

async function Get(Request: Request): Promise<Response> {
  try {
    await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const { searchParams } = new URL(Request.url);
  const BotId = searchParams.get("botId");

  const HealthReportValue: HealthReport = {
    Database: "Unhealthy",
    Redis: "Unhealthy",
    Bot: "Unhealthy"
  };

  try {
    await Prisma.$queryRaw`SELECT 1`;
    HealthReportValue.Database = "Healthy";
  } catch {
    HealthReportValue.Database = "Unhealthy";
  }

  try {
    const RedisPong = await RedisClient.ping();
    HealthReportValue.Redis = RedisPong === "PONG" ? "Healthy" : "Unhealthy";
    
    if (BotId) {
      HealthReportValue.Bot = (await RedisClient.get(`Bot:${BotId}:Heartbeat`)) ? "Healthy" : "Unhealthy";
    } else {
      HealthReportValue.Bot = "Healthy"; // General health if no specific bot requested
    }
  } catch {
    HealthReportValue.Redis = "Unhealthy";
  }

  return NextResponse.json(HealthReportValue);
}

export { Get as GET };
