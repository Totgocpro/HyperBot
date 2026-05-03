"use client";

import { useRouter as UseRouter, useSearchParams as UseSearchParams } from "next/navigation";
import { useEffect as UseEffect, useState as UseState } from "react";

type AuthStatus = {
  NeedsSetup: boolean;
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
  const [Username, SetUsername] = UseState("");
  const [DisplayName, SetDisplayName] = UseState("");
  const [DiscordId, SetDiscordId] = UseState("");
  const [Password, SetPassword] = UseState("");
  const [Status, SetStatus] = UseState("Checking dashboard state...");

  UseEffect(() => {
    void LoadStatus();
  }, []);

  async function LoadStatus(): Promise<void> {
    const Response = await fetch("/api/auth/status");
    const Payload = (await Response.json()) as AuthStatus;

    if (Payload.Authenticated) {
      Router.push(SearchParams.get("Next") ?? "/");
      return;
    }

    SetNeedsSetup(Payload.NeedsSetup);
    SetStatus(
      Payload.NeedsSetup
        ? "New database detected. Create the first administrator account."
        : "Sign in with your dashboard account."
    );
  }

  async function Submit(): Promise<void> {
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

    Router.push(SearchParams.get("Next") ?? "/");
    Router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-slate-100">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900 shadow-2xl shadow-black/30 md:grid-cols-[1fr_430px]">
        <div className="bg-gradient-to-br from-blue-700 via-blue-950 to-slate-950 p-8 md:p-10">
          <p className="text-sm font-bold uppercase tracking-wide text-blue-200">HyperBot</p>
          <h1 className="mt-5 text-4xl font-black leading-tight text-white">
            {NeedsSetup ? "First launch" : "Dashboard sign in"}
          </h1>
          <p className="mt-4 text-blue-100">
            The panel is private. An account is required to access servers, plugins, and administration settings.
          </p>
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/10 p-5">
            <p className="font-bold text-white">{NeedsSetup ? "First admin creation" : "Security"}</p>
            <p className="mt-2 text-sm text-blue-100">
              {NeedsSetup
                ? "This account will be SuperAdmin and will be able to manage users."
                : "Sessions are stored in the database and passwords are hashed with PBKDF2."}
            </p>
          </div>
        </div>

        <div className="p-8 md:p-10">
          <h2 className="text-2xl font-black text-white">{NeedsSetup ? "Create admin account" : "Sign in"}</h2>
          <p className="mt-2 text-sm text-slate-400">{Status}</p>

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

          <button className="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500" onClick={() => void Submit()}>
            {NeedsSetup ? "Create and enter" : "Sign in"}
          </button>
        </div>
      </section>
    </main>
  );
}
