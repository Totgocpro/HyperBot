"use client";

import { CustomSelect } from "../CustomSelect";
import { BuildConfigSections, RenderField, type BotPreviewIdentity, type DashboardPlugin } from "../PluginInterfaceRenderer";
import type { SettingsField } from "../../../Core/Types";
import type { CustomCommandActionDraft, CustomCommandActionType, CustomCommandDraft, NotificationSourceDraft, NotificationSourceType, ReminderDraft } from "./PluginSettingsTypes";
import { AdvancedEmbedEditor, BuildNotificationSourceName, BuildReminderDraftId, ComputeReminderNextRun, CreateClientId, CreateDefaultEmbed, EmbedInputClassName, FormatReminderDate, IsoToLocalDateTime, LocalDateTimeToIso, MultiSelectField, NotificationSourceUsesKeys, ParseCustomCommands, ParseNotificationSources, ParseReminderDrafts, ParseReminderDuration, ReminderWeekdays, SanitizeCommandDraftName, SplitCommaList, StringArray, ActionNeedsEmbed, ActionNeedsMessage, ActionNeedsRole } from "./PluginSettingsShared";

export function CustomCommandsEditor(Properties: {
  BotIdentity?: BotPreviewIdentity | null;
  DraftValues: Record<string, Record<string, unknown>>;
  GuildId: string;
  OnCreateChannel: (Name: string) => Promise<string | null>;
  OnCreateRole: (Name: string, Color: string) => Promise<string | null>;
  Plugin: DashboardPlugin;
  SetStatus: (Status: string) => void;
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void;
}) {
  const PluginId = Properties.Plugin.Metadata.Id;
  const Values = Properties.DraftValues[PluginId] ?? {};
  const Commands = ParseCustomCommands(Values.Commands);
  const SelectedCommand = Commands[0];
  const ChannelOptions = Properties.Plugin.WebInterface.find((Field) => Field.Key === "DefaultAllowedChannelIds")?.Options ?? [];
  const RoleOptions = Properties.Plugin.WebInterface.find((Field) => Field.Key === "DefaultRequiredRoleIds")?.Options ?? [];

  function SetValue(Key: string, Value: unknown): void {
    Properties.UpdateDraftValue(PluginId, Key, Value);
  }

  function SetCommands(NextCommands: CustomCommandDraft[]): void {
    SetValue("Commands", NextCommands);
  }

  function AddCommand(): void {
    SetCommands([
      ...Commands,
      {
        Id: CreateClientId(),
        Name: "new-command",
        Aliases: [],
        Enabled: true,
        MatchMode: "Exact",
        Description: "",
        Checks: {
          AllowedChannelIds: [],
          BlockedChannelIds: [],
          RequiredRoleIds: [],
          BlockedRoleIds: [],
          DeniedMessage: ""
        },
        Actions: [{ Id: CreateClientId(), Type: "Reply", Message: "Hello %mention%", Embed: CreateDefaultEmbed(), RoleId: "", Emoji: "" }]
      }
    ]);
    Properties.SetStatus("Command added in draft. Use Save to persist it.");
  }

  function UpdateCommand(CommandId: string, Patch: Partial<CustomCommandDraft>): void {
    SetCommands(Commands.map((Command) => Command.Id === CommandId ? { ...Command, ...Patch } : Command));
  }

  function RemoveCommand(CommandId: string): void {
    SetCommands(Commands.filter((Command) => Command.Id !== CommandId));
  }

  function UpdateAction(CommandId: string, ActionId: string, Patch: Partial<CustomCommandActionDraft>): void {
    const Command = Commands.find((CommandValue) => CommandValue.Id === CommandId);

    if (!Command) {
      return;
    }

    UpdateCommand(CommandId, {
      Actions: Command.Actions.map((Action) => Action.Id === ActionId ? { ...Action, ...Patch } : Action)
    });
  }

  function AddAction(CommandId: string): void {
    const Command = Commands.find((CommandValue) => CommandValue.Id === CommandId);

    if (!Command) {
      return;
    }

    UpdateCommand(CommandId, {
      Actions: [...Command.Actions, { Id: CreateClientId(), Type: "SendMessage", Message: "", Embed: CreateDefaultEmbed(), RoleId: "", Emoji: "" }]
    });
  }

  function RemoveAction(CommandId: string, ActionId: string): void {
    const Command = Commands.find((CommandValue) => CommandValue.Id === CommandId);

    if (!Command) {
      return;
    }

    UpdateCommand(CommandId, {
      Actions: Command.Actions.filter((Action) => Action.Id !== ActionId)
    });
  }

  return (
    <section className="scroll-mt-28 rounded-[2rem] border border-slate-800 bg-slate-950/40 p-4 sm:p-5" id="plugin-section-custom-commands">
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Command builder</p>
        <h3 className="mt-2 text-2xl font-black text-white">Custom prefix commands</h3>
      </div>

      <div className="grid gap-5">
        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-200">
              Prefix
              <input className={EmbedInputClassName} maxLength={8} onChange={(Event) => SetValue("Prefix", Event.target.value)} value={String(Values.Prefix ?? "!")} />
            </label>
            <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 font-semibold text-slate-100">
              Case sensitive names
              <input checked={Boolean(Values.CaseSensitive)} className="h-5 w-5 accent-blue-600" onChange={(Event) => SetValue("CaseSensitive", Event.target.checked)} type="checkbox" />
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <MultiSelectField CreateKind="Channel" Label="Default allowed channels" OnChange={(Value) => SetValue("DefaultAllowedChannelIds", Value)} OnCreate={Properties.OnCreateChannel} Options={ChannelOptions} Value={StringArray(Values.DefaultAllowedChannelIds)} />
            <MultiSelectField Label="Default required roles" OnChange={(Value) => SetValue("DefaultRequiredRoleIds", Value)} OnCreate={Properties.OnCreateRole} Options={RoleOptions} Value={StringArray(Values.DefaultRequiredRoleIds)} />
          </div>
          <label className="mt-4 block text-sm font-bold text-slate-200">
            Default denied message
            <input className={EmbedInputClassName} onChange={(Event) => SetValue("DefaultDeniedMessage", Event.target.value)} value={String(Values.DefaultDeniedMessage ?? "You cannot use this command here.")} />
          </label>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-xl font-black text-white">Commands</h4>
              <p className="mt-1 text-sm text-slate-500">Commands are triggered by messages like {String(Values.Prefix ?? "!")}role.</p>
            </div>
            <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500" onClick={AddCommand} type="button">
              Add command
            </button>
          </div>
          <div className="mt-4 grid gap-4">
            {Commands.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No custom command configured.</p> : null}
            {Commands.map((Command) => (
              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-4" key={Command.Id}>
                <div className="grid gap-3 lg:grid-cols-[1fr_180px_auto]">
                  <label className="block text-sm font-bold text-slate-200">
                    Command name
                    <input className={EmbedInputClassName} onChange={(Event) => UpdateCommand(Command.Id, { Name: SanitizeCommandDraftName(Event.target.value) })} value={Command.Name} />
                  </label>
                  <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
                    Match mode
                    <CustomSelect
                      ClassName="mt-2"
                      OnChange={(Value) => UpdateCommand(Command.Id, { MatchMode: Value as CustomCommandDraft["MatchMode"] })}
                      Options={[
                        { Label: "Exact", Value: "Exact" },
                        { Label: "Starts with", Value: "StartsWith" }
                      ]}
                      Required={true}
                      Value={Command.MatchMode}
                    />
                  </div>
                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 font-semibold text-slate-100">
                    Enabled
                    <input checked={Command.Enabled} className="h-5 w-5 accent-blue-600" onChange={(Event) => UpdateCommand(Command.Id, { Enabled: Event.target.checked })} type="checkbox" />
                  </label>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <label className="block text-sm font-bold text-slate-200">
                    Aliases
                    <input className={EmbedInputClassName} onChange={(Event) => UpdateCommand(Command.Id, { Aliases: SplitCommaList(Event.target.value).map(SanitizeCommandDraftName).filter(Boolean) })} placeholder="rank, role, info" value={Command.Aliases.join(", ")} />
                  </label>
                  <label className="block text-sm font-bold text-slate-200">
                    Description
                    <input className={EmbedInputClassName} onChange={(Event) => UpdateCommand(Command.Id, { Description: Event.target.value })} value={Command.Description} />
                  </label>
                </div>

                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                    <p className="font-black text-white">Checks</p>
                    <div className="mt-3 grid gap-3">
                      <MultiSelectField CreateKind="Channel" Label="Allowed channels" OnChange={(Value) => UpdateCommand(Command.Id, { Checks: { ...Command.Checks, AllowedChannelIds: Value } })} OnCreate={Properties.OnCreateChannel} Options={ChannelOptions} Value={Command.Checks.AllowedChannelIds} />
                      <MultiSelectField CreateKind="Channel" Label="Blocked channels" OnChange={(Value) => UpdateCommand(Command.Id, { Checks: { ...Command.Checks, BlockedChannelIds: Value } })} OnCreate={Properties.OnCreateChannel} Options={ChannelOptions} Value={Command.Checks.BlockedChannelIds} />
                      <MultiSelectField Label="Required roles" OnChange={(Value) => UpdateCommand(Command.Id, { Checks: { ...Command.Checks, RequiredRoleIds: Value } })} OnCreate={Properties.OnCreateRole} Options={RoleOptions} Value={Command.Checks.RequiredRoleIds} />
                      <MultiSelectField Label="Blocked roles" OnChange={(Value) => UpdateCommand(Command.Id, { Checks: { ...Command.Checks, BlockedRoleIds: Value } })} OnCreate={Properties.OnCreateRole} Options={RoleOptions} Value={Command.Checks.BlockedRoleIds} />
                      <label className="block text-sm font-bold text-slate-200">
                        Denied message
                        <input className={EmbedInputClassName} onChange={(Event) => UpdateCommand(Command.Id, { Checks: { ...Command.Checks, DeniedMessage: Event.target.value } })} value={Command.Checks.DeniedMessage} />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black text-white">Actions</p>
                      <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500" onClick={() => AddAction(Command.Id)} type="button">
                        Add action
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3">
                      {Command.Actions.map((Action) => (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3" key={Action.Id}>
                          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                            <CustomSelect
                              OnChange={(Value) => UpdateAction(Command.Id, Action.Id, { Type: Value as CustomCommandActionType })}
                              Options={[
                                { Label: "Send message", Value: "SendMessage" },
                                { Label: "Reply", Value: "Reply" },
                                { Label: "DM user", Value: "DM" },
                                { Label: "Send embed", Value: "SendEmbed" },
                                { Label: "Reply embed", Value: "ReplyEmbed" },
                                { Label: "DM embed", Value: "DMEmbed" },
                                { Label: "Add role", Value: "AddRole" },
                                { Label: "Remove role", Value: "RemoveRole" },
                                { Label: "Toggle role", Value: "ToggleRole" },
                                { Label: "Delete trigger", Value: "DeleteTrigger" },
                                { Label: "React", Value: "React" }
                              ]}
                              Required={true}
                              Value={Action.Type}
                            />
                            <button className="rounded-xl border border-red-500/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10" onClick={() => RemoveAction(Command.Id, Action.Id)} type="button">
                              Remove
                            </button>
                          </div>
                          {ActionNeedsMessage(Action.Type) ? (
                            <textarea className={`${EmbedInputClassName} min-h-24 resize-y`} onChange={(Event) => UpdateAction(Command.Id, Action.Id, { Message: Event.target.value })} placeholder="Use %mention%, %user%, %args%, %server%, %channel%" value={Action.Message} />
                          ) : null}
                          {ActionNeedsEmbed(Action.Type) ? (
                            <div className="mt-3">
                              <AdvancedEmbedEditor
                                BotIdentity={Properties.BotIdentity}
                                EmbedValue={Action.Embed}
                                OnChange={(Embed) => UpdateAction(Command.Id, Action.Id, { Embed })}
                                PlaceholderText="Use %mention%, %user%, %args%, %server%, %channel% in text fields."
                              />
                            </div>
                          ) : null}
                          {ActionNeedsRole(Action.Type) ? (
                            <CustomSelect
                              ClassName="mt-2"
                              CreateButtonLabel="Create role"
                              CreateInputPlaceholder="Role name"
                              CreateLabel="Create role"
                              EmptyCreateError="Role name is required."
                              EmptyLabel="Select a role"
                              OnChange={(Value) => UpdateAction(Command.Id, Action.Id, { RoleId: Value })}
                              OnCreate={Properties.OnCreateRole}
                              Options={RoleOptions}
                              Value={Action.RoleId}
                            />
                          ) : null}
                          {Action.Type === "React" ? (
                            <input className={EmbedInputClassName} onChange={(Event) => UpdateAction(Command.Id, Action.Id, { Emoji: Event.target.value })} placeholder="Emoji, for example ✅" value={Action.Emoji} />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-500" onClick={() => RemoveCommand(Command.Id)} type="button">
                    Delete command
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      {SelectedCommand ? null : null}
    </section>
  );
}

export function RemindersEditor(Properties: {
  BotIdentity?: BotPreviewIdentity | null;
  BotId: string;
  DraftValues: Record<string, Record<string, unknown>>;
  GuildId: string;
  OnCreateChannel: (Name: string) => Promise<string | null>;
  Plugin: DashboardPlugin;
  SetStatus: (Status: string) => void;
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void;
}) {
  const PluginId = Properties.Plugin.Metadata.Id;
  const Values = Properties.DraftValues[PluginId] ?? {};
  const Reminders = ParseReminderDrafts(Values.Reminders);
  const ReminderList = Object.values(Reminders).sort((First, Second) => new Date(First.NextRunAt).getTime() - new Date(Second.NextRunAt).getTime());
  const ChannelField = Properties.Plugin.WebInterface.find((Field) => Field.Key === "DefaultChannelId");
  const ChannelOptions = ChannelField?.Options ?? [];
  const DefaultChannelId = String(Values.DefaultChannelId ?? "");
  const DefaultIntervalText = String(Values.DefaultInterval ?? "1d");
  const DefaultIntervalMs = ParseReminderDuration(DefaultIntervalText) ?? 86_400_000;
  const MaxReminders = Number(Values.MaxReminders ?? 25);

  function SetValue(Key: string, Value: unknown): void {
    Properties.UpdateDraftValue(PluginId, Key, Value);
  }

  function SetReminders(NextReminders: Record<string, ReminderDraft>): void {
    SetValue("Reminders", NextReminders);
  }

  function AddReminder(): void {
    if (ReminderList.length >= Math.max(1, MaxReminders)) {
      Properties.SetStatus(`Reminder limit reached (${MaxReminders}).`);
      return;
    }

    const Id = BuildReminderDraftId("new-reminder", Reminders);
    const Now = Date.now();
    SetReminders({
      ...Reminders,
      [Id]: {
        Id,
        Name: "New reminder",
        ChannelId: DefaultChannelId,
        Mode: Boolean(Values.DefaultEmbed ?? true) ? "Embed" : "Message",
        ScheduleMode: "Interval",
        Weekdays: [1],
        TimeOfDay: "13:00",
        Message: "Write your scheduled message here.",
        Title: "Scheduled reminder",
        Color: String(Values.DefaultColor ?? "#5865f2"),
        Embed: {
          ...CreateDefaultEmbed(),
          Name: "Scheduled reminder",
          Title: "Scheduled reminder",
          Description: "Write your scheduled message here.",
          Color: String(Values.DefaultColor ?? "#5865f2")
        },
        IntervalMs: DefaultIntervalMs,
        NextRunAt: new Date(Now + DefaultIntervalMs).toISOString(),
        Enabled: true,
        CreatedBy: "Dashboard",
        CreatedAt: new Date(Now).toISOString(),
        LastRunAt: null,
        RunCount: 0
      }
    });
    Properties.SetStatus("Reminder added in draft. Use Save to persist it.");
  }

  function UpdateReminder(ReminderId: string, Patch: Partial<ReminderDraft>): void {
    const ReminderValue = Reminders[ReminderId];

    if (!ReminderValue) {
      return;
    }

    SetReminders({
      ...Reminders,
      [ReminderId]: {
        ...ReminderValue,
        ...Patch
      }
    });
  }

  function DeleteReminder(ReminderId: string): void {
    const NextReminders = { ...Reminders };
    delete NextReminders[ReminderId];
    SetReminders(NextReminders);
  }

  return (
    <section className="scroll-mt-28 rounded-[2rem] border border-slate-800 bg-slate-950/40 p-4 sm:p-5" id="plugin-section-reminders">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Scheduler</p>
          <h3 className="mt-2 text-2xl font-black text-white">Scheduled reminders</h3>
        </div>
        <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500" onClick={AddReminder} type="button">
          Add reminder
        </button>
      </div>

      <div className="grid gap-5">
        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            {RenderField(Properties.BotId, Properties.GuildId, PluginId, Properties.Plugin.WebInterface.find((Field) => Field.Key === "DefaultChannelId") as SettingsField & { Value: unknown }, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel, Properties.BotIdentity)}
            {RenderField(Properties.BotId, Properties.GuildId, PluginId, Properties.Plugin.WebInterface.find((Field) => Field.Key === "DefaultEmbed") as SettingsField & { Value: unknown }, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel, Properties.BotIdentity)}
            {RenderField(Properties.BotId, Properties.GuildId, PluginId, Properties.Plugin.WebInterface.find((Field) => Field.Key === "DefaultInterval") as SettingsField & { Value: unknown }, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel, Properties.BotIdentity)}
            {RenderField(Properties.BotId, Properties.GuildId, PluginId, Properties.Plugin.WebInterface.find((Field) => Field.Key === "DefaultColor") as SettingsField & { Value: unknown }, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel, Properties.BotIdentity)}
            {RenderField(Properties.BotId, Properties.GuildId, PluginId, Properties.Plugin.WebInterface.find((Field) => Field.Key === "FooterText") as SettingsField & { Value: unknown }, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel, Properties.BotIdentity)}
            {RenderField(Properties.BotId, Properties.GuildId, PluginId, Properties.Plugin.WebInterface.find((Field) => Field.Key === "MaxReminders") as SettingsField & { Value: unknown }, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel, Properties.BotIdentity)}
          </div>
        </section>

        {ReminderList.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No reminder configured.</p> : null}
        {ReminderList.map((ReminderValue) => (
          <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4" key={ReminderValue.Id}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h4 className="text-xl font-black text-white">{ReminderValue.Name || ReminderValue.Id}</h4>
                <p className="mt-1 text-xs text-slate-500">
                  ID: {ReminderValue.Id} | Runs: {ReminderValue.RunCount} | Next: {FormatReminderDate(ReminderValue.NextRunAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <button className={ReminderValue.Enabled ? "rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-500" : "rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800"} onClick={() => UpdateReminder(ReminderValue.Id, { Enabled: !ReminderValue.Enabled })} type="button">
                  {ReminderValue.Enabled ? "Enabled" : "Disabled"}
                </button>
                <button className="rounded-xl border border-red-500/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10" onClick={() => DeleteReminder(ReminderValue.Id)} type="button">
                  Delete
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <label className="block text-sm font-bold text-slate-200">
                Name
                <input className={EmbedInputClassName} onChange={(Event) => UpdateReminder(ReminderValue.Id, { Name: Event.target.value })} value={ReminderValue.Name} />
              </label>
              <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
                Channel
                <CustomSelect
                  ClassName="mt-2"
                  CreateButtonLabel="Create channel"
                  CreateColorEnabled={false}
                  CreateInputPlaceholder="channel-name"
                  CreateLabel="Create channel"
                  EmptyLabel="Select a channel"
                  OnChange={(Value) => UpdateReminder(ReminderValue.Id, { ChannelId: Value })}
                  OnCreate={Properties.OnCreateChannel}
                  Options={ChannelOptions}
                  Value={ReminderValue.ChannelId}
                />
              </div>
              <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
                Mode
                <CustomSelect
                  ClassName="mt-2"
                  OnChange={(Value) => UpdateReminder(ReminderValue.Id, { Mode: Value as ReminderDraft["Mode"] })}
                  Options={[
                    { Label: "Embed", Value: "Embed" },
                    { Label: "Message", Value: "Message" }
                  ]}
                  Required={true}
                  Value={ReminderValue.Mode}
                />
              </div>
              <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
                Schedule
                <CustomSelect
                  ClassName="mt-2"
                  OnChange={(Value) => UpdateReminder(ReminderValue.Id, { ScheduleMode: Value as ReminderDraft["ScheduleMode"], NextRunAt: ComputeReminderNextRun(Value as ReminderDraft["ScheduleMode"], ReminderValue) })}
                  Options={[
                    { Label: "Every interval", Value: "Interval" },
                    { Label: "Weekly days and time", Value: "Weekly" }
                  ]}
                  Required={true}
                  Value={ReminderValue.ScheduleMode}
                />
              </div>
              {ReminderValue.ScheduleMode === "Interval" ? (
                <label className="block text-sm font-bold text-slate-200">
                  Interval minutes
                  <input className={EmbedInputClassName} min={1} onChange={(Event) => UpdateReminder(ReminderValue.Id, { IntervalMs: Math.max(60_000, Number(Event.target.value) * 60_000) })} type="number" value={Math.max(1, Math.round(ReminderValue.IntervalMs / 60_000))} />
                </label>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 lg:col-span-2">
                  <p className="text-sm font-bold text-slate-200">Weekly schedule</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ReminderWeekdays.map((Day) => (
                      <label className={`rounded-xl px-3 py-2 text-sm font-bold ${ReminderValue.Weekdays.includes(Day.Value) ? "bg-blue-600 text-white" : "bg-slate-950 text-slate-300"}`} key={Day.Value}>
                        <input className="sr-only" checked={ReminderValue.Weekdays.includes(Day.Value)} onChange={() => {
                          const NextWeekdays = ReminderValue.Weekdays.includes(Day.Value) ? ReminderValue.Weekdays.filter((Value) => Value !== Day.Value) : [...ReminderValue.Weekdays, Day.Value].sort();
                          UpdateReminder(ReminderValue.Id, { Weekdays: NextWeekdays.length ? NextWeekdays : [Day.Value], NextRunAt: ComputeReminderNextRun("Weekly", { ...ReminderValue, Weekdays: NextWeekdays.length ? NextWeekdays : [Day.Value] }) });
                        }} type="checkbox" />
                        {Day.Label}
                      </label>
                    ))}
                  </div>
                  <label className="mt-3 block text-sm font-bold text-slate-200">
                    Time
                    <input className={EmbedInputClassName} onChange={(Event) => UpdateReminder(ReminderValue.Id, { TimeOfDay: Event.target.value, NextRunAt: ComputeReminderNextRun("Weekly", { ...ReminderValue, TimeOfDay: Event.target.value }) })} type="time" value={ReminderValue.TimeOfDay} />
                  </label>
                </div>
              )}
              <label className="block text-sm font-bold text-slate-200">
                Next run
                <input className={EmbedInputClassName} onChange={(Event) => UpdateReminder(ReminderValue.Id, { NextRunAt: LocalDateTimeToIso(Event.target.value) })} type="datetime-local" value={IsoToLocalDateTime(ReminderValue.NextRunAt)} />
              </label>
              {ReminderValue.Mode === "Embed" ? (
                <div className="lg:col-span-2">
                  <AdvancedEmbedEditor
                    BotIdentity={Properties.BotIdentity}
                    EmbedValue={ReminderValue.Embed}
                    OnChange={(NextEmbed) => UpdateReminder(ReminderValue.Id, { Embed: NextEmbed, Title: NextEmbed.Title, Message: NextEmbed.Description, Color: NextEmbed.Color })}
                    PlaceholderText="Use placeholders like %server%, %name%, %runCount%, %interval%, %nextRun%."
                  />
                </div>
              ) : (
                <label className="block text-sm font-bold text-slate-200 lg:col-span-2">
                  Message
                  <textarea className={`${EmbedInputClassName} min-h-28 resize-y`} onChange={(Event) => UpdateReminder(ReminderValue.Id, { Message: Event.target.value })} value={ReminderValue.Message} />
                </label>
              )}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

export function NotificationsEditor(Properties: {
  BotIdentity?: BotPreviewIdentity | null;
  BotId: string;
  DraftValues: Record<string, Record<string, unknown>>;
  GuildId: string;
  OnCreateChannel: (Name: string) => Promise<string | null>;
  Plugin: DashboardPlugin;
  SetStatus: (Status: string) => void;
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void;
}) {
  const PluginId = Properties.Plugin.Metadata.Id;
  const Values = Properties.DraftValues[PluginId] ?? {};
  const Sources = ParseNotificationSources(Values.Sources);
  const ChannelField = Properties.Plugin.WebInterface.find((Field) => Field.Key === "DefaultChannelId");
  const ChannelOptions = ChannelField?.Options ?? [];
  const DefaultChannelId = String(Values.DefaultChannelId ?? "");
  const DefaultIntervalMinutes = Math.max(5, Number(Values.DefaultIntervalMinutes ?? 10) || 10);
  const DebugIntervalsEnabled = process.env.NODE_ENV !== "production";
  const MinimumIntervalSeconds = DebugIntervalsEnabled ? 5 : 300;

  function SetValue(Key: string, Value: unknown): void {
    Properties.UpdateDraftValue(PluginId, Key, Value);
  }

  function SetSources(NextSources: NotificationSourceDraft[]): void {
    SetValue("Sources", NextSources);
  }

  function AddSource(Type: NotificationSourceType = "RSS"): void {
    const NextSource: NotificationSourceDraft = {
      Id: CreateClientId(),
      Name: BuildNotificationSourceName(Type),
      Type,
      Enabled: true,
      ChannelId: DefaultChannelId,
      Url: "",
      ExternalId: "",
      ApiKey: "",
      ApiSecret: "",
      AccessToken: "",
      IntervalSeconds: Math.max(MinimumIntervalSeconds, DefaultIntervalMinutes * 60),
      IntervalMinutes: DefaultIntervalMinutes,
      LastCheckedAt: null,
      Embed: {
        ...CreateDefaultEmbed(),
        Name: "Notification embed",
        Title: "%source%: %title%",
        Description: "%summary%",
        Color: "#5865f2",
        Url: "%url%",
        AuthorName: "%author%",
        ThumbnailUrl: "%image%",
        FooterText: "%type% notification",
        Timestamp: true
      }
    };

    SetSources([...Sources, NextSource]);
    Properties.SetStatus("Notification source added in draft. Use Save to persist it.");
  }

  function UpdateSource(SourceId: string, Patch: Partial<NotificationSourceDraft>): void {
    SetSources(Sources.map((Source) => Source.Id === SourceId ? { ...Source, ...Patch } : Source));
  }

  function RemoveSource(SourceId: string): void {
    SetSources(Sources.filter((Source) => Source.Id !== SourceId));
  }

  return (
    <section className="scroll-mt-28 rounded-[2rem] border border-slate-800 bg-slate-950/40 p-4 sm:p-5" id="plugin-section-notifications">
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Notification feeds</p>
        <h3 className="mt-2 text-2xl font-black text-white">Social and RSS notifications</h3>
      </div>

      <div className="grid gap-5">
        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            {RenderField(Properties.BotId, Properties.GuildId, PluginId, Properties.Plugin.WebInterface.find((Field) => Field.Key === "DefaultChannelId") as SettingsField & { Value: unknown }, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel, Properties.BotIdentity)}
            {RenderField(Properties.BotId, Properties.GuildId, PluginId, Properties.Plugin.WebInterface.find((Field) => Field.Key === "DefaultIntervalMinutes") as SettingsField & { Value: unknown }, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel, Properties.BotIdentity)}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h4 className="text-xl font-black text-white">Sources</h4>
              <p className="mt-1 text-sm text-slate-500">Bring your own keys per source when the platform requires API access.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-7">
              <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500" onClick={() => AddSource("RSS")} type="button">Add RSS</button>
              <button className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-500" onClick={() => AddSource("YouTube")} type="button">Add YouTube</button>
              <button className="rounded-2xl bg-purple-600 px-4 py-3 text-sm font-bold text-white hover:bg-purple-500" onClick={() => AddSource("Twitch")} type="button">Add Twitch</button>
              <button className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500" onClick={() => AddSource("Kick")} type="button">Add Kick</button>
              <button className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white hover:bg-slate-700" onClick={() => AddSource("X")} type="button">Add X</button>
              <button className="rounded-2xl bg-orange-600 px-4 py-3 text-sm font-bold text-white hover:bg-orange-500" onClick={() => AddSource("Reddit")} type="button">Add Reddit</button>
              <button className="rounded-2xl bg-pink-600 px-4 py-3 text-sm font-bold text-white hover:bg-pink-500" onClick={() => AddSource("Instagram")} type="button">Add Instagram</button>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            {Sources.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No notification source configured.</p> : null}
            {Sources.map((Source) => (
              <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4" key={Source.Id}>
                <div className="grid gap-4 lg:grid-cols-[1fr_220px_150px]">
                  <label className="block text-sm font-bold text-slate-200">
                    Name
                    <input className={EmbedInputClassName} onChange={(Event) => UpdateSource(Source.Id, { Name: Event.target.value })} value={Source.Name} />
                  </label>
                  <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
                    Type
                    <CustomSelect
                      ClassName="mt-2"
                      OnChange={(Value) => UpdateSource(Source.Id, { Type: Value as NotificationSourceType })}
                      Options={[
                        { Label: "RSS", Value: "RSS" },
                        { Label: "YouTube", Value: "YouTube" },
                        { Label: "Twitch", Value: "Twitch" },
                        { Label: "Kick", Value: "Kick" },
                        { Label: "X", Value: "X" },
                        { Label: "Reddit", Value: "Reddit" },
                        { Label: "Instagram", Value: "Instagram" }
                      ]}
                      Required={true}
                      Value={Source.Type}
                    />
                  </div>
                  <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 font-semibold text-slate-100">
                    Enabled
                    <input checked={Source.Enabled} className="h-5 w-5 accent-blue-600" onChange={(Event) => UpdateSource(Source.Id, { Enabled: Event.target.checked })} type="checkbox" />
                  </label>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
                    Target channel
                    <CustomSelect
                      ClassName="mt-2"
                      CreateButtonLabel="Create channel"
                      CreateColorEnabled={false}
                      CreateErrorMessage="Channel creation failed."
                      CreateInputPlaceholder="channel-name"
                      CreateLabel="Create channel"
                      EmptyCreateError="Channel name is required."
                      EmptyLabel="Select a writable channel"
                      OnChange={(ChannelId) => UpdateSource(Source.Id, { ChannelId })}
                      OnCreate={Properties.OnCreateChannel}
                      Options={ChannelOptions}
                      Value={Source.ChannelId}
                    />
                  </div>
                  <label className="block text-sm font-bold text-slate-200">
                    {DebugIntervalsEnabled ? "Check interval seconds" : "Check interval minutes"}
                    <input
                      className={EmbedInputClassName}
                      min={DebugIntervalsEnabled ? 5 : 5}
                      onChange={(Event) => {
                        const RawValue = Number(Event.target.value) || (DebugIntervalsEnabled ? 5 : 5);
                        UpdateSource(Source.Id, DebugIntervalsEnabled ? { IntervalSeconds: Math.max(5, RawValue), IntervalMinutes: Math.max(1, RawValue / 60) } : { IntervalMinutes: Math.max(5, RawValue), IntervalSeconds: Math.max(300, RawValue * 60) });
                      }}
                      type="number"
                      value={DebugIntervalsEnabled ? Source.IntervalSeconds : Source.IntervalMinutes}
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {Source.Type === "RSS" ? (
                    <label className="block text-sm font-bold text-slate-200 lg:col-span-2">
                      RSS feed URL
                      <input className={EmbedInputClassName} onChange={(Event) => UpdateSource(Source.Id, { Url: Event.target.value })} placeholder="https://example.com/feed.xml" value={Source.Url} />
                    </label>
                  ) : null}
                  {Source.Type === "YouTube" ? (
                    <>
                      <label className="block text-sm font-bold text-slate-200">
                        YouTube channel ID
                        <input className={EmbedInputClassName} onChange={(Event) => UpdateSource(Source.Id, { ExternalId: Event.target.value })} placeholder="UC..." value={Source.ExternalId} />
                      </label>
                      <label className="block text-sm font-bold text-slate-200">
                        Feed URL override
                        <input className={EmbedInputClassName} onChange={(Event) => UpdateSource(Source.Id, { Url: Event.target.value })} placeholder="Optional RSS URL" value={Source.Url} />
                      </label>
                    </>
                  ) : null}
                  {Source.Type === "Twitch" ? (
                    <label className="block text-sm font-bold text-slate-200 lg:col-span-2">
                      Twitch login
                      <input className={EmbedInputClassName} onChange={(Event) => UpdateSource(Source.Id, { ExternalId: Event.target.value })} placeholder="channel_login" value={Source.ExternalId} />
                    </label>
                  ) : null}
                  {Source.Type === "Kick" ? (
                    <label className="block text-sm font-bold text-slate-200 lg:col-span-2">
                      Kick login
                      <input className={EmbedInputClassName} onChange={(Event) => UpdateSource(Source.Id, { ExternalId: Event.target.value })} placeholder="channel_login" value={Source.ExternalId} />
                    </label>
                  ) : null}
                  {Source.Type === "X" ? (
                    <label className="block text-sm font-bold text-slate-200 lg:col-span-2">
                      X username
                      <input className={EmbedInputClassName} onChange={(Event) => UpdateSource(Source.Id, { ExternalId: Event.target.value })} placeholder="username without @" value={Source.ExternalId} />
                    </label>
                  ) : null}
                  {Source.Type === "Reddit" ? (
                    <label className="block text-sm font-bold text-slate-200 lg:col-span-2">
                      Subreddit
                      <input className={EmbedInputClassName} onChange={(Event) => UpdateSource(Source.Id, { ExternalId: Event.target.value })} placeholder="announcements" value={Source.ExternalId} />
                    </label>
                  ) : null}
                  {Source.Type === "Instagram" ? (
                    <label className="block text-sm font-bold text-slate-200 lg:col-span-2">
                      Instagram user ID
                      <input className={EmbedInputClassName} onChange={(Event) => UpdateSource(Source.Id, { ExternalId: Event.target.value })} placeholder="178414..." value={Source.ExternalId} />
                    </label>
                  ) : null}
                </div>

                {NotificationSourceUsesKeys(Source.Type) ? (
                  <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    {Source.Type === "Twitch" || Source.Type === "Reddit" ? (
                      <>
                        <label className="block text-sm font-bold text-slate-200">
                          API key / client ID
                          <input className={EmbedInputClassName} onChange={(Event) => UpdateSource(Source.Id, { ApiKey: Event.target.value })} value={Source.ApiKey} />
                        </label>
                        <label className="block text-sm font-bold text-slate-200">
                          API secret
                          <input className={EmbedInputClassName} onChange={(Event) => UpdateSource(Source.Id, { ApiSecret: Event.target.value })} type="password" value={Source.ApiSecret} />
                        </label>
                      </>
                    ) : null}
                    {Source.Type === "X" || Source.Type === "Instagram" || Source.Type === "Kick" || Source.Type === "Reddit" ? (
                      <label className="block text-sm font-bold text-slate-200">
                        Access token
                        <input className={EmbedInputClassName} onChange={(Event) => UpdateSource(Source.Id, { AccessToken: Event.target.value })} type="password" value={Source.AccessToken} />
                      </label>
                    ) : null}
                    {Source.Type === "Twitch" ? (
                      <p className="self-end rounded-2xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">Uses source keys first, then TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET from .env.</p>
                    ) : null}
                    {Source.Type === "Reddit" ? (
                      <p className="self-end rounded-2xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">Can work without keys through public JSON. Client credentials or bearer token are used when provided.</p>
                    ) : null}
                    {Source.Type === "X" ? (
                      <p className="self-end rounded-2xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">Requires an X API bearer token.</p>
                    ) : null}
                    {Source.Type === "Instagram" ? (
                      <p className="self-end rounded-2xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">Requires an Instagram Graph access token for the configured user ID.</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4">
                  <AdvancedEmbedEditor
                    BotIdentity={Properties.BotIdentity}
                    EmbedValue={Source.Embed}
                    OnChange={(Embed) => UpdateSource(Source.Id, { Embed })}
                    PlaceholderText="Available tags: %source%, %type%, %title%, %url%, %author%, %publishedAt%, %summary%, %image%."
                  />
                </div>

                <div className="mt-4 flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                  <span>Last checked: {Source.LastCheckedAt ? FormatReminderDate(Source.LastCheckedAt) : "Never"}</span>
                  <button className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-500" onClick={() => RemoveSource(Source.Id)} type="button">
                    Delete source
                  </button>
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
