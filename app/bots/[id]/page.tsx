"use client";

import { useEffect, useState, use } from "react";
import { AppShell } from "@/src/Web/Components/AppShell";
import { CustomSelect } from "@/src/Web/Components/CustomSelect";
import type { SettingsField } from "@/src/Core/Types";
import { BuildConfigSections, RenderField, type DashboardPlugin, IsFieldVisible, AnimatedVisibility } from "@/src/Web/Components/PluginInterfaceRenderer";

type Bot = {
  Id: string;
  Name: string;
  ClientId: string;
  Token: string;
  IsEnabled: boolean;
};

type User = {
    Role: string;
};

type AdminCommand = {
  Name: string;
  Description: string;
  PluginId: string;
  PluginName: string;
};

type CommandAliasDraft = {
  AliasName: string;
  TargetCommandName: string;
  Description: string;
  Enabled: boolean;
};

export default function BotSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [Bot, SetBot] = useState<Bot | null>(null);
  const [User, SetUser] = useState<User | null>(null);
  const [Plugins, SetPlugins] = useState<DashboardPlugin[]>([]);
  const [ManageablePlugins, SetManageablePlugins] = useState<any[]>([]);
  const [AvailableCommands, SetAvailableCommands] = useState<AdminCommand[]>([]);
  const [SelectedGlobalPluginId, SetSelectedGlobalPluginId] = useState("");
  const [DraftValues, SetDraftValues] = useState<Record<string, Record<string, unknown>>>({});
  const [Loading, SetLoading] = useState(true);
  const [Status, SetStatus] = useState("");
  const [BotConfig, SetBotConfig] = useState({ ClientId: "", Token: "" });
  const [SavingPluginId, SetSavingPluginId] = useState("");

  useEffect(() => {
    void LoadData();
  }, [id]);

  async function LoadData() {
    const [BotsRes, PluginsRes, AdminPluginsRes, UserRes] = await Promise.all([
        fetch("/api/bots"),
        fetch(`/api/plugins/${id}/Global`),
        fetch(`/api/admin/plugins?botId=${id}`),
        fetch("/api/auth/me")
    ]);

    if (BotsRes.ok && PluginsRes.ok && AdminPluginsRes.ok && UserRes.ok) {
      const Bots = await BotsRes.json();
      const CurrentBot = Bots.find((b: Bot) => b.Id === id);
      SetBot(CurrentBot);
      SetBotConfig({ ClientId: CurrentBot.ClientId, Token: CurrentBot.Token });

      const AdminPluginsData = await AdminPluginsRes.json();
      SetManageablePlugins(AdminPluginsData.ManageablePlugins || []);
      SetAvailableCommands(AdminPluginsData.Commands || []);
      
      const PluginsData = await PluginsRes.json();
      const GlobalPlugins = PluginsData.Plugins || [];
      SetPlugins(GlobalPlugins);
      if (GlobalPlugins.length > 0 && !SelectedGlobalPluginId) {
          SetSelectedGlobalPluginId(GlobalPlugins[0].Metadata.Id);
      }

      const drafts: Record<string, Record<string, unknown>> = {};
      GlobalPlugins.forEach((p: DashboardPlugin) => {
          drafts[p.Metadata.Id] = Object.fromEntries(p.WebInterface.map(f => [f.Key, f.Value ?? f.Default]));
      });
      SetDraftValues(drafts);

      const userPayload = await UserRes.json();
      SetUser(userPayload.User);
    }
    SetLoading(false);
  }

  function UpdateDraftValue(PluginId: string, Key: string, Value: unknown): void {
    SetDraftValues((prev) => ({
        ...prev,
        [PluginId]: {
            ...(prev[PluginId] ?? {}),
            [Key]: Value
        }
    }));
  }

  async function ControlPlugin(PluginId: string, Action: "Enable" | "Disable" | "Reload") {
    const Response = await fetch(`/api/admin/plugins?botId=${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ PluginId, Action })
    });
    if (Response.ok) {
      SetStatus(`${PluginId} ${Action.toLowerCase()} queued.`);
      setTimeout(LoadData, 1000);
    }
  }

  async function SaveGlobalPlugin(Plugin: DashboardPlugin): Promise<void> {
    const PluginDraftValues = DraftValues[Plugin.Metadata.Id] ?? {};
    
    // CommandAliases special validation if needed
    if (Plugin.Metadata.Id === "CommandAliases") {
        const Aliases = ParseCommandAliases(PluginDraftValues.Aliases);
        const InvalidAlias = Aliases.find(a => GetAliasNameError(a.AliasName));
        if (InvalidAlias) {
            SetStatus(`Invalid alias name: ${InvalidAlias.AliasName}`);
            return;
        }
    } else {
        const MissingRequiredField = Plugin.WebInterface.find((Field) => Field.Required && IsFieldVisible(Field, PluginDraftValues) && !PluginDraftValues[Field.Key]);
        if (MissingRequiredField) {
            SetStatus(`${MissingRequiredField.Label} is required.`);
            return;
        }
    }

    SetSavingPluginIdValue(Plugin.Metadata.Id);

    try {
        const Response = await fetch(`/api/plugins/${id}/Global`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            PluginId: Plugin.Metadata.Id,
            Values: PluginDraftValues
        })
        });
        if (Response.ok) {
            SetStatus("Settings saved.");
            void LoadData();
        } else {
            SetStatus(await Response.text());
        }
    } finally {
        SetSavingPluginIdValue("");
    }
  }

  function SetSavingPluginIdValue(PluginId: string): void {
      SetSavingPluginId(PluginId);
  }

  async function UpdateBotConfig() {
      const Response = await fetch(`/api/bots/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(BotConfig)
      });
      if (Response.ok) {
          SetStatus("Bot configuration updated.");
          void LoadData();
      }
  }

  const SelectedGlobalPlugin = Plugins.find(p => p.Metadata.Id === SelectedGlobalPluginId);
  const SelectedPluginDraftValues = SelectedGlobalPlugin ? DraftValues[SelectedGlobalPlugin.Metadata.Id] ?? {} : {};
  const ConfigSections = SelectedGlobalPlugin ? BuildConfigSections(SelectedGlobalPlugin, SelectedPluginDraftValues) : [];

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl p-6">
        <div className="flex items-center justify-between mb-8">
            <div>
                <h1 className="text-3xl font-black text-white">{Bot?.Name || "Bot Settings"}</h1>
                <p className="text-slate-400">Manage plugins and global configuration for this bot.</p>
            </div>
            {Status && <p className="px-4 py-2 rounded-xl bg-blue-600/20 text-blue-400 font-bold animate-pulse">{Status}</p>}
        </div>

        {Loading ? (
             <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
             </div>
        ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
          <div className="space-y-8">
            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="mb-6 text-xl font-bold text-white">Global Configuration</h2>
                <div className="grid gap-6 md:grid-cols-[200px_1fr]">
                    <div className="space-y-2">
                        {Plugins.map(p => (
                            <button
                                key={p.Metadata.Id}
                                onClick={() => SetSelectedGlobalPluginId(p.Metadata.Id)}
                                className={`w-full text-left px-4 py-3 rounded-xl font-bold transition ${SelectedGlobalPluginId === p.Metadata.Id ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800"}`}
                            >
                                {p.Metadata.DisplayName}
                            </button>
                        ))}
                    </div>
                    <div className="p-1 rounded-2xl bg-slate-950 border border-slate-800">
                        {SelectedGlobalPlugin ? (
                            <div className="flex flex-col h-full">
                                <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-white">{SelectedGlobalPlugin.Metadata.DisplayName}</h3>
                                    <button
                                        disabled={SavingPluginId === SelectedGlobalPlugin.Metadata.Id}
                                        onClick={() => SaveGlobalPlugin(SelectedGlobalPlugin)}
                                        className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-50"
                                    >
                                        {SavingPluginId === SelectedGlobalPlugin.Metadata.Id ? "Saving..." : "Save"}
                                    </button>
                                </div>
                                <div className="p-6 overflow-y-auto max-h-[800px] space-y-8 pb-80">
                                    {SelectedGlobalPlugin.Metadata.Id === "CommandAliases" ? (
                                        <CommandAliasesEditor
                                            Aliases={ParseCommandAliases(SelectedPluginDraftValues.Aliases)}
                                            AvailableCommands={AvailableCommands}
                                            OnChange={(Aliases) => UpdateDraftValue("CommandAliases", "Aliases", Aliases)}
                                        />
                                    ) : (
                                        ConfigSections.map(section => {
                                            const SectionVisible = section.Fields.some((Field) => IsFieldVisible(Field, SelectedPluginDraftValues));
                                            return (
                                                <AnimatedVisibility
                                                    Id={`section-${section.Id}`}
                                                    IsVisible={SectionVisible}
                                                    key={section.Id}
                                                >
                                                    <div key={section.Id}>
                                                        <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400 mb-4">{section.Label}</h4>
                                                        <div className="grid gap-4">
                                                            {section.Fields.map(field => (
                                                                <AnimatedVisibility IsVisible={IsFieldVisible(field, SelectedPluginDraftValues)} key={field.Key}>
                                                                    {RenderField(
                                                                        id,
                                                                        "Global",
                                                                        SelectedGlobalPlugin.Metadata.Id,
                                                                        field,
                                                                        DraftValues,
                                                                        UpdateDraftValue,
                                                                        SetStatus,
                                                                        async () => null,
                                                                        async () => null
                                                                    )}
                                                                </AnimatedVisibility>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </AnimatedVisibility>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        ) : <p className="text-slate-500 text-center py-10">Select a plugin to configure</p>}
                    </div>
                </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="mb-6 text-xl font-bold text-white">Bot Plugins</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {ManageablePlugins.map((Plugin) => (
                        <div key={Plugin.Metadata.Id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                            <h3 className="font-bold text-white">{Plugin.Metadata.DisplayName}</h3>
                            <p className="text-xs text-slate-500">{Plugin.Metadata.Id} | {Plugin.Scope}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-black ${Plugin.Disabled ? "bg-red-500/15 text-red-200" : "bg-emerald-500/15 text-emerald-200"}`}>
                            {Plugin.Disabled ? "Disabled" : "Enabled"}
                            </span>
                        </div>
                        <div className="mt-4 flex gap-2">
                            {Plugin.Scope !== "Global" && (
                                <button
                                    onClick={() => ControlPlugin(Plugin.Metadata.Id, Plugin.Disabled ? "Enable" : "Disable")}
                                    className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold transition ${Plugin.Disabled ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-red-600 text-white hover:bg-red-500"}`}
                                >
                                    {Plugin.Disabled ? "Enable" : "Disable"}
                                </button>
                            )}
                            <button
                                onClick={() => ControlPlugin(Plugin.Metadata.Id, "Reload")}
                                className="flex-1 rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800 transition"
                            >
                                Reload
                            </button>
                        </div>
                        </div>
                    ))}
                </div>
            </section>
          </div>

          <div className="space-y-8">
            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="mb-6 text-xl font-bold text-white">Credentials</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-2">Client ID</label>
                        <input
                            type="text"
                            value={BotConfig.ClientId}
                            onChange={e => SetBotConfig({ ...BotConfig, ClientId: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white outline-none focus:border-blue-500 font-mono text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-2">Bot Token</label>
                        <input
                            type="password"
                            value={BotConfig.Token}
                            onChange={e => SetBotConfig({ ...BotConfig, Token: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white outline-none focus:border-blue-500 font-mono text-sm"
                        />
                    </div>
                    <button
                        onClick={UpdateBotConfig}
                        className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition"
                    >
                        Update Credentials
                    </button>
                    <p className="text-xs text-slate-500 italic">Changing the token will re-fetch the bot's name and avatar from Discord.</p>
                </div>
            </section>

            <section className="rounded-3xl border border-red-900/30 bg-red-950/10 p-6">
                <h2 className="mb-4 text-xl font-bold text-red-500">Danger Zone</h2>
                <p className="text-sm text-slate-400 mb-6">Once you delete a bot, there is no going back. All its configurations will be permanently removed.</p>
                <button
                    onClick={() => {
                        if (confirm("Are you sure? This will remove all configuration for this bot.")) {
                            fetch(`/api/bots/${id}`, { method: "DELETE" }).then(() => window.location.href = "/bots");
                        }
                    }}
                    className="w-full py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition"
                >
                    Delete Bot
                </button>
            </section>
          </div>
        </div>
        )}
      </main>
    </AppShell>
  );
}

function CommandAliasesEditor(Properties: {
  Aliases: CommandAliasDraft[];
  AvailableCommands: AdminCommand[];
  OnChange: (Aliases: CommandAliasDraft[]) => void;
}) {
  const EmbedInputClassName = "mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-blue-500";

  function AddAlias(): void {
    Properties.OnChange([
      ...Properties.Aliases,
      {
        AliasName: "",
        TargetCommandName: Properties.AvailableCommands[0]?.Name ?? "",
        Description: "",
        Enabled: true
      }
    ]);
  }

  function UpdateAlias(Index: number, Patch: Partial<CommandAliasDraft>): void {
    Properties.OnChange(Properties.Aliases.map((Alias, AliasIndex) => (AliasIndex === Index ? { ...Alias, ...Patch } : Alias)));
  }

  function RemoveAlias(Index: number): void {
    Properties.OnChange(Properties.Aliases.filter((_, AliasIndex) => AliasIndex !== Index));
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h4 className="text-xl font-black text-white">Slash command aliases</h4>
          <p className="mt-1 text-sm text-slate-500">Aliases are registered as Discord slash commands and copy options from the target command.</p>
        </div>
        <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500" onClick={AddAlias} type="button">
          Add alias
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        {Properties.AvailableCommands.length === 0 ? (
          <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">
            No base slash command found. Add a plugin command before creating aliases.
          </p>
        ) : null}
        {Properties.Aliases.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No alias configured.</p> : null}
        {Properties.Aliases.map((Alias, Index) => {
          const AliasError = GetAliasNameError(Alias.AliasName);

          return (
            <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4" key={Index}>
              <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
                <label className="block text-sm font-bold text-slate-200">
                  Alias command
                  <input
                    className={`mt-2 w-full rounded-2xl border bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-blue-500 ${AliasError ? "border-red-500" : "border-slate-700"}`}
                    onChange={(Event) => UpdateAlias(Index, { AliasName: Event.target.value.toLowerCase() })}
                    placeholder="ex: sanction"
                    value={Alias.AliasName}
                  />
                  {AliasError ? <span className="mt-1 block text-xs font-semibold text-red-300">{AliasError}</span> : null}
                </label>
                <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
                  Target command
                  <CustomSelect
                    ClassName="mt-2"
                    EmptyLabel="Select command"
                    OnChange={(Value) => UpdateAlias(Index, { TargetCommandName: Value })}
                    Options={Properties.AvailableCommands.map((Command) => ({
                      Label: `/${Command.Name} - ${Command.PluginName}`,
                      Value: Command.Name
                    }))}
                    Value={Alias.TargetCommandName}
                  />
                </div>
              </div>
              <label className="block text-sm font-bold text-slate-200">
                Alias description
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                  maxLength={100}
                  onChange={(Event) => UpdateAlias(Index, { Description: Event.target.value })}
                  placeholder="Leave empty to use Alias for /target"
                  value={Alias.Description}
                />
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <input checked={Alias.Enabled} className="h-5 w-5 accent-blue-600" onChange={(Event) => UpdateAlias(Index, { Enabled: Event.target.checked })} type="checkbox" />
                  Enabled
                </label>
                <button className="rounded-xl border border-red-500/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10" onClick={() => RemoveAlias(Index)} type="button">
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ParseCommandAliases(Value: unknown): CommandAliasDraft[] {
  if (!Array.isArray(Value)) {
    return [];
  }

  return Value.filter(IsCommandAliasDraft).map((Alias) => ({
    AliasName: Alias.AliasName,
    TargetCommandName: Alias.TargetCommandName,
    Description: Alias.Description,
    Enabled: Alias.Enabled
  }));
}

function IsCommandAliasDraft(Value: unknown): Value is CommandAliasDraft {
  if (typeof Value !== "object" || Value === null || Array.isArray(Value)) {
    return false;
  }

  const RecordValue = Value as Record<string, unknown>;
  return (
    typeof RecordValue.AliasName === "string" &&
    typeof RecordValue.TargetCommandName === "string" &&
    typeof RecordValue.Description === "string" &&
    typeof RecordValue.Enabled === "boolean"
  );
}

function GetAliasNameError(Value: string): string | null {
  if (!Value.trim()) {
    return "Alias name is required.";
  }

  if (!/^[a-z0-9_-]{1,32}$/u.test(Value)) {
    return "Use 1-32 lowercase characters, numbers, underscore, or dash.";
  }

  return null;
}
