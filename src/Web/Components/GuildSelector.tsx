"use client";

import Link from "next/link";
import { useEffect as UseEffect, useMemo as UseMemo, useState as UseState } from "react";
import type { BotGuildSummary } from "../../Core/Types";
import { FiRefreshCw } from "react-icons/fi";

type GuildPayload = {
  Guilds: BotGuildSummary[];
  BotOnline: boolean;
  InviteUrl: string | null;
};

type BotSummary = {
  Id: string;
  Name: string;
  AvatarUrl: string | null;
  IsOnline: boolean;
};

type BotGuildEntry = {
  Bot: BotSummary;
  Guild: BotGuildSummary;
};

type AggregatedGuild = {
  Id: string;
  Name: string;
  Icon: string | null;
  MemberCount: number | null;
  Entries: BotGuildEntry[];
};

export function GuildSelector() {
  const [Bots, SetBots] = UseState<BotSummary[]>([]);
  const [GuildEntries, SetGuildEntries] = UseState<BotGuildEntry[]>([]);
  const [SelectedBotIds, SetSelectedBotIds] = UseState<string[]>([]);
  const [Status, SetStatus] = UseState("Loading servers...");
  const [Loading, SetLoading] = UseState(true);
  const [BotLoadErrors, SetBotLoadErrors] = UseState<Record<string, string>>({});
  const [LastLoadedAt, SetLastLoadedAt] = UseState<number>(0);

  UseEffect(() => {
    void LoadData();
  }, []);

  UseEffect(() => {
    if (LastLoadedAt > 0 && Object.keys(BotLoadErrors).length > 0) {
      SetStatus(`${BuildStatus(Bots, SafeGuildEntries(GuildEntries))} Some bots could not be loaded.`);
    }
  }, [BotLoadErrors, Bots, GuildEntries, LastLoadedAt]);

  const FilteredGuilds = UseMemo(() => {
    const ActiveBotIds = new Set(SelectedBotIds.length ? SelectedBotIds : Bots.map((Bot) => Bot.Id));
    return AggregateGuildEntries(SafeGuildEntries(GuildEntries).filter((Entry) => ActiveBotIds.has(Entry.Bot.Id)));
  }, [Bots, GuildEntries, SelectedBotIds]);

  async function LoadData(): Promise<void> {
    SetLoading(true);
    const BotsResponse = await fetch("/api/bots");

    if (!BotsResponse.ok) {
      SetStatus(await BotsResponse.text());
      SetLoading(false);
      return;
    }

    const BotsPayload = (await BotsResponse.json()) as BotSummary[];
    const Entries: BotGuildEntry[] = [];
    const Errors: Record<string, string> = {};

    for (const Bot of BotsPayload) {
      const GuildsResponse = await fetch(`/api/guilds?botId=${Bot.Id}`);

      if (!GuildsResponse.ok) {
        Errors[Bot.Id] = await GuildsResponse.text();
        continue;
      }

      const GuildsPayload = (await GuildsResponse.json()) as GuildPayload;
      const BotWithStatus = { ...Bot, IsOnline: GuildsPayload.BotOnline };

      for (const Guild of GuildsPayload.Guilds) {
        Entries.push({ Bot: BotWithStatus, Guild });
      }
    }

    SetBots(BotsPayload);
    SetGuildEntries(Entries);
    SetBotLoadErrors(Errors);
    SetLastLoadedAt(Date.now());
    SetSelectedBotIds((PreviousIds) => PreviousIds.filter((BotId) => BotsPayload.some((Bot) => Bot.Id === BotId)));
    SetStatus(BuildStatus(BotsPayload, Entries));
    SetLoading(false);
  }

  function ToggleBotFilter(BotId: string): void {
    SetSelectedBotIds((PreviousIds) =>
      PreviousIds.includes(BotId) ? PreviousIds.filter((Id) => Id !== BotId) : [...PreviousIds, BotId]
    );
  }

  function ClearBotFilter(): void {
    SetSelectedBotIds([]);
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/20 sm:p-6">
      <div className="border-b border-slate-800 pb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-black text-white">Servers</h2>
            <p className="mt-1 text-sm text-slate-400">{Status}</p>
          </div>
          <button
            aria-label="Refresh servers"
            className="w-fit rounded-2xl border border-slate-700 p-3 text-slate-200 hover:bg-slate-800"
            onClick={() => void LoadData()}
            title="Refresh servers"
            type="button"
          >
            <RefreshIcon />
          </button>
        </div>

        <div className="mt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Bot filter</p>
            <button
              className="w-fit rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={SelectedBotIds.length === 0}
              onClick={ClearBotFilter}
              type="button"
            >
              Show all
            </button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {Bots.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-3 text-sm text-slate-400">No bot available.</p> : null}
            {Bots.map((Bot) => {
              const IsSelected = SelectedBotIds.length === 0 || SelectedBotIds.includes(Bot.Id);

              return (
                <button
                  className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-bold transition ${
                    IsSelected ? "border-blue-500 bg-blue-600 text-white" : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                  key={Bot.Id}
                  onClick={() => ToggleBotFilter(Bot.Id)}
                  type="button"
                >
                  <BotAvatar Bot={Bot} Size="Small" />
                  <span className="max-w-40 truncate">{Bot.Name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {Loading ? (
        <div className="flex justify-center py-10">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
        </div>
      ) : FilteredGuilds.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-5 sm:p-8">
          <h3 className="text-lg font-black text-white">No server available</h3>
          <p className="mt-2 text-sm text-slate-400">No server matches the current bot filter.</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {FilteredGuilds.map((Guild) => (
            <ServerCard Guild={Guild} key={Guild.Id} />
          ))}
        </div>
      )}
    </section>
  );
}

function ServerCard(Properties: { Guild: AggregatedGuild }) {
  const { Guild } = Properties;
  const HasDuplicateBots = Guild.Entries.length > 1;
  const PrimaryEntry = Guild.Entries[0];

  return (
    <article className={`rounded-2xl border bg-slate-950 p-4 transition ${HasDuplicateBots ? "border-amber-400/70" : "border-slate-800 hover:border-blue-500"}`}>
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-600 text-lg font-bold text-white">
          {Guild.Icon ? <img alt="" className="h-12 w-12 rounded-2xl object-cover" src={Guild.Icon} /> : Guild.Name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-bold text-white">{Guild.Name}</p>
              <p className="text-sm text-slate-500">{Guild.MemberCount ?? "?"} members</p>
            </div>
            {PrimaryEntry ? (
              <Link
                className="w-full max-w-28 shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-center text-sm font-bold text-white hover:bg-blue-500 sm:w-auto"
                href={`/dashboard/${PrimaryEntry.Bot.Id}/${Guild.Id}`}
              >
                Manage
              </Link>
            ) : null}
          </div>

          <div className="mt-4 grid gap-2">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Linked bot{Guild.Entries.length > 1 ? "s" : ""}</p>
            <div className="flex flex-wrap gap-2">
              {Guild.Entries.map((Entry) => (
                <Link
                  className="flex max-w-full items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-700"
                  href={`/dashboard/${Entry.Bot.Id}/${Guild.Id}`}
                  key={Entry.Bot.Id}
                  title={`Manage ${Guild.Name} with ${Entry.Bot.Name}`}
                >
                  <BotAvatar Bot={Entry.Bot} Size="Small" />
                  <span className="truncate">{Entry.Bot.Name}</span>
                  <span className={`h-2 w-2 rounded-full ${Entry.Bot.IsOnline ? "bg-emerald-400" : "bg-red-400"}`} />
                </Link>
              ))}
            </div>
          </div>

          {HasDuplicateBots ? (
            <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm font-semibold text-amber-100">
              Warning: several bots are present on this server. Use only one bot here unless this is intentional.
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function AggregateGuildEntries(Entries: BotGuildEntry[]): AggregatedGuild[] {
  const GuildsById = new Map<string, AggregatedGuild>();

  for (const Entry of Entries) {
    const ExistingGuild = GuildsById.get(Entry.Guild.Id);

    if (ExistingGuild) {
      ExistingGuild.Entries.push(Entry);
      continue;
    }

    GuildsById.set(Entry.Guild.Id, {
      Id: Entry.Guild.Id,
      Name: Entry.Guild.Name,
      Icon: Entry.Guild.Icon,
      MemberCount: Entry.Guild.MemberCount,
      Entries: [Entry]
    });
  }

  return Array.from(GuildsById.values()).sort((FirstGuild, SecondGuild) => FirstGuild.Name.localeCompare(SecondGuild.Name));
}

function SafeGuildEntries(Value: unknown): BotGuildEntry[] {
  if (!Array.isArray(Value)) {
    return [];
  }

  return Value.filter((Entry): Entry is BotGuildEntry =>
    typeof Entry === "object" &&
    Entry !== null &&
    typeof (Entry as BotGuildEntry).Bot?.Id === "string" &&
    typeof (Entry as BotGuildEntry).Guild?.Id === "string"
  );
}

function BuildStatus(Bots: BotSummary[], Entries: BotGuildEntry[]): string {
  if (Bots.length === 0) {
    return "No bot configured yet.";
  }

  if (Entries.length === 0) {
    return "No server is available for your account.";
  }

  const DuplicateCount = AggregateGuildEntries(Entries).filter((Guild) => Guild.Entries.length > 1).length;

  if (DuplicateCount > 0) {
    return `${Entries.length} bot/server link(s). ${DuplicateCount} server(s) have several linked bots.`;
  }

  return `${Entries.length} bot/server link(s) available.`;
}

function BotAvatar(Properties: { Bot: BotSummary; Size: "Small" | "Large" }) {
  const SizeClassName = Properties.Size === "Small" ? "h-6 w-6 text-[10px]" : "h-10 w-10 text-sm";

  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800 font-black text-slate-300 ${SizeClassName}`}>
      {Properties.Bot.AvatarUrl ? <img alt="" className="h-full w-full object-cover" src={Properties.Bot.AvatarUrl} /> : BuildInitials(Properties.Bot.Name)}
    </span>
  );
}

function BuildInitials(Name: string): string {
  return Name.trim().slice(0, 2).toUpperCase() || "HB";
}

function RefreshIcon() {
  return <FiRefreshCw aria-hidden="true" className="h-5 w-5" />;
}
