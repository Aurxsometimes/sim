import { Loadout as DimApiLoadout } from '@destinyitemmanager/dim-api-types';
import { CompressionStream, DecompressionStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';
import { decodeCompactLoadout, encodeCompactLoadout } from './compact-share';
import { decodeShareUrl, getDecodedLoadout } from './loadout-import';

// jsdom doesn't provide these browser APIs; Node's versions behave the same
Object.assign(globalThis, { CompressionStream, DecompressionStream, TextEncoder, TextDecoder });

// A realistic loadout: subclass with abilities/aspects/fragments, 3 weapons, 5 armor, mods
const loadout: DimApiLoadout = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name: 'Dungeon',
  classType: 1,
  clearSpace: false,
  createdAt: 1764000000000,
  lastUpdatedAt: 1764000000000,
  equipped: [
    {
      id: '6917529901234567890',
      hash: 2453357042,
      socketOverrides: {
        0: 1170479937,
        1: 2979161761,
        2: 3191254962,
        3: 1891701049,
        7: 1727069360,
        8: 2979161761,
        9: 3060003305,
        10: 2272984671,
        11: 1051276348,
      },
    },
    { id: '6917529901234567891', hash: 1395261499 },
    { id: '6917529901234567892', hash: 2591746970 },
    { id: '6917529901234567893', hash: 3260753130 },
    { id: '6917529901234567894', hash: 1513486336 },
    { id: '6917529901234567895', hash: 3216110440 },
    { id: '6917529901234567896', hash: 2723059534 },
    { id: '6917529901234567897', hash: 1474735276 },
    { id: '6917529901234567898', hash: 3870637183 },
  ],
  unequipped: [],
  parameters: {
    mods: [
      2623485440, 2623485440, 4048838440, 1484685884, 3484440775, 3484440775, 1702273159,
      4287799666, 2501112932, 1435557120, 1435557120, 4081595582,
    ],
  },
};

describe('compact SIM loadout links', () => {
  it('round-trips, dropping item instance IDs and timestamps', async () => {
    const decoded = await decodeCompactLoadout(await encodeCompactLoadout(loadout));
    expect(decoded.name).toBe('Dungeon');
    expect(decoded.parameters?.mods).toEqual(loadout.parameters?.mods);
    expect(decoded.equipped.map((i) => i.hash)).toEqual(loadout.equipped.map((i) => i.hash));
    expect(decoded.equipped[0].socketOverrides).toEqual(loadout.equipped[0].socketOverrides);
    expect(decoded.equipped.some((i) => i.id)).toBe(false);
    expect(decoded.createdAt).toBeUndefined();
  });

  it('keeps other loadout settings', async () => {
    const withExtras: DimApiLoadout = {
      ...loadout,
      notes: 'Use with Well',
      parameters: { ...loadout.parameters, query: 'is:dupe', exoticArmorHash: 2773056939 },
    };
    const decoded = await decodeCompactLoadout(await encodeCompactLoadout(withExtras));
    expect(decoded.notes).toBe('Use with Well');
    expect(decoded.parameters).toEqual(withExtras.parameters);
  });

  it('is much shorter than the old full-JSON link', async () => {
    const compact = `https://sim-3sj.pages.dev/loadouts?s=${await encodeCompactLoadout(loadout)}`;
    const old = `https://sim-3sj.pages.dev/loadouts?loadout=${encodeURIComponent(JSON.stringify(loadout))}`;
    expect(compact.length * 4).toBeLessThan(old.length);
  });

  it('decodes from a pasted link into a usable loadout', async () => {
    const url = `https://sim-3sj.pages.dev/loadouts?s=${await encodeCompactLoadout(loadout)}`;
    const decoded = decodeShareUrl(url);
    expect(decoded?.tag).toBe('compactLoadout');
    const result = await getDecodedLoadout(decoded!);
    expect(result.name).toBe('Dungeon');
    expect(result.items).toHaveLength(9);
    // Missing instance IDs get placeholder IDs so the loadout works
    expect(result.items.every((i) => i.id && i.id !== '0')).toBe(true);
  });
});
