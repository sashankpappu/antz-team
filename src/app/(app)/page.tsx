import { auth } from "@/auth";
import { Surface } from "@/components/surface";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mic, Paperclip } from "lucide-react";

/**
 * Capture (home). Phase 0 renders the composer frame — one primary action,
 * "Hand it to Vidur". The signal detector + brain-first recall wire in Phase 1.
 */
export default async function CapturePage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <Surface title={`Good day, ${firstName}`} blurb="Hand it to Vidur — type, paste, or speak." phase="Phase 0">
      <Card>
        <CardBody>
          <textarea
            disabled
            rows={4}
            placeholder="What's on your mind? An idea, an email to act on, a bug, a decision…"
            className="w-full resize-none bg-transparent text-ink placeholder:text-muted focus:outline-none"
          />
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <div className="flex items-center gap-1 text-muted">
              <span className="rounded-md p-2" aria-hidden>
                <Paperclip className="h-4 w-4" />
              </span>
              <span className="rounded-md p-2" aria-hidden>
                <Mic className="h-4 w-4" />
              </span>
              <span className="ml-1 font-mono text-[11px] uppercase tracking-wide">
                paste · voice · email · webhook
              </span>
            </div>
            <Button disabled>Hand it to Vidur</Button>
          </div>
        </CardBody>
      </Card>

      <p className="mt-6 text-sm text-muted">
        On submit, Vidur classifies the input, shows what you already know about it
        from the brain, and proposes a route — <span className="text-ink">know</span> or{" "}
        <span className="text-ink">do</span>. The unified inbox stream appears here.
        <span className="mt-1 block font-mono text-[11px] uppercase tracking-wide text-muted">
          wired in Phase 1
        </span>
      </p>
    </Surface>
  );
}
