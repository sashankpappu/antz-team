import { Surface } from "@/components/surface";
import { DecisionsClient } from "@/components/decisions-client";

export default function DecisionsPage() {
  return (
    <Surface title="Decisions" blurb="The human-only forks, with the crew's recommendation." phase="Phase 3">
      <DecisionsClient />
    </Surface>
  );
}
