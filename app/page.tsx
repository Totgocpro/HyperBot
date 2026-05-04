import Link from "next/link";
import { GuildSelector } from "@/src/Web/Components/GuildSelector";
import { RequireAuthenticatedPage } from "@/src/Web/PageAuth";

export default async function HomePage() {
  await RequireAuthenticatedPage("/");

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-blue-700 via-blue-950 to-slate-900 p-6 text-white shadow-xl shadow-black/20 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-100">HyperBot</p>
            <h1 className="mt-2 text-3xl font-black md:text-4xl">HyperBot dashboard</h1>
            <p className="mt-2 max-w-2xl text-blue-100">
              Manage servers, enable plugins, and edit settings from one interface.
            </p>
          </div>
          <div className="flex gap-3">
            <Link className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-blue-700" href="/admin">
              Global admin
            </Link>
          </div>
        </header>
        <GuildSelector />
      </div>
    </main>
  );
}
