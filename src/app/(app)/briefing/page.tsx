import { Surface } from "@/components/surface";
import { BriefingClient } from "@/components/briefing-client";

export default function BriefingPage() {
  return (
    <Surface title="Dream & Briefing" blurb="What shipped, what's holding, what needs you." phase="Phase 4">
      <BriefingClient />
    </Surface>
  );
}
