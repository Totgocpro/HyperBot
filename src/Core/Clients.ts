import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";

type GlobalWithClients = typeof globalThis & {
  HyperBotPrisma?: PrismaClient;
  HyperBotRedis?: Redis;
};

const GlobalClients = globalThis as GlobalWithClients;
const IsNextProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

export const Prisma = GlobalClients.HyperBotPrisma ?? new PrismaClient();

export const RedisClient =
  GlobalClients.HyperBotRedis ??
  (IsNextProductionBuild
    ? new Redis({
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0
      })
    : new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
        lazyConnect: true,
        maxRetriesPerRequest: 2
      }));

RedisClient.on("error", (ErrorValue) => {
  if (IsNextProductionBuild) {
    return;
  }

  console.error("Redis client error:", ErrorValue);
});

if (process.env.NODE_ENV !== "production") {
  GlobalClients.HyperBotPrisma = Prisma;
  GlobalClients.HyperBotRedis = RedisClient;
}
