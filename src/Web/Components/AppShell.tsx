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
  const [MobileMenuOpen, SetMobileMenuOpen] = UseState(false);
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
    SetMobileMenuOpen(false);
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
        <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-800 bg-slate-950/90 px-3 py-2 text-slate-100 shadow-xl shadow-black/20 backdrop-blur sm:px-5 sm:py-3">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-4">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Link className="rounded-2xl bg-blue-600 px-3 py-2 text-sm font-black text-white sm:px-4" href="/">
                HyperBot
              </Link>
              <Link className="hidden text-xs font-semibold text-slate-300 hover:text-white sm:inline sm:text-sm" href="/">
                Servers
              </Link>
              <Link className="hidden text-xs font-semibold text-slate-300 hover:text-white sm:inline sm:text-sm" href="/bots">
                Bots
              </Link>
              {User?.Role === "SuperAdmin" ? (
                <Link className="hidden text-xs font-semibold text-slate-300 hover:text-white sm:inline sm:text-sm" href="/admin">
                  Admin
                </Link>
              ) : null}
            </div>
            <button
              aria-expanded={MobileMenuOpen}
              aria-label="Open navigation menu"
              className="rounded-2xl border border-slate-700 p-2 text-slate-200 hover:bg-slate-800 sm:hidden"
              onClick={() => SetMobileMenuOpen(!MobileMenuOpen)}
            >
              <HamburgerIcon />
            </button>
            <div className="hidden items-center gap-3 sm:flex">
              <div className="hidden text-right text-sm md:block">
                <p className="font-bold text-white">{User?.DisplayName ?? User?.Username}</p>
                <p className="text-xs text-slate-400">{User?.Role}</p>
              </div>
              <button className="shrink-0 rounded-2xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800" onClick={ToggleTheme}>
                {Theme === "dark" ? "Light" : "Dark"}
              </button>
              <button className="shrink-0 rounded-2xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800" onClick={() => SetPasswordPanelOpen(true)}>
                Password
              </button>
              <button className="shrink-0 rounded-2xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500" onClick={() => void Logout()}>
                Logout
              </button>
            </div>
          </div>
          {MobileMenuOpen ? (
            <div className="mx-auto mt-3 grid max-w-7xl gap-2 rounded-3xl border border-slate-800 bg-slate-900 p-3 sm:hidden">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <p className="font-bold text-white">{User?.DisplayName ?? User?.Username}</p>
                <p className="text-xs text-slate-400">{User?.Role}</p>
              </div>
              <Link className="rounded-2xl px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800" href="/" onClick={() => SetMobileMenuOpen(false)}>
                Servers
              </Link>
              <Link className="rounded-2xl px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800" href="/" onClick={() => SetMobileMenuOpen(false)}>
                Servers
              </Link>
              <Link className="rounded-2xl px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800" href="/bots" onClick={() => SetMobileMenuOpen(false)}>
                Bots
              </Link>
              {User?.Role === "SuperAdmin" ? (
                <Link className="rounded-2xl px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800" href="/admin" onClick={() => SetMobileMenuOpen(false)}>
                  Admin
                </Link>
              ) : null}
              <button className="rounded-2xl border border-slate-700 px-3 py-2 text-left text-sm font-semibold text-slate-200 hover:bg-slate-800" onClick={ToggleTheme}>
                {Theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              </button>
              <button
                className="rounded-2xl border border-slate-700 px-3 py-2 text-left text-sm font-semibold text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  SetPasswordPanelOpen(true);
                  SetMobileMenuOpen(false);
                }}
              >
                Change password
              </button>
              <button className="rounded-2xl bg-red-600 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-red-500" onClick={() => void Logout()}>
                Logout
              </button>
            </div>
          ) : null}
        </header>
      ) : null}
      {PasswordPanelOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-6">
          <section className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 p-4 text-slate-100 shadow-2xl shadow-black/30 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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

function HamburgerIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}
