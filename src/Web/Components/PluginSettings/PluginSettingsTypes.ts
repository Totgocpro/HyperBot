import type { SettingsField } from "../../../Core/Types";
import type { EditableEmbed } from "../PluginInterfaceRenderer";

export type BackupSummary = {
  Id: string;
  Name: string;
  GuildName: string;
  CreatedAt: string;
  CreatedBy: string;
  Roles: number;
  Channels: number;
  PluginConfigs: number;
};

export type CustomCommandActionType = "SendMessage" | "Reply" | "DM" | "SendEmbed" | "ReplyEmbed" | "DMEmbed" | "AddRole" | "RemoveRole" | "ToggleRole" | "DeleteTrigger" | "React";

export type CustomCommandActionDraft = {
  Id: string;
  Type: CustomCommandActionType;
  Message: string;
  Embed: EditableEmbed;
  RoleId: string;
  Emoji: string;
};

export type CustomCommandDraft = {
  Id: string;
  Name: string;
  Aliases: string[];
  Enabled: boolean;
  MatchMode: "Exact" | "StartsWith";
  Description: string;
  Checks: {
    AllowedChannelIds: string[];
    BlockedChannelIds: string[];
    RequiredRoleIds: string[];
    BlockedRoleIds: string[];
    DeniedMessage: string;
  };
  Actions: CustomCommandActionDraft[];
};

export type SaveFeedback = {
  Message: string;
  Tone: "Success" | "Error";
  Key: number;
};

export type ReminderDraft = {
  Id: string;
  Name: string;
  ChannelId: string;
  Mode: "Message" | "Embed";
  ScheduleMode: "Interval" | "Weekly";
  Weekdays: number[];
  TimeOfDay: string;
  Message: string;
  Title: string;
  Color: string;
  Embed: EditableEmbed;
  IntervalMs: number;
  NextRunAt: string;
  Enabled: boolean;
  CreatedBy: string;
  CreatedAt: string;
  LastRunAt: string | null;
  RunCount: number;
};

export type NotificationSourceType = "RSS" | "YouTube" | "Twitch" | "Kick" | "X" | "Reddit" | "Instagram";

export type NotificationSourceDraft = {
  Id: string;
  Name: string;
  Type: NotificationSourceType;
  Enabled: boolean;
  ChannelId: string;
  Url: string;
  ExternalId: string;
  ApiKey: string;
  ApiSecret: string;
  AccessToken: string;
  IntervalSeconds: number;
  IntervalMinutes: number;
  LastCheckedAt: string | null;
  Embed: EditableEmbed;
};

export type ChannelCounterDraft = {
  Id: string;
  Enabled: boolean;
  ChannelId: string;
  Template: string;
};
