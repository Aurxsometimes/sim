import Sheet from 'app/dim-ui/Sheet';
import { DimStore } from 'app/inventory/store-types';
import { useThunkDispatch } from 'app/store/thunk-dispatch';
import { RootState } from 'app/store/types';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import LoadoutView from '../LoadoutView';
import EditInGameLoadoutIdentifiers from '../ingame/EditInGameLoadoutIdentifiers';
import { inGameLoadoutsForCharacterSelector } from '../ingame/selectors';
import * as styles from './LoadoutGroupSlotSheet.m.scss';
import LoadoutPicker from './LoadoutPicker';
import {
  LoadoutGroup,
  clearGroupSlot,
  setGroupSlotFromDimLoadout,
  setGroupSlotFromInGame,
  setGroupSlotIdentifiers,
  slotIdentifiers,
} from './loadout-groups';

/** Edit one slot of a loadout group. */
export default function LoadoutGroupSlotSheet({
  group,
  slot,
  store,
  onClose,
}: {
  group: LoadoutGroup;
  slot: number;
  store: DimStore;
  onClose: () => void;
}) {
  const dispatch = useThunkDispatch();
  const loadout = group.slots.get(slot);
  const inGameAtSlot = useSelector((state: RootState) =>
    inGameLoadoutsForCharacterSelector(state, store.id),
  ).find((l) => l.index === slot);
  const [editingIdentifiers, setEditingIdentifiers] = useState(false);

  const copyFromInGame = async () => {
    await dispatch(setGroupSlotFromInGame(group, slot));
    onClose();
  };

  const clearSlot = async () => {
    await dispatch(clearGroupSlot(group, slot));
    onClose();
  };

  const actionButtons = [
    <button
      key="identifiers"
      type="button"
      className="dim-button"
      onClick={() => setEditingIdentifiers(true)}
    >
      Change in-game name & icon
    </button>,
    <button key="clear" type="button" className="dim-button" onClick={clearSlot}>
      Clear slot
    </button>,
  ];

  return (
    <>
      <Sheet
        onClose={onClose}
        header={
          <h1>
            {group.name} — slot {slot + 1}
          </h1>
        }
      >
        <div className={styles.sheet}>
          {loadout ? (
            <LoadoutView
              loadout={loadout}
              store={store}
              actionButtons={actionButtons}
              hideOptimizeArmor
            />
          ) : (
            <p>This slot is empty. Applying the group will clear in-game slot {slot + 1}.</p>
          )}

          <div className={styles.sheetButtons}>
            <button
              type="button"
              className="dim-button"
              disabled={!inGameAtSlot}
              onClick={copyFromInGame}
            >
              {inGameAtSlot
                ? `Copy from in-game slot ${slot + 1} (${inGameAtSlot.name})`
                : `In-game slot ${slot + 1} is empty`}
            </button>
          </div>

          <h3 className={styles.pickerTitle}>Put a different loadout in this slot</h3>
          <LoadoutPicker
            store={store}
            excludeGroupId={group.id}
            onPick={async (picked) => {
              await dispatch(setGroupSlotFromDimLoadout(group, slot, picked));
              onClose();
            }}
          />
        </div>
      </Sheet>
      {editingIdentifiers && loadout && (
        <EditInGameLoadoutIdentifiers
          identifiers={slotIdentifiers(loadout)}
          onSave={(identifiers) => dispatch(setGroupSlotIdentifiers(group, slot, identifiers))}
          onClose={() => setEditingIdentifiers(false)}
        />
      )}
    </>
  );
}
