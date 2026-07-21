"use client";

import { useEffect as UseEffect, useRef as UseRef, useState as UseState, type Ref } from "react";
import type { HealthReport, SettingsField } from "../../Core/Types";
import { CustomSelect } from "./CustomSelect";
import { PluginIcon } from "./PluginIcon";

type AdminSection = "GeneralStatus" | "ConfigTransfer" | "UserManagement" | "CustomPlugins" | "AuditLogs";

type DashboardUserRow = {
  Id: string;
  DiscordId: string;
  Username: string;
  DisplayName: string;
  Role: "SuperAdmin" | "User";
  IsDashboardBanned: boolean;
  BotAccesses: { BotId: string }[];
};

type BotRow = {
  Id: string;
  Name: string;
};

type AdminGuildRow = {
  GuildId: string;
  Name: string;
  IsBotPresent: boolean;
  IsBanned: boolean;
};

type GuildGrantRow = {
  BotId: string;
  GuildId: string;
  DiscordId: string;
  Role: "GuildAdmin" | "GuildOwner";
  AllowedPluginIds: unknown;
};

type GrantPlugin = {
  Id: string;
  DisplayName: string;
  Category?: string;
};

type BotAccessScope = {
  BotId: string;
  Guilds: AdminGuildRow[];
  Plugins: GrantPlugin[];
  Grants: GuildGrantRow[];
};

type CustomPluginRow = {
  Id: string;
  DisplayName: string;
  Version: string;
  Author: string;
  Description: string;
  Category: string;
  Icon: string;
};

type AuditLogRow = {
  Id: string;
  BotId: string | null;
  ActorId: string;
  ActorDisplayName: string | null;
  Action: string;
  Target: string;
  Metadata: unknown;
  CreatedAt: string;
};

type AuditLogFilters = {
  Search: string;
  Action: string;
  ActorId: string;
  Target: string;
  BotId: string;
  IpAddress: string;
  From: string;
  To: string;
  Limit: string;
};

type UserForm = {
  Username: string;
  Password: string;
  DiscordId: string;
  DisplayName: string;
  Role: "User" | "SuperAdmin";
  IsDashboardBanned: boolean;
  AllowedBotIds: string[];
  GuildPluginAccess: Record<string, Record<string, string[]>>;
};

const EmptyUserForm: UserForm = {
  Username: "",
  Password: "",
  DiscordId: "",
  DisplayName: "",
  Role: "User",
  IsDashboardBanned: false,
  AllowedBotIds: [],
  GuildPluginAccess: {}
};

const DefaultAuditLogFilters: AuditLogFilters = {
  Search: "",
  Action: "",
  ActorId: "",
  Target: "",
  BotId: "",
  IpAddress: "",
  From: "",
  To: "",
  Limit: "100"
};

const AdminSections: Array<{ Id: AdminSection; Label: string; Description: string }> = [
  { Id: "GeneralStatus", Label: "General and status", Description: "Instance health and quick metrics." },
  { Id: "ConfigTransfer", Label: "Config export/import", Description: "Move every saved configuration as JSON." },
  { Id: "UserManagement", Label: "User Management", Description: "Accounts, roles, bans, and access." },
  { Id: "CustomPlugins", Label: "Custom Plugins", Description: "Import, manage, and delete custom plugins." },
  { Id: "AuditLogs", Label: "Logs", Description: "Audit trail, login IPs, and filters." }
];

export function SuperAdminPanel() {
  const [ActiveSection, SetActiveSection] = UseState<AdminSection>("GeneralStatus");
  const [MobileAdminMenuOpen, SetMobileAdminMenuOpen] = UseState(false);
  const [Health, SetHealth] = UseState<HealthReport | null>(null);
  const [Users, SetUsers] = UseState<DashboardUserRow[]>([]);
  const [Bots, SetBots] = UseState<BotRow[]>([]);
  const [BotAccessScopes, SetBotAccessScopes] = UseState<BotAccessScope[]>([]);
  const [AuditLogs, SetAuditLogs] = UseState<AuditLogRow[]>([]);
  const [AuditLogFiltersValue, SetAuditLogFiltersValue] = UseState<AuditLogFilters>(DefaultAuditLogFilters);
  const [AuditLogTotal, SetAuditLogTotal] = UseState(0);
  const [CurrentUserDiscordId, SetCurrentUserDiscordId] = UseState("");
  const [CreateUserForm, SetCreateUserForm] = UseState<UserForm>(EmptyUserForm);
  const [IsCreateUserOpen, SetIsCreateUserOpen] = UseState(false);
  const [SelectedUserDiscordId, SetSelectedUserDiscordId] = UseState("");
  const [EditUserForm, SetEditUserForm] = UseState<UserForm>(EmptyUserForm);
  const [ImportReplaceExisting, SetImportReplaceExisting] = UseState(false);
  const [ImportFileName, SetImportFileName] = UseState("");
  const [Status, SetStatus] = UseState("Loading admin panel...");
  const [CustomPlugins, SetCustomPlugins] = UseState<CustomPluginRow[]>([]);
  const [CustomPluginDeleteId, SetCustomPluginDeleteId] = UseState("");
  const ImportInputRef = UseRef<HTMLInputElement | null>(null);
  const CustomPluginImportRef = UseRef<HTMLInputElement | null>(null);
  const SelectedUser = Users.find((User) => User.DiscordId === SelectedUserDiscordId) ?? Users[0];

  UseEffect(() => {
    void LoadAdminData();
  }, []);

  UseEffect(() => {
    if (ActiveSection === "AuditLogs") {
      void LoadAuditLogs();
    }

    if (ActiveSection === "CustomPlugins") {
      void LoadCustomPlugins();
    }
  }, [ActiveSection]);

  UseEffect(() => {
    if (!SelectedUser) {
      SetSelectedUserDiscordId("");
      SetEditUserForm(EmptyUserForm);
      return;
    }

    SetSelectedUserDiscordId(SelectedUser.DiscordId);
    SetEditUserForm({
      Username: SelectedUser.Username,
      Password: "",
      DiscordId: SelectedUser.DiscordId,
      DisplayName: SelectedUser.DisplayName,
      Role: SelectedUser.Role,
      IsDashboardBanned: SelectedUser.IsDashboardBanned,
      AllowedBotIds: SelectedUser.BotAccesses.map(a => a.BotId),
      GuildPluginAccess: BuildUserGuildPluginAccess(SelectedUser.DiscordId, BotAccessScopes)
    });
  }, [SelectedUser?.DiscordId, Users, BotAccessScopes]);

  async function LoadAdminData(): Promise<void> {
    try {
      const HealthResponse = await fetch("/api/admin/health");
      const UsersResponse = await fetch("/api/admin/users");
      const CurrentUserResponse = await fetch("/api/auth/me");
      const BotsResponse = await fetch("/api/bots");

      if (!HealthResponse.ok || !UsersResponse.ok || !CurrentUserResponse.ok || !BotsResponse.ok) {
        SetStatus(await ReadFirstError([HealthResponse, UsersResponse, CurrentUserResponse, BotsResponse]));
        return;
      }

      const UsersPayload = ((await UsersResponse.json()) as { Users: DashboardUserRow[] }).Users;
      const CurrentUserPayload = (await CurrentUserResponse.json()) as { User: DashboardUserRow };
      const BotsPayload = (await BotsResponse.json()) as BotRow[];
      const AccessScopes = await FetchBotAccessScopes(BotsPayload);

      SetHealth((await HealthResponse.json()) as HealthReport);
      SetCurrentUserDiscordId(CurrentUserPayload.User.DiscordId);
      SetUsers(UsersPayload);
      SetBots(BotsPayload);
      SetBotAccessScopes(AccessScopes);
      SetSelectedUserDiscordId((PreviousDiscordId) => PreviousDiscordId || UsersPayload[0]?.DiscordId || "");
      SetStatus("Admin data loaded.");
    } catch (ErrorValue) {
      SetStatus(ErrorValue instanceof Error ? ErrorValue.message : "Admin data loading failed.");
    }
  }

  async function LoadCustomPlugins(): Promise<void> {
    try {
      const Response = await fetch("/api/admin/custom-plugins");

      if (!Response.ok) {
        SetStatus(await Response.text());
        return;
      }

      const Payload = (await Response.json()) as { Plugins: CustomPluginRow[] };
      SetCustomPlugins(Payload.Plugins);
    } catch (ErrorValue) {
      SetStatus(ErrorValue instanceof Error ? ErrorValue.message : "Failed to load custom plugins.");
    }
  }

  async function ImportCustomPlugin(FileValue: File | null): Promise<void> {
    if (!FileValue) {
      return;
    }

    const UploadForm = new FormData();
    UploadForm.append("plugin", FileValue);

    try {
      const Response = await fetch("/api/admin/custom-plugins", {
        method: "POST",
        body: UploadForm
      });

      SetStatus(Response.ok ? "Plugin imported." : await Response.text());
      await LoadCustomPlugins();
    } catch (ErrorValue) {
      SetStatus(ErrorValue instanceof Error ? ErrorValue.message : "Import failed.");
    } finally {
      if (CustomPluginImportRef.current) {
        CustomPluginImportRef.current.value = "";
      }
    }
  }

  async function DeleteCustomPlugin(PluginId: string): Promise<void> {
    try {
      const Response = await fetch(`/api/admin/custom-plugins?pluginId=${encodeURIComponent(PluginId)}`, {
        method: "DELETE"
      });

      SetStatus(Response.ok ? "Plugin deleted." : await Response.text());
      SetCustomPluginDeleteId("");
      await LoadCustomPlugins();
    } catch (ErrorValue) {
      SetStatus(ErrorValue instanceof Error ? ErrorValue.message : "Delete failed.");
    }
  }

  async function LoadAuditLogs(Filters: AuditLogFilters = AuditLogFiltersValue): Promise<void> {
    try {
      const Query = new URLSearchParams();
      const FilterEntries: Array<[keyof AuditLogFilters, string]> = [
        ["Search", "search"],
        ["Action", "action"],
        ["ActorId", "actorId"],
        ["Target", "target"],
        ["BotId", "botId"],
        ["IpAddress", "ipAddress"],
        ["From", "from"],
        ["To", "to"],
        ["Limit", "limit"]
      ];

      for (const [FilterKey, QueryKey] of FilterEntries) {
        const Value = Filters[FilterKey].trim();

        if (Value) {
          Query.set(QueryKey, Value);
        }
      }

      const Response = await fetch(`/api/admin/logs?${Query.toString()}`);

      if (!Response.ok) {
        SetStatus(await Response.text());
        return;
      }

      const Payload = (await Response.json()) as { Logs: AuditLogRow[]; Total: number; Limit: number };
      SetAuditLogs(Payload.Logs);
      SetAuditLogTotal(Payload.Total);
      SetStatus(`Logs loaded (${Payload.Logs.length}/${Payload.Total}).`);
    } catch (ErrorValue) {
      SetStatus(ErrorValue instanceof Error ? ErrorValue.message : "Log loading failed.");
    }
  }

  async function CreateUser(): Promise<void> {
    const Username = CreateUserForm.Username.trim();
    const Password = CreateUserForm.Password;

    if (!Username) {
      SetStatus("Login is required.");
      return;
    }

    if (Password.length < 8) {
      SetStatus("Password must contain at least 8 characters.");
      return;
    }

    const Response = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...CreateUserForm,
        Username
      })
    });

    if (!Response.ok) {
      SetStatus(await Response.text());
      return;
    }

    const CreatedUser = ((await Response.json()) as { User: DashboardUserRow }).User;

    try {
      await SyncUserGuildPluginAccess(CreatedUser.DiscordId, CreateUserForm.AllowedBotIds, CreateUserForm.GuildPluginAccess);
    } catch (ErrorValue) {
      SetStatus(ErrorValue instanceof Error ? ErrorValue.message : "User created, but access grants could not be saved.");
      await LoadAdminData();
      return;
    }

    SetCreateUserForm(EmptyUserForm);
    SetIsCreateUserOpen(false);
    SetSelectedUserDiscordId(CreatedUser.DiscordId);
    SetStatus("User created.");
    await LoadAdminData();
  }

  async function SaveUser(): Promise<void> {
    if (!EditUserForm.DiscordId) {
      SetStatus("Select a user first.");
      return;
    }

    const Response = await PatchUser({
      DiscordId: EditUserForm.DiscordId,
      DisplayName: EditUserForm.DisplayName,
      Role: EditUserForm.Role,
      IsDashboardBanned: EditUserForm.IsDashboardBanned,
      Password: EditUserForm.Password || undefined,
      AllowedBotIds: EditUserForm.AllowedBotIds
    });

    if (!Response.ok) {
      SetStatus(await Response.text());
      return;
    }

    try {
      await SyncUserGuildPluginAccess(EditUserForm.DiscordId, EditUserForm.AllowedBotIds, EditUserForm.GuildPluginAccess);
    } catch (ErrorValue) {
      SetStatus(ErrorValue instanceof Error ? ErrorValue.message : "User updated, but access grants could not be saved.");
      await LoadAdminData();
      return;
    }

    SetStatus("User updated.");
    await LoadAdminData();
  }

  async function DeleteUser(User: DashboardUserRow): Promise<void> {
    const Response = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ DiscordId: User.DiscordId })
    });

    SetStatus(Response.ok ? "User deleted." : await Response.text());
    SetSelectedUserDiscordId("");
    await LoadAdminData();
  }

  async function ResetUserSessions(User: DashboardUserRow): Promise<void> {
    const Response = await fetch("/api/admin/security", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        DiscordId: User.DiscordId,
        Action: "ResetSessions"
      })
    });

    SetStatus(Response.ok ? "User sessions reset." : await Response.text());
  }

  async function SyncUserGuildPluginAccess(DiscordId: string, AllowedBotIds: string[], GuildPluginAccess: UserForm["GuildPluginAccess"]): Promise<void> {
    const AllowedBotIdSet = new Set(AllowedBotIds);

    for (const Scope of BotAccessScopes) {
      const DesiredGuildAccess = AllowedBotIdSet.has(Scope.BotId) ? GuildPluginAccess[Scope.BotId] ?? {} : {};
      const DesiredGuildIds = new Set(Object.keys(DesiredGuildAccess));
      const ExistingGrants = Scope.Grants.filter((Grant) => Grant.DiscordId === DiscordId);

      for (const ExistingGrant of ExistingGrants) {
        if (!DesiredGuildIds.has(ExistingGrant.GuildId)) {
          const Response = await fetch(`/api/admin/grants?botId=${Scope.BotId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ GuildId: ExistingGrant.GuildId, DiscordId })
          });

          if (!Response.ok) {
            throw new Error(await Response.text());
          }
        }
      }

      for (const [GuildId, AllowedPluginIds] of Object.entries(DesiredGuildAccess)) {
        const Response = await fetch(`/api/admin/grants?botId=${Scope.BotId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ GuildId, DiscordId, AllowedPluginIds })
        });

        if (!Response.ok) {
          throw new Error(await Response.text());
        }
      }
    }
  }

  async function ExportConfigs(): Promise<void> {
    const Response = await fetch("/api/admin/configs");

    if (!Response.ok) {
      SetStatus(await Response.text());
      return;
    }

    const BlobValue = await Response.blob();
    const DownloadUrl = window.URL.createObjectURL(BlobValue);
    const DownloadLink = document.createElement("a");
    const HeaderFileName = Response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/u)?.[1];

    DownloadLink.href = DownloadUrl;
    DownloadLink.download = HeaderFileName ?? `hyperbot-configs-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(DownloadLink);
    DownloadLink.click();
    DownloadLink.remove();
    window.URL.revokeObjectURL(DownloadUrl);
    SetStatus("Configuration export downloaded.");
  }

  async function ImportConfigs(FileValue: File | null): Promise<void> {
    if (!FileValue) {
      return;
    }

    SetImportFileName(FileValue.name);

    try {
      const RawText = await FileValue.text();
      const ParsedExport = JSON.parse(RawText) as unknown;
      const Response = await fetch("/api/admin/configs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          Export: ParsedExport,
          ReplaceExisting: ImportReplaceExisting
        })
      });

      if (!Response.ok) {
        SetStatus(await Response.text());
        return;
      }

      const Payload = (await Response.json()) as { Counts: Record<string, number>; ReplaceExisting: boolean };
      SetStatus(`Configuration imported (${Object.values(Payload.Counts).reduce((Total, Count) => Total + Count, 0)} row(s)).`);
      await LoadAdminData();
    } catch (ErrorValue) {
      SetStatus(ErrorValue instanceof Error ? ErrorValue.message : "Invalid import file.");
    } finally {
      if (ImportInputRef.current) {
        ImportInputRef.current.value = "";
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-4 text-slate-100 sm:px-4 sm:py-6 md:px-8">
      <div className="mx-auto grid max-w-7xl gap-4 sm:gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="h-fit rounded-[2rem] border border-slate-800 bg-slate-900 p-3 shadow-xl shadow-black/20 sm:p-4 lg:sticky lg:top-6">
          <div className="px-2 py-3 sm:px-3 sm:py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-blue-300">SuperAdmin</p>
                <h1 className="mt-3 text-2xl font-black text-white sm:text-3xl">Control Panel</h1>
              </div>
              <button
                aria-expanded={MobileAdminMenuOpen}
                aria-label="Open admin menu"
                className="rounded-2xl border border-slate-700 p-2 text-slate-200 hover:bg-slate-800 lg:hidden"
                onClick={() => SetMobileAdminMenuOpen(!MobileAdminMenuOpen)}
              >
                <AdminHamburgerIcon />
              </button>
            </div>
            <p className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">{Status}</p>
          </div>
          <nav className={`${MobileAdminMenuOpen ? "grid" : "hidden"} mt-2 gap-2 lg:grid lg:space-y-2`}>
            {AdminSections.map((Section) => (
              <button
                className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                  ActiveSection === Section.Id ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
                }`}
                key={Section.Id}
                onClick={() => {
                  SetActiveSection(Section.Id);
                  SetMobileAdminMenuOpen(false);
                }}
              >
                <span className="block text-sm font-black">{Section.Label}</span>
                <span className={ActiveSection === Section.Id ? "mt-1 block text-xs text-blue-100" : "mt-1 block text-xs text-slate-500"}>{Section.Description}</span>
              </button>
            ))}
          </nav>
          <button className="mt-3 w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800 sm:mt-4" onClick={() => void LoadAdminData()}>
            Reload data
          </button>
        </aside>

        <section>
          {ActiveSection === "GeneralStatus" ? <GeneralStatusPanel Health={Health} Users={Users} Bots={Bots} /> : null}

          {ActiveSection === "ConfigTransfer" ? (
            <ConfigTransferPanel
              ExportConfigs={ExportConfigs}
              ImportFileName={ImportFileName}
              ImportInputRef={ImportInputRef}
              ImportReplaceExisting={ImportReplaceExisting}
              ImportConfigs={ImportConfigs}
              SetImportReplaceExisting={SetImportReplaceExisting}
            />
          ) : null}

          {ActiveSection === "UserManagement" ? (
            <UserManagementPanel
              CreateUserForm={CreateUserForm}
              CurrentUserDiscordId={CurrentUserDiscordId}
              DeleteUser={DeleteUser}
              EditUserForm={EditUserForm}
              BotAccessScopes={BotAccessScopes}
              Bots={Bots}
              IsCreateUserOpen={IsCreateUserOpen}
              ResetUserSessions={ResetUserSessions}
              SaveUser={SaveUser}
              SelectedUser={SelectedUser}
              SelectedUserDiscordId={SelectedUserDiscordId}
              SetCreateUserForm={SetCreateUserForm}
              SetEditUserForm={SetEditUserForm}
              SetIsCreateUserOpen={SetIsCreateUserOpen}
              SetSelectedUserDiscordId={SetSelectedUserDiscordId}
              Users={Users}
              CreateUser={CreateUser}
            />
          ) : null}

          {ActiveSection === "CustomPlugins" ? (
            <CustomPluginsPanel
              CustomPlugins={CustomPlugins}
              CustomPluginDeleteId={CustomPluginDeleteId}
              CustomPluginImportRef={CustomPluginImportRef}
              DeleteCustomPlugin={DeleteCustomPlugin}
              ImportCustomPlugin={ImportCustomPlugin}
              SetCustomPluginDeleteId={SetCustomPluginDeleteId}
            />
          ) : null}

          {ActiveSection === "AuditLogs" ? (
            <AuditLogsPanel
              Bots={Bots}
              Filters={AuditLogFiltersValue}
              Logs={AuditLogs}
              OnApplyFilters={() => void LoadAuditLogs()}
              OnReload={() => void LoadAuditLogs()}
              OnResetFilters={() => {
                SetAuditLogFiltersValue(DefaultAuditLogFilters);
                void LoadAuditLogs(DefaultAuditLogFilters);
              }}
              SetFilters={SetAuditLogFiltersValue}
              Total={AuditLogTotal}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function AdminHamburgerIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function GeneralStatusPanel(Properties: { Health: HealthReport | null; Users: DashboardUserRow[]; Bots: BotRow[] }) {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-black/20 sm:p-8">
        <p className="text-sm uppercase tracking-[0.35em] text-blue-300">General and status</p>
        <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">Instance overview</h2>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">Monitor the database, Redis, and overall system state.</p>
      </section>
      <section className="grid gap-5 md:grid-cols-2">
        {(["Database", "Redis"] as const).map((HealthKey) => (
          <div key={HealthKey} className="rounded-[1.5rem] border border-slate-800 bg-slate-900 p-5 sm:p-6">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{HealthKey}</p>
            <p className="mt-3 text-2xl font-black text-white sm:text-3xl">{Properties.Health?.[HealthKey] ?? "Unknown"}</p>
          </div>
        ))}
      </section>
      <section className="grid gap-5 md:grid-cols-2">
        <MetricCard Label="Dashboard users" Value={String(Properties.Users.length)} />
        <MetricCard Label="Discord Bots" Value={String(Properties.Bots.length)} />
      </section>
    </div>
  );
}

function ConfigTransferPanel(Properties: {
  ExportConfigs: () => Promise<void>;
  ImportConfigs: (FileValue: File | null) => Promise<void>;
  ImportFileName: string;
  ImportInputRef: Ref<HTMLInputElement>;
  ImportReplaceExisting: boolean;
  SetImportReplaceExisting: (Value: boolean) => void;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/20 sm:p-6">
      <div>
        <p className="text-sm uppercase tracking-[0.35em] text-blue-300">Config export/import</p>
        <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">Configuration transfer</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Export or restore plugin configs, plugin user values, system settings, guild access rules, and plugin grants. Dashboard accounts, sessions, and audit logs are not included.
        </p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
          <h3 className="text-xl font-black text-white">Export all configs</h3>
          <p className="mt-2 text-sm text-slate-400">
            Downloads a JSON snapshot that can be imported into another HyperBot instance or restored later.
          </p>
          <button className="mt-5 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500" onClick={() => void Properties.ExportConfigs()} type="button">
            Download JSON
          </button>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
          <h3 className="text-xl font-black text-white">Import configs</h3>
          <p className="mt-2 text-sm text-slate-400">
            Merges the JSON into the current database by default. Enable replacement to clear existing config rows first.
          </p>

          <label className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm font-bold text-red-100">
            Replace existing configs
            <input
              checked={Properties.ImportReplaceExisting}
              className="h-5 w-5 accent-red-600"
              onChange={(Event) => Properties.SetImportReplaceExisting(Event.target.checked)}
              type="checkbox"
            />
          </label>

          <input
            accept="application/json,.json"
            className="mt-4 block w-full text-sm text-slate-300 file:mr-4 file:rounded-2xl file:border-0 file:bg-slate-800 file:px-4 file:py-3 file:text-sm file:font-bold file:text-white hover:file:bg-slate-700"
            onChange={(Event) => void Properties.ImportConfigs(Event.target.files?.[0] ?? null)}
            ref={Properties.ImportInputRef}
            type="file"
          />

          {Properties.ImportFileName ? <p className="mt-3 text-xs text-slate-500">Last selected file: {Properties.ImportFileName}</p> : null}
        </section>
      </div>
    </section>
  );
}

function AuditLogsPanel(Properties: {
  Bots: BotRow[];
  Filters: AuditLogFilters;
  Logs: AuditLogRow[];
  OnApplyFilters: () => void;
  OnReload: () => void;
  OnResetFilters: () => void;
  SetFilters: (Value: AuditLogFilters) => void;
  Total: number;
}) {
  const AllColumnKeys = ["Time", "Action", "Actor", "Target", "Bot", "IP", "Result", "Details"] as const;
  type ColumnKey = (typeof AllColumnKeys)[number];
  const [VisibleColumns, SetVisibleColumns] = UseState<ColumnKey[]>(["Time", "Action", "Actor"]);
  function ToggleColumn(Key: ColumnKey): void {
    SetVisibleColumns((Prev) => {
      if (Prev.includes(Key)) return Prev.filter((C) => C !== Key);
      if (Prev.length < 3) return [...Prev, Key];
      return [...Prev.slice(0, -1), Key];
    });
  }

  function SetFilter(Key: keyof AuditLogFilters, Value: string): void {
    Properties.SetFilters({ ...Properties.Filters, [Key]: Value });
  }

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-blue-300">Logs</p>
          <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">Audit trail</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Review admin actions, plugin changes, authentication events, connection IPs, and request metadata.
          </p>
        </div>
        <button className="rounded-2xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800" onClick={Properties.OnReload} type="button">
          Reload logs
        </button>
      </div>

      <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminInput Label="Search" Placeholder="Action, actor, target, IP..." Value={Properties.Filters.Search} OnChange={(Value) => SetFilter("Search", Value)} />
          <AdminInput Label="Action" Placeholder="DashboardLoginSucceeded" Value={Properties.Filters.Action} OnChange={(Value) => SetFilter("Action", Value)} />
          <AdminInput Label="Actor ID" Placeholder="Discord ID or username" Value={Properties.Filters.ActorId} OnChange={(Value) => SetFilter("ActorId", Value)} />
          <AdminInput Label="Target" Placeholder="User, plugin, guild..." Value={Properties.Filters.Target} OnChange={(Value) => SetFilter("Target", Value)} />
          <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
            Bot
            <CustomSelect
              ClassName="mt-2"
              EmptyLabel="All bots"
              OnChange={(Value) => SetFilter("BotId", Value)}
              Options={Properties.Bots.map((Bot) => ({ Label: Bot.Name, Value: Bot.Id, Description: Bot.Id }))}
              Value={Properties.Filters.BotId}
            />
          </div>
          <AdminInput Label="IP address" Placeholder="192.0.2.10" Value={Properties.Filters.IpAddress} OnChange={(Value) => SetFilter("IpAddress", Value)} />
          <AdminInput Label="From" Type="datetime-local" Value={Properties.Filters.From} OnChange={(Value) => SetFilter("From", Value)} />
          <AdminInput Label="To" Type="datetime-local" Value={Properties.Filters.To} OnChange={(Value) => SetFilter("To", Value)} />
          <AdminInput Label="Limit" Type="number" Value={Properties.Filters.Limit} OnChange={(Value) => SetFilter("Limit", Value)} />
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500" onClick={Properties.OnApplyFilters} type="button">
            Apply filters
          </button>
          <button className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800" onClick={Properties.OnResetFilters} type="button">
            Reset filters
          </button>
          <p className="self-center text-sm text-slate-500">
            Showing {Properties.Logs.length} of {Properties.Total} matching log(s).
          </p>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        {AllColumnKeys.map((Key) => {
          const IsVisible = VisibleColumns.includes(Key);
          return (
            <button
              key={Key}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                IsVisible
                  ? "bg-blue-600 text-white"
                  : "border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }`}
              onClick={() => ToggleColumn(Key)}
              type="button"
            >
              {Key}
            </button>
          );
        })}
      </div>

      <section className="mt-3 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950">
        {Properties.Logs.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">No log found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900 text-xs uppercase tracking-[0.2em] text-slate-500">
                <tr>
                  {VisibleColumns.includes("Time") && <th className="px-2 py-3 sm:px-4">Time</th>}
                  {VisibleColumns.includes("Action") && <th className="px-2 py-3 sm:px-4">Action</th>}
                  {VisibleColumns.includes("Actor") && <th className="px-2 py-3 sm:px-4">Actor</th>}
                  {VisibleColumns.includes("Target") && <th className="px-2 py-3 sm:px-4">Target</th>}
                  {VisibleColumns.includes("Bot") && <th className="px-2 py-3 sm:px-4">Bot</th>}
                  {VisibleColumns.includes("IP") && <th className="px-2 py-3 sm:px-4">IP</th>}
                  {VisibleColumns.includes("Result") && <th className="px-2 py-3 sm:px-4">Result</th>}
                  {VisibleColumns.includes("Details") && <th className="px-2 py-3 sm:px-4">Details</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {Properties.Logs.map((Log) => (
                  <tr className="align-top text-slate-200" key={Log.Id}>
                    {VisibleColumns.includes("Time") && <td className="whitespace-nowrap px-2 py-4 text-xs text-slate-400 sm:px-4">{FormatAuditDate(Log.CreatedAt)}</td>}
                    {VisibleColumns.includes("Action") && <td className="px-2 py-4 font-bold text-white sm:px-4">{Log.Action}</td>}
                    {VisibleColumns.includes("Actor") && (
                      <td className="px-2 py-4 sm:px-4">
                        <span className="block font-semibold">{Log.ActorDisplayName ?? Log.ActorId}</span>
                        {Log.ActorDisplayName ? <span className="mt-1 block text-xs text-slate-500">{Log.ActorId}</span> : null}
                      </td>
                    )}
                    {VisibleColumns.includes("Target") && <td className="px-2 py-4 text-slate-300 sm:px-4">{Log.Target}</td>}
                    {VisibleColumns.includes("Bot") && <td className="px-2 py-4 text-xs text-slate-400 sm:px-4">{BuildAuditBotLabel(Log.BotId, Properties.Bots)}</td>}
                    {VisibleColumns.includes("IP") && <td className="px-2 py-4 font-mono text-xs text-slate-300 sm:px-4">{GetAuditMetadataValue(Log.Metadata, "IpAddress") || "-"}</td>}
                    {VisibleColumns.includes("Result") && <td className="px-2 py-4 sm:px-4">{GetAuditMetadataValue(Log.Metadata, "Result") || "-"}</td>}
                    {VisibleColumns.includes("Details") && (
                      <td className="max-w-md px-2 py-4 sm:px-4">
                        <details>
                          <summary className="cursor-pointer text-xs font-bold text-blue-300 hover:text-blue-200">Metadata</summary>
                          <pre className="mt-2 max-h-48 overflow-auto rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300">{FormatAuditMetadata(Log.Metadata)}</pre>
                        </details>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function UserManagementPanel(Properties: {
  CreateUser: () => Promise<void>;
  CreateUserForm: UserForm;
  CurrentUserDiscordId: string;
  DeleteUser: (User: DashboardUserRow) => Promise<void>;
  EditUserForm: UserForm;
  BotAccessScopes: BotAccessScope[];
  Bots: BotRow[];
  IsCreateUserOpen: boolean;
  ResetUserSessions: (User: DashboardUserRow) => Promise<void>;
  SaveUser: () => Promise<void>;
  SelectedUser: DashboardUserRow | undefined;
  SelectedUserDiscordId: string;
  SetCreateUserForm: (Value: UserForm) => void;
  SetEditUserForm: (Value: UserForm) => void;
  SetIsCreateUserOpen: (Value: boolean) => void;
  SetSelectedUserDiscordId: (Value: string) => void;
  Users: DashboardUserRow[];
}) {
  const IsEditingSelf = Boolean(Properties.SelectedUser && Properties.SelectedUser.DiscordId === Properties.CurrentUserDiscordId);

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-black text-white sm:text-3xl">User Management</h2>
          <p className="mt-1 text-sm text-slate-400">Create accounts, edit roles, ban users, reset passwords, and assign bot access.</p>
        </div>
        <button className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-black text-white hover:bg-blue-500" onClick={() => Properties.SetIsCreateUserOpen(true)} title="Create user">
          +
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-3xl border border-slate-800 bg-slate-950 p-3">
          {Properties.Users.length === 0 ? <p className="p-4 text-sm text-slate-400">No user found.</p> : null}
          <div className="flex gap-2 overflow-x-auto pb-1 xl:block xl:space-y-2 xl:overflow-visible xl:pb-0">
            {Properties.Users.map((User) => (
              <button
                className={`min-w-60 rounded-2xl px-4 py-3 text-left transition xl:w-full xl:min-w-0 ${
                  Properties.SelectedUserDiscordId === User.DiscordId ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
                }`}
                key={User.DiscordId}
                onClick={() => Properties.SetSelectedUserDiscordId(User.DiscordId)}
              >
                <span className="block font-black">{User.DisplayName}</span>
                <span className={Properties.SelectedUserDiscordId === User.DiscordId ? "mt-1 block text-xs text-blue-100" : "mt-1 block text-xs text-slate-500"}>
                  {User.Username} | {User.Role} | {User.IsDashboardBanned ? "Banned" : "Active"}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-6">
          {Properties.SelectedUser ? (
            <div className="space-y-6">
              {IsEditingSelf ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">
                  You are editing your own account. Self-ban, self-delete, and removing your own SuperAdmin role are locked.
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <AdminInput Label="Login" Disabled={true} Value={Properties.EditUserForm.Username} OnChange={() => undefined} />
                <AdminInput Label="Discord ID" Disabled={true} Value={Properties.EditUserForm.DiscordId} OnChange={() => undefined} />
                <AdminInput Label="Display name" Value={Properties.EditUserForm.DisplayName} OnChange={(Value) => Properties.SetEditUserForm({ ...Properties.EditUserForm, DisplayName: Value })} />
                <AdminInput Label="New password" Placeholder="Leave empty to keep current password" Type="password" Value={Properties.EditUserForm.Password} OnChange={(Value) => Properties.SetEditUserForm({ ...Properties.EditUserForm, Password: Value })} />
                <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
                  Account type
                  <CustomSelect
                    ClassName="mt-2"
                    Disabled={IsEditingSelf}
                    OnChange={(Value) => Properties.SetEditUserForm({ ...Properties.EditUserForm, Role: Value as UserForm["Role"] })}
                    Options={[
                      { Label: "User", Value: "User" },
                      { Label: "SuperAdmin", Value: "SuperAdmin" }
                    ]}
                    Required={true}
                    Value={Properties.EditUserForm.Role}
                  />
                </div>
                <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 font-semibold text-slate-100">
                  Dashboard banned
                  <input
                    checked={Properties.EditUserForm.IsDashboardBanned}
                    className="h-5 w-5 accent-blue-600"
                    disabled={IsEditingSelf}
                    onChange={(Event) => Properties.SetEditUserForm({ ...Properties.EditUserForm, IsDashboardBanned: Event.target.checked })}
                    type="checkbox"
                  />
                </label>
              </div>

              <UserAccessMatrix
                BotAccessScopes={Properties.BotAccessScopes}
                Bots={Properties.Bots}
                Form={Properties.EditUserForm}
                OnChange={Properties.SetEditUserForm}
              />

              <div className="grid gap-3 sm:flex sm:flex-wrap">
                <button className="rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500" onClick={() => void Properties.SaveUser()}>
                  Save user
                </button>
                <button
                  className="rounded-2xl border border-slate-700 px-5 py-3 font-bold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={IsEditingSelf}
                  onClick={() => void Properties.ResetUserSessions(Properties.SelectedUser as DashboardUserRow)}
                >
                  Reset sessions
                </button>
                <button
                  className="rounded-2xl bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={IsEditingSelf}
                  onClick={() => void Properties.DeleteUser(Properties.SelectedUser as DashboardUserRow)}
                >
                  Delete user
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-400">Select a user to edit.</div>
          )}
        </section>
      </div>

      {Properties.IsCreateUserOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-slate-800 bg-slate-900 p-4 shadow-2xl shadow-black sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-2xl font-black text-white sm:text-3xl">Create user</h3>
                <p className="mt-1 text-sm text-slate-400">Create the account and assign allowed bots.</p>
              </div>
              <button className="rounded-2xl border border-slate-700 px-4 py-2 font-bold text-slate-200 hover:bg-slate-800" onClick={() => Properties.SetIsCreateUserOpen(false)}>
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <AdminInput Label="Login" Value={Properties.CreateUserForm.Username} OnChange={(Value) => Properties.SetCreateUserForm({ ...Properties.CreateUserForm, Username: Value })} />
              <AdminInput Label="Password" Placeholder="At least 8 characters" Type="password" Value={Properties.CreateUserForm.Password} OnChange={(Value) => Properties.SetCreateUserForm({ ...Properties.CreateUserForm, Password: Value })} />
              <AdminInput Label="Display name" Value={Properties.CreateUserForm.DisplayName} OnChange={(Value) => Properties.SetCreateUserForm({ ...Properties.CreateUserForm, DisplayName: Value })} />
              <AdminInput Label="Discord ID" Value={Properties.CreateUserForm.DiscordId} OnChange={(Value) => Properties.SetCreateUserForm({ ...Properties.CreateUserForm, DiscordId: Value })} />
              <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
                Account type
                <CustomSelect
                  ClassName="mt-2"
                  OnChange={(Value) => Properties.SetCreateUserForm({ ...Properties.CreateUserForm, Role: Value as UserForm["Role"] })}
                  Options={[
                    { Label: "User", Value: "User" },
                    { Label: "SuperAdmin", Value: "SuperAdmin" }
                  ]}
                  Required={true}
                  Value={Properties.CreateUserForm.Role}
                />
              </div>
              <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 font-semibold text-slate-100">
                Dashboard banned
                <input
                  checked={Properties.CreateUserForm.IsDashboardBanned}
                  className="h-5 w-5 accent-blue-600"
                  onChange={(Event) => Properties.SetCreateUserForm({ ...Properties.CreateUserForm, IsDashboardBanned: Event.target.checked })}
                  type="checkbox"
                />
              </label>
            </div>
            <div className="mt-6">
                <UserAccessMatrix
                    BotAccessScopes={Properties.BotAccessScopes}
                    Bots={Properties.Bots}
                    Form={Properties.CreateUserForm}
                    OnChange={Properties.SetCreateUserForm}
                />
            </div>
            <button
              className="mt-6 w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              disabled={!Properties.CreateUserForm.Username.trim() || Properties.CreateUserForm.Password.length < 8}
              onClick={() => void Properties.CreateUser()}
            >
              Create user
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CustomPluginsPanel(Properties: {
  CustomPlugins: CustomPluginRow[];
  CustomPluginDeleteId: string;
  CustomPluginImportRef: Ref<HTMLInputElement>;
  DeleteCustomPlugin: (PluginId: string) => Promise<void>;
  ImportCustomPlugin: (FileValue: File | null) => Promise<void>;
  SetCustomPluginDeleteId: (Value: string) => void;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-blue-300">Custom Plugins</p>
          <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">Plugin management</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Import third-party plugins as zip archives or remove custom plugins.
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
        <h3 className="text-xl font-black text-white">Import a plugin</h3>
        <p className="mt-2 text-sm text-slate-400">
          Upload a zip file containing a Plugin.json manifest and the plugin source files.
        </p>
        <input
          accept=".zip,application/zip,application/x-zip-compressed"
          className="mt-4 block w-full text-sm text-slate-300 file:mr-4 file:rounded-2xl file:border-0 file:bg-blue-600 file:px-4 file:py-3 file:text-sm file:font-bold file:text-white hover:file:bg-blue-500"
          onChange={(Event) => void Properties.ImportCustomPlugin(Event.target.files?.[0] ?? null)}
          ref={Properties.CustomPluginImportRef}
          type="file"
        />
      </section>

      <section className="mt-6">
        <h3 className="text-xl font-black text-white">Installed custom plugins</h3>
        {Properties.CustomPlugins.length === 0 ? (
          <p className="mt-4 rounded-3xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
            No custom plugin imported yet.
          </p>
        ) : (
          <div className="mt-4 grid gap-4">
            {Properties.CustomPlugins.map((Plugin) => {
              const IsDeleting = Properties.CustomPluginDeleteId === Plugin.Id;
              return (
                <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-5" key={Plugin.Id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <PluginIcon ClassName="mt-1 h-8 w-8 shrink-0 rounded-xl bg-white/10 text-sm font-black" Icon={Plugin.Icon} PluginId={Plugin.Id} />
                      <div>
                        <p className="text-lg font-black text-white">{Plugin.DisplayName}</p>
                        <p className="mt-1 text-sm text-slate-400">
                          {Plugin.Id} &middot; v{Plugin.Version} &middot; by {Plugin.Author}
                        </p>
                        {Plugin.Category ? <p className="mt-1 text-xs text-slate-500">Category: {Plugin.Category}</p> : null}
                        {Plugin.Description ? <p className="mt-2 text-sm text-slate-300">{Plugin.Description}</p> : null}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {IsDeleting ? (
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500"
                            onClick={() => void Properties.DeleteCustomPlugin(Plugin.Id)}
                            type="button"
                          >
                            Confirm delete
                          </button>
                          <button
                            className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800"
                            onClick={() => Properties.SetCustomPluginDeleteId("")}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="rounded-2xl border border-red-500/50 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-950"
                          onClick={() => Properties.SetCustomPluginDeleteId(Plugin.Id)}
                          type="button"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function UserAccessMatrix(Properties: {
  BotAccessScopes: BotAccessScope[];
  Bots: BotRow[];
  Form: UserForm;
  OnChange: (Form: UserForm) => void;
}) {
  function ToggleBot(BotId: string): void {
    const IsEnabled = Properties.Form.AllowedBotIds.includes(BotId);
    const NextGuildPluginAccess = { ...Properties.Form.GuildPluginAccess };

    if (IsEnabled) {
      delete NextGuildPluginAccess[BotId];
    }

    Properties.OnChange({
      ...Properties.Form,
      AllowedBotIds: IsEnabled ? Properties.Form.AllowedBotIds.filter((Id) => Id !== BotId) : [...Properties.Form.AllowedBotIds, BotId],
      GuildPluginAccess: NextGuildPluginAccess
    });
  }

  function ToggleGuild(BotId: string, GuildId: string): void {
    const BotGuildAccess = { ...(Properties.Form.GuildPluginAccess[BotId] ?? {}) };

    if (Object.prototype.hasOwnProperty.call(BotGuildAccess, GuildId)) {
      delete BotGuildAccess[GuildId];
    } else {
      BotGuildAccess[GuildId] = [];
    }

    Properties.OnChange({
      ...Properties.Form,
      GuildPluginAccess: {
        ...Properties.Form.GuildPluginAccess,
        [BotId]: BotGuildAccess
      }
    });
  }

  function TogglePlugin(BotId: string, GuildId: string, PluginId: string): void {
    const BotGuildAccess = { ...(Properties.Form.GuildPluginAccess[BotId] ?? {}) };
    const CurrentPluginIds = BotGuildAccess[GuildId] ?? [];
    BotGuildAccess[GuildId] = CurrentPluginIds.includes(PluginId)
      ? CurrentPluginIds.filter((Id) => Id !== PluginId)
      : [...CurrentPluginIds, PluginId];

    Properties.OnChange({
      ...Properties.Form,
      GuildPluginAccess: {
        ...Properties.Form.GuildPluginAccess,
        [BotId]: BotGuildAccess
      }
    });
  }

  function SetAllPlugins(BotId: string, GuildId: string, PluginIds: string[]): void {
    Properties.OnChange({
      ...Properties.Form,
      GuildPluginAccess: {
        ...Properties.Form.GuildPluginAccess,
        [BotId]: {
          ...(Properties.Form.GuildPluginAccess[BotId] ?? {}),
          [GuildId]: PluginIds
        }
      }
    });
  }

  return (
    <div>
      <h4 className="text-xl font-black text-white">Access scope</h4>
      <p className="mt-1 text-sm text-slate-400">Choose bot access first, then server access, then the plugins this user can manage inside each server.</p>
      <div className="mt-4 grid gap-4">
        {Properties.Bots.length === 0 ? <p className="col-span-2 rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">No bot configured.</p> : null}
        {Properties.Bots.map((Bot) => {
          const IsEnabled = Properties.Form.AllowedBotIds.includes(Bot.Id);
          const Scope = Properties.BotAccessScopes.find((AccessScope) => AccessScope.BotId === Bot.Id);
          const BotGuildAccess = Properties.Form.GuildPluginAccess[Bot.Id] ?? {};

          return (
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4" key={Bot.Id}>
              <label className="flex items-center justify-between gap-3 font-semibold text-slate-100">
                {Bot.Name}
                <input
                    checked={IsEnabled}
                    className="h-5 w-5 accent-blue-600"
                    onChange={() => ToggleBot(Bot.Id)}
                    type="checkbox"
                />
              </label>

              {IsEnabled ? (
                <div className="mt-4 grid gap-3">
                  {!Scope || Scope.Guilds.length === 0 ? <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">No server available for this bot.</p> : null}
                  {Scope?.Guilds.map((Guild) => {
                    const GuildEnabled = Object.prototype.hasOwnProperty.call(BotGuildAccess, Guild.GuildId);
                    const GuildPluginIds = BotGuildAccess[Guild.GuildId] ?? [];
                    const AllPluginIds = Scope.Plugins.map((Plugin) => Plugin.Id);

                    return (
                      <section className={`rounded-xl border p-3 ${GuildEnabled ? "border-blue-500/50 bg-blue-500/10" : "border-slate-800 bg-slate-950"}`} key={Guild.GuildId}>
                        <label className="flex items-center justify-between gap-3 text-sm font-bold text-slate-100">
                          <span className="min-w-0">
                            <span className="block truncate">{Guild.Name}</span>
                            <span className="mt-1 block text-xs font-medium text-slate-500">{Guild.GuildId}{Guild.IsBanned ? " | banned" : ""}{Guild.IsBotPresent ? "" : " | bot absent"}</span>
                          </span>
                          <input checked={GuildEnabled} className="h-5 w-5 shrink-0 accent-blue-600" onChange={() => ToggleGuild(Bot.Id, Guild.GuildId)} type="checkbox" />
                        </label>

                        {GuildEnabled ? (
                          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Plugins</p>
                              <div className="flex gap-2">
                                <button className="rounded-lg border border-slate-700 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-slate-800" onClick={() => SetAllPlugins(Bot.Id, Guild.GuildId, AllPluginIds)} type="button">All</button>
                                <button className="rounded-lg border border-slate-700 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-slate-800" onClick={() => SetAllPlugins(Bot.Id, Guild.GuildId, [])} type="button">None</button>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-3">
                              {Scope.Plugins.length === 0 ? <p className="text-sm text-slate-500">No guild plugin available.</p> : null}
                              {BuildGrantPluginCategoryGroups(Scope.Plugins).map((Group) => (
                                <div className="grid gap-2" key={Group.Category}>
                                  <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-slate-500">{Group.Category}</p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {Group.Plugins.map((Plugin) => (
                                      <label className="flex items-center justify-between gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200" key={Plugin.Id}>
                                        <span className="truncate">{Plugin.DisplayName}</span>
                                        <input checked={GuildPluginIds.includes(Plugin.Id)} className="h-4 w-4 shrink-0 accent-blue-600" onChange={() => TogglePlugin(Bot.Id, Guild.GuildId, Plugin.Id)} type="checkbox" />
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function MetricCard(Properties: { Label: string; Value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-800 bg-slate-900 p-5 sm:p-6">
      <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{Properties.Label}</p>
      <p className="mt-3 text-2xl font-black text-white sm:text-3xl">{Properties.Value}</p>
    </div>
  );
}

function AdminInput(Properties: { Label: string; Value: string; OnChange: (Value: string) => void; Type?: string; Disabled?: boolean; Placeholder?: string }) {
  return (
    <label className="block text-sm font-bold text-slate-200">
      {Properties.Label}
      <input
        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={Properties.Disabled}
        onChange={(Event) => Properties.OnChange(Event.target.value)}
        placeholder={Properties.Placeholder}
        type={Properties.Type ?? "text"}
        value={Properties.Value}
      />
    </label>
  );
}

function PatchUser(Body: Partial<DashboardUserRow> & { Password?: string, AllowedBotIds?: string[] }) {
  return fetch("/api/admin/users", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(Body)
  });
}

async function FetchBotAccessScopes(BotRows: BotRow[]): Promise<BotAccessScope[]> {
  const Scopes: BotAccessScope[] = [];

  for (const Bot of BotRows) {
    const [GuildsResponse, GrantsResponse] = await Promise.all([
      fetch(`/api/admin/guild-access?botId=${Bot.Id}`),
      fetch(`/api/admin/grants?botId=${Bot.Id}`)
    ]);

    if (!GuildsResponse.ok || !GrantsResponse.ok) {
      throw new Error(await ReadFirstError([GuildsResponse, GrantsResponse]));
    }

    const GuildsPayload = (await GuildsResponse.json()) as { Guilds: AdminGuildRow[] };
    const GrantsPayload = (await GrantsResponse.json()) as { Plugins: GrantPlugin[]; Grants: GuildGrantRow[] };

    Scopes.push({
      BotId: Bot.Id,
      Guilds: GuildsPayload.Guilds,
      Plugins: GrantsPayload.Plugins,
      Grants: GrantsPayload.Grants.map((Grant) => ({ ...Grant, BotId: Bot.Id }))
    });
  }

  return Scopes;
}

function BuildUserGuildPluginAccess(DiscordId: string, BotAccessScopes: BotAccessScope[]): UserForm["GuildPluginAccess"] {
  const Access: UserForm["GuildPluginAccess"] = {};

  for (const Scope of BotAccessScopes) {
    const UserGrants = Scope.Grants.filter((Grant) => Grant.DiscordId === DiscordId);

    if (UserGrants.length === 0) {
      continue;
    }

    Access[Scope.BotId] = {};

    for (const Grant of UserGrants) {
      Access[Scope.BotId][Grant.GuildId] = Array.isArray(Grant.AllowedPluginIds)
        ? Grant.AllowedPluginIds.filter((PluginId): PluginId is string => typeof PluginId === "string")
        : [];
    }
  }

  return Access;
}

function BuildGrantPluginCategoryGroups(Plugins: GrantPlugin[]): Array<{ Category: string; Plugins: GrantPlugin[] }> {
  const Groups = new Map<string, GrantPlugin[]>();

  for (const Plugin of Plugins) {
    const Category = Plugin.Category?.trim() || "General";
    Groups.set(Category, [...(Groups.get(Category) ?? []), Plugin]);
  }

  return Array.from(Groups.entries()).map(([Category, GroupPlugins]) => ({
    Category,
    Plugins: GroupPlugins
  }));
}

function BuildAuditBotLabel(BotId: string | null, Bots: BotRow[]): string {
  if (!BotId) {
    return "-";
  }

  const Bot = Bots.find((BotRowValue) => BotRowValue.Id === BotId);
  return Bot ? `${Bot.Name} (${Bot.Id})` : BotId;
}

function FormatAuditDate(Value: string): string {
  const DateValue = new Date(Value);

  if (Number.isNaN(DateValue.getTime())) {
    return Value;
  }

  return DateValue.toLocaleString();
}

function FormatAuditMetadata(Metadata: unknown): string {
  if (Metadata === null || Metadata === undefined) {
    return "{}";
  }

  try {
    return JSON.stringify(Metadata, null, 2);
  } catch {
    return String(Metadata);
  }
}

function GetAuditMetadataValue(Metadata: unknown, Key: string): string {
  if (!IsRecord(Metadata)) {
    return "";
  }

  const Value = Metadata[Key];

  if (Value === null || Value === undefined) {
    return "";
  }

  if (typeof Value === "string") {
    return Value;
  }

  if (typeof Value === "number" || typeof Value === "boolean") {
    return String(Value);
  }

  return "";
}

function IsRecord(Value: unknown): Value is Record<string, unknown> {
  return typeof Value === "object" && Value !== null && !Array.isArray(Value);
}

async function ReadFirstError(Responses: Response[]): Promise<string> {
  const FailedResponse = Responses.find((Response) => !Response.ok);
  return FailedResponse ? `${FailedResponse.status} ${await FailedResponse.text()}` : "Unknown admin loading error.";
}
