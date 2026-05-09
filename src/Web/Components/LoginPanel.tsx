"use client";

import { useRouter as UseRouter, useSearchParams as UseSearchParams } from "next/navigation";
import { useEffect as UseEffect, useState as UseState } from "react";

type AuthStatus = {
  NeedsSetup: boolean;
  NeedsBot: boolean;
  Authenticated: boolean;
  User: {
    Username: string;
    DisplayName: string;
    Role: string;
    DiscordId: string;
  } | null;
};

export function LoginPanel() {
  const Router = UseRouter();
  const SearchParams = UseSearchParams();
  const [NeedsSetup, SetNeedsSetup] = UseState(false);
  const [NeedsBot, SetNeedsBot] = UseState(false);
  const [Username, SetUsername] = UseState("");
  const [DisplayName, SetDisplayName] = UseState("");
  const [DiscordId, SetDiscordId] = UseState("");
  const [Password, SetPassword] = UseState("");
  const [BotName, SetBotName] = UseState("");
  const [BotToken, SetBotToken] = UseState("");
  const [BotClientId, SetBotClientId] = UseState("");
  const [Status, SetStatus] = UseState("Checking dashboard state...");

  UseEffect(() => {
    void LoadStatus();
  }, []);

  async function LoadStatus(): Promise<void> {
    const Response = await fetch("/api/auth/status");
    const Payload = (await Response.json()) as AuthStatus;

    if (Payload.Authenticated && !Payload.NeedsBot) {
      Router.push(GetSafeNextPath(SearchParams.get("Next")));
      return;
    }

    SetNeedsSetup(Payload.NeedsSetup);
    SetNeedsBot(Payload.NeedsBot);
    
    if (Payload.NeedsSetup) {
      SetStatus("New database detected. Create the first administrator account.");
    } else if (Payload.NeedsBot) {
      SetStatus("Admin account created. Now add your first Discord bot.");
    } else {
      SetStatus("Sign in with your dashboard account.");
    }
  }

  async function Submit(): Promise<void> {
    if (NeedsBot) {
      const Response = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Name: BotName,
          Token: BotToken,
          ClientId: BotClientId
        })
      });

      if (!Response.ok) {
        SetStatus(await Response.text());
        return;
      }

      Router.push("/");
      Router.refresh();
      return;
    }

    const Endpoint = NeedsSetup ? "/api/auth/setup" : "/api/auth/login";
    const Response = await fetch(Endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        Username,
        DisplayName,
        DiscordId,
        Password
      })
    });

    if (!Response.ok) {
      SetStatus(await Response.text());
      return;
    }

    if (NeedsSetup) {
        void LoadStatus(); // Will trigger NeedsBot state
    } else {
        Router.push(GetSafeNextPath(SearchParams.get("Next")));
        Router.refresh();
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-slate-100">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900 shadow-2xl shadow-black/30 md:grid-cols-[1fr_430px]">
        <div className="bg-gradient-to-br from-blue-700 via-blue-950 to-slate-950 p-8 md:p-10">
          <p className="text-sm font-bold uppercase tracking-wide text-blue-200">HyperBot</p>
          <h1 className="mt-5 text-4xl font-black leading-tight text-white">
            {NeedsSetup ? "First launch" : NeedsBot ? "Bot Setup" : "Dashboard sign in"}
          </h1>
          <p className="mt-4 text-blue-100">
            Welcome to your HyperBot Web Panel
          </p>
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/10 p-5">
            <p className="font-bold text-white">
                {NeedsSetup ? "First admin creation" : NeedsBot ? "Add your bot" : "You need to be log-in"}
            </p>
            <p className="mt-2 text-sm text-blue-100">
              {NeedsSetup
                ? "This account will be SuperAdmin and will be able to manage users."
                : NeedsBot ? "Add your first bot token and client ID to start using HyperBot."
                : "You need to log-in for access the panel"}
            </p>
          </div>
        </div>

        <div className="p-8 md:p-10">
          <h2 className="text-2xl font-black text-white">
              {NeedsSetup ? "Create admin account" : NeedsBot ? "Configure first bot" : "Sign in"}
          </h2>
          <p className="mt-2 text-sm text-slate-400">{Status}</p>

          {NeedsBot ? (
              <>
                <label className="mt-6 block text-sm font-bold text-slate-200">
                    Bot Name
                    <input
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                        onChange={(Event) => SetBotName(Event.target.value)}
                        placeholder="My HyperBot"
                        value={BotName}
                    />
                </label>
                <label className="mt-4 block text-sm font-bold text-slate-200">
                    Client ID
                    <input
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                        onChange={(Event) => SetBotClientId(Event.target.value)}
                        placeholder="Discord Application ID"
                        value={BotClientId}
                    />
                </label>
                <label className="mt-4 block text-sm font-bold text-slate-200">
                    Bot Token
                    <input
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                        onChange={(Event) => SetBotToken(Event.target.value)}
                        placeholder="Bot Token"
                        type="password"
                        value={BotToken}
                    />
                </label>
              </>
          ) : (
              <>
                <label className="mt-6 block text-sm font-bold text-slate-200">
                    Login
                    <input
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                    onChange={(Event) => SetUsername(Event.target.value)}
                    placeholder="admin"
                    value={Username}
                    />
                </label>

                {NeedsSetup ? (
                    <>
                    <label className="mt-4 block text-sm font-bold text-slate-200">
                        Display name
                        <input
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                        onChange={(Event) => SetDisplayName(Event.target.value)}
                        placeholder="Administrator"
                        value={DisplayName}
                        />
                    </label>
                    <label className="mt-4 block text-sm font-bold text-slate-200">
                        Discord User ID
                        <input
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                        onChange={(Event) => SetDiscordId(Event.target.value)}
                        placeholder="Optional but recommended"
                        value={DiscordId}
                        />
                    </label>
                    </>
                ) : null}

                <label className="mt-4 block text-sm font-bold text-slate-200">
                    Password
                    <input
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                    onChange={(Event) => SetPassword(Event.target.value)}
                    placeholder={NeedsSetup ? "At least 8 characters" : "Password"}
                    type="password"
                    value={Password}
                    />
                </label>
              </>
          )}

          <button className="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500" onClick={() => void Submit()}>
            {NeedsSetup ? "Create and continue" : NeedsBot ? "Add and finish" : "Sign in"}
          </button>
        </div>
      </section>
    </main>
  );
}

function GetSafeNextPath(NextPath: string | null): string {
  if (!NextPath || !NextPath.startsWith("/") || NextPath.startsWith("//")) {
    return "/";
  }

  return NextPath;
}
