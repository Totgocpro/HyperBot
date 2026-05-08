"use client";

import Link from "next/link";
import { useEffect as UseEffect, useRef as UseRef, useState as UseState } from "react";
import type { BotGuildSummary, DashboardElement, SettingsField } from "../../Core/Types";
import { CustomSelect } from "./CustomSelect";

type DashboardPlugin = {
  Metadata: {
    Id: string;
    DisplayName: string;
    Version: string;
    Author: string;
    Icon: string;
  };
  Commands: Array<{
    Name: string;
    Description: string;
  }>;
  Dependencies?: string[];
  DependencyErrors?: string[];
  WebInterface: Array<SettingsField & { Value: unknown }>;
  DashboardElements?: Array<DashboardElement & { Value: unknown }>;
};

type PluginSettingsPanelProperties = {
  GuildId: string;
};

type PluginConfigSection = {
  Id: string;
  Label: string;
  Fields: Array<SettingsField & { Value: unknown }>;
};

type EditableEmbedField = {
  Name: string;
  Value: string;
  Inline: boolean;
};

type EditableEmbed = {
  Name: string;
  Title: string;
  Description: string;
  Color: string;
  Url: string;
  AuthorName: string;
  AuthorIconUrl: string;
  ThumbnailUrl: string;
  ImageUrl: string;
  FooterText: string;
  FooterIconUrl: string;
  Timestamp: boolean;
  Fields: EditableEmbedField[];
  ImageDataUrl: string;
  ImageName: string;
};

type BackupSummary = {
  Id: string;
  Name: string;
  GuildName: string;
  CreatedAt: string;
  CreatedBy: string;
  Roles: number;
  Channels: number;
  PluginConfigs: number;
};

type CustomCommandActionType = "SendMessage" | "Reply" | "DM" | "SendEmbed" | "ReplyEmbed" | "DMEmbed" | "AddRole" | "RemoveRole" | "ToggleRole" | "DeleteTrigger" | "React";

type CustomCommandActionDraft = {
  Id: string;
  Type: CustomCommandActionType;
  Message: string;
  Embed: EditableEmbed;
  RoleId: string;
  Emoji: string;
};

type CustomCommandDraft = {
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

type SaveFeedback = {
  Message: string;
  Tone: "Success" | "Error";
  Key: number;
};

type ReminderDraft = {
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

export function PluginSettingsPanel(Properties: PluginSettingsPanelProperties) {
  const [Plugins, SetPlugins] = UseState<DashboardPlugin[]>([]);
  const [Guild, SetGuild] = UseState<BotGuildSummary | null>(null);
  const [SelectedPluginId, SetSelectedPluginId] = UseState("");
  const [PluginMenuOpen, SetPluginMenuOpen] = UseState(false);
  const [SectionMenuOpen, SetSectionMenuOpen] = UseState(true);
  const [DraftValues, SetDraftValues] = UseState<Record<string, Record<string, unknown>>>({});
  const [Status, SetStatus] = UseState("Loading plugins...");
  const [SavingPluginId, SetSavingPluginId] = UseState("");
  const [SaveFeedbackValue, SetSaveFeedbackValue] = UseState<SaveFeedback | null>(null);
  const SaveFeedbackTimeout = UseRef<number | null>(null);

  const SelectedPlugin = Plugins.find((Plugin) => Plugin.Metadata.Id === SelectedPluginId) ?? Plugins[0];
  const SelectedPluginDraftValues = SelectedPlugin ? DraftValues[SelectedPlugin.Metadata.Id] ?? {} : {};
  const ConfigSections = SelectedPlugin ? BuildConfigSections(SelectedPlugin, SelectedPluginDraftValues) : [];
  const HasDashboardOverview = Boolean(SelectedPlugin?.DashboardElements?.length);

  UseEffect(() => {
    void LoadPlugins();
    void LoadGuild();

    const RefreshInterval = window.setInterval(() => {
      void LoadPlugins(true);
    }, 5_000);

    return () => window.clearInterval(RefreshInterval);
  }, [Properties.GuildId]);

  UseEffect(() => {
    return () => {
      if (SaveFeedbackTimeout.current) {
        window.clearTimeout(SaveFeedbackTimeout.current);
      }
    };
  }, []);

  async function LoadGuild(): Promise<void> {
    const Response = await fetch("/api/guilds");

    if (!Response.ok) {
      return;
    }

    const Payload = (await Response.json()) as { Guilds: BotGuildSummary[] };
    SetGuild(Payload.Guilds.find((GuildValue) => GuildValue.Id === Properties.GuildId) ?? null);
  }

  async function LoadPlugins(PreserveDraftValues = false): Promise<void> {
    const Response = await fetch(`/api/plugins/${Properties.GuildId}`, {
      headers: BuildGuildHeaders()
    });

    if (!Response.ok) {
      SetStatus(await Response.text());
      return;
    }

    const Payload = (await Response.json()) as { Plugins: DashboardPlugin[] };
    SetPlugins(Payload.Plugins);
    SetSelectedPluginId((PreviousPluginId) => PreviousPluginId || Payload.Plugins[0]?.Metadata.Id || "");

    if (!PreserveDraftValues) {
      SetDraftValues(BuildDraftValues(Payload.Plugins));
    }

    SetStatus(`${Payload.Plugins.length} plugin(s) available.`);
  }

  async function SavePlugin(Plugin: DashboardPlugin): Promise<void> {
    const PluginDraftValues = DraftValues[Plugin.Metadata.Id] ?? {};
    const MissingRequiredField = Plugin.WebInterface.find((Field) => Field.Required && IsFieldVisible(Field, PluginDraftValues) && !PluginDraftValues[Field.Key]);

    if (MissingRequiredField) {
      SetStatus(`${MissingRequiredField.Label} is required.`);
      ShowSaveFeedback(`${MissingRequiredField.Label} is required.`, "Error");
      return;
    }

    SetSavingPluginId(Plugin.Metadata.Id);

    try {
      const Response = await fetch(`/api/plugins/${Properties.GuildId}`, {
        method: "PUT",
        headers: {
          ...BuildGuildHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          PluginId: Plugin.Metadata.Id,
          Values: BuildPersistablePluginValues(Plugin, DraftValues[Plugin.Metadata.Id] ?? {})
        })
      });

      if (Response.ok) {
        const Message = "Settings saved successfully.";

        SetStatus(`${Plugin.Metadata.DisplayName} saved.`);
        ShowSaveFeedback(Message, "Success");
        return;
      }

      const ErrorMessage = await Response.text();
      SetStatus(ErrorMessage);
      ShowSaveFeedback(ErrorMessage, "Error");
    } finally {
      SetSavingPluginId("");
    }
  }

  async function CreateRole(Name: string, Color: string): Promise<string | null> {
    const Response = await fetch(`/api/plugins/${Properties.GuildId}/roles`, {
      method: "POST",
      headers: {
        ...BuildGuildHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ Name, Color })
    });

    if (!Response.ok) {
      throw new Error(await Response.text());
    }

    const Payload = (await Response.json()) as { Role: { Id: string } };
    await LoadPlugins(true);
    SetStatus(`Role ${Name} created.`);
    return Payload.Role.Id;
  }

  async function CreateChannel(Name: string): Promise<string | null> {
    const Response = await fetch(`/api/plugins/${Properties.GuildId}/channels`, {
      method: "POST",
      headers: {
        ...BuildGuildHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ Name })
    });

    if (!Response.ok) {
      throw new Error(await Response.text());
    }

    const Payload = (await Response.json()) as { Channel: { Id: string } };
    await LoadPlugins(true);
    SetStatus(`Channel ${Name} created.`);
    return Payload.Channel.Id;
  }

  function ShowSaveFeedback(Message: string, Tone: SaveFeedback["Tone"]): void {
    if (SaveFeedbackTimeout.current) {
      window.clearTimeout(SaveFeedbackTimeout.current);
    }

    SetSaveFeedbackValue({
      Message,
      Tone,
      Key: Date.now()
    });

    SaveFeedbackTimeout.current = window.setTimeout(() => {
      SetSaveFeedbackValue(null);
      SaveFeedbackTimeout.current = null;
    }, 2_800);
  }

  function UpdateDraftValue(PluginId: string, Key: string, Value: unknown): void {
    SetDraftValues((PreviousValues) => ({
      ...PreviousValues,
      [PluginId]: {
        ...(PreviousValues[PluginId] ?? {}),
        [Key]: Value
      }
    }));
  }

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-slate-100 sm:px-6 sm:py-8">
      {SaveFeedbackValue ? <SaveFeedbackToast Feedback={SaveFeedbackValue} /> : null}
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/20 sm:p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-blue-600 text-2xl font-black text-white sm:h-16 sm:w-16">
              {Guild?.Icon ? <img alt="" className="h-16 w-16 rounded-3xl" src={Guild.Icon} /> : (Guild?.Name ?? "S").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <Link className="text-sm font-semibold text-blue-400" href="/">
                Back to servers
              </Link>
              <h1 className="mt-2 truncate text-2xl font-black text-white sm:text-3xl">{Guild?.Name ?? "Discord server"}</h1>
              <p className="mt-1 break-all text-sm text-slate-400 sm:break-normal">
                {Guild?.MemberCount ?? "?"} members | Guild ID: {Properties.GuildId}
              </p>
            </div>
          </div>
          <button className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 sm:w-auto" onClick={() => void LoadPlugins()}>
            Refresh
          </button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-3xl border border-slate-800 bg-slate-900 p-3 shadow-xl shadow-black/20 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="px-2 text-xs font-bold uppercase tracking-wide text-slate-500">Plugins</p>
              <button
                aria-expanded={PluginMenuOpen}
                aria-label="Open plugin menu"
                className="rounded-2xl border border-slate-700 p-2 text-slate-200 hover:bg-slate-800 lg:hidden"
                onClick={() => SetPluginMenuOpen(!PluginMenuOpen)}
              >
                <PluginHamburgerIcon />
              </button>
            </div>
            <div className={`${PluginMenuOpen ? "grid" : "hidden"} mt-3 gap-2 lg:grid lg:space-y-2`}>
              {Plugins.map((Plugin) => (
                <button
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    SelectedPlugin?.Metadata.Id === Plugin.Metadata.Id ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
                  }`}
                  key={Plugin.Metadata.Id}
                  onClick={() => {
                    SetSelectedPluginId(Plugin.Metadata.Id);
                    SetPluginMenuOpen(false);
                    SetSectionMenuOpen(true);
                  }}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-sm font-black">
                    {Plugin.Metadata.Icon.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <span className="block font-bold">{Plugin.Metadata.DisplayName}</span>
                    <span className={SelectedPlugin?.Metadata.Id === Plugin.Metadata.Id ? "text-xs text-blue-100" : "text-xs text-slate-500"}>
                      {Plugin.Commands.length} command(s)
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {SelectedPlugin ? (
              <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950 p-3">
                <button
                  className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-xs font-black uppercase tracking-wide text-slate-500 hover:bg-slate-900"
                  onClick={() => SetSectionMenuOpen(!SectionMenuOpen)}
                >
                  Sections
                  <span className={`text-slate-300 transition-transform duration-200 ${SectionMenuOpen ? "rotate-180" : ""}`}>⌄</span>
                </button>
                <div className={`grid overflow-hidden transition-all duration-300 ${SectionMenuOpen ? "mt-2 max-h-96 opacity-100" : "max-h-0 opacity-0"}`}>
                  {HasDashboardOverview ? (
                    <button className="rounded-2xl px-3 py-2 text-left text-sm font-semibold text-slate-300 hover:bg-slate-900 hover:text-white" onClick={() => ScrollToPluginSection("plugin-section-overview")}>
                      Overview
                    </button>
                  ) : null}
                  {ConfigSections.map((Section) => (
                    <button
                      className="rounded-2xl px-3 py-2 text-left text-sm font-semibold text-slate-300 hover:bg-slate-900 hover:text-white"
                      key={Section.Id}
                      onClick={() => ScrollToPluginSection(`plugin-section-${Section.Id}`)}
                    >
                      {Section.Label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/20 sm:p-6">
            {/* <p className="mb-5 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">{Status}</p> */}

            {SelectedPlugin ? (
              <>
                <div className="flex flex-col gap-3 border-b border-slate-800 pb-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-white">{SelectedPlugin.Metadata.DisplayName}</h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Version {SelectedPlugin.Metadata.Version} by {SelectedPlugin.Metadata.Author}
                    </p>
                    {SelectedPlugin.Dependencies?.length ? (
                      <p className="mt-2 text-xs font-bold text-slate-500">
                        Requires: {SelectedPlugin.Dependencies.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <button
                    className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                    disabled={SavingPluginId === SelectedPlugin.Metadata.Id}
                    onClick={() => void SavePlugin(SelectedPlugin)}
                  >
                    {SavingPluginId === SelectedPlugin.Metadata.Id ? "Saving..." : "Save"}
                  </button>
                </div>

                <div className="mt-6 grid gap-5">
                  {SelectedPlugin.DependencyErrors?.length ? (
                    <div className="rounded-3xl border border-red-500/40 bg-red-950/50 p-4 text-sm font-bold text-red-100">
                      {SelectedPlugin.DependencyErrors.join(" ")}
                    </div>
                  ) : null}
                  {SelectedPlugin.Metadata.Id === "SendEmbed" ? (
                    <SendEmbedEditor
                      DraftValues={DraftValues}
                      GuildId={Properties.GuildId}
                      OnCreateChannel={CreateChannel}
                      Plugin={SelectedPlugin}
                      SetStatus={SetStatus}
                      UpdateDraftValue={UpdateDraftValue}
                    />
                  ) : SelectedPlugin.Metadata.Id === "Backups" ? (
                    <BackupsManager
                      DraftValues={DraftValues}
                      GuildId={Properties.GuildId}
                      Plugin={SelectedPlugin}
                      SetStatus={SetStatus}
                      UpdateDraftValue={UpdateDraftValue}
                    />
                  ) : SelectedPlugin.Metadata.Id === "CustomCommands" ? (
                    <CustomCommandsEditor
                      DraftValues={DraftValues}
                      GuildId={Properties.GuildId}
                      OnCreateChannel={CreateChannel}
                      OnCreateRole={CreateRole}
                      Plugin={SelectedPlugin}
                      SetStatus={SetStatus}
                      UpdateDraftValue={UpdateDraftValue}
                    />
                  ) : SelectedPlugin.Metadata.Id === "Reminders" ? (
                    <RemindersEditor
                      DraftValues={DraftValues}
                      OnCreateChannel={CreateChannel}
                      Plugin={SelectedPlugin}
                      SetStatus={SetStatus}
                      UpdateDraftValue={UpdateDraftValue}
                    />
                  ) : (
                    <>
                  {SelectedPlugin.DashboardElements?.length ? (
                    <section className="scroll-mt-28 rounded-[2rem] border border-slate-800 bg-slate-950/40 p-4 sm:p-5" id="plugin-section-overview">
                      <div className="mb-4">
                        <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Overview</p>
                        <h3 className="mt-2 text-2xl font-black text-white">Plugin dashboard</h3>
                      </div>
                      <div className="grid gap-4">
                        {SelectedPlugin.DashboardElements.map((Element) => (
                          <DashboardElementRenderer Element={Element} key={Element.Key} />
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {ConfigSections.map((Section) => (
                    <section className="scroll-mt-28 rounded-[2rem] border border-slate-800 bg-slate-950/40 p-4 sm:p-5" id={`plugin-section-${Section.Id}`} key={Section.Id}>
                      <div className="mb-4">
                        <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Configuration</p>
                        <h3 className="mt-2 text-2xl font-black text-white">{Section.Label}</h3>
                      </div>
                      <div className="grid gap-4">
                        {Section.Fields.map((Field) => (
                          <div key={Field.Key}>{RenderField(Properties.GuildId, SelectedPlugin.Metadata.Id, Field, DraftValues, UpdateDraftValue, SetStatus, CreateRole, CreateChannel)}</div>
                        ))}
                      </div>
                    </section>
                  ))}
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-400">
                No plugin loaded for this server.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function SaveFeedbackToast(Properties: { Feedback: SaveFeedback }) {
  const IsSuccess = Properties.Feedback.Tone === "Success";

  return (
    <div
      aria-live="polite"
      className={`hyperbot-save-toast fixed right-4 top-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm items-center gap-3 rounded-2xl border p-4 shadow-2xl shadow-black/30 sm:right-6 sm:top-6 ${
        IsSuccess ? "border-emerald-400/40 bg-emerald-950 text-emerald-50" : "border-red-400/40 bg-red-950 text-red-50"
      }`}
      key={Properties.Feedback.Key}
      role="status"
    >
      <span className={`hyperbot-save-toast-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${IsSuccess ? "bg-emerald-500" : "bg-red-500"}`}>
        {IsSuccess ? <SaveCheckIcon /> : <SaveErrorIcon />}
      </span>
      <span>
        <span className="block text-sm font-black">{IsSuccess ? "Settings saved" : "Save failed"}</span>
        <span className={IsSuccess ? "mt-0.5 block text-sm text-emerald-100" : "mt-0.5 block text-sm text-red-100"}>{Properties.Feedback.Message}</span>
      </span>
    </div>
  );
}

function SaveCheckIcon() {
  return (
    <svg aria-hidden="true" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
      <path className="hyperbot-save-check-path" d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
    </svg>
  );
}

function SaveErrorIcon() {
  return (
    <svg aria-hidden="true" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
      <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

function CustomCommandsEditor(Properties: {
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
                  <div className="block text-sm font-bold text-slate-200">
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

function DashboardElementRenderer(Properties: { Element: DashboardElement & { Value: unknown } }) {
  const [SelectedMonth, SetSelectedMonth] = UseState(BuildCurrentMonth());
  const Series = BuildMonthlySeries(Properties.Element.Value, SelectedMonth);
  const Total = Series.reduce((TotalValue, Point) => TotalValue + Point.Value, 0);
  const Average = Series.length > 0 ? Total / Series.length : 0;

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">{Properties.Element.Label}</h3>
          <p className="mt-1 text-sm text-slate-500">
            Total: {FormatChartValue(Total, Properties.Element.Unit)} | Average/day: {FormatChartValue(Average, Properties.Element.Unit)}
          </p>
        </div>
        <input
          className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
          onChange={(Event) => SetSelectedMonth(Event.target.value)}
          type="month"
          value={SelectedMonth}
        />
      </div>
      {Properties.Element.Type === "MetricGrid" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MetricTile Label="Total" Value={FormatChartValue(Total, Properties.Element.Unit)} />
          <MetricTile Label="Average/day" Value={FormatChartValue(Average, Properties.Element.Unit)} />
          <MetricTile Label="Active days" Value={String(Series.filter((Point) => Point.Value > 0).length)} />
        </div>
      ) : (
        <ChartSvg Series={Series} Type={Properties.Element.Type} Unit={Properties.Element.Unit} />
      )}
    </section>
  );
}

function RemindersEditor(Properties: {
  DraftValues: Record<string, Record<string, unknown>>;
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
            {RenderField("", PluginId, Properties.Plugin.WebInterface.find((Field) => Field.Key === "DefaultChannelId") as SettingsField & { Value: unknown }, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel)}
            {RenderField("", PluginId, Properties.Plugin.WebInterface.find((Field) => Field.Key === "DefaultEmbed") as SettingsField & { Value: unknown }, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel)}
            {RenderField("", PluginId, Properties.Plugin.WebInterface.find((Field) => Field.Key === "DefaultInterval") as SettingsField & { Value: unknown }, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel)}
            {RenderField("", PluginId, Properties.Plugin.WebInterface.find((Field) => Field.Key === "DefaultColor") as SettingsField & { Value: unknown }, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel)}
            {RenderField("", PluginId, Properties.Plugin.WebInterface.find((Field) => Field.Key === "FooterText") as SettingsField & { Value: unknown }, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel)}
            {RenderField("", PluginId, Properties.Plugin.WebInterface.find((Field) => Field.Key === "MaxReminders") as SettingsField & { Value: unknown }, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel)}
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
              <div className="block text-sm font-bold text-slate-200">
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
              <div className="block text-sm font-bold text-slate-200">
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
              <div className="block text-sm font-bold text-slate-200">
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

function AdvancedEmbedEditor(Properties: {
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
        <DiscordEmbedPreview Embed={CurrentEmbed} OnSelectPart={SetSelectedPart} SelectedPart={SelectedPart} />
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

function SendEmbedEditor(Properties: {
  DraftValues: Record<string, Record<string, unknown>>;
  GuildId: string;
  OnCreateChannel: (Name: string) => Promise<string | null>;
  Plugin: DashboardPlugin;
  SetStatus: (Status: string) => void;
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void;
}) {
  const PluginId = Properties.Plugin.Metadata.Id;
  const Values = Properties.DraftValues[PluginId] ?? {};
  const ChannelField = Properties.Plugin.WebInterface.find((Field) => Field.Key === "SendChannelId");
  const SavedEmbeds = ParseSavedEmbeds(Values.SavedEmbeds);
  const CurrentEmbed = ParseEditableEmbed(Values.CurrentEmbed);
  const [IsSending, SetIsSending] = UseState(false);

  function SetChannelId(ChannelId: string): void {
    Properties.UpdateDraftValue(PluginId, "SendChannelId", ChannelId);
  }

  function SetCurrentEmbed(EmbedValue: EditableEmbed): void {
    Properties.UpdateDraftValue(PluginId, "CurrentEmbed", EmbedValue);
  }

  function UpdateEmbed(Patch: Partial<EditableEmbed>): void {
    SetCurrentEmbed({ ...CurrentEmbed, ...Patch });
  }

  function SaveCurrentEmbed(): void {
    const SafeName = CurrentEmbed.Name.trim() || "Untitled embed";
    const NextEmbed = { ...CurrentEmbed, Name: SafeName };
    const ExistingIndex = SavedEmbeds.findIndex((EmbedValue) => EmbedValue.Name.toLowerCase() === SafeName.toLowerCase());
    const NextEmbeds = ExistingIndex >= 0 ? SavedEmbeds.map((EmbedValue, Index) => (Index === ExistingIndex ? NextEmbed : EmbedValue)) : [...SavedEmbeds, NextEmbed];

    Properties.UpdateDraftValue(PluginId, "SavedEmbeds", NextEmbeds);
    SetCurrentEmbed(NextEmbed);
    Properties.SetStatus(`${SafeName} saved in draft. Use the main Save button to persist it.`);
  }

  function LoadEmbed(Name: string): void {
    const SavedEmbed = SavedEmbeds.find((EmbedValue) => EmbedValue.Name === Name);

    if (SavedEmbed) {
      SetCurrentEmbed(SavedEmbed);
      Properties.SetStatus(`${SavedEmbed.Name} loaded.`);
    }
  }

  function DeleteEmbed(Name: string): void {
    Properties.UpdateDraftValue(PluginId, "SavedEmbeds", SavedEmbeds.filter((EmbedValue) => EmbedValue.Name !== Name));
    Properties.SetStatus(`${Name} removed from draft. Use the main Save button to persist it.`);
  }

  async function SendEmbed(): Promise<void> {
    const ChannelId = String(Values.SendChannelId ?? "");

    if (!ChannelId) {
      Properties.SetStatus("Select a target channel before sending.");
      return;
    }

    SetIsSending(true);
    Properties.SetStatus("Sending embed...");

    try {
      const Response = await fetch(`/api/plugins/${Properties.GuildId}/actions`, {
        method: "POST",
        headers: {
          ...BuildGuildHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          PluginId,
          ActionKey: "SendEmbed",
          Payload: {
            ChannelId,
            Embed: CurrentEmbed
          }
        })
      });

      Properties.SetStatus(Response.ok ? "Embed queued for sending." : await Response.text());
    } finally {
      SetIsSending(false);
    }
  }

  return (
    <section className="scroll-mt-28 rounded-[2rem] border border-slate-800 bg-slate-950/40 p-4 sm:p-5" id="plugin-section-send-embed">
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Embed builder</p>
        <h3 className="mt-2 text-2xl font-black text-white">Create, preview, save, and send embeds</h3>
      </div>

      <div className="grid gap-5">
        <div className="grid gap-4">
          <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-bold text-slate-200">
                Template name
                <input className={EmbedInputClassName} onChange={(Event) => UpdateEmbed({ Name: Event.target.value })} value={CurrentEmbed.Name} />
              </label>
              <div className="block text-sm font-bold text-slate-200">
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
                  OnChange={SetChannelId}
                  OnCreate={Properties.OnCreateChannel}
                  Options={ChannelField?.Options ?? []}
                  Value={String(Values.SendChannelId ?? "")}
                />
              </div>
            </div>
          </section>

          <AdvancedEmbedEditor
            EmbedValue={CurrentEmbed}
            OnChange={SetCurrentEmbed}
            PlaceholderText="Build the embed from the preview. Select a part of the Discord preview, then edit only that section."
          />
        </div>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h4 className="text-xl font-black text-white">Saved embeds</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500" onClick={SaveCurrentEmbed} type="button">
                Save template
              </button>
              <button className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60" disabled={IsSending} onClick={() => void SendEmbed()} type="button">
                {IsSending ? "Sending..." : "Send embed"}
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {SavedEmbeds.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No saved embed.</p> : null}
              {SavedEmbeds.map((EmbedValue) => (
                <div className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-3" key={EmbedValue.Name}>
                  <p className="truncate font-bold text-white">{EmbedValue.Name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-slate-100 hover:bg-slate-700" onClick={() => LoadEmbed(EmbedValue.Name)} type="button">
                      Load
                    </button>
                    <button className="rounded-xl border border-red-500/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10" onClick={() => DeleteEmbed(EmbedValue.Name)} type="button">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
        </section>
      </div>
    </section>
  );
}

function DiscordEmbedPreview(Properties: { Embed: EditableEmbed; OnSelectPart?: (Part: "Content" | "Author" | "Media" | "Footer" | "Fields") => void; SelectedPart?: string }) {
  const Color = NormalizeEmbedColor(Properties.Embed.Color);
  const SelectClassName = "rounded-md outline outline-2 outline-transparent transition hover:outline-blue-400";
  const ActiveClassName = "outline-blue-500";

  return (
    <section className="rounded-3xl border border-slate-800 bg-[#313338] p-4 shadow-xl shadow-black/20">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Discord preview</p>
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-black text-white">HB</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            HyperBot <span className="rounded bg-[#5865f2] px-1 py-0.5 text-[10px] uppercase text-white">Bot</span>
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

function BackupsManager(Properties: {
  DraftValues: Record<string, Record<string, unknown>>;
  GuildId: string;
  Plugin: DashboardPlugin;
  SetStatus: (Status: string) => void;
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void;
}) {
  const PluginId = Properties.Plugin.Metadata.Id;
  const Values = Properties.DraftValues[PluginId] ?? {};
  const [Backups, SetBackups] = UseState<BackupSummary[]>([]);
  const [SelectedBackupId, SetSelectedBackupId] = UseState("");
  const [IsBusy, SetIsBusy] = UseState(false);
  const BackupNameField = Properties.Plugin.WebInterface.find((Field) => Field.Key === "BackupName");
  const DeleteUnknownField = Properties.Plugin.WebInterface.find((Field) => Field.Key === "DeleteUnknownObjects");
  const SelectedBackup = Backups.find((Backup) => Backup.Id === SelectedBackupId) ?? Backups[0];
  const BackupName = String(Values.BackupName ?? BackupNameField?.Default ?? "Manual backup");
  const DeleteUnknownObjects = Boolean(Values.DeleteUnknownObjects ?? DeleteUnknownField?.Default ?? false);

  UseEffect(() => {
    void LoadBackups();
  }, [Properties.GuildId]);

  async function LoadBackups(): Promise<void> {
    const Response = await fetch(`/api/plugins/${Properties.GuildId}/backups`, {
      headers: BuildGuildHeaders()
    });

    if (!Response.ok) {
      Properties.SetStatus(await Response.text());
      return;
    }

    const Payload = (await Response.json()) as { Backups: BackupSummary[] };
    SetBackups(Payload.Backups);
    SetSelectedBackupId((PreviousId) => PreviousId || Payload.Backups[0]?.Id || "");
    Properties.SetStatus(`${Payload.Backups.length} backup(s) available.`);
  }

  async function SendBackupAction(ActionKey: string, Payload: Record<string, unknown>): Promise<void> {
    SetIsBusy(true);

    try {
      const Response = await fetch(`/api/plugins/${Properties.GuildId}/actions`, {
        method: "POST",
        headers: {
          ...BuildGuildHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          PluginId,
          ActionKey,
          Payload
        })
      });

      Properties.SetStatus(Response.ok ? `${ActionKey} queued. Refresh the list in a few seconds.` : await Response.text());
    } finally {
      SetIsBusy(false);
    }
  }

  async function DeleteBackup(BackupId: string): Promise<void> {
    SetIsBusy(true);

    try {
      const Response = await fetch(`/api/plugins/${Properties.GuildId}/backups`, {
        method: "DELETE",
        headers: {
          ...BuildGuildHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ BackupId })
      });

      if (!Response.ok) {
        Properties.SetStatus(await Response.text());
        return;
      }

      const NextBackups = Backups.filter((Backup) => Backup.Id !== BackupId);
      SetBackups(NextBackups);
      SetSelectedBackupId(NextBackups[0]?.Id ?? "");
      Properties.SetStatus("Backup deleted.");
    } finally {
      SetIsBusy(false);
    }
  }

  function DownloadBackup(BackupId: string): void {
    window.open(`/api/plugins/${Properties.GuildId}/backups?backupId=${encodeURIComponent(BackupId)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/40 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-4 sm:grid-cols-[1fr_auto]">
            {BackupNameField ? (
              <label className="block text-sm font-bold text-slate-200">
                {BackupNameField.Label}
                <input
                  className={EmbedInputClassName}
                  onChange={(Event) => Properties.UpdateDraftValue(PluginId, "BackupName", Event.target.value)}
                  type="text"
                  value={BackupName}
                />
              </label>
            ) : null}
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm font-semibold text-slate-100">
              <span>{DeleteUnknownField?.Label ?? "Delete unknown objects"}</span>
              <input
                checked={DeleteUnknownObjects}
                className="h-5 w-5 accent-blue-600"
                onChange={(Event) => Properties.UpdateDraftValue(PluginId, "DeleteUnknownObjects", Event.target.checked)}
                type="checkbox"
              />
            </label>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={IsBusy}
              onClick={() => void LoadBackups()}
              type="button"
            >
              Refresh
            </button>
            <button
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={IsBusy}
              onClick={() => void SendBackupAction("CreateBackup", { BackupName })}
              type="button"
            >
              Create backup
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Backups include roles, permissions, categories, channels and saved plugin configuration. Discord messages are not copied.
        </p>
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/40 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Archives</p>
            <h3 className="mt-2 text-2xl font-black text-white">Server backups</h3>
          </div>
          {SelectedBackup ? (
            <button
              className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-black text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={IsBusy}
              onClick={() => void SendBackupAction("RestoreBackup", { BackupId: SelectedBackup.Id, DeleteUnknownObjects })}
              type="button"
            >
              Restore selected
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3">
          {Backups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
              No backup created yet.
            </div>
          ) : (
            Backups.map((Backup) => (
              <button
                className={`rounded-3xl border p-4 text-left transition ${
                  SelectedBackup?.Id === Backup.Id ? "border-blue-500 bg-blue-500/10" : "border-slate-800 bg-slate-950 hover:border-slate-700"
                }`}
                key={Backup.Id}
                onClick={() => SetSelectedBackupId(Backup.Id)}
                type="button"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h4 className="text-lg font-black text-white">{Backup.Name}</h4>
                    <p className="mt-1 text-sm text-slate-500">
                      {new Date(Backup.CreatedAt).toLocaleString()} | {Backup.GuildName}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-300">
                    <span className="rounded-full bg-slate-800 px-3 py-2">{Backup.Roles} roles</span>
                    <span className="rounded-full bg-slate-800 px-3 py-2">{Backup.Channels} channels</span>
                    <span className="rounded-full bg-slate-800 px-3 py-2">{Backup.PluginConfigs} configs</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-100 hover:bg-slate-800"
                    onClick={(Event) => {
                      Event.stopPropagation();
                      DownloadBackup(Backup.Id);
                    }}
                    type="button"
                  >
                    Download JSON
                  </button>
                  <button
                    className="rounded-2xl bg-amber-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={IsBusy}
                    onClick={(Event) => {
                      Event.stopPropagation();
                      void SendBackupAction("RestoreBackup", { BackupId: Backup.Id, DeleteUnknownObjects });
                    }}
                    type="button"
                  >
                    Restore
                  </button>
                  <button
                    className="rounded-2xl border border-red-500/50 px-4 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={IsBusy}
                    onClick={(Event) => {
                      Event.stopPropagation();
                      void DeleteBackup(Backup.Id);
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function ChartSvg(Properties: { Series: Array<{ Label: string; Value: number }>; Type: DashboardElement["Type"]; Unit?: string }) {
  const [HoveredIndex, SetHoveredIndex] = UseState<number | null>(null);
  const MaxValue = Math.max(...Properties.Series.map((Point) => Point.Value), 1);
  const Width = 820;
  const Height = 280;
  const Padding = 36;
  const InnerWidth = Width - Padding * 2;
  const InnerHeight = Height - Padding * 2;

  if (Properties.Series.length === 0) {
    return <p className="mt-4 rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No data for this period.</p>;
  }

  const Points = Properties.Series.map((Point, Index) => {
    const X = Padding + (Properties.Series.length === 1 ? InnerWidth / 2 : (Index / (Properties.Series.length - 1)) * InnerWidth);
    const Y = Padding + InnerHeight - (Point.Value / MaxValue) * InnerHeight;
    return { ...Point, X, Y };
  });
  const Polyline = Points.map((Point) => `${Point.X},${Point.Y}`).join(" ");
  const BarWidth = Math.max(4, InnerWidth / Properties.Series.length - 3);
  const HoveredPoint = HoveredIndex === null ? null : Points[HoveredIndex] ?? null;
  const TooltipWidth = 152;
  const TooltipX = HoveredPoint ? Math.min(Math.max(HoveredPoint.X - TooltipWidth / 2, 10), Width - TooltipWidth - 10) : 0;
  const TooltipY = HoveredPoint ? Math.max(HoveredPoint.Y - 72, 10) : 0;

  return (
    <div className="mt-4 overflow-x-auto">
      <svg className="min-w-[720px]" height={Height} onMouseLeave={() => SetHoveredIndex(null)} viewBox={`0 0 ${Width} ${Height}`} width="100%">
        <defs>
          <linearGradient id="HyperBotChartArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="HyperBotChartBar" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(96 165 250)" />
            <stop offset="100%" stopColor="rgb(37 99 235)" />
          </linearGradient>
        </defs>
        <rect fill="rgb(15 23 42)" height={Height} rx="20" width={Width} />
        {[0, 0.25, 0.5, 0.75, 1].map((Step) => (
          <g key={Step}>
            <line stroke="rgb(51 65 85)" strokeDasharray="4 6" x1={Padding} x2={Width - Padding} y1={Padding + InnerHeight * Step} y2={Padding + InnerHeight * Step} />
            <text fill="rgb(100 116 139)" fontSize="10" textAnchor="end" x={Padding - 8} y={Padding + InnerHeight * Step + 4}>
              {FormatChartValue(MaxValue * (1 - Step), Properties.Unit)}
            </text>
          </g>
        ))}
        {Properties.Type === "LineChart" ? (
          <>
            <polygon fill="url(#HyperBotChartArea)" points={`${Padding},${Height - Padding} ${Polyline} ${Width - Padding},${Height - Padding}`} />
            <polyline fill="none" points={Polyline} stroke="rgb(96 165 250)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          </>
        ) : null}
        {Points.map((Point) =>
          Properties.Type === "BarChart" ? (
            <rect
              fill={HoveredPoint?.Label === Point.Label ? "rgb(147 197 253)" : "url(#HyperBotChartBar)"}
              height={Height - Padding - Point.Y}
              key={Point.Label}
              onMouseEnter={() => SetHoveredIndex(Points.indexOf(Point))}
              rx="5"
              width={BarWidth}
              x={Point.X - BarWidth / 2}
              y={Point.Y}
            />
          ) : (
            <circle
              cx={Point.X}
              cy={Point.Y}
              fill={HoveredPoint?.Label === Point.Label ? "rgb(255 255 255)" : "rgb(147 197 253)"}
              key={Point.Label}
              onMouseEnter={() => SetHoveredIndex(Points.indexOf(Point))}
              r={HoveredPoint?.Label === Point.Label ? "6" : "4"}
              stroke="rgb(37 99 235)"
              strokeWidth="2"
            />
          )
        )}
        {Points.map((Point, Index) => (
          <rect
            fill="transparent"
            height={InnerHeight}
            key={`hit-${Point.Label}`}
            onMouseEnter={() => SetHoveredIndex(Index)}
            width={Math.max(8, InnerWidth / Properties.Series.length)}
            x={Point.X - Math.max(8, InnerWidth / Properties.Series.length) / 2}
            y={Padding}
          />
        ))}
        {Points.filter((_, Index) => Index % Math.ceil(Points.length / 8) === 0).map((Point) => (
          <text fill="rgb(148 163 184)" fontSize="10" key={Point.Label} textAnchor="middle" x={Point.X} y={Height - 8}>
            {Point.Label.slice(5)}
          </text>
        ))}
        <text fill="rgb(203 213 225)" fontSize="12" x={Padding} y="18">
          Max: {FormatChartValue(MaxValue, Properties.Unit)}
        </text>
        {HoveredPoint ? (
          <g pointerEvents="none">
            <line stroke="rgb(191 219 254)" strokeDasharray="3 5" x1={HoveredPoint.X} x2={HoveredPoint.X} y1={Padding} y2={Height - Padding} />
            <rect fill="rgb(2 6 23)" height="54" opacity="0.96" rx="12" stroke="rgb(59 130 246)" width={TooltipWidth} x={TooltipX} y={TooltipY} />
            <text fill="rgb(226 232 240)" fontSize="12" fontWeight="700" x={TooltipX + 12} y={TooltipY + 22}>
              {HoveredPoint.Label}
            </text>
            <text fill="rgb(147 197 253)" fontSize="12" x={TooltipX + 12} y={TooltipY + 40}>
              {FormatChartValue(HoveredPoint.Value, Properties.Unit)}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function MetricTile(Properties: { Label: string; Value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{Properties.Label}</p>
      <p className="mt-2 text-2xl font-black text-white">{Properties.Value}</p>
    </div>
  );
}

function BuildMonthlySeries(Value: unknown, Month: string): Array<{ Label: string; Value: number }> {
  const Data = IsRecord(Value) ? Value : {};
  const DaysInMonth = new Date(Number(Month.slice(0, 4)), Number(Month.slice(5, 7)), 0).getDate();

  return Array.from({ length: DaysInMonth }, (_, Index) => {
    const Day = String(Index + 1).padStart(2, "0");
    const Label = `${Month}-${Day}`;
    const RawValue = Data[Label];

    return {
      Label,
      Value: typeof RawValue === "number" ? RawValue : 0
    };
  });
}

function BuildCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function IsRecord(Value: unknown): Value is Record<string, unknown> {
  return typeof Value === "object" && Value !== null && !Array.isArray(Value);
}

function FormatChartValue(Value: number, Unit?: string): string {
  if (Unit === "seconds") {
    const Hours = Math.floor(Value / 3600);
    const Minutes = Math.floor((Value % 3600) / 60);
    return `${Hours}h ${Minutes}m`;
  }

  return `${Math.round(Value * 10) / 10}${Unit ? ` ${Unit}` : ""}`;
}

function PluginHamburgerIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function BuildGuildHeaders(): HeadersInit {
  return {};
}

function BuildConfigSections(Plugin: DashboardPlugin, Values: Record<string, unknown>): PluginConfigSection[] {
  const Sections = new Map<string, PluginConfigSection>();

  for (const Field of Plugin.WebInterface.filter((FieldValue) => IsFieldVisible(FieldValue, Values))) {
    const Label = Field.Section ?? "General";
    const Id = BuildSectionId(Label);
    const ExistingSection = Sections.get(Id);

    if (ExistingSection) {
      ExistingSection.Fields.push(Field);
      continue;
    }

    Sections.set(Id, {
      Id,
      Label,
      Fields: [Field]
    });
  }

  return Array.from(Sections.values());
}

function IsFieldVisible(Field: SettingsField, Values: Record<string, unknown>): boolean {
  const AllRules = Array.isArray(Field.VisibleWhen) ? Field.VisibleWhen : Field.VisibleWhen ? [Field.VisibleWhen] : [];

  if (AllRules.length > 0 && !AllRules.every((Rule) => MatchesVisibilityRule(Rule, Values))) {
    return false;
  }

  if (Field.VisibleWhenAny?.length && !Field.VisibleWhenAny.some((Rule) => MatchesVisibilityRule(Rule, Values))) {
    return false;
  }

  return true;
}

function MatchesVisibilityRule(Rule: NonNullable<SettingsField["VisibleWhenAny"]>[number], Values: Record<string, unknown>): boolean {
  const CurrentValue = Values[Rule.Key];
  const Matches = String(CurrentValue) === String(Rule.Value);

  return Rule.Operator === "NotEquals" ? !Matches : Matches;
}

function BuildSectionId(Label: string): string {
  return Label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general";
}

function ScrollToPluginSection(SectionId: string): void {
  document.getElementById(SectionId)?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function BuildDraftValues(Plugins: DashboardPlugin[]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Plugins.map((Plugin) => [
      Plugin.Metadata.Id,
      Object.fromEntries(Plugin.WebInterface.map((Field) => [Field.Key, Field.Value ?? Field.Default]))
    ])
  );
}

function BuildPersistablePluginValues(Plugin: DashboardPlugin, Values: Record<string, unknown>): Record<string, unknown> {
  const PersistableKeys = new Set(Plugin.WebInterface.filter((Field) => Field.Type !== "Button").map((Field) => Field.Key));

  return Object.fromEntries(Object.entries(Values).filter(([Key]) => PersistableKeys.has(Key)));
}

const EmbedInputClassName = "mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500";

function CreateDefaultEmbed(): EditableEmbed {
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

function ParseCustomCommands(Value: unknown): CustomCommandDraft[] {
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

function ParseCustomActionType(Value: unknown): CustomCommandActionType {
  const AllowedTypes: CustomCommandActionType[] = ["SendMessage", "Reply", "DM", "SendEmbed", "ReplyEmbed", "DMEmbed", "AddRole", "RemoveRole", "ToggleRole", "DeleteTrigger", "React"];
  return AllowedTypes.includes(String(Value) as CustomCommandActionType) ? String(Value) as CustomCommandActionType : "SendMessage";
}

function ParseCustomMatchMode(Value: unknown): CustomCommandDraft["MatchMode"] {
  return Value === "StartsWith" ? "StartsWith" : "Exact";
}

function ParseReminderDrafts(Value: unknown): Record<string, ReminderDraft> {
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

const ReminderWeekdays = [
  { Label: "Sun", Value: 0 },
  { Label: "Mon", Value: 1 },
  { Label: "Tue", Value: 2 },
  { Label: "Wed", Value: 3 },
  { Label: "Thu", Value: 4 },
  { Label: "Fri", Value: 5 },
  { Label: "Sat", Value: 6 }
];

function ComputeReminderNextRun(ScheduleMode: ReminderDraft["ScheduleMode"], ReminderValue: ReminderDraft): string {
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

function ParseEditableEmbed(Value: unknown): EditableEmbed {
  const DefaultEmbed = CreateDefaultEmbed();

  if (!IsRecord(Value)) {
    return DefaultEmbed;
  }

  return {
    Name: typeof Value.Name === "string" ? Value.Name : DefaultEmbed.Name,
    Title: typeof Value.Title === "string" ? Value.Title : DefaultEmbed.Title,
    Description: typeof Value.Description === "string" ? Value.Description : DefaultEmbed.Description,
    Color: typeof Value.Color === "string" ? Value.Color : DefaultEmbed.Color,
    Url: typeof Value.Url === "string" ? Value.Url : "",
    AuthorName: typeof Value.AuthorName === "string" ? Value.AuthorName : "",
    AuthorIconUrl: typeof Value.AuthorIconUrl === "string" ? Value.AuthorIconUrl : "",
    ThumbnailUrl: typeof Value.ThumbnailUrl === "string" ? Value.ThumbnailUrl : "",
    ImageUrl: typeof Value.ImageUrl === "string" ? Value.ImageUrl : "",
    FooterText: typeof Value.FooterText === "string" ? Value.FooterText : "",
    FooterIconUrl: typeof Value.FooterIconUrl === "string" ? Value.FooterIconUrl : "",
    Timestamp: Boolean(Value.Timestamp),
    Fields: Array.isArray(Value.Fields) ? Value.Fields.filter(IsRecord).map((Field) => ({
      Name: typeof Field.Name === "string" ? Field.Name : "",
      Value: typeof Field.Value === "string" ? Field.Value : "",
      Inline: Boolean(Field.Inline)
    })) : [],
    ImageDataUrl: typeof Value.ImageDataUrl === "string" ? Value.ImageDataUrl : "",
    ImageName: typeof Value.ImageName === "string" ? Value.ImageName : ""
  };
}

function ParseReminderDuration(Value: string): number | null {
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

function BuildReminderDraftId(Name: string, Reminders: Record<string, ReminderDraft>): string {
  const BaseId = Name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 24) || "reminder";
  let CandidateId = BaseId;
  let Index = 2;

  while (Reminders[CandidateId]) {
    CandidateId = `${BaseId}-${Index}`;
    Index += 1;
  }

  return CandidateId;
}

function FormatReminderDate(Value: string): string {
  const DateValue = new Date(Value);
  return Number.isNaN(DateValue.getTime()) ? "Invalid date" : DateValue.toLocaleString();
}

function IsoToLocalDateTime(Value: string): string {
  const DateValue = new Date(Value);

  if (Number.isNaN(DateValue.getTime())) {
    return "";
  }

  const LocalDate = new Date(DateValue.getTime() - DateValue.getTimezoneOffset() * 60_000);
  return LocalDate.toISOString().slice(0, 16);
}

function LocalDateTimeToIso(Value: string): string {
  const DateValue = new Date(Value);
  return Number.isNaN(DateValue.getTime()) ? new Date().toISOString() : DateValue.toISOString();
}

function ReadNestedStringArray(Value: unknown, Key: string): string[] {
  if (!IsRecord(Value) || !Array.isArray(Value[Key])) {
    return [];
  }

  return Value[Key].map((Item) => String(Item)).filter(Boolean);
}

function StringArray(Value: unknown): string[] {
  return Array.isArray(Value) ? Value.map((Item) => String(Item)).filter(Boolean) : [];
}

function SplitCommaList(Value: string): string[] {
  return Value.split(",").map((Item) => Item.trim()).filter(Boolean);
}

function SanitizeCommandDraftName(Value: string): string {
  return Value.trim().replace(/^!+/u, "").split(/\s+/u)[0]?.slice(0, 48) ?? "";
}

function ActionNeedsMessage(Type: CustomCommandActionType): boolean {
  return Type === "SendMessage" || Type === "Reply" || Type === "DM";
}

function ActionNeedsEmbed(Type: CustomCommandActionType): boolean {
  return Type === "SendEmbed" || Type === "ReplyEmbed" || Type === "DMEmbed";
}

function ActionNeedsRole(Type: CustomCommandActionType): boolean {
  return Type === "AddRole" || Type === "RemoveRole" || Type === "ToggleRole";
}

function CreateClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function MultiSelectField(Properties: {
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
          <button className="mt-2 w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60" disabled={IsCreating} onClick={() => void CreateRole()} type="button">
            {IsCreating ? "Creating..." : IsChannelCreate ? "Create channel" : "Create role"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ParseSavedEmbeds(Value: unknown): EditableEmbed[] {
  if (!Array.isArray(Value)) {
    return [];
  }

  return Value.filter(IsEditableEmbed);
}

function IsEditableEmbed(Value: unknown): Value is EditableEmbed {
  if (!IsRecord(Value)) {
    return false;
  }

  return typeof Value.Name === "string" && Array.isArray(Value.Fields);
}

function NormalizeEmbedColor(Color: string): string {
  return /^#[0-9a-f]{6}$/iu.test(Color) ? Color : "#5865f2";
}

function RenderField(
  GuildId: string,
  PluginId: string,
  Field: SettingsField & { Value: unknown },
  DraftValues: Record<string, Record<string, unknown>>,
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void,
  SetStatus: (Status: string) => void,
  OnCreateRole: (Name: string, Color: string) => Promise<string | null>,
  OnCreateChannel: (Name: string) => Promise<string | null>
) {
  const Value = DraftValues[PluginId]?.[Field.Key] ?? Field.Default;
  const BaseClassName = "mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500";

  if (Field.Type === "Boolean") {
    return (
      <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 p-4 font-semibold text-slate-100">
        {Field.Label}
        <input checked={Boolean(Value)} className="h-5 w-5 accent-blue-600" onChange={(Event) => UpdateDraftValue(PluginId, Field.Key, Event.target.checked)} type="checkbox" />
      </label>
    );
  }

  if (Field.Type === "Select" || Field.Type === "ChannelPicker" || Field.Type === "RolePicker") {
    return (
      <div className="block text-sm font-bold text-slate-200">
        {Field.Label}
        <CustomSelect
          ClassName="mt-2"
          CreateButtonLabel={Field.Type === "ChannelPicker" ? "Create channel" : "Create role"}
          CreateColorEnabled={Field.Type !== "ChannelPicker"}
          CreateErrorMessage={Field.Type === "ChannelPicker" ? "Channel creation failed." : "Role creation failed."}
          CreateInputPlaceholder={Field.Type === "ChannelPicker" ? "channel-name" : "Role name"}
          CreateLabel={Field.Type === "ChannelPicker" ? "Create channel" : "Create role"}
          EmptyCreateError={Field.Type === "ChannelPicker" ? "Channel name is required." : "Role name is required."}
          EmptyLabel={Field.Required ? "Select a required value" : "Select"}
          OnChange={(NextValue) => UpdateDraftValue(PluginId, Field.Key, NextValue)}
          OnCreate={Field.Type === "RolePicker" ? OnCreateRole : Field.Type === "ChannelPicker" ? OnCreateChannel : undefined}
          Options={Field.Options ?? []}
          Required={Field.Required}
          Value={String(Value ?? "")}
        />
        {Field.Type === "ChannelPicker" ? <p className="mt-2 text-xs text-slate-500">Only supported writable channels can be selected.</p> : null}
        {Field.Type === "RolePicker" ? <p className="mt-2 text-xs text-slate-500">Only selectable server roles are listed.</p> : null}
      </div>
    );
  }

  if (Field.Type === "List") {
    return (
      <ListField
        Field={Field}
        OnCreateChannel={OnCreateChannel}
        OnCreateRole={OnCreateRole}
        PluginId={PluginId}
        UpdateDraftValue={UpdateDraftValue}
        Value={Array.isArray(Value) ? Value : []}
      />
    );
  }

  if (Field.Type === "EmbedEditor") {
    return (
      <div>
        <p className="mb-2 text-sm font-bold text-slate-200">{Field.Label}</p>
        <AdvancedEmbedEditor
          EmbedValue={ParseEditableEmbed(Value)}
          OnChange={(NextEmbed) => UpdateDraftValue(PluginId, Field.Key, NextEmbed)}
          PlaceholderText={Field.Description}
        />
      </div>
    );
  }

  if (Field.Type === "Button") {
    return <ActionButton Field={Field} GuildId={GuildId} PluginId={PluginId} SetStatus={SetStatus} />;
  }

  if (PluginId === "WelcomeMessage" && IsWelcomeImageField(Field.Key)) {
    return (
      <ImageUploadField
        Field={Field}
        PluginId={PluginId}
        SetStatus={SetStatus}
        UpdateDraftValue={UpdateDraftValue}
        Value={String(Value ?? "")}
      />
    );
  }

  return (
    <label className="block text-sm font-bold text-slate-200">
      {Field.Label}
      <input
        className={BaseClassName}
        onChange={(Event) => UpdateDraftValue(PluginId, Field.Key, Field.Type === "Number" ? Number(Event.target.value) : Event.target.value)}
        type={Field.Type === "Number" ? "number" : "text"}
        value={String(Value ?? "")}
      />
    </label>
  );
}

function IsWelcomeImageField(Key: string): boolean {
  return Key === "ImageBackgroundImage" || Key === "WelcomeImageBackgroundImage" || Key === "LeaveImageBackgroundImage";
}

function ImageUploadField(Properties: {
  Field: SettingsField & { Value: unknown };
  PluginId: string;
  SetStatus: (Status: string) => void;
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void;
  Value: string;
}) {
  const MaxImageBytes = 1_500_000;
  const IsPreviewable = Properties.Value.startsWith("data:image/") || /^https?:\/\//iu.test(Properties.Value);

  function UpdateValue(Value: string): void {
    Properties.UpdateDraftValue(Properties.PluginId, Properties.Field.Key, Value);
  }

  function UploadFile(FileValue: File | undefined): void {
    if (!FileValue) {
      return;
    }

    if (!FileValue.type.startsWith("image/")) {
      Properties.SetStatus("Select an image file.");
      return;
    }

    if (FileValue.size > MaxImageBytes) {
      Properties.SetStatus("Image is too large. Maximum size is 1.5 MB.");
      return;
    }

    const Reader = new FileReader();
    Reader.onload = () => {
      UpdateValue(String(Reader.result ?? ""));
      Properties.SetStatus(`${Properties.Field.Label} uploaded in draft. Use Save to persist it.`);
    };
    Reader.onerror = () => Properties.SetStatus("Image upload failed.");
    Reader.readAsDataURL(FileValue);
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <p className="font-bold text-slate-100">{Properties.Field.Label}</p>
      <p className="mt-1 text-xs text-slate-500">Paste an image URL or upload a PNG/JPG/WebP file. Uploaded images are stored with this plugin configuration.</p>
      <input
        className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
        onChange={(Event) => UpdateValue(Event.target.value)}
        placeholder="https://example.com/background.png"
        type="text"
        value={Properties.Value}
      />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500">
          Upload image
          <input accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(Event) => UploadFile(Event.target.files?.[0])} type="file" />
        </label>
        <button className="rounded-2xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800" onClick={() => UpdateValue("")} type="button">
          Clear
        </button>
      </div>
      {IsPreviewable ? <img alt="" className="mt-4 max-h-44 w-full rounded-2xl border border-slate-800 object-cover" src={Properties.Value} /> : null}
    </div>
  );
}

function ActionButton(Properties: {
  Field: SettingsField & { Value: unknown };
  GuildId: string;
  PluginId: string;
  SetStatus: (Status: string) => void;
}) {
  const [IsSending, SetIsSending] = UseState(false);

  async function SendAction(): Promise<void> {
    SetIsSending(true);
    Properties.SetStatus(`Sending ${Properties.Field.Label}...`);

    try {
      const Response = await fetch(`/api/plugins/${Properties.GuildId}/actions`, {
        method: "POST",
        headers: {
          ...BuildGuildHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          PluginId: Properties.PluginId,
          ActionKey: Properties.Field.ActionKey ?? Properties.Field.Key
        })
      });

      Properties.SetStatus(Response.ok ? `${Properties.Field.Label} queued.` : await Response.text());
    } finally {
      SetIsSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <p className="font-bold text-slate-100">{Properties.Field.Label}</p>
      <p className="mt-1 text-xs text-slate-500">Runs a dashboard action without changing saved settings.</p>
      <button
        className="mt-4 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={IsSending}
        onClick={() => void SendAction()}
        type="button"
      >
        {IsSending ? "Sending..." : Properties.Field.ButtonLabel ?? Properties.Field.Label}
      </button>
    </div>
  );
}

function ListField(Properties: {
  Field: SettingsField & { Value: unknown };
  OnCreateChannel: (Name: string) => Promise<string | null>;
  OnCreateRole: (Name: string, Color: string) => Promise<string | null>;
  PluginId: string;
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void;
  Value: unknown[];
}) {
  const BaseClassName = "w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500";

  function UpdateItem(Index: number, Value: unknown): void {
    const NextValue = [...Properties.Value];
    NextValue[Index] = Value;
    Properties.UpdateDraftValue(Properties.PluginId, Properties.Field.Key, NextValue);
  }

  function AddItem(): void {
    const EmptyValue = Properties.Field.ItemType === "Number" ? 0 : "";
    Properties.UpdateDraftValue(Properties.PluginId, Properties.Field.Key, [...Properties.Value, EmptyValue]);
  }

  function RemoveItem(Index: number): void {
    Properties.UpdateDraftValue(Properties.PluginId, Properties.Field.Key, Properties.Value.filter((_, ItemIndex) => ItemIndex !== Index));
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold text-slate-100">{Properties.Field.Label}</p>
          <p className="mt-1 text-xs text-slate-500">Add one value per row.</p>
        </div>
        <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500" onClick={AddItem} type="button">
          Add
        </button>
      </div>
      <div className="mt-4 grid gap-2">
        {Properties.Value.length === 0 ? <p className="rounded-xl border border-dashed border-slate-700 p-3 text-sm text-slate-500">No value configured.</p> : null}
        {Properties.Value.map((ItemValue, Index) => (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]" key={Index}>
            {Properties.Field.ItemType === "ChannelPicker" || Properties.Field.ItemType === "RolePicker" ? (
              <CustomSelect
                CreateButtonLabel={Properties.Field.ItemType === "ChannelPicker" ? "Create channel" : "Create role"}
                CreateColorEnabled={Properties.Field.ItemType !== "ChannelPicker"}
                CreateErrorMessage={Properties.Field.ItemType === "ChannelPicker" ? "Channel creation failed." : "Role creation failed."}
                CreateInputPlaceholder={Properties.Field.ItemType === "ChannelPicker" ? "channel-name" : "Role name"}
                CreateLabel={Properties.Field.ItemType === "ChannelPicker" ? "Create channel" : "Create role"}
                EmptyCreateError={Properties.Field.ItemType === "ChannelPicker" ? "Channel name is required." : "Role name is required."}
                EmptyLabel="Select"
                OnChange={(Value) => UpdateItem(Index, Value)}
                OnCreate={Properties.Field.ItemType === "RolePicker" ? Properties.OnCreateRole : Properties.Field.ItemType === "ChannelPicker" ? Properties.OnCreateChannel : undefined}
                Options={Properties.Field.Options ?? []}
                Value={String(ItemValue ?? "")}
              />
            ) : (
              <ValidatedListInput
                BaseClassName={BaseClassName}
                Field={Properties.Field}
                ItemValue={ItemValue}
                OnChange={(Value) => UpdateItem(Index, Value)}
              />
            )}
            <button className="rounded-xl border border-red-500/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10" onClick={() => RemoveItem(Index)} type="button">
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ValidatedListInput(Properties: {
  BaseClassName: string;
  Field: SettingsField & { Value: unknown };
  ItemValue: unknown;
  OnChange: (Value: unknown) => void;
}) {
  const StringValue = String(Properties.ItemValue ?? "");
  const RegexError = Properties.Field.ValidateAs === "Regex" ? GetRegexError(StringValue) : null;

  return (
    <div>
      <input
        className={`${Properties.BaseClassName} ${RegexError ? "border-red-500 text-red-100 focus:border-red-400" : ""}`}
        onChange={(Event) => Properties.OnChange(Properties.Field.ItemType === "Number" ? Number(Event.target.value) : Event.target.value)}
        type={Properties.Field.ItemType === "Number" ? "number" : "text"}
        value={StringValue}
      />
      {RegexError ? <p className="mt-1 text-xs font-semibold text-red-300">{RegexError}</p> : null}
    </div>
  );
}

function GetRegexError(Value: string): string | null {
  if (!Value.trim()) {
    return null;
  }

  try {
    new RegExp(Value, "iu");
    return null;
  } catch (ErrorValue) {
    return ErrorValue instanceof Error ? ErrorValue.message : "Invalid regex";
  }
}
