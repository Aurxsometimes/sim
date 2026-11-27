import Dropdown, { Option } from 'app/dim-ui/Dropdown';
import { DimStore } from 'app/inventory/store-types';
import { AppIcon, deleteIcon, downloadIcon, faAngleLeft, plusIcon } from 'app/shell/icons';
import { useThunkDispatch } from 'app/store/thunk-dispatch';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import LoadoutView from '../LoadoutView';
import EditInGameLoadoutIdentifiers from '../ingame/EditInGameLoadoutIdentifiers';
import InGameLoadoutIcon, { InGameLoadoutIconFromIdentifiers } from '../ingame/InGameLoadoutIcon';
import { InGameLoadout, Loadout } from '../loadout-types';
import * as styles from './LoadoutGroupDetail.m.scss';
import LoadoutPicker from './LoadoutPicker';
import {
  LoadoutGroup,
  clearGroupSlot,
  setGroupSlotFromDimLoadout,
  setGroupSlotIdentifiers,
  slotIdentifiers,
} from './loadout-groups';

/**
 * A single group, opened full-page: the selected slot's loadout on the left,
 * the group's slots and the character's in-game slots on the right, and an
 * Equip menu for pushing things into the game.
 */
export default function LoadoutGroupDetail({
  group,
  store,
  slotCount,
  inGameLoadouts,
  initialSlot,
  busy,
  onBack,
  onApplyGroup,
  onEquipItems,
  onCreateInGame,
  onEditSlot,
  onInGameSlotClick,
  onRename,
  onExport,
  onOverwriteFromInGame,
  onDuplicate,
  onDelete,
}: {
  group: LoadoutGroup;
  store: DimStore;
  slotCount: number;
  inGameLoadouts: InGameLoadout[];
  initialSlot?: number;
  /** An in-game write is already running */
  busy: boolean;
  onBack: () => void;
  onApplyGroup: () => void;
  onEquipItems: (loadout: Loadout) => void;
  onCreateInGame: (slot: number, loadout: Loadout, skipConfirm?: boolean) => void;
  onEditSlot: (slot: number) => void;
  onInGameSlotClick: (slot: number) => void;
  onRename: () => void;
  onExport: () => void;
  onOverwriteFromInGame: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const dispatch = useThunkDispatch();
  const firstFilled = [...group.slots.keys()].sort((a, b) => a - b)[0] ?? 0;
  const [selectedSlot, setSelectedSlot] = useState(initialSlot ?? firstFilled);
  const [editingIdentifiers, setEditingIdentifiers] = useState(false);

  // If the opened slot is past this account's slot count, fall back to the first one
  useEffect(() => {
    if (slotCount > 0 && selectedSlot >= slotCount) {
      setSelectedSlot(0);
    }
  }, [slotCount, selectedSlot]);

  const loadout = group.slots.get(selectedSlot);
  const identifiers = loadout && slotIdentifiers(loadout);
  const inGameAtSlot = inGameLoadouts.find((l) => l.index === selectedSlot);

  const equipOptions: Option[] = [
    {
      key: 'all',
      content: (
        <span className={styles.option}>
          <AppIcon icon={downloadIcon} /> Equip all loadouts in this group
        </span>
      ),
      disabled: busy,
      onSelected: onApplyGroup,
    },
    { key: 'sep' },
    {
      key: 'items',
      content: "Equip this loadout's items",
      disabled: !loadout,
      onSelected: () => loadout && onEquipItems(loadout),
    },
    {
      key: 'create',
      content: `Create this loadout in game (slot ${selectedSlot + 1})`,
      disabled: !loadout || busy,
      onSelected: () => loadout && onCreateInGame(selectedSlot, loadout),
    },
  ];

  const manageOptions: Option[] = [
    { key: 'rename', content: 'Rename group', onSelected: onRename },
    { key: 'duplicate', content: 'Duplicate group', onSelected: onDuplicate },
    {
      key: 'overwrite',
      content: 'Overwrite with current in-game loadouts',
      onSelected: onOverwriteFromInGame,
    },
    { key: 'sep' },
    {
      key: 'delete',
      content: (
        <span className={styles.danger}>
          <AppIcon icon={deleteIcon} /> Delete group
        </span>
      ),
      onSelected: onDelete,
    },
  ];

  const shareOptions: Option[] = [
    { key: 'export', content: 'Export this group to a file', onSelected: onExport },
  ];

  return (
    <div className={styles.detail}>
      <div className={styles.topBar}>
        <button type="button" className="dim-button" onClick={onBack}>
          <AppIcon icon={faAngleLeft} /> Back
        </button>
        <button type="button" className={styles.groupName} onClick={onRename} title="Rename">
          {group.name}
        </button>
        <Dropdown options={equipOptions} label="Equip" className={styles.equipMenu}>
          Equip
        </Dropdown>
        <Dropdown options={shareOptions} label="Share">
          Share
        </Dropdown>
        <Dropdown options={manageOptions} label="Overwrite / delete" className={styles.manageMenu}>
          Overwrite / delete
        </Dropdown>
      </div>

      <div className={styles.body}>
        <div className={styles.main}>
          <div className={styles.slotHeader}>
            <span className={styles.editing}>Editing</span>
            {identifiers ? (
              <InGameLoadoutIconFromIdentifiers identifiers={identifiers} size={72} />
            ) : (
              <span className={styles.blankIcon} />
            )}
            <span className={styles.slotNum}>#{selectedSlot + 1}</span>
            <span className={styles.slotName}>{loadout ? loadout.name : 'Empty slot'}</span>
          </div>

          {loadout ? (
            <LoadoutView
              loadout={loadout}
              store={store}
              hideOptimizeArmor
              actionButtons={[
                <button
                  key="change"
                  type="button"
                  className="dim-button"
                  onClick={() => onEditSlot(selectedSlot)}
                >
                  Change loadout…
                </button>,
                <button
                  key="ids"
                  type="button"
                  className="dim-button"
                  onClick={() => setEditingIdentifiers(true)}
                >
                  Name & icon
                </button>,
                <button
                  key="clear"
                  type="button"
                  className="dim-button"
                  onClick={() => dispatch(clearGroupSlot(group, selectedSlot))}
                >
                  Clear slot
                </button>,
              ]}
            />
          ) : (
            <div className={styles.emptySlot}>
              <p>
                Slot {selectedSlot + 1} is empty in this group. Pick a loadout to put here
                {inGameAtSlot ? `, or copy in-game slot ${selectedSlot + 1}` : ''}.
              </p>
              {inGameAtSlot && (
                <button
                  type="button"
                  className="dim-button"
                  onClick={() => onEditSlot(selectedSlot)}
                >
                  More options…
                </button>
              )}
              <LoadoutPicker
                store={store}
                excludeGroupId={group.id}
                onPick={(picked) =>
                  dispatch(setGroupSlotFromDimLoadout(group, selectedSlot, picked))
                }
              />
            </div>
          )}
        </div>

        <div className={styles.side}>
          <div className={styles.tiles}>
            {Array.from({ length: slotCount }, (_, slot) => {
              const slotLoadout = group.slots.get(slot);
              const ids = slotLoadout && slotIdentifiers(slotLoadout);
              return (
                <button
                  type="button"
                  key={slot}
                  className={clsx(styles.tile, {
                    [styles.emptyTile]: !slotLoadout,
                    [styles.selected]: slot === selectedSlot,
                  })}
                  title={slotLoadout ? `${slot + 1}: ${slotLoadout.name}` : `Slot ${slot + 1}`}
                  onClick={() => setSelectedSlot(slot)}
                >
                  {slotLoadout ? (
                    ids ? (
                      <InGameLoadoutIconFromIdentifiers identifiers={ids} size={64} />
                    ) : (
                      <span>{slotLoadout.name.slice(0, 2)}</span>
                    )
                  ) : (
                    <AppIcon icon={plusIcon} />
                  )}
                  <span className={styles.slotNumber}>{slot + 1}</span>
                </button>
              );
            })}
          </div>

          <h3 className={styles.sideTitle}>Character slots</h3>
          <p className={styles.sideHint}>
            {loadout
              ? `Click a slot to put #${selectedSlot + 1} ${loadout.name} there in game. Shift-click to choose a different loadout.`
              : 'Pick a filled group slot above, then click one of these to put it in game.'}
          </p>
          <div className={styles.tiles}>
            {Array.from({ length: slotCount }, (_, slot) => {
              const inGame = inGameLoadouts.find((l) => l.index === slot);
              return (
                <button
                  type="button"
                  key={slot}
                  className={clsx(styles.tile, {
                    [styles.emptyTile]: !inGame,
                    [styles.target]: loadout && !busy,
                  })}
                  title={
                    loadout
                      ? `Put #${selectedSlot + 1} ${loadout.name} into in-game slot ${slot + 1}${
                          inGame ? ` (replaces ${inGame.name})` : ''
                        }`
                      : inGame
                        ? `${slot + 1}: ${inGame.name} - click to replace in game`
                        : `Slot ${slot + 1} (empty) - click to fill in game`
                  }
                  onClick={(e) => {
                    // Selected group loadout -> straight into this in-game slot
                    if (loadout && !busy && !e.shiftKey) {
                      onCreateInGame(slot, loadout, true);
                    } else {
                      onInGameSlotClick(slot);
                    }
                  }}
                >
                  {inGame ? (
                    <InGameLoadoutIcon loadout={inGame} size={64} />
                  ) : (
                    <AppIcon icon={plusIcon} />
                  )}
                  <span className={styles.slotNumber}>{slot + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {editingIdentifiers && loadout && (
        <EditInGameLoadoutIdentifiers
          identifiers={identifiers}
          onSave={(ids) => dispatch(setGroupSlotIdentifiers(group, selectedSlot, ids))}
          onClose={() => setEditingIdentifiers(false)}
        />
      )}
    </div>
  );
}
