"use client";

import Link from "next/link";
import { usePathname as UsePathname, useRouter as UseRouter } from "next/navigation";
import { useEffect as UseEffect, useState as UseState, type ReactNode } from "react";

type AuthStatus = {
  Authenticated: boolean;
  User: {
    Username: string;
    DisplayName: string;
    Role: string;
  } | null;
};

export function AppShell(Properties: { children: ReactNode }) {
  const Pathname = UsePathname();
  const Router = UseRouter();
  const [User, SetUser] = UseState<AuthStatus["User"]>(null);
  const [Theme, SetTheme] = UseState("dark");
  const [PasswordPanelOpen, SetPasswordPanelOpen] = UseState(false);
  const [CurrentPassword, SetCurrentPassword] = UseState("");
  const [NewPassword, SetNewPassword] = UseState("");
  const [PasswordStatus, SetPasswordStatus] = UseState("");
  const ShowHud = Pathname !== "/login" && Boolean(User);

  UseEffect(() => {
    const StoredTheme = window.localStorage.getItem("HyperBotTheme") ?? "dark";
    SetTheme(StoredTheme);
    document.documentElement.dataset.theme = StoredTheme;
    void LoadUser();
  }, [Pathname]);

  async function LoadUser(): Promise<void> {
    const Response = await fetch("/api/auth/status");

    if (!Response.ok) {
      SetUser(null);
      return;
    }

    const Payload = (await Response.json()) as AuthStatus;
    SetUser(Payload.User);
  }

  async function Logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
    SetUser(null);
    Router.push("/login");
    Router.refresh();
  }

  function ToggleTheme(): void {
    const NextTheme = Theme === "dark" ? "light" : "dark";
    SetTheme(NextTheme);
    window.localStorage.setItem("HyperBotTheme", NextTheme);
    document.documentElement.dataset.theme = NextTheme;
  }

  async function ChangePassword(): Promise<void> {
    const Response = await fetch("/api/auth/password", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        CurrentPassword,
        NewPassword
      })
    });

    if (!Response.ok) {
      SetPasswordStatus(await Response.text());
      return;
    }

    SetCurrentPassword("");
    SetNewPassword("");
    SetPasswordStatus("Password updated.");
  }

  return (
    <>
      {ShowHud ? (
        <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-800 bg-slate-950/90 px-5 py-3 text-slate-100 shadow-xl shadow-black/20 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-black text-white" href="/">
                HyperBot
              </Link>
              <Link className="text-sm font-semibold text-slate-300 hover:text-white" href="/">
                Servers
              </Link>
              {User?.Role === "SuperAdmin" ? (
                <Link className="text-sm font-semibold text-slate-300 hover:text-white" href="/admin">
                  Admin
                </Link>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right text-sm md:block">
                <p className="font-bold text-white">{User?.DisplayName ?? User?.Username}</p>
                <p className="text-xs text-slate-400">{User?.Role}</p>
              </div>
              <button className="rounded-2xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800" onClick={ToggleTheme}>
                {Theme === "dark" ? "Light" : "Dark"}
              </button>
              <button className="rounded-2xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800" onClick={() => SetPasswordPanelOpen(true)}>
                Password
              </button>
              <button className="rounded-2xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500" onClick={() => void Logout()}>
                Logout
              </button>
            </div>
          </div>
        </header>
      ) : null}
      {PasswordPanelOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-6">
          <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl shadow-black/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-white">Change password</h2>
                <p className="mt-1 text-sm text-slate-400">Other sessions for your account will be revoked.</p>
              </div>
              <button className="rounded-xl border border-slate-700 px-3 py-1 text-sm font-bold text-slate-300" onClick={() => SetPasswordPanelOpen(false)}>
                Close
              </button>
            </div>
            <label className="mt-5 block text-sm font-bold text-slate-200">
              Current password
              <input
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                onChange={(Event) => SetCurrentPassword(Event.target.value)}
                type="password"
                value={CurrentPassword}
              />
            </label>
            <label className="mt-4 block text-sm font-bold text-slate-200">
              New password
              <input
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                onChange={(Event) => SetNewPassword(Event.target.value)}
                placeholder="At least 8 characters"
                type="password"
                value={NewPassword}
              />
            </label>
            {PasswordStatus ? <p className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">{PasswordStatus}</p> : null}
            <button className="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500" onClick={() => void ChangePassword()}>
              Update password
            </button>
          </section>
        </div>
      ) : null}
      <div className={ShowHud ? "pt-16" : ""}>{Properties.children}</div>
    </>
  );
}
