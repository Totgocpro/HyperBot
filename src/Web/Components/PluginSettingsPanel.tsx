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
  const [PluginMenuOpen, SetPluginMenuOpen] = UseState(false);
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
    const MissingRequiredField = Plugin.WebInterface.find((Field) => Field.Required && !DraftValues[Plugin.Metadata.Id]?.[Field.Key]);

    if (MissingRequiredField) {
      SetStatus(`${MissingRequiredField.Label} is required.`);
      return;
    }

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
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-slate-100 sm:px-6 sm:py-8">
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
          </aside>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/20 sm:p-6">
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
                  <button className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 sm:w-auto" onClick={() => void SavePlugin(SelectedPlugin)}>
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
        <select className={BaseClassName} required={Field.Required} onChange={(Event) => UpdateDraftValue(PluginId, Field.Key, Event.target.value)} value={String(Value ?? "")}>
          <option value="">{Field.Required ? "Select a required value" : "Select"}</option>
          {Field.Options?.map((Option) => (
            <option disabled={Option.Disabled} key={String(Option.Value)} value={String(Option.Value)}>
              {Option.Label}
            </option>
          ))}
        </select>
        {Field.Type === "ChannelPicker" ? <p className="mt-2 text-xs text-slate-500">Only supported writable channels can be selected.</p> : null}
      </label>
    );
  }

  if (Field.Type === "List") {
    return (
      <ListField
        Field={Field}
        PluginId={PluginId}
        UpdateDraftValue={UpdateDraftValue}
        Value={Array.isArray(Value) ? Value : []}
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

function ListField(Properties: {
  Field: SettingsField & { Value: unknown };
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
            {Properties.Field.ItemType === "ChannelPicker" ? (
              <select className={BaseClassName} onChange={(Event) => UpdateItem(Index, Event.target.value)} value={String(ItemValue ?? "")}>
                <option value="">Select</option>
                {Properties.Field.Options?.map((Option) => (
                  <option disabled={Option.Disabled} key={String(Option.Value)} value={String(Option.Value)}>
                    {Option.Label}
                  </option>
                ))}
              </select>
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
