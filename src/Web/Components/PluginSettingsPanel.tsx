"use client";

import Link from "next/link";
import { useEffect as UseEffect, useState as UseState } from "react";
import type { BotGuildSummary, SettingsField } from "../../Core/Types";

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
  WebInterface: Array<SettingsField & { Value: unknown }>;
};

type PluginSettingsPanelProperties = {
  GuildId: string;
};

export function PluginSettingsPanel(Properties: PluginSettingsPanelProperties) {
  const [Plugins, SetPlugins] = UseState<DashboardPlugin[]>([]);
  const [Guild, SetGuild] = UseState<BotGuildSummary | null>(null);
  const [SelectedPluginId, SetSelectedPluginId] = UseState("");
  const [DraftValues, SetDraftValues] = UseState<Record<string, Record<string, unknown>>>({});
  const [Status, SetStatus] = UseState("Loading plugins...");

  const SelectedPlugin = Plugins.find((Plugin) => Plugin.Metadata.Id === SelectedPluginId) ?? Plugins[0];

  UseEffect(() => {
    void LoadPlugins();
    void LoadGuild();
  }, [Properties.GuildId]);

  async function LoadGuild(): Promise<void> {
    const Response = await fetch("/api/guilds");

    if (!Response.ok) {
      return;
    }

    const Payload = (await Response.json()) as { Guilds: BotGuildSummary[] };
    SetGuild(Payload.Guilds.find((GuildValue) => GuildValue.Id === Properties.GuildId) ?? null);
  }

  async function LoadPlugins(): Promise<void> {
    const Response = await fetch(`/api/plugins/${Properties.GuildId}`, {
      headers: BuildGuildHeaders()
    });

    if (!Response.ok) {
      SetStatus(await Response.text());
      return;
    }

    const Payload = (await Response.json()) as { Plugins: DashboardPlugin[] };
    SetPlugins(Payload.Plugins);
    SetSelectedPluginId(Payload.Plugins[0]?.Metadata.Id ?? "");
    SetDraftValues(BuildDraftValues(Payload.Plugins));
    SetStatus(`${Payload.Plugins.length} plugin(s) available.`);
  }

  async function SavePlugin(Plugin: DashboardPlugin): Promise<void> {
    const Response = await fetch(`/api/plugins/${Properties.GuildId}`, {
      method: "PUT",
      headers: {
        ...BuildGuildHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        PluginId: Plugin.Metadata.Id,
        Values: DraftValues[Plugin.Metadata.Id] ?? {}
      })
    });

    SetStatus(Response.ok ? `${Plugin.Metadata.DisplayName} saved.` : await Response.text());
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
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-black/20 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-600 text-2xl font-black text-white">
              {Guild?.Icon ? <img alt="" className="h-16 w-16 rounded-3xl" src={Guild.Icon} /> : (Guild?.Name ?? "S").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <Link className="text-sm font-semibold text-blue-400" href="/">
                Back to servers
              </Link>
              <h1 className="mt-2 text-3xl font-black text-white">{Guild?.Name ?? "Discord server"}</h1>
              <p className="mt-1 text-sm text-slate-400">
                {Guild?.MemberCount ?? "?"} members | Guild ID: {Properties.GuildId}
              </p>
            </div>
          </div>
          <button className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500" onClick={() => void LoadPlugins()}>
            Refresh
          </button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/20">
            <p className="px-2 text-xs font-bold uppercase tracking-wide text-slate-500">Plugins</p>
            <div className="mt-3 space-y-2">
              {Plugins.map((Plugin) => (
                <button
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    SelectedPlugin?.Metadata.Id === Plugin.Metadata.Id ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
                  }`}
                  key={Plugin.Metadata.Id}
                  onClick={() => SetSelectedPluginId(Plugin.Metadata.Id)}
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
          </aside>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/20">
            <p className="mb-5 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">{Status}</p>

            {SelectedPlugin ? (
              <>
                <div className="flex flex-col gap-3 border-b border-slate-800 pb-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-white">{SelectedPlugin.Metadata.DisplayName}</h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Version {SelectedPlugin.Metadata.Version} by {SelectedPlugin.Metadata.Author}
                    </p>
                  </div>
                  <button className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500" onClick={() => void SavePlugin(SelectedPlugin)}>
                    Save
                  </button>
                </div>

                <div className="mt-6 grid gap-4">
                  {SelectedPlugin.WebInterface.map((Field) => (
                    <div key={Field.Key}>{RenderField(SelectedPlugin.Metadata.Id, Field, DraftValues, UpdateDraftValue)}</div>
                  ))}
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

function BuildGuildHeaders(): HeadersInit {
  return {};
}

function BuildDraftValues(Plugins: DashboardPlugin[]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Plugins.map((Plugin) => [
      Plugin.Metadata.Id,
      Object.fromEntries(Plugin.WebInterface.map((Field) => [Field.Key, Field.Value ?? Field.Default]))
    ])
  );
}

function RenderField(
  PluginId: string,
  Field: SettingsField & { Value: unknown },
  DraftValues: Record<string, Record<string, unknown>>,
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void
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

  if (Field.Type === "Select" || Field.Type === "ChannelPicker") {
    return (
      <label className="block text-sm font-bold text-slate-200">
        {Field.Label}
        <select className={BaseClassName} onChange={(Event) => UpdateDraftValue(PluginId, Field.Key, Event.target.value)} value={String(Value ?? "")}>
          <option value="">Select</option>
          {Field.Options?.map((Option) => (
            <option key={String(Option.Value)} value={String(Option.Value)}>
              {Option.Label}
            </option>
          ))}
        </select>
      </label>
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
