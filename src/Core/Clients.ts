import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";

type GlobalWithClients = typeof globalThis & {
  HyperBotPrisma?: PrismaClient;
  HyperBotRedis?: Redis;
};

const GlobalClients = globalThis as GlobalWithClients;

export const Prisma = GlobalClients.HyperBotPrisma ?? new PrismaClient();

export const RedisClient =
  GlobalClients.HyperBotRedis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 2
  });

if (process.env.NODE_ENV !== "production") {
  GlobalClients.HyperBotPrisma = Prisma;
  GlobalClients.HyperBotRedis = RedisClient;
}
