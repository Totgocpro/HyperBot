"use client";

import { useEffect as UseEffect, useState as UseState } from "react";
import type { HealthReport, SettingsField } from "../../Core/Types";

type AdminSection = "GeneralStatus" | "GlobalPlugins" | "UserManagement" | "GuildBanlist";

type DashboardUserRow = {
  DiscordId: string;
  Username: string;
  DisplayName: string;
  Role: "SuperAdmin" | "User";
  IsDashboardBanned: boolean;
};

type GuildAccessRow = {
  GuildId: string;
  Name: string;
  Icon: string | null;
  MemberCount: number | null;
  IsBotPresent: boolean;
  IsBanned: boolean;
  RestrictedReason: string | null;
  UpdatedAt: string | null;
};

type GuildGrantRow = {
  GuildId: string;
  DiscordId: string;
  Role: "GuildAdmin" | "GuildOwner";
  AllowedPluginIds: unknown;
};

type GrantPlugin = {
  Id: string;
  DisplayName: string;
};

type UserForm = {
  Username: string;
  Password: string;
  DiscordId: string;
  DisplayName: string;
  Role: "User" | "SuperAdmin";
  IsDashboardBanned: boolean;
};

type UserAccessDraft = Record<string, string[]>;

type AdminPlugin = {
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

const EmptyUserForm: UserForm = {
  Username: "",
  Password: "",
  DiscordId: "",
  DisplayName: "",
  Role: "User",
  IsDashboardBanned: false
};

const AdminSections: Array<{ Id: AdminSection; Label: string; Description: string }> = [
  { Id: "GeneralStatus", Label: "General and status", Description: "Instance health and quick metrics." },
  { Id: "GlobalPlugins", Label: "Global Plugin", Description: "Instance-level plugin settings." },
  { Id: "UserManagement", Label: "User Management", Description: "Accounts, roles, bans, and access." },
  { Id: "GuildBanlist", Label: "Guild Banlist", Description: "Servers blocked from using the bot." }
];

export function SuperAdminPanel() {
  const [ActiveSection, SetActiveSection] = UseState<AdminSection>("GeneralStatus");
  const [Health, SetHealth] = UseState<HealthReport | null>(null);
  const [Users, SetUsers] = UseState<DashboardUserRow[]>([]);
  const [Guilds, SetGuilds] = UseState<GuildAccessRow[]>([]);
  const [Grants, SetGrants] = UseState<GuildGrantRow[]>([]);
  const [GrantPlugins, SetGrantPlugins] = UseState<GrantPlugin[]>([]);
  const [GlobalPlugins, SetGlobalPlugins] = UseState<AdminPlugin[]>([]);
  const [SelectedGlobalPluginId, SetSelectedGlobalPluginId] = UseState("");
  const [GlobalPluginDraftValues, SetGlobalPluginDraftValues] = UseState<Record<string, Record<string, unknown>>>({});
  const [ManualGuildId, SetManualGuildId] = UseState("");
  const [CurrentUserDiscordId, SetCurrentUserDiscordId] = UseState("");
  const [CreateUserForm, SetCreateUserForm] = UseState<UserForm>(EmptyUserForm);
  const [CreateUserAccessDraft, SetCreateUserAccessDraft] = UseState<UserAccessDraft>({});
  const [IsCreateUserOpen, SetIsCreateUserOpen] = UseState(false);
  const [SelectedUserDiscordId, SetSelectedUserDiscordId] = UseState("");
  const [EditUserForm, SetEditUserForm] = UseState<UserForm>(EmptyUserForm);
  const [EditUserAccessDraft, SetEditUserAccessDraft] = UseState<UserAccessDraft>({});
  const [Status, SetStatus] = UseState("Loading admin panel...");
  const SelectedGlobalPlugin = GlobalPlugins.find((Plugin) => Plugin.Metadata.Id === SelectedGlobalPluginId) ?? GlobalPlugins[0];
  const SelectedUser = Users.find((User) => User.DiscordId === SelectedUserDiscordId) ?? Users[0];

  UseEffect(() => {
    void LoadAdminData();
  }, []);

  UseEffect(() => {
    if (!SelectedUser) {
      SetSelectedUserDiscordId("");
      SetEditUserForm(EmptyUserForm);
      SetEditUserAccessDraft({});
      return;
    }

    SetSelectedUserDiscordId(SelectedUser.DiscordId);
    SetEditUserForm({
      Username: SelectedUser.Username,
      Password: "",
      DiscordId: SelectedUser.DiscordId,
      DisplayName: SelectedUser.DisplayName,
      Role: SelectedUser.Role,
      IsDashboardBanned: SelectedUser.IsDashboardBanned
    });
    SetEditUserAccessDraft(BuildAccessDraft(SelectedUser.DiscordId, Grants));
  }, [SelectedUser?.DiscordId, Grants, Users]);

  async function LoadAdminData(): Promise<void> {
    const HealthResponse = await fetch("/api/admin/health");
    const UsersResponse = await fetch("/api/admin/users");
    const CurrentUserResponse = await fetch("/api/auth/me");
    const GuildsResponse = await fetch("/api/admin/guild-access");
    const GlobalPluginsResponse = await fetch("/api/admin/plugins");
    const GrantsResponse = await fetch("/api/admin/grants");

    if (!HealthResponse.ok || !UsersResponse.ok || !CurrentUserResponse.ok || !GuildsResponse.ok || !GlobalPluginsResponse.ok || !GrantsResponse.ok) {
      SetStatus(await ReadFirstError([HealthResponse, UsersResponse, CurrentUserResponse, GuildsResponse, GlobalPluginsResponse, GrantsResponse]));
      return;
    }

    const UsersPayload = ((await UsersResponse.json()) as { Users: DashboardUserRow[] }).Users;
    const CurrentUserPayload = (await CurrentUserResponse.json()) as { User: DashboardUserRow };
    const GlobalPluginsPayload = (await GlobalPluginsResponse.json()) as { Plugins: AdminPlugin[] };
    const GrantsPayload = (await GrantsResponse.json()) as { Grants: GuildGrantRow[]; Plugins: GrantPlugin[] };

    SetHealth((await HealthResponse.json()) as HealthReport);
    SetCurrentUserDiscordId(CurrentUserPayload.User.DiscordId);
    SetUsers(UsersPayload);
    SetGuilds(((await GuildsResponse.json()) as { Guilds: GuildAccessRow[] }).Guilds);
    SetGlobalPlugins(GlobalPluginsPayload.Plugins);
    SetSelectedGlobalPluginId(GlobalPluginsPayload.Plugins[0]?.Metadata.Id ?? "");
    SetGlobalPluginDraftValues(BuildPluginDraftValues(GlobalPluginsPayload.Plugins));
    SetGrants(GrantsPayload.Grants);
    SetGrantPlugins(GrantsPayload.Plugins);
    SetSelectedUserDiscordId((PreviousDiscordId) => PreviousDiscordId || UsersPayload[0]?.DiscordId || "");
    SetStatus("Admin data loaded.");
  }

  async function SetGuildBanned(GuildId: string, IsBanned: boolean): Promise<void> {
    if (!GuildId.trim()) {
      SetStatus("Guild ID is required.");
      return;
    }

    const Response = await fetch("/api/admin/guild-access", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        GuildId: GuildId.trim(),
        IsAllowed: !IsBanned,
        RestrictedReason: IsBanned ? "Banned by SuperAdmin" : null
      })
    });

    SetStatus(Response.ok ? (IsBanned ? "Server banned. The bot will leave this server." : "Server unbanned.") : await Response.text());
    SetManualGuildId("");
    await LoadAdminData();
  }

  async function CreateUser(): Promise<void> {
    const Response = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(CreateUserForm)
    });

    if (!Response.ok) {
      SetStatus(await Response.text());
      return;
    }

    const CreatedUser = ((await Response.json()) as { User: DashboardUserRow }).User;
    await SaveAccessDraft(CreatedUser.DiscordId, CreateUserAccessDraft);
    SetCreateUserForm(EmptyUserForm);
    SetCreateUserAccessDraft({});
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
      Password: EditUserForm.Password || undefined
    });

    if (!Response.ok) {
      SetStatus(await Response.text());
      return;
    }

    await SaveAccessDraft(EditUserForm.DiscordId, EditUserAccessDraft);
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

  async function SaveGlobalPlugin(Plugin: AdminPlugin): Promise<void> {
    const Response = await fetch("/api/admin/plugins", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        PluginId: Plugin.Metadata.Id,
        Values: GlobalPluginDraftValues[Plugin.Metadata.Id] ?? {}
      })
    });

    SetStatus(Response.ok ? `${Plugin.Metadata.DisplayName} saved.` : await Response.text());
    await LoadAdminData();
  }

  function UpdateGlobalPluginDraftValue(PluginId: string, Key: string, Value: unknown): void {
    SetGlobalPluginDraftValues((PreviousValues) => ({
      ...PreviousValues,
      [PluginId]: {
        ...(PreviousValues[PluginId] ?? {}),
        [Key]: Value
      }
    }));
  }

  async function SaveAccessDraft(DiscordId: string, AccessDraft: UserAccessDraft): Promise<void> {
    const ExistingGrants = Grants.filter((Grant) => Grant.DiscordId === DiscordId);
    const RequestedGuildIds = new Set(Object.keys(AccessDraft).filter((GuildId) => AccessDraft[GuildId]?.length));

    await Promise.all(
      Object.entries(AccessDraft)
        .filter(([, PluginIds]) => PluginIds.length > 0)
        .map(([GuildId, PluginIds]) =>
          fetch("/api/admin/grants", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              DiscordId,
              GuildId,
              AllowedPluginIds: PluginIds
            })
          })
        )
    );

    await Promise.all(
      ExistingGrants
        .filter((Grant) => !RequestedGuildIds.has(Grant.GuildId))
        .map((Grant) =>
          fetch("/api/admin/grants", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              DiscordId,
              GuildId: Grant.GuildId
            })
          })
        )
    );
  }

  function ToggleAccessGuild(AccessDraft: UserAccessDraft, SetAccessDraft: (Value: UserAccessDraft) => void, GuildId: string): void {
    if (AccessDraft[GuildId]) {
      const NextDraft = { ...AccessDraft };
      delete NextDraft[GuildId];
      SetAccessDraft(NextDraft);
      return;
    }

    SetAccessDraft({
      ...AccessDraft,
      [GuildId]: GrantPlugins.map((Plugin) => Plugin.Id)
    });
  }

  function ToggleAccessPlugin(AccessDraft: UserAccessDraft, SetAccessDraft: (Value: UserAccessDraft) => void, GuildId: string, PluginId: string): void {
    const CurrentPluginIds = AccessDraft[GuildId] ?? [];
    const NextPluginIds = CurrentPluginIds.includes(PluginId)
      ? CurrentPluginIds.filter((CurrentPluginId) => CurrentPluginId !== PluginId)
      : [...CurrentPluginIds, PluginId];
    const NextDraft = { ...AccessDraft };

    if (NextPluginIds.length === 0) {
      delete NextDraft[GuildId];
    } else {
      NextDraft[GuildId] = NextPluginIds;
    }

    SetAccessDraft(NextDraft);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="h-fit rounded-[2rem] border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/20 lg:sticky lg:top-6">
          <div className="px-3 py-4">
            <p className="text-xs uppercase tracking-[0.35em] text-blue-300">SuperAdmin</p>
            <h1 className="mt-3 text-3xl font-black text-white">Control Panel</h1>
            <p className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">{Status}</p>
          </div>
          <nav className="mt-2 space-y-2">
            {AdminSections.map((Section) => (
              <button
                className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                  ActiveSection === Section.Id ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
                }`}
                key={Section.Id}
                onClick={() => SetActiveSection(Section.Id)}
              >
                <span className="block text-sm font-black">{Section.Label}</span>
                <span className={ActiveSection === Section.Id ? "mt-1 block text-xs text-blue-100" : "mt-1 block text-xs text-slate-500"}>{Section.Description}</span>
              </button>
            ))}
          </nav>
          <button className="mt-4 w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800" onClick={() => void LoadAdminData()}>
            Reload data
          </button>
        </aside>

        <section>
          {ActiveSection === "GeneralStatus" ? <GeneralStatusPanel Health={Health} Users={Users} Guilds={Guilds} Grants={Grants} /> : null}

          {ActiveSection === "GlobalPlugins" ? (
            <GlobalPluginsPanel
              GlobalPlugins={GlobalPlugins}
              GlobalPluginDraftValues={GlobalPluginDraftValues}
              SelectedGlobalPlugin={SelectedGlobalPlugin}
              SelectedGlobalPluginId={SelectedGlobalPluginId}
              SetSelectedGlobalPluginId={SetSelectedGlobalPluginId}
              SaveGlobalPlugin={SaveGlobalPlugin}
              UpdateGlobalPluginDraftValue={UpdateGlobalPluginDraftValue}
            />
          ) : null}

          {ActiveSection === "UserManagement" ? (
            <UserManagementPanel
              CreateUserAccessDraft={CreateUserAccessDraft}
              CreateUserForm={CreateUserForm}
              CurrentUserDiscordId={CurrentUserDiscordId}
              DeleteUser={DeleteUser}
              EditUserAccessDraft={EditUserAccessDraft}
              EditUserForm={EditUserForm}
              GrantPlugins={GrantPlugins}
              Guilds={Guilds}
              IsCreateUserOpen={IsCreateUserOpen}
              ResetUserSessions={ResetUserSessions}
              SaveUser={SaveUser}
              SelectedUser={SelectedUser}
              SelectedUserDiscordId={SelectedUserDiscordId}
              SetCreateUserAccessDraft={SetCreateUserAccessDraft}
              SetCreateUserForm={SetCreateUserForm}
              SetEditUserAccessDraft={SetEditUserAccessDraft}
              SetEditUserForm={SetEditUserForm}
              SetIsCreateUserOpen={SetIsCreateUserOpen}
              SetSelectedUserDiscordId={SetSelectedUserDiscordId}
              ToggleAccessGuild={ToggleAccessGuild}
              ToggleAccessPlugin={ToggleAccessPlugin}
              Users={Users}
              CreateUser={CreateUser}
            />
          ) : null}

          {ActiveSection === "GuildBanlist" ? (
            <GuildBanlistPanel
              Guilds={Guilds}
              ManualGuildId={ManualGuildId}
              SetGuildBanned={SetGuildBanned}
              SetManualGuildId={SetManualGuildId}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function GeneralStatusPanel(Properties: { Health: HealthReport | null; Users: DashboardUserRow[]; Guilds: GuildAccessRow[]; Grants: GuildGrantRow[] }) {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-900 p-8 shadow-xl shadow-black/20">
        <p className="text-sm uppercase tracking-[0.35em] text-blue-300">General and status</p>
        <h2 className="mt-3 text-4xl font-black text-white">Instance overview</h2>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">Monitor the database, Redis, bot gateway, users, and known servers from one place.</p>
      </section>
      <section className="grid gap-5 md:grid-cols-3">
        {(["Database", "Redis", "Bot"] as const).map((HealthKey) => (
          <div key={HealthKey} className="rounded-[1.5rem] border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{HealthKey}</p>
            <p className="mt-3 text-3xl font-black text-white">{Properties.Health?.[HealthKey] ?? "Unknown"}</p>
          </div>
        ))}
      </section>
      <section className="grid gap-5 md:grid-cols-3">
        <MetricCard Label="Dashboard users" Value={String(Properties.Users.length)} />
        <MetricCard Label="Known servers" Value={String(Properties.Guilds.length)} />
        <MetricCard Label="Access grants" Value={String(Properties.Grants.length)} />
      </section>
    </div>
  );
}

function GlobalPluginsPanel(Properties: {
  GlobalPlugins: AdminPlugin[];
  GlobalPluginDraftValues: Record<string, Record<string, unknown>>;
  SelectedGlobalPlugin: AdminPlugin | undefined;
  SelectedGlobalPluginId: string;
  SetSelectedGlobalPluginId: (Value: string) => void;
  SaveGlobalPlugin: (Plugin: AdminPlugin) => Promise<void>;
  UpdateGlobalPluginDraftValue: (PluginId: string, Key: string, Value: unknown) => void;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/20">
      <h2 className="text-3xl font-black text-white">Global Plugin</h2>
      <p className="mt-1 text-sm text-slate-400">These plugins are configured at instance level, not per server.</p>
      <div className="mt-5 grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <p className="px-2 text-xs font-bold uppercase tracking-wide text-slate-500">Global plugins</p>
          <div className="mt-3 space-y-2">
            {Properties.GlobalPlugins.map((Plugin) => (
              <button
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                  Properties.SelectedGlobalPluginId === Plugin.Metadata.Id ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
                }`}
                key={Plugin.Metadata.Id}
                onClick={() => Properties.SetSelectedGlobalPluginId(Plugin.Metadata.Id)}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-sm font-black">
                  {Plugin.Metadata.Icon.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <span className="block font-bold">{Plugin.Metadata.DisplayName}</span>
                  <span className={Properties.SelectedGlobalPluginId === Plugin.Metadata.Id ? "text-xs text-blue-100" : "text-xs text-slate-500"}>Global</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
          {Properties.SelectedGlobalPlugin ? (
            <>
              <div className="flex flex-col gap-3 border-b border-slate-800 pb-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-2xl font-black text-white">{Properties.SelectedGlobalPlugin.Metadata.DisplayName}</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Version {Properties.SelectedGlobalPlugin.Metadata.Version} by {Properties.SelectedGlobalPlugin.Metadata.Author}
                  </p>
                </div>
                <button className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500" onClick={() => void Properties.SaveGlobalPlugin(Properties.SelectedGlobalPlugin as AdminPlugin)}>
                  Save
                </button>
              </div>
              <div className="mt-6 grid gap-4">
                {Properties.SelectedGlobalPlugin.WebInterface.map((Field) => (
                  <div key={Field.Key}>
                    {RenderPluginField(Properties.SelectedGlobalPlugin?.Metadata.Id ?? "", Field, Properties.GlobalPluginDraftValues, Properties.UpdateGlobalPluginDraftValue)}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-400">No global plugin.</div>
          )}
        </section>
      </div>
    </section>
  );
}

function UserManagementPanel(Properties: {
  CreateUser: () => Promise<void>;
  CreateUserAccessDraft: UserAccessDraft;
  CreateUserForm: UserForm;
  CurrentUserDiscordId: string;
  DeleteUser: (User: DashboardUserRow) => Promise<void>;
  EditUserAccessDraft: UserAccessDraft;
  EditUserForm: UserForm;
  GrantPlugins: GrantPlugin[];
  Guilds: GuildAccessRow[];
  IsCreateUserOpen: boolean;
  ResetUserSessions: (User: DashboardUserRow) => Promise<void>;
  SaveUser: () => Promise<void>;
  SelectedUser: DashboardUserRow | undefined;
  SelectedUserDiscordId: string;
  SetCreateUserAccessDraft: (Value: UserAccessDraft) => void;
  SetCreateUserForm: (Value: UserForm) => void;
  SetEditUserAccessDraft: (Value: UserAccessDraft) => void;
  SetEditUserForm: (Value: UserForm) => void;
  SetIsCreateUserOpen: (Value: boolean) => void;
  SetSelectedUserDiscordId: (Value: string) => void;
  ToggleAccessGuild: (AccessDraft: UserAccessDraft, SetAccessDraft: (Value: UserAccessDraft) => void, GuildId: string) => void;
  ToggleAccessPlugin: (AccessDraft: UserAccessDraft, SetAccessDraft: (Value: UserAccessDraft) => void, GuildId: string, PluginId: string) => void;
  Users: DashboardUserRow[];
}) {
  const IsEditingSelf = Boolean(Properties.SelectedUser && Properties.SelectedUser.DiscordId === Properties.CurrentUserDiscordId);

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-black text-white">User Management</h2>
          <p className="mt-1 text-sm text-slate-400">Create accounts, edit roles, ban users, reset passwords, and assign server/plugin access.</p>
        </div>
        <button className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-black text-white hover:bg-blue-500" onClick={() => Properties.SetIsCreateUserOpen(true)} title="Create user">
          +
        </button>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-3xl border border-slate-800 bg-slate-950 p-3">
          {Properties.Users.length === 0 ? <p className="p-4 text-sm text-slate-400">No user found.</p> : null}
          <div className="space-y-2">
            {Properties.Users.map((User) => (
              <button
                className={`w-full rounded-2xl px-4 py-3 text-left transition ${
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

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
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
                <label className="block text-sm font-bold text-slate-200">
                  Account type
                  <select
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={IsEditingSelf}
                    onChange={(Event) => Properties.SetEditUserForm({ ...Properties.EditUserForm, Role: Event.target.value as UserForm["Role"] })}
                    value={Properties.EditUserForm.Role}
                  >
                    <option value="User">User</option>
                    <option value="SuperAdmin">SuperAdmin</option>
                  </select>
                </label>
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

              <AccessEditor
                AccessDraft={Properties.EditUserAccessDraft}
                GrantPlugins={Properties.GrantPlugins}
                Guilds={Properties.Guilds}
                SetAccessDraft={Properties.SetEditUserAccessDraft}
                ToggleAccessGuild={Properties.ToggleAccessGuild}
                ToggleAccessPlugin={Properties.ToggleAccessPlugin}
              />

              <div className="flex flex-wrap gap-3">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-3xl font-black text-white">Create user</h3>
                <p className="mt-1 text-sm text-slate-400">Create the account and assign allowed servers/plugins in the same flow.</p>
              </div>
              <button className="rounded-2xl border border-slate-700 px-4 py-2 font-bold text-slate-200 hover:bg-slate-800" onClick={() => Properties.SetIsCreateUserOpen(false)}>
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <AdminInput Label="Login" Value={Properties.CreateUserForm.Username} OnChange={(Value) => Properties.SetCreateUserForm({ ...Properties.CreateUserForm, Username: Value })} />
              <AdminInput Label="Password" Type="password" Value={Properties.CreateUserForm.Password} OnChange={(Value) => Properties.SetCreateUserForm({ ...Properties.CreateUserForm, Password: Value })} />
              <AdminInput Label="Display name" Value={Properties.CreateUserForm.DisplayName} OnChange={(Value) => Properties.SetCreateUserForm({ ...Properties.CreateUserForm, DisplayName: Value })} />
              <AdminInput Label="Discord ID" Value={Properties.CreateUserForm.DiscordId} OnChange={(Value) => Properties.SetCreateUserForm({ ...Properties.CreateUserForm, DiscordId: Value })} />
              <label className="block text-sm font-bold text-slate-200">
                Account type
                <select
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                  onChange={(Event) => Properties.SetCreateUserForm({ ...Properties.CreateUserForm, Role: Event.target.value as UserForm["Role"] })}
                  value={Properties.CreateUserForm.Role}
                >
                  <option value="User">User</option>
                  <option value="SuperAdmin">SuperAdmin</option>
                </select>
              </label>
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
              <AccessEditor
                AccessDraft={Properties.CreateUserAccessDraft}
                GrantPlugins={Properties.GrantPlugins}
                Guilds={Properties.Guilds}
                SetAccessDraft={Properties.SetCreateUserAccessDraft}
                ToggleAccessGuild={Properties.ToggleAccessGuild}
                ToggleAccessPlugin={Properties.ToggleAccessPlugin}
              />
            </div>
            <button className="mt-6 rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500" onClick={() => void Properties.CreateUser()}>
              Create user
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AccessEditor(Properties: {
  AccessDraft: UserAccessDraft;
  GrantPlugins: GrantPlugin[];
  Guilds: GuildAccessRow[];
  SetAccessDraft: (Value: UserAccessDraft) => void;
  ToggleAccessGuild: (AccessDraft: UserAccessDraft, SetAccessDraft: (Value: UserAccessDraft) => void, GuildId: string) => void;
  ToggleAccessPlugin: (AccessDraft: UserAccessDraft, SetAccessDraft: (Value: UserAccessDraft) => void, GuildId: string, PluginId: string) => void;
}) {
  return (
    <div>
      <h4 className="text-xl font-black text-white">Server and plugin access</h4>
      <p className="mt-1 text-sm text-slate-400">Enable a server, then choose which plugins the user can configure on that server.</p>
      <div className="mt-4 grid gap-3">
        {Properties.Guilds.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">No server detected.</p> : null}
        {Properties.Guilds.map((Guild) => {
          const IsEnabled = Boolean(Properties.AccessDraft[Guild.GuildId]);

          return (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4" key={Guild.GuildId}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 font-black text-white">
                    {Guild.Icon ? <img alt="" className="h-11 w-11 rounded-2xl" src={Guild.Icon} /> : Guild.Name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-white">{Guild.Name}</p>
                    <p className="text-xs text-slate-400">
                      {Guild.MemberCount ?? "?"} members | {Guild.GuildId}
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-3 text-sm font-bold text-slate-200">
                  Enabled
                  <input checked={IsEnabled} className="h-5 w-5 accent-blue-600" onChange={() => Properties.ToggleAccessGuild(Properties.AccessDraft, Properties.SetAccessDraft, Guild.GuildId)} type="checkbox" />
                </label>
              </div>
              {IsEnabled ? (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {Properties.GrantPlugins.map((Plugin) => (
                    <label key={Plugin.Id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm font-semibold text-slate-200">
                      <input
                        checked={(Properties.AccessDraft[Guild.GuildId] ?? []).includes(Plugin.Id)}
                        className="h-4 w-4 accent-blue-600"
                        onChange={() => Properties.ToggleAccessPlugin(Properties.AccessDraft, Properties.SetAccessDraft, Guild.GuildId, Plugin.Id)}
                        type="checkbox"
                      />
                      {Plugin.DisplayName}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GuildBanlistPanel(Properties: {
  Guilds: GuildAccessRow[];
  ManualGuildId: string;
  SetGuildBanned: (GuildId: string, IsBanned: boolean) => Promise<void>;
  SetManualGuildId: (Value: string) => void;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-black text-white">Guild Banlist</h2>
          <p className="mt-1 text-sm text-slate-400">By default, a server is allowed. Banned means the bot leaves and rejects this server.</p>
        </div>
        <div className="flex gap-2">
          <input
            className="w-56 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
            onChange={(Event) => Properties.SetManualGuildId(Event.target.value)}
            placeholder="Manual guild ID"
            value={Properties.ManualGuildId}
          />
          <button className="rounded-2xl bg-red-600 px-4 py-3 font-semibold text-white" onClick={() => void Properties.SetGuildBanned(Properties.ManualGuildId, true)}>
            Ban
          </button>
        </div>
      </div>

      <div className="mt-5 divide-y divide-slate-800">
        {Properties.Guilds.length === 0 ? <p className="py-4 text-sm text-slate-400">No known server.</p> : null}
        {Properties.Guilds.map((Guild) => (
          <div key={Guild.GuildId} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 font-black text-white">
                {Guild.Icon ? <img alt="" className="h-11 w-11 rounded-2xl" src={Guild.Icon} /> : Guild.Name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-white">{Guild.Name}</p>
                <p className="text-sm text-slate-400">
                  {Guild.GuildId} | {Guild.IsBotPresent ? "Present" : "Absent"} | {Guild.IsBanned ? "Banned" : "Allowed"}
                </p>
              </div>
            </div>
            <button
              className={`rounded-2xl px-4 py-2 font-semibold text-white ${Guild.IsBanned ? "bg-emerald-600" : "bg-red-600"}`}
              onClick={() => void Properties.SetGuildBanned(Guild.GuildId, !Guild.IsBanned)}
            >
              {Guild.IsBanned ? "Unban" : "Ban"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCard(Properties: { Label: string; Value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-800 bg-slate-900 p-6">
      <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{Properties.Label}</p>
      <p className="mt-3 text-3xl font-black text-white">{Properties.Value}</p>
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

function PatchUser(Body: Partial<DashboardUserRow> & { Password?: string }) {
  return fetch("/api/admin/users", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(Body)
  });
}

function BuildAccessDraft(DiscordId: string, Grants: GuildGrantRow[]): UserAccessDraft {
  return Object.fromEntries(
    Grants.filter((Grant) => Grant.DiscordId === DiscordId).map((Grant) => [
      Grant.GuildId,
      Array.isArray(Grant.AllowedPluginIds) ? Grant.AllowedPluginIds.filter((PluginId): PluginId is string => typeof PluginId === "string") : []
    ])
  );
}

function BuildPluginDraftValues(Plugins: AdminPlugin[]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Plugins.map((Plugin) => [
      Plugin.Metadata.Id,
      Object.fromEntries(Plugin.WebInterface.map((Field) => [Field.Key, Field.Value ?? Field.Default]))
    ])
  );
}

function RenderPluginField(
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

async function ReadFirstError(Responses: Response[]): Promise<string> {
  const FailedResponse = Responses.find((Response) => !Response.ok);
  return FailedResponse ? `${FailedResponse.status} ${await FailedResponse.text()}` : "Unknown admin loading error.";
}
