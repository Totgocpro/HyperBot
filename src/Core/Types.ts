import type { ChatInputCommandInteraction, Client, Message } from "discord.js";
import type { BasePlugin } from "./BasePlugin.js";

export enum SettingsFieldType {
  String = "String",
  Boolean = "Boolean",
  Number = "Number",
  Password = "Password",
  Select = "Select",
  ChannelPicker = "ChannelPicker",
  RolePicker = "RolePicker",
  EmbedEditor = "EmbedEditor",
  List = "List",
  Custom = "Custom",
  Button = "Button"
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

export type CommandAliasDefinition = {
  AliasName: string;
  TargetCommandName: string;
  Description?: string;
  Enabled?: boolean;
};

export type SettingsField = {
  Key: string;
  Type: SettingsFieldType;
  Label: string;
  Default: string | number | boolean | unknown[] | Record<string, unknown> | null;
  Description?: string;
  Section?: string;
  Required?: boolean;
  ButtonLabel?: string;
  ActionKey?: string;
  ActionKeys?: string[];
  CustomRenderer?: string;
  ItemType?: "String" | "Number" | "ChannelPicker" | "RolePicker";
  ValidateAs?: "Regex";
  SupportedChannelTypes?: string[];
  RequireWritable?: boolean;
  VisibleWhen?: SettingsFieldVisibilityRule | SettingsFieldVisibilityRule[];
  VisibleWhenAny?: SettingsFieldVisibilityRule[];
  Options?: Array<{
    Label: string;
    Value: string | number | boolean;
    Disabled?: boolean;
    Description?: string;
    Color?: number;
  }>;
};

export type SettingsFieldVisibilityRule = {
  Key: string;
  Value: string | number | boolean;
  Operator?: "Equals" | "NotEquals";
};

export enum DashboardElementType {
  MetricGrid = "MetricGrid",
  LineChart = "LineChart",
  BarChart = "BarChart",
  ActivityHeatmap = "ActivityHeatmap",
  InviteLeaderboard = "InviteLeaderboard"
}

export type DashboardElement = {
  Key: string;
  Type: DashboardElementType;
  Label: string;
  DataSourceKey: string;
  Unit?: string;
};

export type PluginManifest = {
  Metadata: PluginMetadata;
  Scope: PluginScope;
  Category?: string;
  Dependencies?: string[];
  Commands: CommandDefinition[];
  WebInterface: SettingsField[];
  DashboardElements?: DashboardElement[];
  EntryPoint: string;
};

export type LoadedPlugin = {
  Manifest: PluginManifest;
  Instance: BasePlugin;
  Directory: string;
};

export type PluginConstructor = new (Context: PluginContext) => BasePlugin;

export type PluginContext = {
  BotId: string;
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

export type BotRoleSummary = {
  Id: string;
  Name: string;
  Color: number;
  Position: number;
};

export type BotMemberSummary = {
  Id: string;
  DisplayName: string;
  Username: string;
};

export type BotEmojiSummary = {
  Id: string;
  Name: string;
  Animated: boolean;
};

export type BotEmojiLimitSummary = {
  MaxAnimatedEmojis: number;
  MaxStaticEmojis: number;
  PremiumTier: number;
};
