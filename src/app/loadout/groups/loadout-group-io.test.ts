import { DestinyClass } from 'bungie-api-ts/destiny2';
import { Loadout } from '../loadout-types';
import { EXPORT_FORMAT, exportLoadoutGroups, parseLoadoutGroupsImport } from './loadout-group-io';
import { LoadoutGroup } from './loadout-groups';

function makeLoadout(name: string, itemId: string): Loadout {
  return {
    id: `id-${name}`,
    name,
    classType: DestinyClass.Hunter,
    notes: '[dim-loadout-group]{"kind":"slot","groupId":"g","slot":0}',
    clearSpace: false,
    items: [{ id: itemId, hash: 1234, amount: 1, equip: true }],
    parameters: { inGameIdentifiers: { nameHash: 1, colorHash: 2, iconHash: 3 } },
  };
}

const group: LoadoutGroup = {
  id: 'g',
  characterId: 'c',
  name: 'Gos',
  rank: 0,
  header: { ...makeLoadout('Gos', '0'), items: [] },
  slots: new Map([
    [0, makeLoadout('Raid', '111')],
    [6, makeLoadout('PvP', '222')],
  ]),
};

describe('loadout group import/export', () => {
  it('round-trips groups through JSON', () => {
    const file = exportLoadoutGroups([group]);
    expect(file.format).toBe(EXPORT_FORMAT);
    // Internal storage details shouldn't leak into exports
    expect(JSON.stringify(file)).not.toContain('[dim-loadout-group]');

    const [imported] = parseLoadoutGroupsImport(JSON.stringify(file));
    expect(imported.name).toBe('Gos');
    expect(imported.classType).toBe(DestinyClass.Hunter);
    expect([...imported.slots.keys()].sort()).toEqual([0, 6]);

    const pvp = imported.slots.get(6)!;
    expect(pvp.name).toBe('PvP');
    expect(pvp.items.map((i) => i.id)).toEqual(['222']);
    expect(pvp.parameters?.inGameIdentifiers).toEqual({ nameHash: 1, colorHash: 2, iconHash: 3 });
    // Imports get fresh IDs so they never collide with existing loadouts
    expect(pvp.id).not.toBe('id-PvP');
  });

  it('rejects things that are not exports', () => {
    expect(() => parseLoadoutGroupsImport('not json')).toThrow(/JSON/);
    expect(() => parseLoadoutGroupsImport('{"hello": 1}')).toThrow(/isn't a DIM loadout groups/);
  });
});

describe('Blade Dancer backup import', () => {
  const UNSET = 2166136261;
  const emptyItem = { itemInstanceId: '0', plugItemHashes: Array<number>(16).fill(UNSET) };
  const emptySlot = { nameHash: UNSET, colorHash: UNSET, iconHash: UNSET, items: [emptyItem] };
  const filledSlot = {
    nameHash: 752612111,
    colorHash: 1693821587,
    iconHash: 797343698,
    items: [
      { itemInstanceId: '6917530202358518464', plugItemHashes: [UNSET, 3250572790] },
      emptyItem,
    ],
  };
  const backup = {
    version: 1,
    exportedAt: '2026-11-24T23:07:56.581Z',
    settings: { theme: 'system' },
    groups: [
      {
        id: 'abc',
        name: 'Gos',
        characterId: '2305843009734214755',
        createdAt: 1,
        updatedAt: 2,
        loadouts: [
          emptySlot,
          emptySlot,
          filledSlot,
          ...Array<typeof emptySlot>(17).fill(emptySlot),
        ],
      },
    ],
  };

  it('reads groups, characters and filled slots', () => {
    const [group] = parseLoadoutGroupsImport(JSON.stringify(backup));
    expect(group.name).toBe('Gos');
    expect(group.characterId).toBe('2305843009734214755');
    expect(group.slots.size).toBe(0);
    expect([...group.inGameSlots!.keys()]).toEqual([2]);
    expect(group.inGameSlots!.get(2)!.nameHash).toBe(752612111);
  });
});
