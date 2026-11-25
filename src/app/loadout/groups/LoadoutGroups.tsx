import { DestinyAccount } from 'app/accounts/destiny-account';
import { apiPermissionGrantedSelector } from 'app/dim-api/selectors';
import { AlertIcon } from 'app/dim-ui/AlertIcon';
import CharacterSelect from 'app/dim-ui/CharacterSelect';
import ShowPageLoading from 'app/dim-ui/ShowPageLoading';
import useConfirm from 'app/dim-ui/useConfirm';
import usePrompt from 'app/dim-ui/usePrompt';
import { sortedStoresSelector } from 'app/inventory/selectors';
import { useLoadStores } from 'app/inventory/store/hooks';
import { MakeLoadoutAnalysisAvailable } from 'app/loadout-analyzer/hooks';
import { applyLoadout } from 'app/loadout-drawer/loadout-apply';
import { showNotification } from 'app/notifications/notifications';
import {
  AppIcon,
  addIcon,
  copyIcon,
  deleteIcon,
  downloadIcon,
  dragHandleIcon,
  editIcon,
  plusIcon,
  saveIcon,
  shareIcon,
  uploadIcon,
} from 'app/shell/icons';
import { useThunkDispatch } from 'app/store/thunk-dispatch';
import { RootState } from 'app/store/types';
import { download } from 'app/utils/download';
import { errorMessage } from 'app/utils/errors';
import { usePageTitle } from 'app/utils/hooks';
import { Observable } from 'app/utils/observable';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useSubscription } from 'use-subscription';
import { updateLoadoutStore } from '../actions';
import InGameLoadoutIcon, { InGameLoadoutIconFromIdentifiers } from '../ingame/InGameLoadoutIcon';
import {
  availableLoadoutSlotsSelector,
  inGameLoadoutsForCharacterSelector,
} from '../ingame/selectors';
import { InGameLoadout, Loadout } from '../loadout-types';
import { selectedLoadoutStoreSelector } from '../selectors';
import InGameSlotSheet from './InGameSlotSheet';
import { exportFilename, exportLoadoutGroups } from './loadout-group-io';
import {
  ApplyGroupProgress,
  LoadoutGroup,
  applyLoadoutGroup,
  clearInGameSlot,
  createEmptyGroup,
  createGroupFromInGame,
  deleteGroup,
  duplicateGroup,
  loadoutGroupsSelector,
  renameGroup,
  reorderGroups,
  replaceInGameLoadout,
  slotIdentifiers,
  updateGroupFromInGame,
} from './loadout-groups';
import LoadoutGroupDetail from './LoadoutGroupDetail';
import LoadoutGroupImportSheet from './LoadoutGroupImportSheet';
import * as styles from './LoadoutGroups.m.scss';
import LoadoutGroupSlotSheet from './LoadoutGroupSlotSheet';

/**
 * The Loadout Groups page: save whole sets of in-game loadouts per character
 * and swap them into the game in one go.
 */
export default function LoadoutGroupsContainer({ account }: { account: DestinyAccount }) {
  const storesLoaded = useLoadStores(account);
  usePageTitle('Loadout Groups');

  if (!storesLoaded) {
    return <ShowPageLoading message="Loading your characters..." />;
  }

  return (
    <MakeLoadoutAnalysisAvailable>
      <LoadoutGroupsPage />
    </MakeLoadoutAnalysisAvailable>
  );
}

function LoadoutGroupsPage() {
  const dispatch = useThunkDispatch();
  const stores = useSelector(sortedStoresSelector);
  const selectedStore = useSelector(selectedLoadoutStoreSelector);
  const apiPermissionGranted = useSelector(apiPermissionGrantedSelector);
  const slotCount = useSelector(availableLoadoutSlotsSelector);
  const inGameLoadouts = useSelector((state: RootState) =>
    inGameLoadoutsForCharacterSelector(state, selectedStore.id),
  );
  const allGroups = useSelector(loadoutGroupsSelector);
  const groups = useMemo(
    () => allGroups.filter((g) => g.characterId === selectedStore.id),
    [allGroups, selectedStore.id],
  );

  const [confirmDialog, confirm] = useConfirm();
  const [promptDialog, prompt] = usePrompt();
  const [applying, setApplying] = useState(false);
  const [editingInGameSlot, setEditingInGameSlot] = useState<number>();
  const [editingSlot, setEditingSlot] = useState<{ groupId: string; slot: number }>();
  const [draggingId, setDraggingId] = useState<string>();
  const [dragOverId, setDragOverId] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [openGroup, setOpenGroup] = useState<{ groupId: string; slot?: number }>();

  const handleExport = (toExport: LoadoutGroup[]) => {
    download(
      JSON.stringify(exportLoadoutGroups(toExport), null, 2),
      exportFilename(toExport),
      'application/json',
    );
  };

  const setSelectedStoreId = useCallback(
    (storeId: string) => dispatch(updateLoadoutStore({ storeId })),
    [dispatch],
  );
  useEffect(
    () => () => {
      dispatch(updateLoadoutStore({ storeId: undefined }));
    },
    [dispatch],
  );

  const handleNewGroup = async () => {
    const name = await prompt('Name for the new (empty) group:');
    if (name?.trim()) {
      await dispatch(createEmptyGroup(selectedStore.id, name.trim()));
    }
  };

  const handleSaveCurrent = async () => {
    const name = await prompt('Name for the new group:', {
      defaultValue: 'Current loadouts (copy)',
    });
    if (name?.trim()) {
      await dispatch(createGroupFromInGame(selectedStore.id, name.trim()));
    }
  };

  const handleRename = async (group: LoadoutGroup) => {
    const name = await prompt('Rename group:', { defaultValue: group.name });
    if (name?.trim() && name.trim() !== group.name) {
      await dispatch(renameGroup(group, name.trim()));
    }
  };

  const handleDuplicate = async (group: LoadoutGroup) => {
    const name = await prompt('Name for the copy:', { defaultValue: `${group.name} (copy)` });
    if (name?.trim()) {
      await dispatch(duplicateGroup(group, name.trim()));
    }
  };

  const handleUpdateFromInGame = async (group: LoadoutGroup) => {
    if (
      await confirm(
        `Replace every slot in "${group.name}" with your current in-game loadouts? This can't be undone.`,
      )
    ) {
      await dispatch(updateGroupFromInGame(group));
    }
  };

  const handleDelete = async (group: LoadoutGroup) => {
    if (await confirm(`Delete the group "${group.name}"? This can't be undone.`)) {
      await dispatch(deleteGroup(group));
      return true;
    }
    return false;
  };

  /** Run a long in-game write with a live progress notification and a summary at the end. */
  const runWithProgress = async (
    titles: { running: string; done: string; failed: string },
    start: (progress: Observable<ApplyGroupProgress>) => Promise<{ warnings: string[] }>,
  ) => {
    const progress = new Observable<ApplyGroupProgress>({ step: 'Starting...', warnings: [] });
    setApplying(true);
    const promise = start(progress);
    showNotification({
      title: titles.running,
      body: <ApplyProgress progress={progress} />,
      promise,
      duration: 8000,
    });
    try {
      const { warnings } = await promise;
      showNotification({
        type: warnings.length ? 'warning' : 'success',
        title: titles.done,
        body: warnings.length ? (
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : undefined,
        duration: warnings.length ? 20000 : 5000,
      });
    } catch (e) {
      showNotification({
        type: 'error',
        title: titles.failed,
        body: errorMessage(e),
        duration: 20000,
      });
    } finally {
      setApplying(false);
    }
  };

  const handleApply = async (group: LoadoutGroup) => {
    const ok = await confirm(
      <>
        Write "{group.name}" into your in-game loadouts on {selectedStore.name}?
        <br />
        <br />
        This replaces all {slotCount} of your in-game loadout slots (empty slots in the group get
        cleared). DIM equips each loadout one at a time to save it, so be in orbit or a social
        space, and give it a minute or two. Your current gear is re-equipped at the end.
      </>,
      { okLabel: 'Apply group' },
    );
    if (!ok) {
      return;
    }

    await runWithProgress(
      {
        running: `Applying "${group.name}"`,
        done: `"${group.name}" is now in your in-game loadouts`,
        failed: `Couldn't finish applying "${group.name}"`,
      },
      (progress) => dispatch(applyLoadoutGroup(group, progress)),
    );
  };

  const handleReplaceInGame = async (
    slot: number,
    loadout: Loadout,
    keepEquipped = false,
    skipConfirm = false,
  ) => {
    const existing = inGameLoadouts.find((l) => l.index === slot);
    const ok =
      skipConfirm ||
      (await confirm(
        <>
          Replace in-game slot {slot + 1}
          {existing ? ` (${existing.name})` : ''} on {selectedStore.name} with "{loadout.name}"?
          <br />
          <br />
          DIM equips the loadout to save it, so be in orbit or a social space.{' '}
          {keepEquipped
            ? 'It stays equipped afterwards.'
            : 'Your current gear is re-equipped afterwards.'}
        </>,
        { okLabel: 'Replace' },
      ));
    if (!ok) {
      return false;
    }
    void runWithProgress(
      {
        running: `Replacing in-game slot ${slot + 1}`,
        done: `In-game slot ${slot + 1} is now "${loadout.name}"`,
        failed: `Couldn't replace in-game slot ${slot + 1}`,
      },
      (progress) =>
        dispatch(replaceInGameLoadout(selectedStore.id, slot, loadout, progress, keepEquipped)),
    );
    return true;
  };

  const handleClearInGame = async (inGameLoadout: InGameLoadout) => {
    if (
      !(await confirm(
        `Clear in-game slot ${inGameLoadout.index + 1} (${inGameLoadout.name}) on ${selectedStore.name}?`,
        { okLabel: 'Clear slot' },
      ))
    ) {
      return false;
    }
    try {
      await dispatch(clearInGameSlot(inGameLoadout));
    } catch (e) {
      showNotification({ type: 'error', title: "Couldn't clear the slot", body: errorMessage(e) });
    }
    return true;
  };

  const handleDrop = (targetId: string) => {
    setDragOverId(undefined);
    if (!draggingId || draggingId === targetId) {
      return;
    }
    const order = [...groups];
    const fromIndex = order.findIndex((g) => g.id === draggingId);
    const toIndex = order.findIndex((g) => g.id === targetId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    dispatch(reorderGroups(order));
  };

  const editingGroup = editingSlot && groups.find((g) => g.id === editingSlot.groupId);
  const openedGroup = openGroup && groups.find((g) => g.id === openGroup.groupId);

  const sheets = (
    <>
      {editingGroup && editingSlot && (
        <LoadoutGroupSlotSheet
          group={editingGroup}
          slot={editingSlot.slot}
          store={selectedStore}
          onClose={() => setEditingSlot(undefined)}
        />
      )}
      {editingInGameSlot !== undefined && (
        <InGameSlotSheet
          store={selectedStore}
          slot={editingInGameSlot}
          inGameLoadout={inGameLoadouts.find((l) => l.index === editingInGameSlot)}
          busy={applying}
          onReplace={handleReplaceInGame}
          onClear={handleClearInGame}
          onClose={() => setEditingInGameSlot(undefined)}
        />
      )}
      {importing && (
        <LoadoutGroupImportSheet store={selectedStore} onClose={() => setImporting(false)} />
      )}
      {confirmDialog}
      {promptDialog}
    </>
  );

  if (openedGroup) {
    return (
      <div className={styles.page}>
        <LoadoutGroupDetail
          key={openedGroup.id}
          group={openedGroup}
          store={selectedStore}
          slotCount={slotCount}
          inGameLoadouts={inGameLoadouts}
          initialSlot={openGroup.slot}
          busy={applying}
          onBack={() => setOpenGroup(undefined)}
          onApplyGroup={() => handleApply(openedGroup)}
          onEquipItems={(loadout) =>
            dispatch(applyLoadout(selectedStore, loadout, { allowUndo: true }))
          }
          onCreateInGame={(slot, loadout, keepEquipped, skipConfirm) =>
            handleReplaceInGame(slot, loadout, keepEquipped, skipConfirm)
          }
          onEditSlot={(slot) => setEditingSlot({ groupId: openedGroup.id, slot })}
          onInGameSlotClick={setEditingInGameSlot}
          onRename={() => handleRename(openedGroup)}
          onExport={() => handleExport([openedGroup])}
          onOverwriteFromInGame={() => handleUpdateFromInGame(openedGroup)}
          onDuplicate={() => handleDuplicate(openedGroup)}
          onDelete={async () => {
            if (await handleDelete(openedGroup)) {
              setOpenGroup(undefined);
            }
          }}
        />
        {sheets}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.characterSelect}>
          <CharacterSelect
            stores={stores}
            selectedStore={selectedStore}
            onCharacterChanged={setSelectedStoreId}
          />
        </div>
        <button type="button" className="dim-button" onClick={handleNewGroup}>
          <AppIcon icon={addIcon} /> New group
        </button>
        <button type="button" className="dim-button" onClick={() => setImporting(true)}>
          <AppIcon icon={uploadIcon} /> Import
        </button>
        <button
          type="button"
          className="dim-button"
          disabled={groups.length === 0}
          title={`Export every group for ${selectedStore.name} to a file`}
          onClick={() => handleExport(groups)}
        >
          <AppIcon icon={shareIcon} /> Export all
        </button>
        <span className={styles.hint}>
          <AppIcon icon={dragHandleIcon} /> Drag a card's handle to change its rank · Click a group
          to open it · Click a Current tile to replace that in-game loadout
        </span>
      </div>

      {!apiPermissionGranted && (
        <p className={styles.warning}>
          <AlertIcon /> DIM Sync is off, so loadout groups are saved in this browser only. Use
          Export to back them up.
        </p>
      )}
      {slotCount === 0 && (
        <p className={styles.warning}>
          <AlertIcon /> Bungie didn't report any in-game loadout slots for this account.
        </p>
      )}

      <div className={styles.grid}>
        <CurrentCard
          slotCount={slotCount}
          inGameLoadouts={inGameLoadouts}
          onSaveAsGroup={handleSaveCurrent}
          onSlotClick={setEditingInGameSlot}
        />
        {groups.map((group) => (
          <div
            key={group.id}
            className={clsx(styles.card, {
              [styles.dragOver]: dragOverId === group.id && draggingId !== group.id,
              [styles.dragging]: draggingId === group.id,
            })}
            onDragOver={(e) => {
              if (draggingId) {
                e.preventDefault();
                setDragOverId(group.id);
              }
            }}
            onDragLeave={() => setDragOverId((id) => (id === group.id ? undefined : id))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(group.id);
            }}
          >
            <div className={styles.cardHeader}>
              <span
                className={styles.handle}
                draggable
                title="Drag to change rank"
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', group.id);
                  setDraggingId(group.id);
                }}
                onDragEnd={() => {
                  setDraggingId(undefined);
                  setDragOverId(undefined);
                }}
              >
                <AppIcon icon={dragHandleIcon} />
              </span>
              <button
                type="button"
                className={styles.cardTitle}
                title={`Open ${group.name}`}
                onClick={() => setOpenGroup({ groupId: group.id })}
              >
                {group.name}
              </button>
            </div>
            <div className={styles.tiles}>
              {Array.from({ length: slotCount }, (_, slot) => {
                const loadout = group.slots.get(slot);
                const identifiers = loadout && slotIdentifiers(loadout);
                return (
                  <button
                    type="button"
                    key={slot}
                    className={clsx(styles.tile, { [styles.emptyTile]: !loadout })}
                    title={loadout ? `${slot + 1}: ${loadout.name}` : `Slot ${slot + 1} (empty)`}
                    onClick={() => setOpenGroup({ groupId: group.id, slot })}
                  >
                    {loadout ? (
                      identifiers ? (
                        <InGameLoadoutIconFromIdentifiers identifiers={identifiers} size={64} />
                      ) : (
                        <span>{loadout.name.slice(0, 2)}</span>
                      )
                    ) : (
                      <AppIcon icon={plusIcon} />
                    )}
                    <span className={styles.slotNumber}>{slot + 1}</span>
                  </button>
                );
              })}
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.applyButton}
                title="Apply this group to your in-game loadouts"
                disabled={applying}
                onClick={() => handleApply(group)}
              >
                <AppIcon icon={downloadIcon} />
              </button>
              <button
                type="button"
                className="dim-button"
                title="Rename"
                onClick={() => handleRename(group)}
              >
                <AppIcon icon={editIcon} />
              </button>
              <button
                type="button"
                className="dim-button"
                title="Overwrite with your current in-game loadouts"
                onClick={() => handleUpdateFromInGame(group)}
              >
                <AppIcon icon={saveIcon} />
              </button>
              <button
                type="button"
                className="dim-button"
                title="Duplicate"
                onClick={() => handleDuplicate(group)}
              >
                <AppIcon icon={copyIcon} />
              </button>
              <button
                type="button"
                className="dim-button"
                title="Export to a file"
                onClick={() => handleExport([group])}
              >
                <AppIcon icon={shareIcon} />
              </button>
              <span className={styles.spacer} />
              <button
                type="button"
                className={styles.deleteButton}
                title="Delete group"
                onClick={() => handleDelete(group)}
              >
                <AppIcon icon={deleteIcon} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {sheets}
    </div>
  );
}

/** The first card: what's in the game right now. */
function CurrentCard({
  slotCount,
  inGameLoadouts,
  onSaveAsGroup,
  onSlotClick,
}: {
  slotCount: number;
  inGameLoadouts: InGameLoadout[];
  onSaveAsGroup: () => void;
  onSlotClick: (slot: number) => void;
}) {
  return (
    <div className={clsx(styles.card, styles.current)}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>Current (in game)</span>
      </div>
      <div className={styles.tiles}>
        {Array.from({ length: slotCount }, (_, slot) => {
          const loadout = inGameLoadouts.find((l) => l.index === slot);
          return (
            <button
              type="button"
              key={slot}
              className={clsx(styles.tile, { [styles.emptyTile]: !loadout })}
              title={
                loadout
                  ? `${slot + 1}: ${loadout.name} - click to replace`
                  : `Slot ${slot + 1} (empty) - click to fill`
              }
              onClick={() => onSlotClick(slot)}
            >
              {loadout ? (
                <InGameLoadoutIcon loadout={loadout} size={64} />
              ) : (
                <AppIcon icon={plusIcon} />
              )}
              <span className={styles.slotNumber}>{slot + 1}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className="dim-button"
          title="Save these as a new group"
          onClick={onSaveAsGroup}
        >
          <AppIcon icon={copyIcon} /> Save as group
        </button>
      </div>
    </div>
  );
}

function ApplyProgress({ progress }: { progress: Observable<ApplyGroupProgress> }) {
  const { step, warnings } = useSubscription(progress);
  return (
    <div className={styles.progress}>
      <span>{step}</span>
      {warnings.length > 0 && <span>{warnings.length} warning(s) so far</span>}
    </div>
  );
}
