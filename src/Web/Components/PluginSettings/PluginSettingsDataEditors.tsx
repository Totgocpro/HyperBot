"use client";

import { useEffect as UseEffect, useState as UseState } from "react";
import { CustomSelect } from "../CustomSelect";
import { BuildConfigSections, RenderField, type BotPreviewIdentity, type DashboardPlugin } from "../PluginInterfaceRenderer";
import type { DashboardElement } from "../../../Core/Types";
import type { BackupSummary, ChannelCounterDraft } from "./PluginSettingsTypes";
import { ParseEditableEmbed, type EditableEmbed } from "../PluginInterfaceRenderer";
import { AdvancedEmbedEditor, BuildGuildHeaders, CreateClientId, EmbedInputClassName, FormatChartValue, IsRecord, ParseChannelCounters, ParseSavedEmbeds } from "./PluginSettingsShared";

export function DashboardElementRenderer(Properties: { Element: DashboardElement & { Value: unknown } }) {
  const [SelectedMonth, SetSelectedMonth] = UseState(BuildCurrentMonth());
  const Series = BuildMonthlySeries(Properties.Element.Value, SelectedMonth);
  const Total = Series.reduce((TotalValue, Point) => TotalValue + Point.Value, 0);
  const Average = Series.length > 0 ? Total / Series.length : 0;

  if (Properties.Element.Type === "ActivityHeatmap") {
    return <ActivityHeatmap Element={Properties.Element} />;
  }

  if (Properties.Element.Type === "InviteLeaderboard") {
    return <InviteLeaderboard Element={Properties.Element} />;
  }

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


export function StatisticsEditor(Properties: {
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
  const Counters = ParseChannelCounters(Values.ChannelCounters);
  const CounterField = Properties.Plugin.WebInterface.find((Field) => Field.Key === "ChannelCounters");
  const GenericFields = Properties.Plugin.WebInterface.filter((Field) => Field.Key !== "ChannelCounters");
  const ConfigSections = BuildConfigSections({ ...Properties.Plugin, WebInterface: GenericFields }, Values, true);

  function SetValue(Key: string, Value: unknown): void {
    Properties.UpdateDraftValue(PluginId, Key, Value);
  }

  function SetCounters(NextCounters: ChannelCounterDraft[]): void {
    SetValue("ChannelCounters", NextCounters);
  }

  function AddCounter(): void {
    SetCounters([
      ...Counters,
      {
        Id: CreateClientId(),
        Enabled: true,
        ChannelId: "",
        Template: "Members: %members_count%"
      }
    ]);
    Properties.SetStatus("Channel counter added in draft. Use Save to persist it.");
  }

  function UpdateCounter(CounterId: string, Patch: Partial<ChannelCounterDraft>): void {
    SetCounters(Counters.map((Counter) => Counter.Id === CounterId ? { ...Counter, ...Patch } : Counter));
  }

  function RemoveCounter(CounterId: string): void {
    SetCounters(Counters.filter((Counter) => Counter.Id !== CounterId));
  }

  return (
    <section className="scroll-mt-28 rounded-[2rem] border border-slate-800 bg-slate-950/40 p-4 sm:p-5" id="plugin-section-statistics">
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Statistics</p>
        <h3 className="mt-2 text-2xl font-black text-white">Tracking and channel counters</h3>
      </div>

      <div className="grid gap-5">
        {Properties.Plugin.DashboardElements?.length ? (
          <section className="scroll-mt-28 rounded-3xl border border-slate-800 bg-slate-950 p-4" id="plugin-section-overview">
            <div className="grid gap-4">
              {Properties.Plugin.DashboardElements.map((Element) => (
                <DashboardElementRenderer Element={Element} key={Element.Key} />
              ))}
            </div>
          </section>
        ) : null}

        {ConfigSections.map((Section) => (
          <section className="scroll-mt-28 rounded-3xl border border-slate-800 bg-slate-950 p-4" id={`plugin-section-${Section.Id}`} key={Section.Id}>
            <h4 className="text-xl font-black text-white">{Section.Label}</h4>
            <div className="mt-4 grid gap-4">
              {Section.Fields.map((Field) => (
                <div key={Field.Key}>{RenderField(Properties.BotId, Properties.GuildId, PluginId, Field, Properties.DraftValues, Properties.UpdateDraftValue, Properties.SetStatus, async () => null, Properties.OnCreateChannel, Properties.BotIdentity)}</div>
              ))}
            </div>
          </section>
        ))}

        <section className="scroll-mt-28 rounded-3xl border border-slate-800 bg-slate-950 p-4" id="plugin-section-channel-counters">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-xl font-black text-white">Channel counters</h4>
              <p className="mt-1 text-sm text-slate-500">Voice channels are locked automatically. Leave the channel empty to let the bot create it.</p>
            </div>
            <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500" onClick={AddCounter} type="button">
              Add counter
            </button>
          </div>

          <p className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
            Tags: %members_count%, %humans_count%, %bots_count%, %online_count%, %voice_count%, %channels_count%, %roles_count%, %boosts_count%.
          </p>

          <div className="mt-4 grid gap-4">
            {Counters.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No channel counter configured.</p> : null}
            {Counters.map((Counter) => (
              <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4" key={Counter.Id}>
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_150px]">
                  <label className="block text-sm font-bold text-slate-200">
                    Channel name template
                    <input className={EmbedInputClassName} onChange={(Event) => UpdateCounter(Counter.Id, { Template: Event.target.value })} value={Counter.Template} />
                  </label>
                  <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
                    Existing voice channel
                    <CustomSelect
                      ClassName="mt-2"
                      CreateButtonLabel="Create channel"
                      CreateColorEnabled={false}
                      CreateErrorMessage="Channel creation failed."
                      CreateInputPlaceholder="counter-channel"
                      CreateLabel="Create channel"
                      EmptyCreateError="Channel name is required."
                      EmptyLabel="Auto-create channel"
                      OnChange={(ChannelId) => UpdateCounter(Counter.Id, { ChannelId })}
                      OnCreate={Properties.OnCreateChannel}
                      Options={CounterField?.Options ?? []}
                      Value={Counter.ChannelId}
                    />
                  </div>
                  <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 font-semibold text-slate-100">
                    Enabled
                    <input checked={Counter.Enabled} className="h-5 w-5 accent-blue-600" onChange={(Event) => UpdateCounter(Counter.Id, { Enabled: Event.target.checked })} type="checkbox" />
                  </label>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">Current channel ID: {Counter.ChannelId || "Will be created after Save and next bot tick."}</p>
                  <button className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-500" onClick={() => RemoveCounter(Counter.Id)} type="button">
                    Delete counter
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


export function SendEmbedEditor(Properties: {
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
      const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/actions`, {
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
                  OnChange={SetChannelId}
                  OnCreate={Properties.OnCreateChannel}
                  Options={ChannelField?.Options ?? []}
                  Value={String(Values.SendChannelId ?? "")}
                />
              </div>
            </div>
          </section>

          <AdvancedEmbedEditor
            BotId={Properties.BotId}
            BotIdentity={Properties.BotIdentity}
            EmbedValue={CurrentEmbed}
            GuildId={Properties.GuildId}
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


export function BackupsManager(Properties: {
  BotId: string;
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
    const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/backups`, {
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
      const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/actions`, {
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
      const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/backups`, {
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
    window.open(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/backups?backupId=${encodeURIComponent(BackupId)}`, "_blank", "noopener,noreferrer");
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
              <div
                className={`rounded-3xl border p-4 text-left transition ${
                  SelectedBackup?.Id === Backup.Id ? "border-blue-500 bg-blue-500/10" : "border-slate-800 bg-slate-950 hover:border-slate-700"
                }`}
                key={Backup.Id}
                onClick={() => SetSelectedBackupId(Backup.Id)}
                onKeyDown={(Event) => {
                  if (Event.key === "Enter" || Event.key === " ") {
                    Event.preventDefault();
                    SetSelectedBackupId(Backup.Id);
                  }
                }}
                role="button"
                tabIndex={0}
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
              </div>
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

function ActivityHeatmap(Properties: { Element: DashboardElement & { Value: unknown } }) {
  const [HoveredCell, SetHoveredCell] = UseState<ActivityHeatmapCell | null>(null);
  const Cells = BuildActivityHeatmapCells(Properties.Element.Value);
  const MaxValue = Math.max(...Cells.map((Cell) => Cell.Value), 0);
  const Total = Cells.reduce((TotalValue, Cell) => TotalValue + Cell.Value, 0);
  const ActiveSlots = Cells.filter((Cell) => Cell.Value > 0).length;
  const BestCell = Cells.reduce<ActivityHeatmapCell | null>((BestValue, Cell) => (!BestValue || Cell.Value > BestValue.Value ? Cell : BestValue), null);
  const DisplayCell = HoveredCell ?? BestCell;

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">{Properties.Element.Label}</h3>
          <p className="mt-1 text-sm text-slate-500">Weekly pattern by server local day and hour.</p>
        </div>
        <div className="grid gap-2 text-left sm:text-right">
          <p className="text-sm font-bold text-blue-200">
            Peak: {BestCell && BestCell.Value > 0 ? `${BestCell.DayLabel} ${FormatHourRange(BestCell.Hour)}` : "No activity yet"}
          </p>
          <p className="text-xs text-slate-500">
            Total: {FormatChartValue(Total, Properties.Element.Unit)} | Active slots: {ActiveSlots}/168
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[880px]">
          <div className="grid grid-cols-[76px_repeat(24,minmax(26px,1fr))] gap-1">
            <div />
            {Array.from({ length: 24 }, (_, Hour) => (
              <div className="h-6 text-center text-[10px] font-bold text-slate-500" key={Hour}>
                {Hour % 2 === 0 ? String(Hour).padStart(2, "0") : ""}
              </div>
            ))}
            {ActivityHeatmapDayLabels.map((DayLabel, DayIndex) => (
              <ActivityHeatmapRow
                Cells={Cells.filter((Cell) => Cell.DayIndex === DayIndex)}
                DayLabel={DayLabel}
                key={DayLabel}
                MaxValue={MaxValue}
                OnHover={SetHoveredCell}
                Unit={Properties.Element.Unit}
              />
            ))}
          </div>
        </div>
      </div>

      {DisplayCell && DisplayCell.Value > 0 ? (
        <p className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
          {HoveredCell ? "Selected" : "Best"} slot: <span className="font-bold text-white">{DisplayCell.DayLabel} {FormatHourRange(DisplayCell.Hour)}</span> with{" "}
          <span className="font-bold text-blue-200">{FormatChartValue(DisplayCell.Value, Properties.Element.Unit)}</span>.
        </p>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No hourly activity has been tracked yet.</p>
      )}
    </section>
  );
}

function InviteLeaderboard(Properties: { Element: DashboardElement & { Value: unknown } }) {
  const Rows = BuildInviteLeaderboardRows(Properties.Element.Value).slice(0, 10);
  const TotalRegular = Rows.reduce((TotalValue, Row) => TotalValue + Row.Regular, 0);
  const TotalFake = Rows.reduce((TotalValue, Row) => TotalValue + Row.Fake, 0);
  const TotalLeaves = Rows.reduce((TotalValue, Row) => TotalValue + Row.Leaves, 0);

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">{Properties.Element.Label}</h3>
          <p className="mt-1 text-sm text-slate-500">Top inviters tracked from Discord invite usage.</p>
        </div>
        <p className="text-xs text-slate-500">
          Regular: {TotalRegular.toLocaleString()} | Fake: {TotalFake.toLocaleString()} | Left: {TotalLeaves.toLocaleString()}
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        {Rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No invite stats tracked yet.</p>
        ) : (
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">Regular</th>
                <th className="px-3 py-2 text-right">Fake</th>
                <th className="px-3 py-2 text-right">Left</th>
                <th className="px-3 py-2 text-right">Bonus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {Rows.map((Row, Index) => (
                <tr className="text-slate-200" key={Row.UserId}>
                  <td className="px-3 py-3 font-black text-white">#{Index + 1}</td>
                  <td className="px-3 py-3 font-semibold">{Row.UserId}</td>
                  <td className="px-3 py-3 text-right font-black text-blue-200">{Row.Score.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">{Row.Regular.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">{Row.Fake.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">{Row.Leaves.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">{Row.Bonus.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

type InviteLeaderboardRow = {
  Bonus: number;
  Fake: number;
  Leaves: number;
  Regular: number;
  Score: number;
  UserId: string;
};

function BuildInviteLeaderboardRows(Value: unknown): InviteLeaderboardRow[] {
  const Data = IsRecord(Value) ? Value : {};

  return Object.entries(Data)
    .filter((Entry): Entry is [string, Record<string, unknown>] => IsRecord(Entry[1]))
    .map(([UserId, Row]) => {
      const Regular = GetNumberRecordValue(Row, "Regular");
      const Bonus = GetNumberRecordValue(Row, "Bonus");
      const Leaves = GetNumberRecordValue(Row, "Leaves");

      return {
        Bonus,
        Fake: GetNumberRecordValue(Row, "Fake"),
        Leaves,
        Regular,
        Score: Regular + Bonus - Leaves,
        UserId
      };
    })
    .filter((Row) => Row.Score !== 0 || Row.Regular > 0 || Row.Fake > 0 || Row.Leaves > 0)
    .sort((FirstRow, SecondRow) => SecondRow.Score - FirstRow.Score || SecondRow.Regular - FirstRow.Regular || FirstRow.Leaves - SecondRow.Leaves);
}

function GetNumberRecordValue(Value: Record<string, unknown>, Key: string): number {
  return typeof Value[Key] === "number" ? Value[Key] : 0;
}

function ActivityHeatmapRow(Properties: {
  Cells: ActivityHeatmapCell[];
  DayLabel: string;
  MaxValue: number;
  OnHover: (Cell: ActivityHeatmapCell | null) => void;
  Unit?: string;
}) {
  return (
    <>
      <div className="flex h-7 items-center pr-2 text-xs font-bold text-slate-400">{Properties.DayLabel}</div>
      {Properties.Cells.map((Cell) => {
        const Intensity = Properties.MaxValue > 0 ? Cell.Value / Properties.MaxValue : 0;
        const BackgroundColor = BuildHeatmapColor(Intensity);

        return (
          <button
            aria-label={`${Cell.DayLabel} ${FormatHourRange(Cell.Hour)}: ${FormatChartValue(Cell.Value, Properties.Unit)}`}
            className="h-7 rounded-md border border-slate-800 transition-colors hover:border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
            key={Cell.Key}
            onBlur={() => Properties.OnHover(null)}
            onFocus={() => Properties.OnHover(Cell)}
            onMouseEnter={() => Properties.OnHover(Cell)}
            onMouseLeave={() => Properties.OnHover(null)}
            style={{ backgroundColor: BackgroundColor }}
            title={`${Cell.DayLabel} ${FormatHourRange(Cell.Hour)}: ${FormatChartValue(Cell.Value, Properties.Unit)}`}
            type="button"
          />
        );
      })}
    </>
  );
}

type ActivityHeatmapCell = {
  DayIndex: number;
  DayLabel: string;
  Hour: number;
  Key: string;
  Value: number;
};

const ActivityHeatmapDayLabels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function BuildActivityHeatmapCells(Value: unknown): ActivityHeatmapCell[] {
  const Data = IsRecord(Value) ? Value : {};

  return ActivityHeatmapDayLabels.flatMap((DayLabel, DayIndex) =>
    Array.from({ length: 24 }, (_, Hour) => {
      const Key = `${DayIndex}:${Hour}`;
      const RawValue = Data[Key];

      return {
        DayIndex,
        DayLabel,
        Hour,
        Key,
        Value: typeof RawValue === "number" ? RawValue : 0
      };
    })
  );
}

function BuildHeatmapColor(Intensity: number): string {
  if (Intensity <= 0) {
    return "rgb(15 23 42)";
  }

  if (Intensity < 0.2) {
    return "rgb(30 64 175)";
  }

  if (Intensity < 0.45) {
    return "rgb(37 99 235)";
  }

  if (Intensity < 0.7) {
    return "rgb(14 165 233)";
  }

  return "rgb(125 211 252)";
}

function FormatHourRange(Hour: number): string {
  return `${String(Hour).padStart(2, "0")}:00-${String((Hour + 1) % 24).padStart(2, "0")}:00`;
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
