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
    HealthReportValue.Bot = (await RedisClient.get("Bot:Heartbeat")) ? "Healthy" : "Unhealthy";
  } catch {
    HealthReportValue.Redis = "Unhealthy";
  }

  return NextResponse.json(HealthReportValue);
}

export { Get as GET };
