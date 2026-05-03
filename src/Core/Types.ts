import type { ChatInputCommandInteraction, Client, Message } from "discord.js";
import type { BasePlugin } from "./BasePlugin.js";

export enum SettingsFieldType {
  String = "String",
  Boolean = "Boolean",
  Number = "Number",
  Select = "Select",
  ChannelPicker = "ChannelPicker",
  List = "List"
}

export enum AccessLevel {
  SuperAdmin = "SuperAdmin",
  GuildOwner = "GuildOwner",
  GuildAdmin = "GuildAdmin"
}

export enum PluginScope {
  Guild = "Guild",
  Global = "Global"
}

export type PluginMetadata = {
  Id: string;
  DisplayName: string;
  Version: string;
  Author: string;
  Icon: string;
};

export type CommandOptionDefinition = {
  Name: string;
  Description: string;
  Type: "String" | "Integer" | "Boolean" | "User" | "Channel" | "Role";
  Required?: boolean;
  Choices?: Array<{
    Name: string;
    Value: string | number;
  }>;
};

export type CommandDefinition = {
  Name: string;
  Description: string;
  Options?: CommandOptionDefinition[];
};

export type SettingsField = {
  Key: string;
  Type: SettingsFieldType;
  Label: string;
  Default: string | number | boolean | unknown[] | null;
  Required?: boolean;
  ItemType?: "String" | "Number" | "ChannelPicker";
  ValidateAs?: "Regex";
  SupportedChannelTypes?: string[];
  RequireWritable?: boolean;
  Options?: Array<{
    Label: string;
    Value: string | number | boolean;
    Disabled?: boolean;
    Description?: string;
  }>;
};

export type PluginManifest = {
  Metadata: PluginMetadata;
  Scope: PluginScope;
  Commands: CommandDefinition[];
  WebInterface: SettingsField[];
  EntryPoint: string;
};

export type LoadedPlugin = {
  Manifest: PluginManifest;
  Instance: BasePlugin;
  Directory: string;
};

export type PluginConstructor = new (Context: PluginContext) => BasePlugin;

export type PluginContext = {
  Manifest: PluginManifest;
  Storage: PluginStorageContract;
  Logger: PluginLoggerContract;
  DiscordClient: Client;
};

export type PluginStorageContract = {
  GetUserValue<T>(GuildId: string, UserId: string, Key: string): Promise<T | null>;
  SetUserValue<T>(GuildId: string, UserId: string, Key: string, Value: T): Promise<void>;
  GetGlobalConfig<T>(GuildId: string, Key: string): Promise<T | null>;
  SetGlobalConfig<T>(GuildId: string, Key: string, Value: T): Promise<void>;
};

export type PluginLoggerContract = {
  Info(Message: string, Metadata?: unknown): void;
  Warn(Message: string, Metadata?: unknown): void;
  Error(Message: string, Metadata?: unknown): void;
};

export type PluginCommandHandler = (
  CommandName: string,
  Interaction: ChatInputCommandInteraction
) => Promise<void>;

export type PluginMessageHandler = (Message: Message) => Promise<void>;

export type DiscordGuildSummary = {
  Id: string;
  Name: string;
  Icon: string | null;
  Owner: boolean;
  Permissions: string;
};

export type HealthReport = {
  Database: "Healthy" | "Unhealthy";
  Redis: "Healthy" | "Unhealthy";
  Bot: "Healthy" | "Unhealthy";
};

export type BotGuildSummary = {
  Id: string;
  Name: string;
  Icon: string | null;
  MemberCount: number | null;
};

export type BotChannelSummary = {
  Id: string;
  Name: string;
  Type: string;
  IsWritable: boolean;
};
