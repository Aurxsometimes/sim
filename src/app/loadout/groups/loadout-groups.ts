import { InGameLoadoutIdentifiers } from '@destinyitemmanager/dim-api-types';
import { currentAccountSelector } from 'app/accounts/selectors';
import {
  clearInGameLoadout,
  editInGameLoadout as editInGameLoadoutApi,
  snapshotInGameLoadout as snapshotInGameLoadoutApi,
} from 'app/bungie-api/destiny2-api';
import { D2ManifestDefinitions } from 'app/destiny2/d2-definitions';
import {
  allItemsSelector,
  createItemContextSelector,
  storesSelector,
  unlockedPlugSetItemsSelector,
} from 'app/inventory/selectors';
import { DimStore } from 'app/inventory/store-types';
import { getStore } from 'app/inventory/stores-helpers';
import { applyLoadout } from 'app/loadout-drawer/loadout-apply';
import { inGameLoadoutItemsFromEquipped, newLoadout } from 'app/loadout-drawer/loadout-utils';
import { d2ManifestSelector } from 'app/manifest/selectors';
import { RootState, ThunkResult } from 'app/store/types';
import { chainComparator, compareBy } from 'app/utils/comparators';
import { errorMessage } from 'app/utils/errors';
import { Observable } from 'app/utils/observable';
import { createSelector } from 'reselect';
import { deleteLoadout, updateLoadout } from '../actions';
import { inGameLoadoutDeleted, inGameLoadoutUpdated } from '../ingame/actions';
import { implementsDimLoadout } from '../ingame/ingame-loadout-utils';
import {
  availableLoadoutSlotsSelector,
  fullyResolveLoadout,
  inGameLoadoutsForCharacterSelector,
} from '../ingame/selectors';
import {
  convertInGameLoadoutToDimLoadout,
  resolveInGameLoadoutIdentifiers,
} from '../loadout-type-converters';
import { InGameLoadout, Loadout } from '../loadout-types';
import { allLoadoutsIncludingGroupsSelector } from '../loadouts-selector';
import type { ImportedGroup } from './loadout-group-io';
import {
  LoadoutGroupHeaderMeta,
  encodeLoadoutGroupMeta,
  parseLoadoutGroupMeta,
} from './loadout-group-metadata';

/** A saved set of in-game loadouts for one character. */
export interface LoadoutGroup {
  id: string;
  characterId: string;
  name: string;
  rank: number;
  /** The hidden DIM loadout that stores this group's name/rank. */
  header: Loadout;
  /** Filled slots, keyed by 0-based in-game loadout slot index. */
  slots: Map<number, Loadout>;
}

const MAX_LOADOUT_NAME_LENGTH = 50;

/** All loadout groups for the current account, sorted by rank. */
export const loadoutGroupsSelector = createSelector(
  allLoadoutsIncludingGroupsSelector,
  (loadouts): LoadoutGroup[] => {
    const groups = new Map<string, LoadoutGroup>();
    const slotRecords: [string, number, Loadout][] = [];
    for (const loadout of loadouts) {
      const meta = parseLoadoutGroupMeta(loadout.notes);
      if (meta?.kind === 'group') {
        groups.set(meta.groupId, {
          id: meta.groupId,
          characterId: meta.characterId,
          name: meta.name,
          rank: meta.rank,
          header: loadout,
          slots: new Map(),
        });
      } else if (meta?.kind === 'slot') {
        slotRecords.push([meta.groupId, meta.slot, loadout]);
      }
    }
    for (const [groupId, slot, loadout] of slotRecords) {
      groups.get(groupId)?.slots.set(slot, loadout);
    }
    // Tiebreak on name so the order is stable
    return [...groups.values()].sort(
      chainComparator(
        compareBy((g) => g.rank),
        compareBy((g) => g.name),
      ),
    );
  },
);

/** The in-game loadout identifiers (name/color/icon) stored on a slot. */
export function slotIdentifiers(loadout: Loadout): InGameLoadoutIdentifiers | undefined {
  return loadout.parameters?.inGameIdentifiers;
}

/** The first (default) in-game name/color/icon, used for slots made from DIM loadouts. */
export function defaultIdentifiers(defs: D2ManifestDefinitions): InGameLoadoutIdentifiers {
  const first = <T extends { hash: number; index: number; redacted: boolean }>(
    all: Record<number, T>,
  ) =>
    Object.values(all)
      .filter((d) => !d.redacted)
      .sort(compareBy((d) => d.index))[0].hash;
  return {
    nameHash: first(defs.LoadoutName.getAll()),
    colorHash: first(defs.LoadoutColor.getAll()),
    iconHash: first(defs.LoadoutIcon.getAll()),
  };
}

function makeHeader(
  meta: Omit<LoadoutGroupHeaderMeta, 'kind'>,
  classType: DimStore['classType'],
  existing?: Loadout,
): Loadout {
  const header = existing
    ? { ...existing }
    : newLoadout(meta.name.slice(0, MAX_LOADOUT_NAME_LENGTH), [], classType);
  header.name = meta.name.slice(0, MAX_LOADOUT_NAME_LENGTH) || 'Loadout group';
  header.notes = encodeLoadoutGroupMeta({ kind: 'group', ...meta });
  return header;
}

function makeSlotRecord(groupId: string, slot: number, loadout: Loadout): Loadout {
  return {
    ...loadout,
    id: globalThis.crypto.randomUUID(),
    name: loadout.name.slice(0, MAX_LOADOUT_NAME_LENGTH),
    notes: encodeLoadoutGroupMeta({ kind: 'slot', groupId, slot }),
  };
}

function nextRank(groups: LoadoutGroup[]) {
  return groups.length ? Math.max(...groups.map((g) => g.rank)) + 1 : 0;
}

/** Convert the character's current in-game loadouts into slot records. */
function slotsFromInGame(
  inGameLoadouts: InGameLoadout[],
  store: DimStore,
  allItems: ReturnType<typeof allItemsSelector>,
): Map<number, Loadout> {
  const slots = new Map<number, Loadout>();
  for (const inGame of inGameLoadouts) {
    slots.set(inGame.index, convertInGameLoadoutToDimLoadout(inGame, store.classType, allItems));
  }
  return slots;
}

/** Save a new group. `slots` are plain loadouts; they'll be stored as group records. */
function saveNewGroup(
  characterId: string,
  name: string,
  slots: Map<number, Loadout>,
): ThunkResult<string> {
  return async (dispatch, getState) => {
    const store = getStore(storesSelector(getState()), characterId)!;
    const groupId = globalThis.crypto.randomUUID();
    const rank = nextRank(loadoutGroupsSelector(getState()));
    dispatch(updateLoadout(makeHeader({ groupId, characterId, name, rank }, store.classType)));
    for (const [slot, loadout] of slots) {
      dispatch(updateLoadout(makeSlotRecord(groupId, slot, loadout)));
    }
    return groupId;
  };
}

/**
 * Which character an imported group will be saved to: the character it came
 * from if that's on this account, otherwise the fallback (selected) character.
 */
export function importTargetStore(
  stores: DimStore[],
  group: ImportedGroup,
  fallbackCharacterId: string,
): DimStore {
  const original = group.characterId ? getStore(stores, group.characterId) : undefined;
  return original && !original.isVault ? original : getStore(stores, fallbackCharacterId)!;
}

/**
 * Save groups read from an import file. Returns warnings about anything that
 * couldn't be brought over (e.g. items that no longer exist).
 */
export function importGroups(
  fallbackCharacterId: string,
  groups: ImportedGroup[],
): ThunkResult<string[]> {
  return async (dispatch, getState) => {
    const warnings: string[] = [];
    const defs = d2ManifestSelector(getState())!;
    const allItems = allItemsSelector(getState());
    for (const group of groups) {
      const store = importTargetStore(storesSelector(getState()), group, fallbackCharacterId);
      const slots = new Map<number, Loadout>();
      for (const [slot, loadout] of group.slots) {
        slots.set(slot, { ...loadout, classType: store.classType });
      }
      for (const [slot, component] of group.inGameSlots ?? []) {
        const inGameLoadout: InGameLoadout = {
          ...component,
          ...resolveInGameLoadoutIdentifiers(defs, component),
          characterId: store.id,
          index: slot,
          id: `import-${store.id}-${slot}`,
        };
        const loadout = convertInGameLoadoutToDimLoadout(inGameLoadout, store.classType, allItems);
        const wanted = component.items.filter((i) => i.itemInstanceId !== '0').length;
        const missing = wanted - loadout.items.length;
        if (missing > 0) {
          warnings.push(
            `${group.name}, slot ${slot + 1} (${inGameLoadout.name}): ${missing} item(s) aren't in your inventory any more.`,
          );
        }
        slots.set(slot, loadout);
      }
      await dispatch(saveNewGroup(store.id, group.name, slots));
    }
    return warnings;
  };
}

/** Create a new group that's a copy of the character's current in-game loadouts. */
export function createGroupFromInGame(characterId: string, name: string): ThunkResult<string> {
  return async (dispatch, getState) => {
    const store = getStore(storesSelector(getState()), characterId)!;
    const inGame = inGameLoadoutsForCharacterSelector(getState(), characterId);
    const slots = slotsFromInGame(inGame, store, allItemsSelector(getState()));
    return dispatch(saveNewGroup(characterId, name, slots));
  };
}

/** Create a new, empty group. */
export function createEmptyGroup(characterId: string, name: string): ThunkResult<string> {
  return async (dispatch) => dispatch(saveNewGroup(characterId, name, new Map()));
}

/** Make a copy of an existing group. */
export function duplicateGroup(group: LoadoutGroup, name: string): ThunkResult<string> {
  return async (dispatch) => dispatch(saveNewGroup(group.characterId, name, group.slots));
}

export function renameGroup(group: LoadoutGroup, name: string): ThunkResult {
  return async (dispatch) => {
    dispatch(
      updateLoadout(
        makeHeader(
          { groupId: group.id, characterId: group.characterId, name, rank: group.rank },
          group.header.classType,
          group.header,
        ),
      ),
    );
  };
}

export function deleteGroup(group: LoadoutGroup): ThunkResult {
  return async (dispatch) => {
    for (const slot of group.slots.values()) {
      dispatch(deleteLoadout(slot.id));
    }
    dispatch(deleteLoadout(group.header.id));
  };
}

/** Save a new order for a character's groups. */
export function reorderGroups(orderedGroups: LoadoutGroup[]): ThunkResult {
  return async (dispatch) => {
    for (const [rank, group] of orderedGroups.entries()) {
      if (group.rank !== rank) {
        dispatch(
          updateLoadout(
            makeHeader(
              { groupId: group.id, characterId: group.characterId, name: group.name, rank },
              group.header.classType,
              group.header,
            ),
          ),
        );
      }
    }
  };
}

/** Put a loadout into one slot of a group, replacing what's there. */
export function setGroupSlot(group: LoadoutGroup, slot: number, loadout: Loadout): ThunkResult {
  return async (dispatch) => {
    const existing = group.slots.get(slot);
    if (existing) {
      dispatch(deleteLoadout(existing.id));
    }
    dispatch(updateLoadout(makeSlotRecord(group.id, slot, loadout)));
  };
}

/** Copy the character's current in-game loadout at `slot` into the group. */
export function setGroupSlotFromInGame(group: LoadoutGroup, slot: number): ThunkResult {
  return async (dispatch, getState) => {
    const store = getStore(storesSelector(getState()), group.characterId)!;
    const inGame = inGameLoadoutsForCharacterSelector(getState(), group.characterId).find(
      (l) => l.index === slot,
    );
    if (!inGame) {
      return dispatch(clearGroupSlot(group, slot));
    }
    const loadout = convertInGameLoadoutToDimLoadout(
      inGame,
      store.classType,
      allItemsSelector(getState()),
    );
    return dispatch(setGroupSlot(group, slot, loadout));
  };
}

/** Use one of the user's regular DIM loadouts for a group slot. */
export function setGroupSlotFromDimLoadout(
  group: LoadoutGroup,
  slot: number,
  dimLoadout: Loadout,
): ThunkResult {
  return async (dispatch, getState) => {
    const defs = d2ManifestSelector(getState())!;
    const identifiers =
      dimLoadout.parameters?.inGameIdentifiers ??
      (group.slots.get(slot) && slotIdentifiers(group.slots.get(slot)!)) ??
      defaultIdentifiers(defs);
    const loadout: Loadout = {
      ...dimLoadout,
      parameters: { ...dimLoadout.parameters, inGameIdentifiers: identifiers },
    };
    return dispatch(setGroupSlot(group, slot, loadout));
  };
}

/** Change the in-game name/color/icon a group slot will get. */
export function setGroupSlotIdentifiers(
  group: LoadoutGroup,
  slot: number,
  identifiers: InGameLoadoutIdentifiers,
): ThunkResult {
  return async (dispatch) => {
    const existing = group.slots.get(slot);
    if (!existing) {
      return;
    }
    dispatch(
      updateLoadout({
        ...existing,
        parameters: { ...existing.parameters, inGameIdentifiers: identifiers },
      }),
    );
  };
}

export function clearGroupSlot(group: LoadoutGroup, slot: number): ThunkResult {
  return async (dispatch) => {
    const existing = group.slots.get(slot);
    if (existing) {
      dispatch(deleteLoadout(existing.id));
    }
  };
}

/** Replace every slot in the group with the character's current in-game loadouts. */
export function updateGroupFromInGame(group: LoadoutGroup): ThunkResult {
  return async (dispatch, getState) => {
    const store = getStore(storesSelector(getState()), group.characterId)!;
    const inGame = inGameLoadoutsForCharacterSelector(getState(), group.characterId);
    for (const slot of group.slots.values()) {
      dispatch(deleteLoadout(slot.id));
    }
    for (const [slot, loadout] of slotsFromInGame(inGame, store, allItemsSelector(getState()))) {
      dispatch(updateLoadout(makeSlotRecord(group.id, slot, loadout)));
    }
  };
}

export interface ApplyGroupProgress {
  step: string;
  warnings: string[];
}

/**
 * Does this in-game slot already hold the loadout's weapons, armor, mods and subclass setup?
 * (Uses the same check DIM uses to show which in-game loadouts match a DIM loadout.)
 */
function inGameSlotAlreadyHas(
  state: RootState,
  characterId: string,
  inGame: InGameLoadout,
  loadout: Loadout,
) {
  const resolved = fullyResolveLoadout(
    characterId,
    loadout,
    d2ManifestSelector(state),
    unlockedPlugSetItemsSelector.selector(state, characterId),
    createItemContextSelector(state),
    allItemsSelector(state),
  );
  return implementsDimLoadout(inGame, resolved.resolvedLoadoutItems, resolved.resolvedMods);
}

function sameIdentifiers(a: InGameLoadoutIdentifiers, b: InGameLoadoutIdentifiers) {
  return a.nameHash === b.nameHash && a.colorHash === b.colorHash && a.iconHash === b.iconHash;
}

/**
 * Save a loadout into one in-game loadout slot.
 *
 * If the slot already has the right gear, it's left alone (only its name/icon is updated if
 * needed), which is much faster. Otherwise the loadout is equipped and snapshotted into the
 * slot, and stays equipped afterwards. Returns a warning if some items couldn't be equipped.
 */
function writeLoadoutToInGameSlot(
  characterId: string,
  index: number,
  loadout: Loadout,
  report: (step: 'Equipping' | 'Saving' | 'Renaming') => void,
): ThunkResult<string | undefined> {
  return async (dispatch, getState) => {
    const account = currentAccountSelector(getState())!;
    const defs = d2ManifestSelector(getState())!;
    const getTargetStore = () => getStore(storesSelector(getState()), characterId)!;
    const existing = inGameLoadoutsForCharacterSelector(getState(), characterId).find(
      (l) => l.index === index,
    );
    let warning: string | undefined;

    if (existing && inGameSlotAlreadyHas(getState(), characterId, existing, loadout)) {
      const wanted = slotIdentifiers(loadout);
      if (wanted && !sameIdentifiers(wanted, existing)) {
        report('Renaming');
        const renamed: InGameLoadout = {
          ...existing,
          ...wanted,
          ...resolveInGameLoadoutIdentifiers(defs, wanted),
        };
        await editInGameLoadoutApi(account, renamed);
        dispatch(inGameLoadoutUpdated(renamed));
      }
      return undefined;
    }

    report('Equipping');
    await dispatch(applyLoadout(getTargetStore(), loadout));

    // applyLoadout reports its own errors, so check what actually got equipped.
    const store = getTargetStore();
    const wanted = loadout.items.filter((li) => li.equip && li.id && li.id !== '0');
    const missing = wanted.filter(
      (li) => !store.items.some((item) => item.id === li.id && item.equipped),
    );
    if (wanted.length && missing.length === wanted.length) {
      throw new Error(
        `Couldn't equip anything for slot ${index + 1} (${loadout.name}). ` +
          `You may be in an activity - go to orbit or a social space and try again.`,
      );
    }
    if (missing.length) {
      warning = `Slot ${index + 1} (${loadout.name}): ${missing.length} item(s) couldn't be equipped (deleted or unavailable), so it was saved with what you had on instead.`;
    }

    report('Saving');
    // Keep the loadout's own name/icon; otherwise keep what the slot already had.
    const identifiers =
      slotIdentifiers(loadout) ??
      (existing && {
        nameHash: existing.nameHash,
        colorHash: existing.colorHash,
        iconHash: existing.iconHash,
      }) ??
      defaultIdentifiers(defs);
    const inGameLoadout: InGameLoadout = {
      ...identifiers,
      ...resolveInGameLoadoutIdentifiers(defs, identifiers),
      characterId,
      index,
      id: `ingame-${characterId}-${index}`,
      items: inGameLoadoutItemsFromEquipped(store),
    };
    await snapshotInGameLoadoutApi(account, inGameLoadout);
    dispatch(inGameLoadoutUpdated(inGameLoadout));
    return warning;
  };
}

/**
 * Replace a single in-game loadout slot with a loadout. The loadout stays equipped afterwards.
 */
export function replaceInGameLoadout(
  characterId: string,
  index: number,
  loadout: Loadout,
  progress: Observable<ApplyGroupProgress>,
): ThunkResult<{ warnings: string[] }> {
  return async (dispatch) => {
    const warnings: string[] = [];
    const report = (step: string) => progress.next({ step, warnings: [...warnings] });
    try {
      const warning = await dispatch(
        writeLoadoutToInGameSlot(characterId, index, loadout, (step) =>
          report(`${step} ${loadout.name} into slot ${index + 1}`),
        ),
      );
      if (warning) {
        warnings.push(warning);
      }
    } catch (e) {
      report(`Stopped: ${errorMessage(e)}`);
      throw e;
    }
    report('Done');
    return { warnings };
  };
}

/** Clear one in-game loadout slot. */
export function clearInGameSlot(inGameLoadout: InGameLoadout): ThunkResult {
  return async (dispatch, getState) => {
    const account = currentAccountSelector(getState())!;
    await clearInGameLoadout(account, inGameLoadout);
    dispatch(inGameLoadoutDeleted(inGameLoadout));
  };
}

/**
 * Write every slot of a group into the character's in-game loadouts.
 *
 * Bungie's API can only save an in-game loadout from what the character is
 * currently wearing, so for each slot we equip the slot's gear, snapshot it
 * into that slot, and move on. Slots that already match are skipped, and slots that are
 * empty in the group are cleared in game. The last slot written stays equipped.
 */
export function applyLoadoutGroup(
  group: LoadoutGroup,
  progress: Observable<ApplyGroupProgress>,
): ThunkResult<{ warnings: string[] }> {
  return async (dispatch, getState) => {
    const account = currentAccountSelector(getState())!;
    const characterId = group.characterId;
    const slotCount = availableLoadoutSlotsSelector(getState());
    const warnings: string[] = [];
    const report = (step: string) => progress.next({ step, warnings: [...warnings] });

    try {
      for (let index = 0; index < slotCount; index++) {
        const slotLoadout = group.slots.get(index);
        const existing = inGameLoadoutsForCharacterSelector(getState(), characterId).find(
          (l) => l.index === index,
        );

        if (!slotLoadout) {
          if (existing) {
            report(`Clearing slot ${index + 1} of ${slotCount}`);
            await clearInGameLoadout(account, existing);
            dispatch(inGameLoadoutDeleted(existing));
          }
          continue;
        }

        const warning = await dispatch(
          writeLoadoutToInGameSlot(characterId, index, slotLoadout, (step) =>
            report(`${step} slot ${index + 1} of ${slotCount}: ${slotLoadout.name}`),
          ),
        );
        if (warning) {
          warnings.push(warning);
        }
      }
    } catch (e) {
      report(`Stopped: ${errorMessage(e)}`);
      throw e;
    }

    report('Done');
    return { warnings };
  };
}
