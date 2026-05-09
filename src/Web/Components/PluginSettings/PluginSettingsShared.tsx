"use client";

import { useState as UseState } from "react";
import type { SettingsField } from "../../../Core/Types";
import { CustomSelect } from "../CustomSelect";
import { ParseEditableEmbed, type BotPreviewIdentity, type EditableEmbed, type EditableEmbedField } from "../PluginInterfaceRenderer";
import type { ChannelCounterDraft, CustomCommandActionType, CustomCommandDraft, NotificationSourceDraft, NotificationSourceType, ReminderDraft } from "./PluginSettingsTypes";

export function BuildGuildHeaders(): HeadersInit {
  return {};
}

export function AdvancedEmbedEditor(Properties: {
  BotIdentity?: BotPreviewIdentity | null;
  EmbedValue: EditableEmbed;
  OnChange: (EmbedValue: EditableEmbed) => void;
  PlaceholderText?: string;
}) {
  const CurrentEmbed = Properties.EmbedValue;
  const [SelectedPart, SetSelectedPart] = UseState<"Content" | "Author" | "Media" | "Footer" | "Fields">("Content");

  function UpdateEmbed(Patch: Partial<EditableEmbed>): void {
    Properties.OnChange({ ...CurrentEmbed, ...Patch });
  }

  function UpdateField(Index: number, Patch: Partial<EditableEmbedField>): void {
    UpdateEmbed({
      Fields: CurrentEmbed.Fields.map((Field, FieldIndex) => (FieldIndex === Index ? { ...Field, ...Patch } : Field))
    });
  }

  function AddField(): void {
    UpdateEmbed({
      Fields: [...CurrentEmbed.Fields, { Name: "Field title", Value: "Field value", Inline: false }]
    });
  }

  function RemoveField(Index: number): void {
    UpdateEmbed({
      Fields: CurrentEmbed.Fields.filter((_, FieldIndex) => FieldIndex !== Index)
    });
  }

  function UploadEmbedImage(FileValue: File | undefined): void {
    if (!FileValue) {
      return;
    }

    if (!FileValue.type.startsWith("image/")) {
      return;
    }

    const Reader = new FileReader();
    Reader.onload = () => UpdateEmbed({ ImageDataUrl: String(Reader.result ?? ""), ImageName: FileValue.name || "embed-image.png", ImageUrl: "" });
    Reader.readAsDataURL(FileValue);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid content-start gap-3">
        {Properties.PlaceholderText ? <p className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">{Properties.PlaceholderText}</p> : null}
        <DiscordEmbedPreview BotIdentity={Properties.BotIdentity} Embed={CurrentEmbed} OnSelectPart={SetSelectedPart} SelectedPart={SelectedPart} />
      </div>
      <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {(["Content", "Author", "Media", "Footer", "Fields"] as const).map((Part) => (
            <button className={SelectedPart === Part ? "rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white" : "rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800"} key={Part} onClick={() => SetSelectedPart(Part)} type="button">
              {Part}
            </button>
          ))}
        </div>

        {SelectedPart === "Content" ? (
          <div className="grid gap-3">
            <label className="block text-sm font-bold text-slate-200">
              Title
              <input className={EmbedInputClassName} maxLength={256} onChange={(Event) => UpdateEmbed({ Title: Event.target.value })} value={CurrentEmbed.Title} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              Description
              <textarea className={`${EmbedInputClassName} min-h-40 resize-y`} maxLength={4096} onChange={(Event) => UpdateEmbed({ Description: Event.target.value })} value={CurrentEmbed.Description} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              Title URL
              <input className={EmbedInputClassName} onChange={(Event) => UpdateEmbed({ Url: Event.target.value })} placeholder="https://example.com" value={CurrentEmbed.Url} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              Accent color
              <input className={EmbedInputClassName} onChange={(Event) => UpdateEmbed({ Color: Event.target.value })} type="color" value={NormalizeEmbedColor(CurrentEmbed.Color)} />
            </label>
          </div>
        ) : null}

        {SelectedPart === "Author" ? (
          <div className="grid gap-3">
            <label className="block text-sm font-bold text-slate-200">
              Author name
              <input className={EmbedInputClassName} maxLength={256} onChange={(Event) => UpdateEmbed({ AuthorName: Event.target.value })} value={CurrentEmbed.AuthorName} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              Author icon URL
              <input className={EmbedInputClassName} onChange={(Event) => UpdateEmbed({ AuthorIconUrl: Event.target.value })} value={CurrentEmbed.AuthorIconUrl} />
            </label>
          </div>
        ) : null}

        {SelectedPart === "Media" ? (
          <div className="grid gap-3">
            <label className="block text-sm font-bold text-slate-200">
              Thumbnail URL
              <input className={EmbedInputClassName} onChange={(Event) => UpdateEmbed({ ThumbnailUrl: Event.target.value })} value={CurrentEmbed.ThumbnailUrl} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              Image URL
              <input className={EmbedInputClassName} onChange={(Event) => UpdateEmbed({ ImageUrl: Event.target.value, ImageDataUrl: "" })} value={CurrentEmbed.ImageUrl} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              Upload image
              <span className="mt-2 flex cursor-pointer items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:bg-slate-800">
                {CurrentEmbed.ImageDataUrl ? CurrentEmbed.ImageName || "Uploaded image" : "Choose image"}
                <input accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(Event) => UploadEmbedImage(Event.target.files?.[0])} type="file" />
              </span>
            </label>
            {CurrentEmbed.ImageDataUrl ? <button className="rounded-xl border border-red-500/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10" onClick={() => UpdateEmbed({ ImageDataUrl: "", ImageName: "" })} type="button">Remove uploaded image</button> : null}
          </div>
        ) : null}

        {SelectedPart === "Footer" ? (
          <div className="grid gap-3">
            <label className="block text-sm font-bold text-slate-200">
              Footer text
              <input className={EmbedInputClassName} maxLength={2048} onChange={(Event) => UpdateEmbed({ FooterText: Event.target.value })} value={CurrentEmbed.FooterText} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              Footer icon URL
              <input className={EmbedInputClassName} onChange={(Event) => UpdateEmbed({ FooterIconUrl: Event.target.value })} value={CurrentEmbed.FooterIconUrl} />
            </label>
            <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 font-semibold text-slate-100">
              Timestamp
              <input checked={CurrentEmbed.Timestamp} className="h-5 w-5 accent-blue-600" onChange={(Event) => UpdateEmbed({ Timestamp: Event.target.checked })} type="checkbox" />
            </label>
          </div>
        ) : null}

        {SelectedPart === "Fields" ? (
          <div className="grid gap-3">
            <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500" onClick={AddField} type="button">
              Add field
            </button>
            {CurrentEmbed.Fields.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No field configured.</p> : null}
            {CurrentEmbed.Fields.map((Field, Index) => (
              <div className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-3" key={Index}>
                <input className={EmbedInputClassName} maxLength={256} onChange={(Event) => UpdateField(Index, { Name: Event.target.value })} placeholder="Field name" value={Field.Name} />
                <textarea className={`${EmbedInputClassName} min-h-20 resize-y`} maxLength={1024} onChange={(Event) => UpdateField(Index, { Value: Event.target.value })} placeholder="Field value" value={Field.Value} />
                <div className="flex gap-2">
                  <label className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200">
                    <input checked={Field.Inline} className="h-4 w-4 accent-blue-600" onChange={(Event) => UpdateField(Index, { Inline: Event.target.checked })} type="checkbox" />
                    Inline
                  </label>
                  <button className="rounded-xl border border-red-500/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10" onClick={() => RemoveField(Index)} type="button">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function DiscordEmbedPreview(Properties: { BotIdentity?: BotPreviewIdentity | null; Embed: EditableEmbed; OnSelectPart?: (Part: "Content" | "Author" | "Media" | "Footer" | "Fields") => void; SelectedPart?: string }) {
  const Color = NormalizeEmbedColor(Properties.Embed.Color);
  const SelectClassName = "rounded-md outline outline-2 outline-transparent transition hover:outline-blue-400";
  const ActiveClassName = "outline-blue-500";
  const BotName = Properties.BotIdentity?.Name?.trim() || "HyperBot";
  const BotInitials = BuildBotInitials(BotName);

  return (
    <section className="rounded-3xl border border-slate-800 bg-[#313338] p-4 shadow-xl shadow-black/20">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Discord preview</p>
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-sm font-black text-white">
          {Properties.BotIdentity?.AvatarUrl ? <img alt="" className="h-10 w-10 rounded-full object-cover" src={Properties.BotIdentity.AvatarUrl} /> : BotInitials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-white">
            <span className="min-w-0 max-w-[240px] truncate">{BotName}</span>
            <span className="shrink-0 rounded bg-[#5865f2] px-1 py-0.5 text-[10px] uppercase text-white">Bot</span>
          </p>
          <div className="mt-2 max-w-[520px] overflow-hidden rounded bg-[#2b2d31]" style={{ borderLeft: `4px solid ${Color}` }}>
            <div className="p-4">
              {Properties.Embed.AuthorName ? (
                <button className={`mb-2 flex w-full items-center gap-2 text-left text-sm font-semibold text-white ${SelectClassName} ${Properties.SelectedPart === "Author" ? ActiveClassName : ""}`} onClick={() => Properties.OnSelectPart?.("Author")} type="button">
                  {Properties.Embed.AuthorIconUrl ? <img alt="" className="h-5 w-5 rounded-full object-cover" src={Properties.Embed.AuthorIconUrl} /> : null}
                  {Properties.Embed.AuthorName}
                </button>
              ) : null}
              <div className="flex gap-4">
                <button className={`min-w-0 flex-1 text-left ${SelectClassName} ${Properties.SelectedPart === "Content" ? ActiveClassName : ""}`} onClick={() => Properties.OnSelectPart?.("Content")} type="button">
                  {Properties.Embed.Title ? <p className="break-words text-base font-semibold text-[#00a8fc]">{Properties.Embed.Title}</p> : null}
                  {Properties.Embed.Description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-[#dbdee1]">{Properties.Embed.Description}</p> : null}
                  {Properties.Embed.ImageDataUrl || Properties.Embed.ImageUrl ? <img alt="" className="mt-3 max-h-56 rounded object-cover" src={Properties.Embed.ImageDataUrl || Properties.Embed.ImageUrl} /> : null}
                </button>
                {Properties.Embed.ThumbnailUrl ? <button className={`${SelectClassName} ${Properties.SelectedPart === "Media" ? ActiveClassName : ""}`} onClick={() => Properties.OnSelectPart?.("Media")} type="button"><img alt="" className="h-20 w-20 shrink-0 rounded object-cover" src={Properties.Embed.ThumbnailUrl} /></button> : null}
              </div>
              {Properties.Embed.Fields.length ? (
                <button className={`mt-3 grid w-full gap-3 text-left ${SelectClassName} ${Properties.SelectedPart === "Fields" ? ActiveClassName : ""}`} onClick={() => Properties.OnSelectPart?.("Fields")} type="button">
                  {Properties.Embed.Fields.filter((Field) => Field.Name || Field.Value).map((Field, Index) => (
                    <div className={Field.Inline ? "inline-block min-w-[30%] pr-3 align-top" : "block"} key={Index}>
                      <p className="break-words text-sm font-semibold text-white">{Field.Name || "\u200b"}</p>
                      <p className="whitespace-pre-wrap break-words text-sm text-[#dbdee1]">{Field.Value || "\u200b"}</p>
                    </div>
                  ))}
                </button>
              ) : null}
              {Properties.Embed.FooterText || Properties.Embed.Timestamp ? (
                <button className={`mt-3 flex w-full items-center gap-2 text-left text-xs text-[#b5bac1] ${SelectClassName} ${Properties.SelectedPart === "Footer" ? ActiveClassName : ""}`} onClick={() => Properties.OnSelectPart?.("Footer")} type="button">
                  {Properties.Embed.FooterIconUrl ? <img alt="" className="h-5 w-5 rounded-full object-cover" src={Properties.Embed.FooterIconUrl} /> : null}
                  <span>
                    {Properties.Embed.FooterText}
                    {Properties.Embed.FooterText && Properties.Embed.Timestamp ? " | " : ""}
                    {Properties.Embed.Timestamp ? "Today at preview time" : ""}
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


export function IsRecord(Value: unknown): Value is Record<string, unknown> {
  return typeof Value === "object" && Value !== null && !Array.isArray(Value);
}

export function FormatChartValue(Value: number, Unit?: string): string {
  if (Unit === "seconds") {
    const Hours = Math.floor(Value / 3600);
    const Minutes = Math.floor((Value % 3600) / 60);
    return `${Hours}h ${Minutes}m`;
  }

  return `${Math.round(Value * 10) / 10}${Unit ? ` ${Unit}` : ""}`;
}


export const EmbedInputClassName = "mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500";

export function CreateDefaultEmbed(): EditableEmbed {
  return {
    Name: "New embed",
    Title: "Embed title",
    Description: "Write your Discord embed description here.",
    Color: "#5865f2",
    Url: "",
    AuthorName: "",
    AuthorIconUrl: "",
    ThumbnailUrl: "",
    ImageUrl: "",
    FooterText: "",
    FooterIconUrl: "",
    Timestamp: false,
    Fields: [],
    ImageDataUrl: "",
    ImageName: ""
  };
}

export function ParseCustomCommands(Value: unknown): CustomCommandDraft[] {
  if (!Array.isArray(Value)) {
    return [];
  }

  return Value.filter(IsRecord).map((CommandValue) => ({
    Id: typeof CommandValue.Id === "string" ? CommandValue.Id : CreateClientId(),
    Name: SanitizeCommandDraftName(String(CommandValue.Name ?? "")),
    Aliases: Array.isArray(CommandValue.Aliases) ? CommandValue.Aliases.map((Alias) => SanitizeCommandDraftName(String(Alias))).filter(Boolean) : [],
    Enabled: CommandValue.Enabled !== false,
    MatchMode: ParseCustomMatchMode(CommandValue.MatchMode),
    Description: typeof CommandValue.Description === "string" ? CommandValue.Description : "",
    Checks: {
      AllowedChannelIds: ReadNestedStringArray(CommandValue.Checks, "AllowedChannelIds"),
      BlockedChannelIds: ReadNestedStringArray(CommandValue.Checks, "BlockedChannelIds"),
      RequiredRoleIds: ReadNestedStringArray(CommandValue.Checks, "RequiredRoleIds"),
      BlockedRoleIds: ReadNestedStringArray(CommandValue.Checks, "BlockedRoleIds"),
      DeniedMessage: IsRecord(CommandValue.Checks) && typeof CommandValue.Checks.DeniedMessage === "string" ? CommandValue.Checks.DeniedMessage : ""
    },
    Actions: Array.isArray(CommandValue.Actions) ? CommandValue.Actions.filter(IsRecord).map((ActionValue) => ({
      Id: typeof ActionValue.Id === "string" ? ActionValue.Id : CreateClientId(),
      Type: ParseCustomActionType(ActionValue.Type),
      Message: typeof ActionValue.Message === "string" ? ActionValue.Message : "",
      Embed: ParseEditableEmbed(ActionValue.Embed),
      RoleId: typeof ActionValue.RoleId === "string" ? ActionValue.RoleId : "",
      Emoji: typeof ActionValue.Emoji === "string" ? ActionValue.Emoji : ""
    })) : []
  })).filter((Command) => Command.Name);
}

export function ParseCustomActionType(Value: unknown): CustomCommandActionType {
  const AllowedTypes: CustomCommandActionType[] = ["SendMessage", "Reply", "DM", "SendEmbed", "ReplyEmbed", "DMEmbed", "AddRole", "RemoveRole", "ToggleRole", "DeleteTrigger", "React"];
  return AllowedTypes.includes(String(Value) as CustomCommandActionType) ? String(Value) as CustomCommandActionType : "SendMessage";
}

export function ParseCustomMatchMode(Value: unknown): CustomCommandDraft["MatchMode"] {
  return Value === "StartsWith" ? "StartsWith" : "Exact";
}

export function ParseReminderDrafts(Value: unknown): Record<string, ReminderDraft> {
  if (!IsRecord(Value)) {
    return {};
  }

  const Reminders: Record<string, ReminderDraft> = {};

  for (const [ReminderId, ReminderValue] of Object.entries(Value)) {
    if (!IsRecord(ReminderValue)) {
      continue;
    }

    const Id = typeof ReminderValue.Id === "string" ? ReminderValue.Id : ReminderId;
    const IntervalMs = typeof ReminderValue.IntervalMs === "number" && Number.isFinite(ReminderValue.IntervalMs) ? ReminderValue.IntervalMs : 86_400_000;
    Reminders[Id] = {
      Id,
      Name: typeof ReminderValue.Name === "string" ? ReminderValue.Name : Id,
      ChannelId: typeof ReminderValue.ChannelId === "string" ? ReminderValue.ChannelId : "",
      Mode: ReminderValue.Mode === "Message" ? "Message" : "Embed",
      Message: typeof ReminderValue.Message === "string" ? ReminderValue.Message : "",
      Title: typeof ReminderValue.Title === "string" ? ReminderValue.Title : "",
      Color: typeof ReminderValue.Color === "string" ? ReminderValue.Color : "#5865f2",
      ScheduleMode: ReminderValue.ScheduleMode === "Weekly" ? "Weekly" : "Interval",
      Weekdays: Array.isArray(ReminderValue.Weekdays) ? ReminderValue.Weekdays.map(Number).filter((Day) => Day >= 0 && Day <= 6) : [1],
      TimeOfDay: typeof ReminderValue.TimeOfDay === "string" ? ReminderValue.TimeOfDay : "13:00",
      Embed: ParseEditableEmbed(ReminderValue.Embed),
      IntervalMs,
      NextRunAt: typeof ReminderValue.NextRunAt === "string" ? ReminderValue.NextRunAt : new Date(Date.now() + IntervalMs).toISOString(),
      Enabled: typeof ReminderValue.Enabled === "boolean" ? ReminderValue.Enabled : true,
      CreatedBy: typeof ReminderValue.CreatedBy === "string" ? ReminderValue.CreatedBy : "Dashboard",
      CreatedAt: typeof ReminderValue.CreatedAt === "string" ? ReminderValue.CreatedAt : new Date().toISOString(),
      LastRunAt: typeof ReminderValue.LastRunAt === "string" ? ReminderValue.LastRunAt : null,
      RunCount: typeof ReminderValue.RunCount === "number" ? ReminderValue.RunCount : 0
    };
  }

  return Reminders;
}

export function ParseNotificationSources(Value: unknown): NotificationSourceDraft[] {
  if (!Array.isArray(Value)) {
    return [];
  }

  return Value.filter(IsRecord).map((SourceValue) => ({
    Id: typeof SourceValue.Id === "string" ? SourceValue.Id : CreateClientId(),
    Name: typeof SourceValue.Name === "string" ? SourceValue.Name : "Notification source",
    Type: ParseNotificationSourceType(SourceValue.Type),
    Enabled: SourceValue.Enabled !== false,
    ChannelId: typeof SourceValue.ChannelId === "string" ? SourceValue.ChannelId : "",
    Url: typeof SourceValue.Url === "string" ? SourceValue.Url : "",
    ExternalId: typeof SourceValue.ExternalId === "string" ? SourceValue.ExternalId : "",
    ApiKey: typeof SourceValue.ApiKey === "string" ? SourceValue.ApiKey : "",
    ApiSecret: typeof SourceValue.ApiSecret === "string" ? SourceValue.ApiSecret : "",
    AccessToken: typeof SourceValue.AccessToken === "string" ? SourceValue.AccessToken : "",
    IntervalSeconds: Math.max(process.env.NODE_ENV === "production" ? 300 : 5, Number(SourceValue.IntervalSeconds) || (Number(SourceValue.IntervalMinutes) || 10) * 60),
    IntervalMinutes: Math.max(5, Number(SourceValue.IntervalMinutes) || 10),
    LastCheckedAt: typeof SourceValue.LastCheckedAt === "string" ? SourceValue.LastCheckedAt : null,
    Embed: ParseEditableEmbed(SourceValue.Embed)
  }));
}

export function ParseNotificationSourceType(Value: unknown): NotificationSourceType {
  return Value === "YouTube" || Value === "Twitch" || Value === "Kick" || Value === "X" || Value === "Reddit" || Value === "Instagram" ? Value : "RSS";
}

export function BuildNotificationSourceName(Type: NotificationSourceType): string {
  const Labels: Record<NotificationSourceType, string> = {
    RSS: "New RSS source",
    YouTube: "New YouTube channel",
    Twitch: "New Twitch channel",
    Kick: "New Kick channel",
    X: "New X account",
    Reddit: "New subreddit",
    Instagram: "New Instagram account"
  };

  return Labels[Type];
}

export function NotificationSourceUsesKeys(Type: NotificationSourceType): boolean {
  return Type === "Twitch" || Type === "Kick" || Type === "X" || Type === "Reddit" || Type === "Instagram";
}

export function ParseChannelCounters(Value: unknown): ChannelCounterDraft[] {
  if (!Array.isArray(Value)) {
    return [];
  }

  return Value.filter(IsRecord).map((CounterValue) => ({
    Id: typeof CounterValue.Id === "string" ? CounterValue.Id : CreateClientId(),
    Enabled: CounterValue.Enabled !== false,
    ChannelId: typeof CounterValue.ChannelId === "string" ? CounterValue.ChannelId : "",
    Template: typeof CounterValue.Template === "string" ? CounterValue.Template : "Members: %members_count%"
  }));
}

export const ReminderWeekdays = [
  { Label: "Sun", Value: 0 },
  { Label: "Mon", Value: 1 },
  { Label: "Tue", Value: 2 },
  { Label: "Wed", Value: 3 },
  { Label: "Thu", Value: 4 },
  { Label: "Fri", Value: 5 },
  { Label: "Sat", Value: 6 }
];

export function ComputeReminderNextRun(ScheduleMode: ReminderDraft["ScheduleMode"], ReminderValue: ReminderDraft): string {
  if (ScheduleMode === "Interval") {
    return new Date(Date.now() + ReminderValue.IntervalMs).toISOString();
  }

  const [Hours, Minutes] = ReminderValue.TimeOfDay.split(":").map((Part) => Number.parseInt(Part, 10));
  const Weekdays = ReminderValue.Weekdays.length ? ReminderValue.Weekdays : [1];
  const Now = new Date();
  let BestDate: Date | null = null;

  for (let Offset = 0; Offset <= 7; Offset += 1) {
    const Candidate = new Date(Now);
    Candidate.setDate(Now.getDate() + Offset);
    Candidate.setHours(Number.isFinite(Hours) ? Hours : 13, Number.isFinite(Minutes) ? Minutes : 0, 0, 0);

    if (!Weekdays.includes(Candidate.getDay()) || Candidate.getTime() <= Now.getTime()) {
      continue;
    }

    if (!BestDate || Candidate.getTime() < BestDate.getTime()) {
      BestDate = Candidate;
    }
  }

  return (BestDate ?? new Date(Date.now() + ReminderValue.IntervalMs)).toISOString();
}

export function ParseReminderDuration(Value: string): number | null {
  const Match = Value.trim().toLowerCase().match(/^(\d+)\s*([mhdw])$/u);

  if (!Match) {
    return null;
  }

  const Multipliers: Record<string, number> = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000
  };

  return Math.max(60_000, Number.parseInt(Match[1], 10) * Multipliers[Match[2]]);
}

export function BuildReminderDraftId(Name: string, Reminders: Record<string, ReminderDraft>): string {
  const BaseId = Name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 24) || "reminder";
  let CandidateId = BaseId;
  let Index = 2;

  while (Reminders[CandidateId]) {
    CandidateId = `${BaseId}-${Index}`;
    Index += 1;
  }

  return CandidateId;
}

export function FormatReminderDate(Value: string): string {
  const DateValue = new Date(Value);
  return Number.isNaN(DateValue.getTime()) ? "Invalid date" : DateValue.toLocaleString();
}

export function IsoToLocalDateTime(Value: string): string {
  const DateValue = new Date(Value);

  if (Number.isNaN(DateValue.getTime())) {
    return "";
  }

  const LocalDate = new Date(DateValue.getTime() - DateValue.getTimezoneOffset() * 60_000);
  return LocalDate.toISOString().slice(0, 16);
}

export function LocalDateTimeToIso(Value: string): string {
  const DateValue = new Date(Value);
  return Number.isNaN(DateValue.getTime()) ? new Date().toISOString() : DateValue.toISOString();
}

export function ReadNestedStringArray(Value: unknown, Key: string): string[] {
  if (!IsRecord(Value) || !Array.isArray(Value[Key])) {
    return [];
  }

  return Value[Key].map((Item) => String(Item)).filter(Boolean);
}

export function StringArray(Value: unknown): string[] {
  return Array.isArray(Value) ? Value.map((Item) => String(Item)).filter(Boolean) : [];
}

export function SplitCommaList(Value: string): string[] {
  return Value.split(",").map((Item) => Item.trim()).filter(Boolean);
}

export function SanitizeCommandDraftName(Value: string): string {
  return Value.trim().replace(/^!+/u, "").split(/\s+/u)[0]?.slice(0, 48) ?? "";
}

export function ActionNeedsMessage(Type: CustomCommandActionType): boolean {
  return Type === "SendMessage" || Type === "Reply" || Type === "DM";
}

export function ActionNeedsEmbed(Type: CustomCommandActionType): boolean {
  return Type === "SendEmbed" || Type === "ReplyEmbed" || Type === "DMEmbed";
}

export function ActionNeedsRole(Type: CustomCommandActionType): boolean {
  return Type === "AddRole" || Type === "RemoveRole" || Type === "ToggleRole";
}

export function CreateClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function MultiSelectField(Properties: {
  CreateKind?: "Channel" | "Role";
  Label: string;
  OnChange: (Value: string[]) => void;
  OnCreate?: (Name: string, Color: string) => Promise<string | null>;
  Options: NonNullable<SettingsField["Options"]>;
  Value: string[];
}) {
  const [NewName, SetNewName] = UseState("");
  const [NewColor, SetNewColor] = UseState("#5865f2");
  const [IsCreating, SetIsCreating] = UseState(false);
  const [CreateError, SetCreateError] = UseState("");
  const IsChannelCreate = Properties.CreateKind === "Channel";

  function Toggle(Value: string): void {
    Properties.OnChange(Properties.Value.includes(Value) ? Properties.Value.filter((Item) => Item !== Value) : [...Properties.Value, Value]);
  }

  async function CreateRole(): Promise<void> {
    if (!Properties.OnCreate || IsCreating) {
      return;
    }

    const TrimmedName = NewName.trim();

    if (!TrimmedName) {
      SetCreateError(IsChannelCreate ? "Channel name is required." : "Role name is required.");
      return;
    }

    SetIsCreating(true);
    SetCreateError("");

    try {
      const CreatedValue = await Properties.OnCreate(TrimmedName, NewColor);

      if (CreatedValue) {
        Properties.OnChange([...Properties.Value, CreatedValue]);
        SetNewName("");
        SetNewColor("#5865f2");
      }
    } catch (ErrorValue) {
      SetCreateError(ErrorValue instanceof Error ? ErrorValue.message : IsChannelCreate ? "Channel creation failed." : "Role creation failed.");
    } finally {
      SetIsCreating(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
      <p className="text-sm font-bold text-slate-200">{Properties.Label}</p>
      <div className="mt-2 grid max-h-40 gap-2 overflow-y-auto pr-1">
        {Properties.Options.length === 0 ? <p className="text-xs text-slate-500">No option available.</p> : null}
        {Properties.Options.map((Option) => (
          <label className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${Option.Disabled ? "cursor-not-allowed text-slate-600" : "text-slate-200 hover:bg-slate-800"}`} key={String(Option.Value)}>
            <input checked={Properties.Value.includes(String(Option.Value))} className="h-4 w-4 accent-blue-600" disabled={Option.Disabled} onChange={() => Toggle(String(Option.Value))} type="checkbox" />
            <span className="truncate">{Option.Label}</span>
          </label>
        ))}
      </div>
      {Properties.OnCreate ? (
        <div className="mt-3 border-t border-slate-800 pt-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{IsChannelCreate ? "Create channel" : "Create role"}</p>
          <div className={`mt-2 grid gap-2 ${IsChannelCreate ? "" : "sm:grid-cols-[1fr_auto]"}`}>
            <input className="min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500" maxLength={100} onChange={(Event) => SetNewName(Event.target.value)} placeholder={IsChannelCreate ? "channel-name" : "Role name"} value={NewName} />
            {IsChannelCreate ? null : <input aria-label="Role color" className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 p-1 sm:w-14" onChange={(Event) => SetNewColor(Event.target.value)} type="color" value={NewColor} />}
          </div>
          {CreateError ? <p className="mt-2 text-xs font-semibold text-red-300">{CreateError}</p> : null}
          <button
            className={`mt-2 w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white transition ${IsCreating ? "cursor-not-allowed opacity-60" : "hover:bg-blue-500"}`}
            onClick={() => !IsCreating && void CreateRole()}
            type="button"
          >
            {IsCreating ? "Creating..." : IsChannelCreate ? "Create channel" : "Create role"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ParseSavedEmbeds(Value: unknown): EditableEmbed[] {
  if (!Array.isArray(Value)) {
    return [];
  }

  return Value.filter(IsEditableEmbed);
}

export function IsEditableEmbed(Value: unknown): Value is EditableEmbed {
  if (!IsRecord(Value)) {
    return false;
  }

  return typeof Value.Name === "string" && Array.isArray(Value.Fields);
}

export function NormalizeEmbedColor(Color: string): string {
  return /^#[0-9a-f]{6}$/iu.test(Color) ? Color : "#5865f2";
}

export function BuildBotInitials(Name: string): string {
  const Words = Name.trim().split(/\s+/u).filter(Boolean);

  if (Words.length >= 2) {
    return `${Words[0][0] ?? ""}${Words[1][0] ?? ""}`.toUpperCase();
  }

  return Name.slice(0, 2).toUpperCase() || "HB";
}