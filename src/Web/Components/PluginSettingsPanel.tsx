"use client";

import Link from "next/link";
import { useEffect as UseEffect, useRef as UseRef, useState as UseState } from "react";
import type { BotGuildSummary } from "../../Core/Types";
import {
  BuildConfigSections,
  IsFieldVisible,
  AnimatedVisibility,
  RenderField,
  type DashboardPlugin,
  type BotPreviewIdentity
} from "./PluginInterfaceRenderer";
import { BuildGuildHeaders } from "./PluginSettings/PluginSettingsShared";
import { BackupsManager, DashboardElementRenderer, SendEmbedEditor, StatisticsEditor } from "./PluginSettings/PluginSettingsDataEditors";
import { BuildDraftValues, BuildPersistablePluginValues, BuildPluginDraftValues, HasPluginUnsavedChanges, PluginHamburgerIcon, ScrollToPluginSection, UpdatePluginSavedValues } from "./PluginSettings/PluginSettingsState";
import { CustomCommandsEditor, NotificationsEditor, RemindersEditor } from "./PluginSettings/PluginSettingsWorkflowEditors";
import { EmojiAdderEditor } from "./PluginSettingsCustom/EmojiAdderEditor";
import type { SaveFeedback } from "./PluginSettings/PluginSettingsTypes";

type PluginSettingsPanelProperties = {
  BotId: string;
  GuildId: string;
};



export function PluginSettingsPanel(Properties: PluginSettingsPanelProperties) {
  const [Plugins, SetPlugins] = UseState<DashboardPlugin[]>([]);
  const [Guilds, SetGuilds] = UseState<BotGuildSummary[]>([]);
  const [Guild, SetGuild] = UseState<BotGuildSummary | null>(null);
  const [BotIdentity, SetBotIdentity] = UseState<BotPreviewIdentity | null>(null);
  const [SelectedPluginId, SetSelectedPluginId] = UseState("");
  const [PluginMenuOpen, SetPluginMenuOpen] = UseState(false);
  const [MobileDrawerOpen, SetMobileDrawerOpen] = UseState(false);
  const [SectionMenuOpen, SetSectionMenuOpen] = UseState(true);
  const [DraftValues, SetDraftValues] = UseState<Record<string, Record<string, unknown>>>({});
  const [Status, SetStatus] = UseState("Loading plugins...");
  const [SavingPluginId, SetSavingPluginId] = UseState("");
  const [SaveFeedbackValue, SetSaveFeedbackValue] = UseState<SaveFeedback | null>(null);
  const [BlockedPluginId, SetBlockedPluginId] = UseState("");
  const SaveFeedbackTimeout = UseRef<number | null>(null);

  const SelectedPlugin = Plugins.find((Plugin) => Plugin.Metadata.Id === SelectedPluginId) ?? Plugins[0];
  const SelectedPluginDraftValues = SelectedPlugin ? DraftValues[SelectedPlugin.Metadata.Id] ?? {} : {};
  const ConfigSections = SelectedPlugin ? BuildConfigSections(SelectedPlugin) : [];
  const VisibleConfigSections = SelectedPlugin ? BuildConfigSections(SelectedPlugin, SelectedPluginDraftValues, true) : [];
  const HasDashboardOverview = Boolean(SelectedPlugin?.DashboardElements?.length);
  const SelectedPluginHasUnsavedChanges = SelectedPlugin ? HasPluginUnsavedChanges(SelectedPlugin, DraftValues) : false;
  const PluginCategoryGroups = BuildPluginCategoryGroups(Plugins);

  UseEffect(() => {
    void LoadPlugins();
    void LoadGuild();
    void LoadBotIdentity();

    const RefreshInterval = window.setInterval(() => {
      void LoadPlugins(true);
    }, 5_000);

    return () => window.clearInterval(RefreshInterval);
  }, [Properties.BotId, Properties.GuildId]);

  UseEffect(() => {
    return () => {
      if (SaveFeedbackTimeout.current) {
        window.clearTimeout(SaveFeedbackTimeout.current);
      }
    };
  }, []);

  async function LoadGuild(): Promise<void> {
    const Response = await fetch(`/api/guilds?botId=${Properties.BotId}`);

    if (!Response.ok) {
      return;
    }

    const Payload = (await Response.json()) as { Guilds: BotGuildSummary[] };
    SetGuilds(Payload.Guilds);
    SetGuild(Payload.Guilds.find((GuildValue) => GuildValue.Id === Properties.GuildId) ?? null);
  }

  async function LoadBotIdentity(): Promise<void> {
    const Response = await fetch(`/api/bots/${Properties.BotId}`);

    if (!Response.ok) {
      SetBotIdentity(null);
      return;
    }

    const Payload = (await Response.json()) as BotPreviewIdentity;
    SetBotIdentity({
      Name: Payload.Name,
      AvatarUrl: Payload.AvatarUrl
    });
  }

  async function LoadPlugins(PreserveDraftValues = false): Promise<void> {
    const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}`, {
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
    const PersistableValues = BuildPersistablePluginValues(Plugin, PluginDraftValues);

    try {
      const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}`, {
        method: "PUT",
        headers: {
          ...BuildGuildHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          PluginId: Plugin.Metadata.Id,
          Values: PersistableValues
        })
      });

      if (Response.ok) {
        const Message = "Settings saved successfully.";

        SetPlugins((PreviousPlugins) => UpdatePluginSavedValues(PreviousPlugins, Plugin.Metadata.Id, PersistableValues));
        SetBlockedPluginId("");
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
    const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/roles`, {
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
    const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/channels`, {
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

  function SelectPlugin(PluginId: string): void {
    if (PluginId === SelectedPlugin?.Metadata.Id) {
      SetPluginMenuOpen(false);
      SetSectionMenuOpen(true);
      return;
    }

    if (SelectedPlugin && HasPluginUnsavedChanges(SelectedPlugin, DraftValues)) {
      SetBlockedPluginId(PluginId);
      SetStatus("Save or cancel your changes before changing plugin.");
      ShowSaveFeedback("Save or cancel your changes before changing plugin.", "Error");
      return;
    }

    SetBlockedPluginId("");
    SetSelectedPluginId(PluginId);
    SetPluginMenuOpen(false);
    SetMobileDrawerOpen(false);
    SetSectionMenuOpen(true);
  }

  function ResetSelectedPluginDraft(): void {
    if (!SelectedPlugin) {
      return;
    }

    SetDraftValues((PreviousValues) => ({
      ...PreviousValues,
      [SelectedPlugin.Metadata.Id]: BuildPluginDraftValues(SelectedPlugin)
    }));
    SetBlockedPluginId("");
    SetStatus(`${SelectedPlugin.Metadata.DisplayName} changes cancelled.`);
  }

  return (
    <main className={`min-h-screen bg-slate-950 px-0 py-0 text-slate-100 lg:px-6 lg:py-8 ${SelectedPluginHasUnsavedChanges ? "pb-32 lg:pb-28" : ""}`}>
      {SaveFeedbackValue ? <SaveFeedbackToast Feedback={SaveFeedbackValue} /> : null}
      {MobileDrawerOpen ? (
        <MobileDashboardDrawer
          BlockedPluginId={BlockedPluginId}
          BotId={Properties.BotId}
          BotIdentity={BotIdentity}
          Guild={Guild}
          GuildId={Properties.GuildId}
          Guilds={Guilds}
          OnClose={() => SetMobileDrawerOpen(false)}
          OnRefresh={() => void LoadPlugins()}
          OnSelectPlugin={SelectPlugin}
          PluginCategoryGroups={PluginCategoryGroups}
          SelectedPlugin={SelectedPlugin}
          SelectedPluginHasUnsavedChanges={SelectedPluginHasUnsavedChanges}
          Status={Status}
        />
      ) : null}
      <div className="mx-auto max-w-7xl">
        <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/95 px-3 py-3 backdrop-blur lg:hidden">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-slate-500">{Guild?.Name ?? "Discord server"}</p>
            <h1 className="truncate text-lg font-black text-white">{SelectedPlugin?.Metadata.DisplayName ?? "Plugins"}</h1>
          </div>
          <button
            aria-expanded={MobileDrawerOpen}
            aria-label="Open dashboard menu"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-lg shadow-black/20"
            onClick={() => SetMobileDrawerOpen(true)}
            type="button"
          >
            <PluginHamburgerIcon />
          </button>
        </div>

        <header className="mb-6 hidden flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/20 sm:p-5 md:flex-row md:items-center md:justify-between lg:flex">
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

        <div className="grid min-w-0 gap-0 lg:grid-cols-[280px_1fr] lg:gap-6">
          <aside className="hidden rounded-3xl border border-slate-800 bg-slate-900 p-3 shadow-xl shadow-black/20 sm:p-4 lg:block">
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
              {PluginCategoryGroups.map((Group) => (
                <div className="grid gap-2" key={Group.Category}>
                  <p className="px-2 pt-2 text-[0.7rem] font-black uppercase tracking-[0.22em] text-slate-500">{Group.Category}</p>
                  {Group.Plugins.map((Plugin) => (
                    <button
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                        BlockedPluginId === Plugin.Metadata.Id
                          ? "border border-red-500/70 bg-red-950/60 text-red-100 shadow-lg shadow-red-950/30"
                          : SelectedPlugin?.Metadata.Id === Plugin.Metadata.Id
                            ? SelectedPluginHasUnsavedChanges
                              ? "border border-red-500/70 bg-red-950/50 text-white"
                              : "bg-blue-600 text-white"
                            : "text-slate-300 hover:bg-slate-800"
                      }`}
                      key={Plugin.Metadata.Id}
                      onClick={() => SelectPlugin(Plugin.Metadata.Id)}
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
                  {VisibleConfigSections.map((Section) => (
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

          <section className="min-h-[calc(100vh-7rem)] min-w-0 overflow-x-hidden border-slate-800 bg-slate-950 p-3 shadow-black/20 lg:min-h-0 lg:rounded-3xl lg:border lg:bg-slate-900 lg:p-6 lg:shadow-xl">
            {/* <p className="mb-5 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">{Status}</p> */}

            {SelectedPlugin ? (
              <>
                <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 lg:flex-row lg:items-center lg:justify-between lg:pb-5">
                  <div>
                    <h2 className="hidden text-2xl font-black text-white lg:block">{SelectedPlugin.Metadata.DisplayName}</h2>
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
                    className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70 lg:w-auto"
                    disabled={SavingPluginId === SelectedPlugin.Metadata.Id}
                    onClick={() => void SavePlugin(SelectedPlugin)}
                  >
                    {SavingPluginId === SelectedPlugin.Metadata.Id ? "Saving..." : "Save"}
                  </button>
                </div>

                <div className="mt-4 grid min-w-0 gap-4 lg:mt-6 lg:gap-5">
                  {SelectedPlugin.DependencyErrors?.length ? (
                    <div className="rounded-3xl border border-red-500/40 bg-red-950/50 p-4 text-sm font-bold text-red-100">
                      {SelectedPlugin.DependencyErrors.join(" ")}
                    </div>
                  ) : null}
                  {SelectedPlugin.Metadata.Id === "SendEmbed" ? (
                    <SendEmbedEditor
                      BotIdentity={BotIdentity}
                      BotId={Properties.BotId}
                      DraftValues={DraftValues}
                      GuildId={Properties.GuildId}
                      OnCreateChannel={CreateChannel}
                      Plugin={SelectedPlugin}
                      SetStatus={SetStatus}
                      UpdateDraftValue={UpdateDraftValue}
                    />
                  ) : SelectedPlugin.Metadata.Id === "EmojiAdder" ? (
                    <EmojiAdderEditor
                      BotId={Properties.BotId}
                      DraftValues={DraftValues}
                      GuildId={Properties.GuildId}
                      Plugin={SelectedPlugin}
                      SetStatus={SetStatus}
                    />
                  ) : SelectedPlugin.Metadata.Id === "Backups" ? (
                    <BackupsManager
                      BotId={Properties.BotId}
                      DraftValues={DraftValues}
                      GuildId={Properties.GuildId}
                      Plugin={SelectedPlugin}
                      SetStatus={SetStatus}
                      UpdateDraftValue={UpdateDraftValue}
                    />
                  ) : SelectedPlugin.Metadata.Id === "CustomCommands" ? (
                    <CustomCommandsEditor
                      BotIdentity={BotIdentity}
                      BotId={Properties.BotId}
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
                      BotIdentity={BotIdentity}
                      BotId={Properties.BotId}
                      DraftValues={DraftValues}
                      GuildId={Properties.GuildId}
                      OnCreateChannel={CreateChannel}
                      Plugin={SelectedPlugin}
                      SetStatus={SetStatus}
                      UpdateDraftValue={UpdateDraftValue}
                    />
                  ) : SelectedPlugin.Metadata.Id === "Notifications" ? (
                    <NotificationsEditor
                      BotIdentity={BotIdentity}
                      BotId={Properties.BotId}
                      DraftValues={DraftValues}
                      GuildId={Properties.GuildId}
                      OnCreateChannel={CreateChannel}
                      Plugin={SelectedPlugin}
                      SetStatus={SetStatus}
                      UpdateDraftValue={UpdateDraftValue}
                    />
                  ) : SelectedPlugin.Metadata.Id === "Statistics" ? (
                    <StatisticsEditor
                      BotIdentity={BotIdentity}
                      BotId={Properties.BotId}
                      DraftValues={DraftValues}
                      GuildId={Properties.GuildId}
                      OnCreateChannel={CreateChannel}
                      Plugin={SelectedPlugin}
                      SetStatus={SetStatus}
                      UpdateDraftValue={UpdateDraftValue}
                    />
                  ) : (
                    <>
                  {SelectedPlugin.DashboardElements?.length ? (
                    <section className="scroll-mt-28 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 lg:rounded-[2rem] lg:bg-slate-950/40 lg:p-5" id="plugin-section-overview">
                      <div className="mb-4">
                        <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Overview</p>
                        <h3 className="mt-2 text-xl font-black text-white lg:text-2xl">Plugin dashboard</h3>
                      </div>
                      <div className="grid gap-4">
                        {SelectedPlugin.DashboardElements.map((Element) => (
                          <DashboardElementRenderer Element={Element} key={Element.Key} />
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {ConfigSections.map((Section) => {
                    const SectionVisible = Section.Fields.some((Field) => IsFieldVisible(Field, SelectedPluginDraftValues));

                    return (
                      <AnimatedVisibility
                        ClassName="scroll-mt-28"
                        Id={`plugin-section-${Section.Id}`}
                        IsVisible={SectionVisible}
                        key={Section.Id}
                      >
                        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 lg:rounded-[2rem] lg:bg-slate-950/40 lg:p-5">
                          <div className="mb-4">
                            <p className="hidden text-xs font-bold uppercase tracking-[0.3em] text-blue-300 lg:block">Configuration</p>
                            <h3 className="text-lg font-black text-white lg:mt-2 lg:text-2xl">{Section.Label}</h3>
                          </div>
                          <div className="grid gap-4">
                            {Section.Fields.map((Field) => (
                              <AnimatedVisibility IsVisible={IsFieldVisible(Field, SelectedPluginDraftValues)} key={Field.Key}>
                                {RenderField(Properties.BotId, Properties.GuildId, SelectedPlugin.Metadata.Id, Field, DraftValues, UpdateDraftValue, SetStatus, CreateRole, CreateChannel, BotIdentity)}
                              </AnimatedVisibility>
                            ))}
                          </div>
                        </section>
                      </AnimatedVisibility>
                    );
                  })}
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
      {SelectedPlugin && SelectedPluginHasUnsavedChanges ? (
        <UnsavedChangesBar
          IsSaving={SavingPluginId === SelectedPlugin.Metadata.Id}
          OnCancel={ResetSelectedPluginDraft}
          OnSave={() => void SavePlugin(SelectedPlugin)}
          PluginName={SelectedPlugin.Metadata.DisplayName}
        />
      ) : null}
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

function UnsavedChangesBar(Properties: {
  IsSaving: boolean;
  OnCancel: () => void;
  OnSave: () => void;
  PluginName: string;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] px-3 pb-3 sm:px-6 sm:pb-5">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 rounded-2xl border border-red-500/60 bg-slate-950 p-3 shadow-2xl shadow-black/60 ring-1 ring-red-500/20 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <p className="text-sm font-black text-white">Unsaved changes</p>
          <p className="mt-1 text-sm text-slate-400">
            Save or cancel your changes in {Properties.PluginName} before changing plugin.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button
            className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={Properties.IsSaving}
            onClick={Properties.OnCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={Properties.IsSaving}
            onClick={Properties.OnSave}
            type="button"
          >
            {Properties.IsSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileDashboardDrawer(Properties: {
  BlockedPluginId: string;
  BotId: string;
  BotIdentity: BotPreviewIdentity | null;
  Guild: BotGuildSummary | null;
  GuildId: string;
  Guilds: BotGuildSummary[];
  OnClose: () => void;
  OnRefresh: () => void;
  OnSelectPlugin: (PluginId: string) => void;
  PluginCategoryGroups: Array<{ Category: string; Plugins: DashboardPlugin[] }>;
  SelectedPlugin: DashboardPlugin | undefined;
  SelectedPluginHasUnsavedChanges: boolean;
  Status: string;
}) {
  return (
    <div className="fixed inset-0 z-[80] lg:hidden">
      <button aria-label="Close dashboard menu" className="hyperbot-mobile-menu-backdrop absolute inset-0 bg-black/70" onClick={Properties.OnClose} type="button" />
      <aside className="hyperbot-mobile-menu-panel absolute inset-y-0 right-0 flex w-[min(92vw,24rem)] flex-col border-l border-slate-800 bg-slate-950 text-slate-100 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Dashboard</p>
            <h2 className="truncate text-lg font-black text-white">Server menu</h2>
          </div>
          <button className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200" onClick={Properties.OnClose} type="button">
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-600 text-lg font-black text-white">
                {Properties.Guild?.Icon ? <img alt="" className="h-12 w-12 object-cover" src={Properties.Guild.Icon} /> : (Properties.Guild?.Name ?? "S").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-black text-white">{Properties.Guild?.Name ?? "Discord server"}</p>
                <p className="mt-1 text-sm text-slate-400">{Properties.Guild?.MemberCount ?? "?"} members</p>
                <p className="mt-1 break-all text-xs text-slate-500">Guild ID: {Properties.GuildId}</p>
              </div>
            </div>
            {Properties.BotIdentity ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
                {Properties.BotIdentity.AvatarUrl ? <img alt="" className="h-7 w-7 rounded-lg object-cover" src={Properties.BotIdentity.AvatarUrl} /> : null}
                <span className="min-w-0 truncate text-sm font-bold text-slate-200">{Properties.BotIdentity.Name}</span>
              </div>
            ) : null}
            <p className="mt-3 text-xs text-slate-500">{Properties.Status}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link className="rounded-xl border border-slate-700 px-3 py-2 text-center text-sm font-bold text-slate-200" href="/" onClick={Properties.OnClose}>
                Servers
              </Link>
              <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white" onClick={Properties.OnRefresh} type="button">
                Refresh
              </button>
            </div>
          </section>

          <section className="mt-4">
            <p className="px-1 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Switch server</p>
            <div className="mt-2 grid gap-2">
              {Properties.Guilds.map((GuildValue) => (
                <Link
                  className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left ${
                    GuildValue.Id === Properties.GuildId ? "border-blue-500 bg-blue-600 text-white" : "border-slate-800 bg-slate-900 text-slate-300"
                  }`}
                  href={`/dashboard/${Properties.BotId}/${GuildValue.Id}`}
                  key={GuildValue.Id}
                  onClick={Properties.OnClose}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10 text-sm font-black">
                    {GuildValue.Icon ? <img alt="" className="h-9 w-9 object-cover" src={GuildValue.Icon} /> : GuildValue.Name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black">{GuildValue.Name}</span>
                    <span className={GuildValue.Id === Properties.GuildId ? "text-xs text-blue-100" : "text-xs text-slate-500"}>{GuildValue.MemberCount ?? "?"} members</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-5">
            <p className="px-1 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Plugins</p>
            <div className="mt-2 grid gap-3">
              {Properties.PluginCategoryGroups.map((Group) => (
                <div className="grid gap-2" key={Group.Category}>
                  <p className="px-1 pt-2 text-[0.7rem] font-black uppercase tracking-[0.22em] text-slate-600">{Group.Category}</p>
                  {Group.Plugins.map((Plugin) => {
                    const IsSelected = Properties.SelectedPlugin?.Metadata.Id === Plugin.Metadata.Id;
                    const IsBlocked = Properties.BlockedPluginId === Plugin.Metadata.Id;

                    return (
                      <button
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left ${
                          IsBlocked
                            ? "border-red-500 bg-red-950 text-red-100"
                            : IsSelected
                              ? Properties.SelectedPluginHasUnsavedChanges
                                ? "border-red-500 bg-red-950/70 text-white"
                                : "border-blue-500 bg-blue-600 text-white"
                              : "border-slate-800 bg-slate-900 text-slate-300"
                        }`}
                        key={Plugin.Metadata.Id}
                        onClick={() => Properties.OnSelectPlugin(Plugin.Metadata.Id)}
                        type="button"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-black">
                          {Plugin.Metadata.Icon.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{Plugin.Metadata.DisplayName}</span>
                          <span className={IsSelected ? "text-xs text-blue-100" : "text-xs text-slate-500"}>{Plugin.Commands.length} command(s)</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function BuildPluginCategoryGroups(Plugins: DashboardPlugin[]): Array<{ Category: string; Plugins: DashboardPlugin[] }> {
  const Groups = new Map<string, DashboardPlugin[]>();

  for (const Plugin of Plugins) {
    const Category = NormalizePluginCategory(Plugin.Category);
    Groups.set(Category, [...(Groups.get(Category) ?? []), Plugin]);
  }

  return Array.from(Groups.entries()).map(([Category, GroupPlugins]) => ({
    Category,
    Plugins: GroupPlugins
  }));
}

function NormalizePluginCategory(Category: string | undefined): string {
  return Category?.trim() || "General";
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
