import { Prisma as PrismaNamespace, type PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { PluginStorageContract } from "./Types.js";

export class PluginStorage implements PluginStorageContract {
  private readonly Prisma: PrismaClient;
  private readonly RedisClient: Redis;
  private readonly BotId: string;
  private readonly PluginId: string;
  private readonly CacheTtlSeconds = 60;

  public constructor(Prisma: PrismaClient, RedisClient: Redis, BotId: string, PluginId: string) {
    this.Prisma = Prisma;
    this.RedisClient = RedisClient;
    this.BotId = BotId;
    this.PluginId = PluginId;
  }

  public async GetUserValue<T>(GuildId: string, UserId: string, Key: string): Promise<T | null> {
    const CacheKey = this.BuildUserCacheKey(GuildId, UserId, Key);
    const CachedValue = await this.RedisClient.get(CacheKey);

    if (CachedValue !== null) {
      return JSON.parse(CachedValue) as T;
    }

    const StoredValue = await this.Prisma.userPluginValue.findUnique({
      where: {
        BotId_GuildId_UserId_PluginId_Key: {
          BotId: this.BotId,
          GuildId,
          UserId,
          PluginId: this.PluginId,
          Key
        }
      }
    });

    if (!StoredValue) {
      return null;
    }

    await this.RedisClient.set(CacheKey, JSON.stringify(StoredValue.Value), "EX", this.CacheTtlSeconds);
    return StoredValue.Value as T;
  }

  public async SetUserValue<T>(GuildId: string, UserId: string, Key: string, Value: T): Promise<void> {
    const CacheKey = this.BuildUserCacheKey(GuildId, UserId, Key);

    await this.Prisma.userPluginValue.upsert({
      where: {
        BotId_GuildId_UserId_PluginId_Key: {
          BotId: this.BotId,
          GuildId,
          UserId,
          PluginId: this.PluginId,
          Key
        }
      },
      update: { Value: this.SerializeJsonValue(Value) },
      create: {
        BotId: this.BotId,
        GuildId,
        UserId,
        PluginId: this.PluginId,
        Key,
        Value: this.SerializeJsonValue(Value)
      }
    });

    await this.RedisClient.set(CacheKey, JSON.stringify(Value), "EX", this.CacheTtlSeconds);
  }

  public async GetGlobalConfig<T>(GuildId: string, Key: string): Promise<T | null> {
    const CacheKey = this.BuildGlobalCacheKey(GuildId, Key);
    const CachedValue = await this.RedisClient.get(CacheKey);

    if (CachedValue !== null) {
      return JSON.parse(CachedValue) as T;
    }

    const StoredValue = await this.Prisma.pluginGlobalConfig.findUnique({
      where: {
        BotId_GuildId_PluginId_Key: {
          BotId: this.BotId,
          GuildId,
          PluginId: this.PluginId,
          Key
        }
      }
    });

    if (!StoredValue) {
      return null;
    }

    await this.RedisClient.set(CacheKey, JSON.stringify(StoredValue.Value), "EX", this.CacheTtlSeconds);
    return StoredValue.Value as T;
  }

  public async SetGlobalConfig<T>(GuildId: string, Key: string, Value: T): Promise<void> {
    const CacheKey = this.BuildGlobalCacheKey(GuildId, Key);

    await this.Prisma.pluginGlobalConfig.upsert({
      where: {
        BotId_GuildId_PluginId_Key: {
          BotId: this.BotId,
          GuildId,
          PluginId: this.PluginId,
          Key
        }
      },
      update: { Value: this.SerializeJsonValue(Value) },
      create: {
        BotId: this.BotId,
        GuildId,
        PluginId: this.PluginId,
        Key,
        Value: this.SerializeJsonValue(Value)
      }
    });

    await this.RedisClient.set(CacheKey, JSON.stringify(Value), "EX", this.CacheTtlSeconds);
  }

  private BuildUserCacheKey(GuildId: string, UserId: string, Key: string): string {
    return `Bot:${this.BotId}:Plugin:${this.PluginId}:Guild:${GuildId}:User:${UserId}:Key:${Key}`;
  }

  private BuildGlobalCacheKey(GuildId: string, Key: string): string {
    return `Bot:${this.BotId}:Plugin:${this.PluginId}:Guild:${GuildId}:Global:${Key}`;
  }

  private SerializeJsonValue(Value: unknown): PrismaNamespace.InputJsonValue | typeof PrismaNamespace.JsonNull {
    return Value === null ? PrismaNamespace.JsonNull : (Value as PrismaNamespace.InputJsonValue);
  }
}
