import { Confidence, Dimension } from '@prisma/client';

/**
 * A read model over the claim store for rendering.
 *
 * Renders never touch prose. Every table cell, every diagram node and every
 * provenance row is looked up through here, so a section that has nothing
 * behind it renders as a visible hole rather than as confident-sounding filler.
 */

export interface RenderClaim {
  id: string;
  dimension: Dimension;
  slot: string;
  content: string;
  quote: string | null;
  speaker: string | null;
  confidence: Confidence;
  createdAt: Date;
  supersededById?: string | null;
  sourceArtifact?: {
    id: string;
    filename: string;
    kind: string;
    uploadedAt: Date;
  } | null;
  sourceTurn?: { id: string; createdAt: Date; medium: string } | null;
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  [Confidence.HIGH]: 3,
  [Confidence.MEDIUM]: 2,
  [Confidence.LOW]: 1,
};

export class ClaimIndex {
  private readonly bySlot = new Map<string, RenderClaim[]>();

  constructor(public readonly claims: RenderClaim[]) {
    for (const claim of claims) {
      if (claim.supersededById) continue;
      const key = `${claim.dimension}.${claim.slot}`;
      const list = this.bySlot.get(key);
      if (list) list.push(claim);
      else this.bySlot.set(key, [claim]);
    }

    // Strongest evidence first, then EARLIEST recorded.
    //
    // Preferring the newer claim at equal confidence would be "last write
    // wins" wearing a different hat, and that is the one thing this store must
    // not do: a later statement that genuinely disagrees raises a Conflict and
    // both survive, so the render shows the disagreement rather than quietly
    // adopting whichever arrived last. Ordering by id last makes a render
    // byte-identical across calls.
    for (const list of this.bySlot.values()) {
      list.sort((a, b) => {
        const rank = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
        if (rank !== 0) return rank;
        const time = a.createdAt.getTime() - b.createdAt.getTime();
        if (time !== 0) return time;
        return a.id.localeCompare(b.id);
      });
    }
  }

  /** Every live claim on a slot, strongest first. */
  all(dimension: Dimension, slot: string): RenderClaim[] {
    return this.bySlot.get(`${dimension}.${slot}`) ?? [];
  }

  /** The best-evidenced claim on a slot, or null. */
  one(dimension: Dimension, slot: string): RenderClaim | null {
    return this.all(dimension, slot)[0] ?? null;
  }

  /** Only claims strong enough to have filled the slot. */
  established(dimension: Dimension, slot: string): RenderClaim[] {
    return this.all(dimension, slot).filter(
      (c) => c.confidence === Confidence.HIGH || c.confidence === Confidence.MEDIUM,
    );
  }

  /** Short text for a slot, or null when nothing established fills it. */
  text(dimension: Dimension, slot: string): string | null {
    return this.established(dimension, slot)[0]?.content ?? null;
  }

  /**
   * Distinct short labels for a slot — for the list-shaped slots like which
   * systems are read, or what comes in. Capped so a diagram stays readable.
   */
  labels(dimension: Dimension, slot: string, max = 4): string[] {
    const seen: string[] = [];
    for (const claim of this.established(dimension, slot)) {
      const label = shorten(claim.content);
      if (label && !seen.some((s) => s.toLowerCase() === label.toLowerCase())) {
        seen.push(label);
      }
      if (seen.length >= max) break;
    }
    return seen;
  }

  get claimCount(): number {
    return this.claims.filter((c) => !c.supersededById).length;
  }
}

/**
 * Trim a claim to something that fits in a diagram node. Cuts on a word
 * boundary, because a node reading "the shortage track" looks like a bug.
 */
export function shorten(text: string, max = 42): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).trim()}…`;
}
