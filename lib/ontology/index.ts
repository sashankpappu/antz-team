import { Dimension } from '@prisma/client';
import { ONTOLOGY, ROLE_ENTRY_ORDER, type DimensionDef, type SlotDef } from './dimensions';

export { ONTOLOGY, ROLE_ENTRY_ORDER };
export type { DimensionDef, SlotDef };
export * from './scoring';

/** A slot's fully qualified address, e.g. "SYSTEMS.system_of_record". */
export type SlotRef = string;

export interface SlotAddress {
  dimension: Dimension;
  slot: string;
}

export interface ResolvedSlot extends SlotAddress {
  ref: SlotRef;
  def: SlotDef;
  dimensionDef: DimensionDef;
}

export function slotRef(dimension: Dimension, slot: string): SlotRef {
  return `${dimension}.${slot}`;
}

export function parseSlotRef(ref: SlotRef): SlotAddress | null {
  const dot = ref.indexOf('.');
  if (dot <= 0) return null;
  const dimension = ref.slice(0, dot);
  const slot = ref.slice(dot + 1);
  if (!isDimension(dimension)) return null;
  return { dimension, slot };
}

export function isDimension(value: string): value is Dimension {
  return Object.prototype.hasOwnProperty.call(Dimension, value);
}

const BY_DIMENSION = new Map<Dimension, DimensionDef>(
  ONTOLOGY.map((d) => [d.dimension, d]),
);

const BY_REF = new Map<SlotRef, ResolvedSlot>();
for (const dimensionDef of ONTOLOGY) {
  for (const def of dimensionDef.slots) {
    const ref = slotRef(dimensionDef.dimension, def.key);
    BY_REF.set(ref, { ref, def, dimensionDef, dimension: dimensionDef.dimension, slot: def.key });
  }
}

export const ALL_SLOTS: ResolvedSlot[] = [...BY_REF.values()];
export const TOTAL_SLOT_COUNT = ALL_SLOTS.length;

export function getDimension(dimension: Dimension): DimensionDef {
  const found = BY_DIMENSION.get(dimension);
  if (!found) throw new Error(`Unknown dimension: ${dimension}`);
  return found;
}

export function findSlot(dimension: Dimension, slot: string): ResolvedSlot | undefined {
  return BY_REF.get(slotRef(dimension, slot));
}

export function findSlotByRef(ref: SlotRef): ResolvedSlot | undefined {
  return BY_REF.get(ref);
}

/**
 * The write-time guard that makes scoring possible. A claim whose
 * dimension/slot pair is not in the ontology cannot be scored, so it is not
 * allowed into the store.
 */
export function assertSlot(dimension: Dimension, slot: string): ResolvedSlot {
  const resolved = findSlot(dimension, slot);
  if (!resolved) {
    throw new Error(
      `Claim rejected: ${dimension}.${slot} is not a slot in the meta-ontology. ` +
        `Every claim must map to a scoreable slot.`,
    );
  }
  return resolved;
}

/**
 * How many slots this one unblocks, counted transitively and including
 * itself. Answering "which screens do you open" makes half the Data dimension
 * askable, so Systems and Actors score highest here without special-casing.
 */
const UNLOCK_COUNT = new Map<SlotRef, number>();

function computeUnlockCount(ref: SlotRef, seen: Set<SlotRef>): Set<SlotRef> {
  if (seen.has(ref)) return seen;
  seen.add(ref);
  const resolved = BY_REF.get(ref);
  if (!resolved) return seen;
  for (const next of resolved.def.unlocks) {
    computeUnlockCount(next, seen);
  }
  return seen;
}

for (const ref of BY_REF.keys()) {
  UNLOCK_COUNT.set(ref, computeUnlockCount(ref, new Set<SlotRef>()).size);
}

export function downstreamUnlock(dimension: Dimension, slot: string): number {
  return UNLOCK_COUNT.get(slotRef(dimension, slot)) ?? 1;
}

/**
 * Every unlock edge must point at a real slot, or the ranking silently
 * under-weights a foundational question. Asserted by the ontology test.
 */
export function danglingUnlockRefs(): SlotRef[] {
  const dangling: SlotRef[] = [];
  for (const { ref, def } of BY_REF.values()) {
    for (const target of def.unlocks) {
      if (!BY_REF.has(target)) dangling.push(`${ref} -> ${target}`);
    }
  }
  return dangling;
}

/**
 * Dimension order for an inferred role. Longest matching key wins so that
 * "Chief Operating Officer" is not beaten by a shorter accidental match.
 */
export function entryOrderForRole(role: string | null | undefined): Dimension[] {
  if (role) {
    const needle = role.toLowerCase();
    const keys = Object.keys(ROLE_ENTRY_ORDER)
      .filter((k) => k !== 'default')
      .sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (needle.includes(key)) return ROLE_ENTRY_ORDER[key];
    }
  }
  return ROLE_ENTRY_ORDER.default;
}

/** Position of a dimension in the role's entry order; lower is earlier. */
export function entryOrderIndex(role: string | null | undefined, dimension: Dimension): number {
  const order = entryOrderForRole(role);
  const index = order.indexOf(dimension);
  return index === -1 ? order.length : index;
}
