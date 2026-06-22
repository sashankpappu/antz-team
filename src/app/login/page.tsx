import { authMeta } from "@/auth";
import { devSignIn, entraSignIn } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";

/**
 * Sign-in. One primary action. Entra ID is the real provider; the dev button
 * only appears when AUTH_DEV_MODE is on, so the CEO demo is one click locally.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="display text-5xl text-ink">Vidur</h1>
        <p className="mt-3 text-muted">
          One surface over a brain that remembers and a crew that ships.
        </p>

        <div className="mt-10 space-y-3">
          {authMeta.entraConfigured && (
            <form action={entraSignIn}>
              <Button type="submit" className="w-full">
                Continue with Microsoft
              </Button>
            </form>
          )}

          {authMeta.devModeEnabled && (
            <form action={devSignIn}>
              <Button
                type="submit"
                variant={authMeta.entraConfigured ? "ghost" : "primary"}
                className="w-full"
              >
                Sign in as CEO (demo)
              </Button>
            </form>
          )}

          {!authMeta.entraConfigured && !authMeta.devModeEnabled && (
            <p className="rounded-md border border-line bg-card p-4 text-sm text-muted">
              No sign-in provider configured. Set Entra ID credentials or enable
              <span className="font-mono"> AUTH_DEV_MODE</span>.
            </p>
          )}
        </div>

        <p className="mt-8 font-mono text-[11px] uppercase tracking-widest text-muted">
          sessions are httpOnly · no tokens in the browser
        </p>
      </div>
    </main>
  );
}
