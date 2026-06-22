import { auth } from "@/auth";
import { Surface } from "@/components/surface";
import { CaptureClient } from "@/components/capture-client";

/**
 * Capture (home). One composer, one primary action. On submit the brain reads
 * the input first (recall + gap note) and a signal proposes a route.
 */
export default async function CapturePage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <Surface
      title={`Good day, ${firstName}`}
      blurb="Hand it to Vidur — type, paste, or speak."
      phase="Phase 1"
    >
      <CaptureClient />
    </Surface>
  );
}
