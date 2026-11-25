import { Loadout as ApiLoadout } from '@destinyitemmanager/dim-api-types';
import { DestinyClass, DestinyLoadoutComponent } from 'bungie-api-ts/destiny2';
import {
  convertDimApiLoadoutToLoadout,
  convertDimLoadoutToApiLoadout,
} from '../loadout-type-converters';
import { Loadout } from '../loadout-types';
import { LoadoutGroup } from './loadout-groups';

/**
 * Import/export of Loadout Groups as a JSON file.
 *
 * Slots are stored in DIM's API loadout format, so they reference your exact
 * items by instance ID. That means an export only works on the same Bungie
 * account (other accounts don't have those items).
 */

export const EXPORT_FORMAT = 'dim-loadout-groups';
const EXPORT_VERSION = 1;

interface ExportedGroup {
  name: string;
  classType: DestinyClass;
  /** Keyed by 0-based in-game slot index */
  slots: Record<string, Omit<ApiLoadout, 'id' | 'notes' | 'createdAt' | 'lastUpdatedAt'>>;
}

export interface LoadoutGroupsExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  groups: ExportedGroup[];
}

/** A group read from an import file, ready to be saved. */
export interface ImportedGroup {
  name: string;
  /** Unknown for formats that only record the character (e.g. Blade Dancer). */
  classType: DestinyClass;
  /** Where the group came from, if the file says. Imports go back to this character when it exists. */
  characterId?: string;
  /** Slots already in DIM loadout format (DIM exports). */
  slots: Map<number, Loadout>;
  /**
   * Slots in Bungie's raw in-game loadout format (Blade Dancer backups). These
   * need your inventory to turn into DIM loadouts, so they're converted at
   * import time.
   */
  inGameSlots?: Map<number, DestinyLoadoutComponent>;
}

/** How many filled slots the group has, whichever format it's in. */
export function importedSlotCount(group: ImportedGroup) {
  return group.slots.size + (group.inGameSlots?.size ?? 0);
}

export function exportLoadoutGroups(groups: LoadoutGroup[]): LoadoutGroupsExportFile {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    groups: groups.map((group) => ({
      name: group.name,
      classType: group.header.classType,
      slots: Object.fromEntries(
        [...group.slots.entries()]
          .sort(([a], [b]) => a - b)
          .map(([slot, loadout]) => {
            const {
              id: _id,
              notes: _notes,
              createdAt: _createdAt,
              lastUpdatedAt: _lastUpdatedAt,
              ...rest
            } = convertDimLoadoutToApiLoadout(loadout);
            return [String(slot), rest];
          }),
      ),
    })),
  };
}

export function exportFilename(groups: LoadoutGroup[]) {
  const date = new Date().toISOString().slice(0, 10);
  const base =
    groups.length === 1
      ? groups[0].name.replace(/[^\w -]/g, '').trim() || 'loadout-group'
      : 'loadout-groups';
  return `${base}-${date}.json`;
}

/** Parse a DIM loadout groups export. Throws with a readable message if it isn't one. */
export function parseDimLoadoutGroupsExport(data: unknown): ImportedGroup[] {
  const file = data as Partial<LoadoutGroupsExportFile>;
  if (file?.format !== EXPORT_FORMAT || !Array.isArray(file.groups)) {
    throw new Error("This isn't a DIM loadout groups export.");
  }
  if ((file.version ?? 0) > EXPORT_VERSION) {
    throw new Error('This export was made by a newer version of DIM.');
  }
  return file.groups.map((group, i) => {
    if (typeof group?.name !== 'string' || typeof group.slots !== 'object') {
      throw new Error(`Group ${i + 1} in the file is malformed.`);
    }
    const slots = new Map<number, Loadout>();
    for (const [slotKey, apiLoadout] of Object.entries(group.slots ?? {})) {
      const slot = Number(slotKey);
      if (!Number.isInteger(slot) || slot < 0 || !apiLoadout) {
        continue;
      }
      const loadout = convertDimApiLoadoutToLoadout({
        ...apiLoadout,
        equipped: apiLoadout.equipped ?? [],
        unequipped: apiLoadout.unequipped ?? [],
        name: apiLoadout.name ?? '',
        classType: apiLoadout.classType ?? group.classType ?? DestinyClass.Unknown,
        id: globalThis.crypto.randomUUID(),
      });
      slots.set(slot, loadout);
    }
    return {
      name: group.name,
      classType: group.classType ?? DestinyClass.Unknown,
      slots,
    };
  });
}

/**
 * Read an import from pasted text or a file's contents. Tries each known format
 * in turn.
 */
export function parseLoadoutGroupsImport(text: string): ImportedGroup[] {
  let data: unknown;
  try {
    data = JSON.parse(text.trim());
  } catch {
    throw new Error("Couldn't read that as JSON. Paste the whole export, or pick the .json file.");
  }
  if (isBladeDancerBackup(data)) {
    return parseBladeDancerBackup(data);
  }
  return parseDimLoadoutGroupsExport(data);
}

// Blade Dancer's Destiny Tools backups (destinytools.bladedancer.net)

interface BladeDancerGroup {
  id?: string;
  name: string;
  characterId?: string;
  /** One per in-game slot, in slot order. Empty slots have every item ID "0". */
  loadouts: DestinyLoadoutComponent[];
}

interface BladeDancerBackup {
  version: number;
  groups: BladeDancerGroup[];
}

function isBladeDancerBackup(data: unknown): data is BladeDancerBackup {
  const backup = data as Partial<BladeDancerBackup>;
  return (
    typeof backup?.version === 'number' &&
    Array.isArray(backup.groups) &&
    backup.groups.every(
      (g) => Array.isArray(g?.loadouts) && g.loadouts.every((l) => Array.isArray(l?.items)),
    )
  );
}

function isEmptyInGameLoadout(loadout: DestinyLoadoutComponent) {
  return loadout.items.every((item) => !item.itemInstanceId || item.itemInstanceId === '0');
}

/** Parse a Blade Dancer backup. Group order in the file is kept. */
export function parseBladeDancerBackup(backup: BladeDancerBackup): ImportedGroup[] {
  return backup.groups.map((group, i) => {
    const inGameSlots = new Map<number, DestinyLoadoutComponent>();
    for (const [slot, loadout] of group.loadouts.entries()) {
      if (!isEmptyInGameLoadout(loadout)) {
        inGameSlots.set(slot, loadout);
      }
    }
    return {
      name: typeof group.name === 'string' && group.name.trim() ? group.name : `Group ${i + 1}`,
      classType: DestinyClass.Unknown,
      characterId: typeof group.characterId === 'string' ? group.characterId : undefined,
      slots: new Map(),
      inGameSlots,
    };
  });
}
