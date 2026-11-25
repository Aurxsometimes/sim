import { createMoveSession } from 'app/inventory/item-move-service';
import { DimItem } from 'app/inventory/item-types';
import { storesSelector } from 'app/inventory/selectors';
import { DimStore } from 'app/inventory/store-types';
import { getStore } from 'app/inventory/stores-helpers';
import { clearItemsOffCharacter } from 'app/loadout-drawer/loadout-apply';
import { showNotification } from 'app/notifications/notifications';
import { loadingTracker } from 'app/shell/loading-tracker';
import { ThunkResult } from 'app/store/types';
import { queueAction } from 'app/utils/action-queue';
import { withCancel } from 'app/utils/cancel';
import { errorMessage } from 'app/utils/errors';
import { BucketCategory } from 'bungie-api-ts/destiny2';

/**
 * Gear that the vault buttons move: unequipped weapons and armor. Equipped
 * items, postmaster items and anything that can't be transferred stay put.
 */
export function shouldVault(item: DimItem) {
  return (
    !item.equipped &&
    !item.notransfer &&
    !item.location.inPostmaster &&
    item.bucket.category === BucketCategory.Equippable &&
    Boolean(item.bucket.vaultBucket) &&
    Boolean(item.bucket.inWeapons || item.bucket.inArmor)
  );
}

function itemsToVault(store: DimStore) {
  return store.isVault ? [] : store.items.filter(shouldVault);
}

/**
 * Move every unequipped piece of gear off the given characters (default: all
 * characters) into the vault.
 */
export function vaultEverything(characterIds?: string[]): ThunkResult {
  return async (dispatch, getState) => {
    const characters = storesSelector(getState()).filter(
      (s) => !s.isVault && (!characterIds || characterIds.includes(s.id)),
    );
    const total = characters.reduce((sum, s) => sum + itemsToVault(s).length, 0);
    const who = characters.length === 1 ? characters[0].name : `${characters.length} characters`;

    if (total === 0) {
      showNotification({
        type: 'info',
        title: 'Nothing to vault',
        body: `${who} has no unequipped weapons or armor to move.`,
      });
      return;
    }

    const [cancelToken, cancel] = withCancel();
    const promise = queueAction(async () => {
      for (const character of characters) {
        // Re-read the character each time; earlier moves may have changed things
        const store = getStore(storesSelector(getState()), character.id);
        if (!store || cancelToken.canceled) {
          continue;
        }
        const items = itemsToVault(store);
        if (items.length) {
          await dispatch(
            clearItemsOffCharacter(store, items, createMoveSession(cancelToken, items), {}),
          );
        }
      }
    });
    loadingTracker.addPromise(promise);

    showNotification({
      type: 'progress',
      title: `Vaulting ${who}'s weapons & armor`,
      body: `Moving ${total} item${total === 1 ? '' : 's'} from ${who} to the vault...`,
      promise,
      onCancel: cancel,
    });

    try {
      await promise;
      const left = storesSelector(getState())
        .filter((s) => characters.some((c) => c.id === s.id))
        .reduce((sum, s) => sum + itemsToVault(s).length, 0);
      showNotification({
        type: left ? 'warning' : 'success',
        title: left
          ? 'Vaulted most of your weapons & armor'
          : `${who}'s weapons & armor are in the vault`,
        body: left
          ? `${total - left} moved. ${left} item${left === 1 ? '' : 's'} couldn't be moved (the vault may be full${cancelToken.canceled ? ', or you cancelled' : ''}).`
          : `Moved ${total} item${total === 1 ? '' : 's'} from ${who}.`,
      });
    } catch (e) {
      showNotification({
        type: 'error',
        title: "Couldn't vault everything",
        body: errorMessage(e),
      });
    }
  };
}
