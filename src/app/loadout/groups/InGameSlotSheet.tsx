import Sheet from 'app/dim-ui/Sheet';
import { allItemsSelector } from 'app/inventory/selectors';
import { DimStore } from 'app/inventory/store-types';
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import LoadoutView from '../LoadoutView';
import { InGameLoadoutIconWithIndex } from '../ingame/InGameLoadoutIcon';
import { convertInGameLoadoutToDimLoadout } from '../loadout-type-converters';
import { InGameLoadout, Loadout } from '../loadout-types';
import * as styles from './InGameSlotSheet.m.scss';
import LoadoutPicker from './LoadoutPicker';

/**
 * Click an in-game loadout slot: see what's in it, and replace it with any DIM
 * loadout or group slot, or clear it.
 */
export default function InGameSlotSheet({
  store,
  slot,
  inGameLoadout,
  busy,
  onReplace,
  onClear,
  onClose,
}: {
  store: DimStore;
  slot: number;
  inGameLoadout: InGameLoadout | undefined;
  /** Another in-game write is already running */
  busy: boolean;
  /** Resolves true if the user went ahead (the sheet then closes) */
  onReplace: (slot: number, loadout: Loadout) => Promise<boolean>;
  onClear: (inGameLoadout: InGameLoadout) => Promise<boolean>;
  onClose: () => void;
}) {
  const allItems = useSelector(allItemsSelector);
  const currentAsDimLoadout = useMemo(
    () =>
      inGameLoadout && convertInGameLoadoutToDimLoadout(inGameLoadout, store.classType, allItems),
    [inGameLoadout, store.classType, allItems],
  );

  const handlePick = async (loadout: Loadout) => {
    if (await onReplace(slot, loadout)) {
      onClose();
    }
  };

  const handleClear = async () => {
    if (inGameLoadout && (await onClear(inGameLoadout))) {
      onClose();
    }
  };

  return (
    <Sheet
      onClose={onClose}
      header={
        <h1 className={styles.header}>
          {inGameLoadout && <InGameLoadoutIconWithIndex loadout={inGameLoadout} size={32} />}
          In-game slot {slot + 1}
          {inGameLoadout ? `: ${inGameLoadout.name}` : ' (empty)'}
        </h1>
      }
    >
      <div className={styles.sheet}>
        {currentAsDimLoadout && (
          <LoadoutView
            loadout={currentAsDimLoadout}
            store={store}
            hideOptimizeArmor
            actionButtons={[
              <button key="clear" type="button" className="dim-button" onClick={handleClear}>
                Clear in-game slot
              </button>,
            ]}
          />
        )}
        <h3 className={styles.title}>
          {inGameLoadout ? 'Replace it with' : 'Fill it with'}
          <span className={styles.subtitle}>
            Pick a loadout and DIM writes it straight into this in-game slot.
          </span>
        </h3>
        {busy ? (
          <p>Another in-game update is running. Wait for it to finish first.</p>
        ) : (
          <LoadoutPicker store={store} onPick={handlePick} />
        )}
      </div>
    </Sheet>
  );
}
