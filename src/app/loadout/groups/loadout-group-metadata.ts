/**
 * Loadout Groups are stored through DIM Sync as ordinary DIM loadouts with a
 * machine-readable marker in their notes. Each group has one "header" record
 * (holding the group's name, character and rank) plus one record per filled
 * in-game loadout slot.
 *
 * This file intentionally has no imports so it can be used from low-level
 * selectors without creating import cycles.
 */

const MARKER = '[dim-loadout-group]';

export interface LoadoutGroupHeaderMeta {
  kind: 'group';
  groupId: string;
  characterId: string;
  name: string;
  rank: number;
}

export interface LoadoutGroupSlotMeta {
  kind: 'slot';
  groupId: string;
  /** 0-based in-game loadout slot index */
  slot: number;
}

export type LoadoutGroupMeta = LoadoutGroupHeaderMeta | LoadoutGroupSlotMeta;

export function encodeLoadoutGroupMeta(meta: LoadoutGroupMeta): string {
  return MARKER + JSON.stringify(meta);
}

export function parseLoadoutGroupMeta(notes: string | undefined): LoadoutGroupMeta | undefined {
  if (!notes?.startsWith(MARKER)) {
    return undefined;
  }
  try {
    const meta = JSON.parse(notes.slice(MARKER.length)) as LoadoutGroupMeta;
    if (meta.kind === 'group' || meta.kind === 'slot') {
      return meta;
    }
  } catch {}
  return undefined;
}

/** Is this loadout one of the hidden records that make up a Loadout Group? */
export function isLoadoutGroupRecord(loadout: { notes?: string }): boolean {
  return Boolean(loadout.notes?.startsWith(MARKER));
}
