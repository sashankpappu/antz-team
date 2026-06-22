"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/cn";

type EntityType = "person" | "company" | "deal" | "project" | "note";
interface Node {
  id: string;
  label: string;
  type: EntityType;
}
interface Edge {
  from: string;
  to: string;
  type: string;
}

const TYPE_LABEL: Record<EntityType, string> = {
  person: "People",
  company: "Companies",
  deal: "Deals",
  project: "Projects",
  note: "Notes",
};
const TYPE_ORDER: EntityType[] = ["person", "company", "deal", "project", "note"];

export function KnowledgeGraph() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/graph");
      if (res.ok) {
        const g = (await res.json()).graph;
        setNodes(g.nodes ?? []);
        setEdges(g.edges ?? []);
      }
      setLoaded(true);
    })();
  }, []);

  const byType = useMemo(() => {
    const m = new Map<EntityType, Node[]>();
    for (const n of nodes) m.set(n.type, [...(m.get(n.type) ?? []), n]);
    return m;
  }, [nodes]);

  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const connections = useMemo(() => {
    if (!selected) return [];
    const out: { dir: "→" | "←"; type: string; other: string }[] = [];
    for (const e of edges) {
      if (e.from === selected) out.push({ dir: "→", type: e.type, other: e.to });
      else if (e.to === selected) out.push({ dir: "←", type: e.type, other: e.from });
    }
    return out;
  }, [selected, edges]);

  if (!loaded) return <p className="text-sm text-muted">Loading the graph…</p>;
  if (nodes.length === 0)
    return <p className="text-sm text-muted">The graph is empty — capture a few notes to wire it up.</p>;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        {nodes.length} entities · {edges.length} connections — scoped to what you can read.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {TYPE_ORDER.filter((t) => byType.has(t)).map((t) => (
          <Card key={t}>
            <CardBody>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-muted">{TYPE_LABEL[t]}</p>
              <ul className="space-y-1">
                {byType.get(t)!.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => setSelected(n.id)}
                      className={cn(
                        "w-full rounded-md px-2 py-1 text-left text-sm transition-colors",
                        selected === n.id ? "bg-accent-tint text-accent-deep" : "text-ink hover:bg-accent-tint/40",
                      )}
                    >
                      {n.label}
                    </button>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>

      {selected && (
        <Card className="border-accent/30">
          <CardBody>
            <p className="text-sm font-medium text-ink">{label(selected)}</p>
            <p className="font-mono text-[11px] text-muted">{selected}</p>
            <div className="mt-3">
              <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-muted">Trajectory · connections</p>
              {connections.length === 0 ? (
                <p className="text-sm text-muted">No connections yet.</p>
              ) : (
                <ul className="space-y-1">
                  {connections.map((c, i) => (
                    <li key={i} className="text-sm text-ink">
                      <span className="font-mono text-xs text-accent">{c.dir} {c.type}</span>{" "}
                      <button className="underline-offset-2 hover:underline" onClick={() => setSelected(c.other)}>
                        {label(c.other)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
