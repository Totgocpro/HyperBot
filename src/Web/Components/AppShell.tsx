"use client";

import Link from "next/link";
import { usePathname as UsePathname, useRouter as UseRouter } from "next/navigation";
import { useEffect as UseEffect, useState as UseState, useRef as UseRef, type ReactNode } from "react";
import { FiSun, FiMoon, FiUser } from "react-icons/fi";

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
  const [ProfilePanelState, SetProfilePanelState] = UseState<"open" | "closing" | null>(null);
  const [CurrentPassword, SetCurrentPassword] = UseState("");
  const [NewPassword, SetNewPassword] = UseState("");
  const [PasswordStatus, SetPasswordStatus] = UseState("");
  const ProfileRef = UseRef<HTMLDivElement>(null);
  const [PasswordExpanded, SetPasswordExpanded] = UseState(false);
  const [PasswordChanging, SetPasswordChanging] = UseState(false);
  const ShowHud = Pathname !== "/login" && Boolean(User);
  const IsDashboardPage = Pathname.startsWith("/dashboard/");

  UseEffect(() => {
    const StoredTheme = window.localStorage.getItem("HyperBotTheme") ?? "dark";
    SetTheme(StoredTheme);
    document.documentElement.dataset.theme = StoredTheme;
    void LoadUser();
  }, [Pathname]);

  function CloseProfilePanel(): void {
    if (ProfilePanelState !== "open") return;
    SetProfilePanelState("closing");
  }

  UseEffect(() => {
    if (ProfilePanelState !== "open") return;
    function HandleClick(Event: MouseEvent) {
      if (ProfileRef.current && !ProfileRef.current.contains(Event.target as Node)) {
        CloseProfilePanel();
      }
    }
    document.addEventListener("mousedown", HandleClick);
    return () => document.removeEventListener("mousedown", HandleClick);
  }, [ProfilePanelState]);

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
    SetProfilePanelState(null);
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
    if (PasswordChanging) return;
    SetPasswordChanging(true);
    SetPasswordStatus("");
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
      SetPasswordChanging(false);
      return;
    }

    SetPasswordStatus("Password updated.");
    SetCurrentPassword("");
    SetNewPassword("");
    setTimeout(() => { SetPasswordStatus(""); SetPasswordChanging(false); }, 2000);
  }

  return (
    <>
      {ShowHud ? (
        <header className={`fixed inset-x-0 top-0 z-[55] border-b border-slate-800 bg-slate-950/90 px-3 py-2 text-slate-100 shadow-xl shadow-black/20 backdrop-blur sm:px-5 sm:py-3 ${IsDashboardPage ? "hidden lg:block" : ""}`}>
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
              <button className="shrink-0 rounded-2xl border border-slate-700 p-2 text-slate-200 hover:bg-slate-800" onClick={ToggleTheme}>
                <span className="relative flex items-center justify-center">
                  <FiMoon size={18} className={`transition-all duration-700 ease-in-out ${Theme === "dark" ? "scale-100 rotate-0 opacity-100" : "scale-0 rotate-90 opacity-0"} absolute`} />
                  <FiSun size={18} className={`transition-all duration-700 ease-in-out ${Theme === "dark" ? "scale-0 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"} absolute`} />
                  <span className="invisible"><FiMoon size={18} /></span>
                </span>
              </button>
              <div className="relative" ref={ProfileRef}>
                <button className="flex items-center gap-2 rounded-2xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800" onClick={() => SetProfilePanelState(ProfilePanelState === "open" ? "closing" : "open")}>
                  <FiUser size={18} />
                  <span className="hidden md:inline">{User?.DisplayName ?? User?.Username}</span>
                </button>
                {ProfilePanelState ? (
                  <div
                    className={`absolute right-0 top-full z-[70] mt-2 w-80 origin-top-right overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl shadow-black/40 ${ProfilePanelState === "open" ? "animate-profile-panel-in" : "animate-profile-panel-out"}`}
                    onAnimationEnd={() => { if (ProfilePanelState === "closing") SetProfilePanelState(null); }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white">
                          {(User?.DisplayName ?? User?.Username)?.[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm">{User?.DisplayName ?? User?.Username}</p>
                          <p className="text-xs text-slate-400">{User?.Role}</p>
                        </div>
                      </div>
                    </div>
                    <hr className="my-4 border-slate-800" />
                    <button className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800" onClick={() => SetPasswordExpanded(!PasswordExpanded)}>
                      <span>Change password</span>
                      <svg className={`h-3 w-3 transition-transform duration-200 ${PasswordExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <div className={`overflow-hidden transition-all duration-200 ${PasswordExpanded ? "mt-3 max-h-96 opacity-100" : "max-h-0 opacity-0"}`}>
                      <p className="text-xs text-slate-500">Other sessions for your account will be revoked.</p>
                      <label className="mt-3 block text-xs font-bold text-slate-200">
                        Current password
                        <input
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                          onChange={(Event) => SetCurrentPassword(Event.target.value)}
                          type="password"
                          value={CurrentPassword}
                        />
                      </label>
                      <label className="mt-3 block text-xs font-bold text-slate-200">
                        New password
                        <input
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                          onChange={(Event) => SetNewPassword(Event.target.value)}
                          placeholder="At least 8 characters"
                          type="password"
                          value={NewPassword}
                        />
                      </label>
                      {PasswordStatus ? <p className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">{PasswordStatus}</p> : null}
                      <div className="mt-4">
                        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-60" disabled={PasswordChanging} onClick={() => void ChangePassword()}>
                          {PasswordChanging ? (
                            <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : PasswordStatus === "Password updated." ? (
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                          ) : null}
                          {PasswordStatus === "Password updated." ? "Updated" : PasswordChanging ? "Updating..." : "Update password"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-4">
                      <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500" onClick={() => void Logout()}>
                        Logout
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
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
                <span className="inline-flex items-center gap-2">
                  <span className="relative flex items-center justify-center">
                    <FiMoon size={18} className={`transition-all duration-700 ease-in-out ${Theme === "dark" ? "scale-100 rotate-0 opacity-100" : "scale-0 rotate-90 opacity-0"} absolute`} />
                    <FiSun size={18} className={`transition-all duration-700 ease-in-out ${Theme === "dark" ? "scale-0 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"} absolute`} />
                    <span className="invisible"><FiMoon size={18} /></span>
                  </span>
                  {Theme === "dark" ? "Light" : "Dark"}
                </span>
              </button>
              <button
                className="rounded-2xl border border-slate-700 px-3 py-2 text-left text-sm font-semibold text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  SetProfilePanelState("open");
                  SetMobileMenuOpen(false);
                }}
              >
                Profile
              </button>
            </div>
          ) : null}
        </header>
      ) : null}

      <div className={ShowHud ? (IsDashboardPage ? "lg:pt-16" : "pt-16") : ""}>{Properties.children}</div>
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
