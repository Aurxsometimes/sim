import { D2ManifestDefinitions } from 'app/destiny2/d2-definitions';
import BungieImage from 'app/dim-ui/BungieImage';
import ColorDestinySymbols from 'app/dim-ui/destiny-symbols/ColorDestinySymbols';
import { DimStore } from 'app/inventory/store-types';
import { useD2Definitions } from 'app/manifest/selectors';
import { AppIcon, collapseIcon, expandIcon } from 'app/shell/icons';
import { chainComparator, compareBy } from 'app/utils/comparators';
import clsx from 'clsx';
import { BucketHashes } from 'data/d2/generated-enums';
import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { InGameLoadoutIconFromIdentifiers } from '../ingame/InGameLoadoutIcon';
import { Loadout } from '../loadout-types';
import { loadoutsForClassTypeSelector } from '../loadouts-selector';
import * as styles from './LoadoutPicker.m.scss';
import { loadoutGroupsSelector, slotIdentifiers } from './loadout-groups';

interface PickerEntry {
  key: string;
  loadout: Loadout;
  /** Short label shown on the tile */
  label: string;
  /** Slot number or similar, shown as a badge */
  badge?: string;
  /** Full name, used for search and the tooltip */
  fullName: string;
  sortNumber: number;
}

interface PickerSection {
  key: string;
  title: string;
  entries: PickerEntry[];
}

/**
 * Split names like "Gos 11 - Trials" or "S Spire 3 - Nightfall" into prefix,
 * number and label.
 */
export function parseNumberedName(name: string) {
  const dash = name.indexOf(' - ');
  if (dash < 0) {
    return undefined;
  }
  const head = name.slice(0, dash).trim();
  const label = name.slice(dash + 3).trim();
  const space = head.lastIndexOf(' ');
  const prefix = head.slice(0, space).trim();
  const num = head.slice(space + 1);
  if (space < 0 || !prefix || !label || !/^\d+$/.test(num)) {
    return undefined;
  }
  return { prefix, num, label };
}

/**
 * A searchable, sectioned picker for choosing a loadout. Shows the user's DIM
 * loadouts (grouped by name prefix like "Gos 11 - Trials") and the slots of
 * their saved loadout groups.
 */
export default function LoadoutPicker({
  store,
  excludeGroupId,
  onPick,
}: {
  store: DimStore;
  /** Don't list slots from this group (e.g. the one being edited) */
  excludeGroupId?: string;
  onPick: (loadout: Loadout) => void;
}) {
  const dimLoadouts = useSelector(loadoutsForClassTypeSelector(store.classType));
  const groups = useSelector(loadoutGroupsSelector);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const sections = useMemo(() => {
    const result: PickerSection[] = [];

    // Slots from saved loadout groups for this character
    for (const group of groups) {
      if (group.characterId !== store.id || group.id === excludeGroupId || !group.slots.size) {
        continue;
      }
      result.push({
        key: `group-${group.id}`,
        title: `Group: ${group.name}`,
        entries: [...group.slots.entries()]
          .sort(([a], [b]) => a - b)
          .map(([slot, loadout]) => ({
            key: `${group.id}-${slot}`,
            loadout,
            label: loadout.name,
            badge: String(slot + 1),
            fullName: `${group.name} ${slot + 1} ${loadout.name}`,
            sortNumber: slot,
          })),
      });
    }

    // DIM loadouts, sectioned by "Prefix N - Label" naming
    const byPrefix = new Map<string, PickerEntry[]>();
    const other: PickerEntry[] = [];
    for (const loadout of dimLoadouts) {
      const match = parseNumberedName(loadout.name);
      if (match) {
        const { prefix, num, label } = match;
        const entries = byPrefix.get(prefix) ?? [];
        entries.push({
          key: loadout.id,
          loadout,
          label,
          badge: num,
          fullName: loadout.name,
          sortNumber: Number(num),
        });
        byPrefix.set(prefix, entries);
      } else {
        other.push({
          key: loadout.id,
          loadout,
          label: loadout.name,
          fullName: loadout.name,
          sortNumber: 0,
        });
      }
    }
    const loadoutSections: PickerSection[] = [];
    for (const [prefix, entries] of byPrefix) {
      if (entries.length < 2) {
        // A lone numbered loadout isn't really a set
        other.push(...entries.map((e) => ({ ...e, label: e.fullName, badge: undefined })));
        continue;
      }
      loadoutSections.push({ key: `prefix-${prefix}`, title: prefix, entries });
    }
    loadoutSections.sort(compareBy((s) => s.title.toLowerCase()));
    if (other.length) {
      loadoutSections.unshift({ key: 'other', title: 'Loadouts', entries: other });
    }
    result.push(...loadoutSections);

    for (const section of result) {
      section.entries.sort(
        chainComparator(
          compareBy((e) => e.sortNumber),
          compareBy((e) => e.label.toLowerCase()),
        ),
      );
    }
    return result;
  }, [dimLoadouts, groups, store.id, excludeGroupId]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? sections
        .map((s) => ({
          ...s,
          entries: s.title.toLowerCase().includes(q)
            ? s.entries
            : s.entries.filter((e) => e.fullName.toLowerCase().includes(q)),
        }))
        .filter((s) => s.entries.length)
    : sections;

  const toggle = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  return (
    <div className={styles.picker}>
      <input
        type="search"
        className={styles.search}
        placeholder="Search loadouts and groups"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {filtered.map((section) => {
        const isCollapsed = !q && collapsed.has(section.key);
        return (
          <section key={section.key} className={styles.section}>
            <button
              type="button"
              className={styles.sectionHeader}
              onClick={() => toggle(section.key)}
            >
              <AppIcon icon={isCollapsed ? expandIcon : collapseIcon} />
              <span>{section.title}</span>
              <span className={styles.count}>{section.entries.length}</span>
            </button>
            {!isCollapsed && (
              <div className={styles.entries}>
                {section.entries.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={styles.entry}
                    title={entry.fullName}
                    onClick={() => onPick(entry.loadout)}
                  >
                    <LoadoutPickerIcon loadout={entry.loadout} />
                    <span className={styles.entryText}>
                      <ColorDestinySymbols text={entry.label} />
                    </span>
                    {entry.badge && <span className={styles.badge}>{entry.badge}</span>}
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
      {filtered.length === 0 && <p className={styles.empty}>No matching loadouts.</p>}
    </div>
  );
}

function subclassIcon(defs: D2ManifestDefinitions, loadout: Loadout) {
  for (const item of loadout.items) {
    const def = defs.InventoryItem.get(item.hash);
    if (def?.inventory?.bucketTypeHash === BucketHashes.Subclass) {
      return def.displayProperties.icon;
    }
  }
  return undefined;
}

/** The loadout's in-game icon if it has one, otherwise its subclass icon. */
function LoadoutPickerIcon({ loadout }: { loadout: Loadout }) {
  const defs = useD2Definitions()!;
  const identifiers = slotIdentifiers(loadout);
  if (identifiers) {
    return (
      <InGameLoadoutIconFromIdentifiers
        identifiers={identifiers}
        size={36}
        className={styles.icon}
      />
    );
  }
  const icon = subclassIcon(defs, loadout);
  return icon ? (
    <BungieImage src={icon} width={36} height={36} className={styles.icon} />
  ) : (
    <span className={clsx(styles.icon, styles.blankIcon)} />
  );
}
