import { Surface } from "@/components/surface";
import { AskBox } from "@/components/ask-box";
import { KnowledgeGraph } from "@/components/knowledge-graph";

export default function BrainPage() {
  return (
    <Surface title="Brain" blurb="Ask what we already know." phase="Phase 1 · 5">
      <AskBox />
      <section className="mt-10">
        <h2 className="display mb-4 text-2xl text-ink">Knowledge graph</h2>
        <KnowledgeGraph />
      </section>
    </Surface>
  );
}
