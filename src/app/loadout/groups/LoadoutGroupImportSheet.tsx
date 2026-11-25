import { AlertIcon } from 'app/dim-ui/AlertIcon';
import FileUpload from 'app/dim-ui/FileUpload';
import Sheet from 'app/dim-ui/Sheet';
import { storesSelector } from 'app/inventory/selectors';
import { DimStore } from 'app/inventory/store-types';
import { showNotification } from 'app/notifications/notifications';
import { useThunkDispatch } from 'app/store/thunk-dispatch';
import { errorMessage } from 'app/utils/errors';
import { DestinyClass } from 'bungie-api-ts/destiny2';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import * as styles from './LoadoutGroupImportSheet.m.scss';
import { ImportedGroup, importedSlotCount, parseLoadoutGroupsImport } from './loadout-group-io';
import { importGroups, importTargetStore } from './loadout-groups';

const classNames: Record<number, string> = {
  [DestinyClass.Titan]: 'Titan',
  [DestinyClass.Hunter]: 'Hunter',
  [DestinyClass.Warlock]: 'Warlock',
};

/** Import loadout groups from a file or pasted text onto the selected character. */
export default function LoadoutGroupImportSheet({
  store,
  onClose,
}: {
  store: DimStore;
  onClose: () => void;
}) {
  const dispatch = useThunkDispatch();
  const stores = useSelector(storesSelector);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ImportedGroup[]>();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string>();

  const read = (contents: string) => {
    setText(contents);
    try {
      const groups = parseLoadoutGroupsImport(contents);
      setParsed(groups);
      setSelected(new Set(groups.map((_, i) => i)));
      setError(undefined);
    } catch (e) {
      setParsed(undefined);
      setError(errorMessage(e));
    }
  };

  const handleDrop = (files: File[]) => {
    const file = files[0];
    if (file) {
      file.text().then(read, (e) => setError(errorMessage(e)));
    }
  };

  const handleImport = async () => {
    if (!parsed) {
      return;
    }
    const groups = parsed.filter((_, i) => selected.has(i));
    const warnings = await dispatch(importGroups(store.id, groups));
    showNotification({
      type: warnings.length ? 'warning' : 'success',
      title: `Imported ${groups.length} loadout group${groups.length === 1 ? '' : 's'}`,
      body: warnings.length ? (
        <ul>
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : undefined,
      duration: warnings.length ? 30000 : 5000,
    });
    onClose();
  };

  const toggle = (i: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      return next;
    });

  return (
    <Sheet onClose={onClose} header={<h1>Import loadout groups</h1>}>
      <div className={styles.sheet}>
        <FileUpload
          title="Choose an export file"
          accept={{ 'application/json': ['.json'], 'text/plain': ['.txt'] }}
          onDrop={handleDrop}
        />
        <label className={styles.paste}>
          Or paste an export here:
          <textarea
            rows={5}
            value={text}
            onChange={(e) => read(e.target.value)}
            placeholder='{"format": "dim-loadout-groups", ...}'
          />
        </label>

        {error && text.trim() && (
          <p>
            <AlertIcon /> {error}
          </p>
        )}

        {parsed && (
          <div className={styles.results}>
            <h3>
              Found {parsed.length} group{parsed.length === 1 ? '' : 's'}
              {parsed.some((g) => g.inGameSlots) ? ' in a Blade Dancer backup' : ''}.
            </h3>
            {parsed.map((group, i) => {
              const target = importTargetStore(stores, group, store.id);
              const count = importedSlotCount(group);
              const wrongClass =
                group.classType !== DestinyClass.Unknown && group.classType !== target.classType;
              const characterMissing =
                group.characterId !== undefined && target.id !== group.characterId;
              return (
                <label key={i} className={styles.groupRow}>
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                  <span>
                    {group.name} ({count} loadout{count === 1 ? '' : 's'}) → {target.name}
                  </span>
                  {wrongClass && (
                    <span className={styles.classWarning}>
                      <AlertIcon /> Made for a {classNames[group.classType] ?? 'different class'} -
                      its gear won't equip on this character
                    </span>
                  )}
                  {characterMissing && (
                    <span className={styles.classWarning}>
                      <AlertIcon /> Its original character isn't on this account, so it goes to the
                      selected one
                    </span>
                  )}
                </label>
              );
            })}
            <p className={styles.note}>
              Exports point at your exact items, so they only work on the account that made them.
            </p>
            <button
              type="button"
              className="dim-button dim-button-primary"
              disabled={selected.size === 0}
              onClick={handleImport}
            >
              Import {selected.size} group{selected.size === 1 ? '' : 's'}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
