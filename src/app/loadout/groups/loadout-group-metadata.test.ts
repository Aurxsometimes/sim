import {
  encodeLoadoutGroupMeta,
  isLoadoutGroupRecord,
  parseLoadoutGroupMeta,
} from './loadout-group-metadata';

describe('loadout group metadata', () => {
  it('round-trips a group header', () => {
    const meta = {
      kind: 'group' as const,
      groupId: 'abc',
      characterId: '123',
      name: 'S Spire "raid"',
      rank: 2,
    };
    expect(parseLoadoutGroupMeta(encodeLoadoutGroupMeta(meta))).toEqual(meta);
  });

  it('round-trips a slot record', () => {
    const meta = { kind: 'slot' as const, groupId: 'abc', slot: 19 };
    expect(parseLoadoutGroupMeta(encodeLoadoutGroupMeta(meta))).toEqual(meta);
  });

  it('ignores normal loadout notes', () => {
    expect(parseLoadoutGroupMeta(undefined)).toBeUndefined();
    expect(parseLoadoutGroupMeta('my #pvp loadout')).toBeUndefined();
    expect(isLoadoutGroupRecord({ notes: 'my #pvp loadout' })).toBe(false);
    expect(isLoadoutGroupRecord({})).toBe(false);
  });

  it('ignores corrupted markers', () => {
    expect(parseLoadoutGroupMeta('[dim-loadout-group]{not json')).toBeUndefined();
    expect(parseLoadoutGroupMeta('[dim-loadout-group]{"kind":"other"}')).toBeUndefined();
  });

  it('detects group records', () => {
    expect(
      isLoadoutGroupRecord({
        notes: encodeLoadoutGroupMeta({ kind: 'slot', groupId: 'x', slot: 0 }),
      }),
    ).toBe(true);
  });
});
