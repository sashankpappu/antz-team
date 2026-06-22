import { Surface } from "@/components/surface";
import { GovernClient } from "@/components/govern-client";

export default function GovernPage() {
  return (
    <Surface title="Govern" blurb="Team, brain scoping, audit & config." phase="Phase 5">
      <GovernClient />
    </Surface>
  );
}
