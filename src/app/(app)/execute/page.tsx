import { Surface } from "@/components/surface";
import { ExecuteBoard } from "@/components/execute-board";

export default function ExecutePage() {
  return (
    <Surface
      title="Execute"
      blurb="Sprints in motion — Think → Plan → Design → Build → Review → Test → Ship."
      phase="Phase 2"
    >
      <ExecuteBoard />
    </Surface>
  );
}
