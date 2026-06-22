import { Surface, Planned } from "@/components/surface";
import { AskBox } from "@/components/ask-box";

export default function BrainPage() {
  return (
    <Surface title="Brain" blurb="Ask what we already know." phase="Phase 1">
      <AskBox />
      <div className="mt-8">
        <Planned
          points={[
            "Knowledge graph: people, companies, deals, projects with typed edges (Phase 5).",
            "Click an entity to see its trajectory over time.",
          ]}
        />
      </div>
    </Surface>
  );
}
