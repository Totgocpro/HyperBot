import Link from "next/link";
import { FiStar } from "react-icons/fi";
import { GuildSelector } from "@/src/Web/Components/GuildSelector";
import { RequireAuthenticatedPage } from "@/src/Web/PageAuth";

async function isUpdateAvailable(): Promise<boolean> {
  try {
    const { execSync } = await import("child_process");
    const localHash = execSync("git rev-parse HEAD").toString().trim();
    const remoteHash = execSync("git ls-remote origin HEAD").toString().split("\t")[0].trim();
    return localHash !== remoteHash;
  } catch {
    return false;
  }
}

export default async function HomePage() {
  const User = await RequireAuthenticatedPage("/");
  const updateAvailable = await isUpdateAvailable();

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl">
        {updateAvailable && (
          <div className="mb-4 rounded-2xl border border-amber-700/50 bg-amber-900/30 px-5 py-3 text-center text-sm text-amber-200">
            Update available — run{" "}
            <code className="rounded bg-amber-950 px-2 py-0.5 font-mono text-amber-100">
              ./HyperBot.sh update
            </code>{" "}
            to upgrade.
          </div>
        )}
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-blue-700 via-blue-950 to-slate-900 p-6 text-white shadow-xl shadow-black/20 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-100">HyperBot</p>
            <h1 className="mt-2 text-3xl font-black md:text-4xl">HyperBot dashboard</h1>
            <p className="mt-2 max-w-2xl text-blue-100">
              Manage servers, enable plugins, and edit settings from one interface.
            </p>
          </div>
          <div className="flex gap-3">
            <a
              className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-blue-700"
              href="https://github.com/Totgocpro/HyperBot"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FiStar className="inline-block size-5" /> Star on GitHub
            </a>
            {User.Role === "SuperAdmin" ? (
              <Link className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-blue-700" href="/admin">
                Global admin
              </Link>
            ) : null}
          </div>
        </header>
        <GuildSelector />
      </div>
    </main>
  );
}
