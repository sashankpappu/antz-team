import { auth } from "@/auth";
import { doSignOut } from "@/lib/auth-actions";
import { getGstack } from "@/lib/gstack";
import { NavRail } from "@/components/nav-rail";
import { BottomTabs } from "@/components/bottom-tabs";
import { LogOut } from "lucide-react";

/**
 * The authenticated shell: persistent nav + a calm top bar. Phase 0 ships the
 * frame; surfaces fill in over Phases 1–5. `needsCount` is wired to live
 * decision data in Phase 3 — held at 0 here so no gold shows yet.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  // The single gold signal: how many forks are waiting on the executive.
  const needsCount = user
    ? getGstack().listDecisions(user.id).filter((d) => !d.resolution).length
    : 0;

  return (
    <div className="flex min-h-screen bg-paper">
      <NavRail needsCount={needsCount} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-paper/80 px-5 py-3 backdrop-blur md:px-8">
          <span className="display text-lg text-ink md:hidden">Vidur</span>
          <div className="ml-auto flex items-center gap-3">
            {user && (
              <div className="text-right leading-tight">
                <div className="text-sm font-medium text-ink">{user.name ?? "You"}</div>
                <div className="font-mono text-[11px] text-muted">{user.role}</div>
              </div>
            )}
            <form action={doSignOut}>
              <button
                type="submit"
                aria-label="Sign out"
                className="rounded-md border border-line p-2 text-muted transition-colors hover:bg-accent-tint/50 hover:text-ink"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 px-5 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
      </div>

      <BottomTabs needsCount={needsCount} />
    </div>
  );
}
