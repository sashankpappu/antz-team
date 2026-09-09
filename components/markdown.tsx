'use client';

import { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';

/**
 * Renders a document view: markdown, with the Mermaid blocks drawn.
 *
 * The diagrams are the point of the render — a swimlane with three `?` in it is
 * the fastest way for an exec to see what is missing — so they are drawn here
 * rather than left as code fences.
 */
export function Markdown({ source }: { source: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    marked.setOptions({ gfm: true, breaks: false });
    return marked.parse(source, { async: false }) as string;
  }, [source]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const blocks = [...container.querySelectorAll('pre > code.language-mermaid')];
    if (blocks.length === 0) return;

    let cancelled = false;

    void (async () => {
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'strict',
        flowchart: { useMaxWidth: true, htmlLabels: false },
      });

      for (const [index, block] of blocks.entries()) {
        if (cancelled) return;
        const definition = block.textContent ?? '';
        const host = block.parentElement;
        if (!host) continue;

        try {
          const { svg } = await mermaid.render(`d${Date.now()}-${index}`, definition);
          const wrapper = document.createElement('div');
          wrapper.className = 'my-4 overflow-x-auto rounded-md border border-line bg-white p-3';
          wrapper.innerHTML = svg;
          host.replaceWith(wrapper);
        } catch {
          // A diagram that will not parse stays as its source. Better a visible
          // block of text than a section that silently disappears.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [html]);

  return <div ref={containerRef} className="doc" dangerouslySetInnerHTML={{ __html: html }} />;
}
