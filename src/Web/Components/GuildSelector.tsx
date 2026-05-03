"use client";

import Link from "next/link";
import { useEffect as UseEffect, useState as UseState } from "react";
import type { BotGuildSummary } from "../../Core/Types";

type GuildPayload = {
  Guilds: BotGuildSummary[];
  BotOnline: boolean;
  InviteUrl: string | null;
};

export function GuildSelector() {
  const [Guilds, SetGuilds] = UseState<BotGuildSummary[]>([]);
  const [BotOnline, SetBotOnline] = UseState(false);
  const [InviteUrl, SetInviteUrl] = UseState<string | null>(null);
  const [Status, SetStatus] = UseState("Loading dashboard...");

  UseEffect(() => {
    void LoadGuilds();
  }, []);

  async function LoadGuilds(): Promise<void> {
    const Response = await fetch("/api/guilds");

    if (!Response.ok) {
      SetStatus(await Response.text());
      return;
    }

    const Payload = (await Response.json()) as GuildPayload;
    SetGuilds(Payload.Guilds);
    SetBotOnline(Payload.BotOnline);
    SetInviteUrl(Payload.InviteUrl);
    SetStatus(BuildStatus(Payload));
  }

  function OpenInvite(): void {
    if (!InviteUrl) {
      return;
    }

    window.open(InviteUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-black text-white">Servers</h2>
          <p className="mt-1 text-sm text-slate-400">{Status}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${BotOnline ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
            {BotOnline ? "Bot online" : "Bot offline"}
          </span>
          <button
            aria-label="Invite bot"
            className="rounded-2xl border border-slate-700 p-3 text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!InviteUrl}
            onClick={OpenInvite}
            title="Invite bot"
          >
            <InviteIcon />
          </button>
          <button
            aria-label="Refresh servers"
            className="rounded-2xl border border-slate-700 p-3 text-slate-200 hover:bg-slate-800"
            onClick={() => void LoadGuilds()}
            title="Refresh servers"
          >
            <RefreshIcon />
          </button>
        </div>
      </div>

      {Guilds.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-5 sm:p-8">
          <h3 className="text-lg font-black text-white">No server detected</h3>
          <p className="mt-2 text-sm text-slate-400">
            If the bot is already on your server, restart `./Dev.sh`, wait for the bot connection log, then refresh.
          </p>
          <p className="mt-3 text-sm text-slate-400">
            Slash commands require the invite to include `applications.commands`.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {Guilds.map((Guild) => (
            <Link
              className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 transition hover:border-blue-500 hover:bg-slate-900"
              href={`/dashboard/${Guild.Id}`}
              key={Guild.Id}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white">
                {Guild.Icon ? <img alt="" className="h-12 w-12 rounded-2xl" src={Guild.Icon} /> : Guild.Name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold text-white">{Guild.Name}</p>
                <p className="text-sm text-slate-500">{Guild.MemberCount ?? "?"} members</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function BuildStatus(Payload: GuildPayload): string {
  if (!Payload.BotOnline) {
    return "Bot offline. Restart `./Dev.sh` and check the Discord token.";
  }

  if (Payload.Guilds.length === 0) {
    return "Bot online, but no server is cached yet.";
  }

  return "Choose a server to manage its plugins.";
}

function InviteIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
      <path d="M14 4h6v6" />
      <path d="m20 4-10 10" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21 12a9 9 0 0 1-15.5 6.2" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8" />
      <path d="M3 18v-5h5" />
      <path d="M21 6v5h-5" />
    </svg>
  );
}
