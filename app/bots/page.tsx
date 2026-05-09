"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/src/Web/Components/AppShell";
import Link from "next/link";

type Bot = {
  Id: string;
  ClientId: string;
  Token: string;
  Name: string;
  AvatarUrl: string | null;
  IsEnabled: boolean;
  IsOnline: boolean;
  GuildCount: number;
  Guilds: Array<{ Id: string; Name: string; Icon: string | null }>;
};

type User = {
    Role: string;
};

export default function BotsPage() {
  const [Bots, SetBots] = useState<Bot[]>([]);
  const [User, SetUser] = useState<User | null>(null);
  const [Loading, SetLoading] = useState(true);
  const [ShowAddModal, SetShowAddModal] = useState(false);
  const [NewBot, SetNewBot] = useState({ ClientId: "", Token: "" });
  const [Error, SetError] = useState("");
  const IsSuperAdmin = User?.Role === "SuperAdmin";

  useEffect(() => {
    void LoadData();
  }, []);

  async function LoadData() {
    const [BotsRes, UserRes] = await Promise.all([
        fetch("/api/bots"),
        fetch("/api/auth/me")
    ]);
    
    if (BotsRes.ok) SetBots(await BotsRes.json());
    if (UserRes.ok) {
        const payload = await UserRes.json();
        SetUser(payload.User);
    }
    SetLoading(false);
  }

  async function AddBot() {
    SetError("");
    const Response = await fetch("/api/bots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(NewBot)
    });

    if (Response.ok) {
      SetShowAddModal(false);
      SetNewBot({ ClientId: "", Token: "" });
      void LoadData();
    } else {
        SetError(await Response.text());
    }
  }

  async function ToggleBot(Bot: Bot) {
    const Response = await fetch(`/api/bots/${Bot.Id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ IsEnabled: !Bot.IsEnabled })
    });

    if (Response.ok) {
      void LoadData();
    }
  }

  async function DeleteBot(Id: string) {
    if (!confirm("Are you sure? This will remove all configuration for this bot.")) return;
    const Response = await fetch(`/api/bots/${Id}`, { method: "DELETE" });
    if (Response.ok) {
      void LoadData();
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white">Discord Bots</h1>
            <p className="text-slate-400">{IsSuperAdmin ? "Manage your Discord applications and their status." : "Invite the bots assigned to your account."}</p>
          </div>
          {IsSuperAdmin && (
            <button
                onClick={() => SetShowAddModal(true)}
                className="rounded-2xl bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-500 transition-colors"
            >
                Add New Bot
            </button>
          )}
        </div>

        {Loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Bots.map((Bot) => (
              <div key={Bot.Id} className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-800">
                    {Bot.AvatarUrl ? (
                      <img src={Bot.AvatarUrl} alt={Bot.Name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-slate-500">
                        {Bot.Name[0]}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-xl font-bold text-white">{Bot.Name}</h2>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${Bot.IsOnline ? "bg-green-500" : "bg-red-500"}`}></span>
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {Bot.IsOnline ? "Online" : "Offline"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Client ID</span>
                    <span className="font-mono text-slate-200">{Bot.ClientId}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Servers</span>
                    <span className="font-bold text-blue-400">{Bot.GuildCount}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {IsSuperAdmin && (
                    <button
                        onClick={() => ToggleBot(Bot)}
                        className={`rounded-xl py-2 text-sm font-bold transition-colors ${
                        Bot.IsEnabled ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                        }`}
                    >
                        {Bot.IsEnabled ? "Disable" : "Enable"}
                    </button>
                  )}
                  {IsSuperAdmin ? (
                    <Link
                      href={`/bots/${Bot.Id}`}
                      className="flex items-center justify-center rounded-xl bg-slate-800 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                      Manage
                    </Link>
                  ) : null}
                  <a
                    href={`https://discord.com/oauth2/authorize?client_id=${Bot.ClientId}&scope=bot%20applications.commands&permissions=8`}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center justify-center rounded-xl bg-blue-600/20 py-2 text-sm font-bold text-blue-400 hover:bg-blue-600/30 transition-colors ${IsSuperAdmin ? "" : "col-span-2"}`}
                  >
                    Invite
                  </a>
                  {IsSuperAdmin && (
                    <button
                        onClick={() => DeleteBot(Bot.Id)}
                        className="rounded-xl bg-red-600/10 py-2 text-sm font-bold text-red-500 hover:bg-red-600/20 transition-colors"
                    >
                        Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {ShowAddModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-6">
            <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
              <h2 className="text-2xl font-black text-white mb-6">Add New Discord Bot</h2>
              <div className="space-y-4">
                {Error && <p className="p-3 rounded-xl bg-red-500/20 text-red-400 text-sm font-bold">{Error}</p>}
                <label className="block text-sm font-bold text-slate-200">
                  Client ID
                  <input
                    type="text"
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                    placeholder="1234567890"
                    value={NewBot.ClientId}
                    onChange={(e) => SetNewBot({ ...NewBot, ClientId: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-bold text-slate-200">
                  Bot Token
                  <input
                    type="password"
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                    placeholder="MTIzNDU2..."
                    value={NewBot.Token}
                    onChange={(e) => SetNewBot({ ...NewBot, Token: e.target.value })}
                  />
                </label>
                <p className="text-xs text-slate-500 italic">Name and avatar will be automatically fetched from Discord.</p>
              </div>
              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => SetShowAddModal(false)}
                  className="flex-1 rounded-2xl border border-slate-700 py-3 font-bold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={AddBot}
                  className="flex-1 rounded-2xl bg-blue-600 py-3 font-bold text-white hover:bg-blue-500"
                >
                  Add Bot
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
