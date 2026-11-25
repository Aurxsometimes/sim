import { DimItem } from 'app/inventory/item-types';
import { BucketCategory } from 'bungie-api-ts/destiny2';
import { shouldVault } from './vault-everything';

function item(overrides: Record<string, unknown> = {}, bucket: Record<string, unknown> = {}) {
  return {
    equipped: false,
    notransfer: false,
    location: { inPostmaster: false },
    bucket: {
      category: BucketCategory.Equippable,
      vaultBucket: { hash: 1 },
      inWeapons: true,
      inArmor: false,
      ...bucket,
    },
    ...overrides,
  } as unknown as DimItem;
}

describe('shouldVault', () => {
  it('vaults unequipped weapons and armor', () => {
    expect(shouldVault(item())).toBe(true);
    expect(shouldVault(item({}, { inWeapons: false, inArmor: true }))).toBe(true);
  });

  it('skips ghosts, ships, sparrows and emblems', () => {
    expect(shouldVault(item({}, { inWeapons: false, inArmor: false }))).toBe(false);
  });

  it('keeps equipped, untransferable and postmaster items', () => {
    expect(shouldVault(item({ equipped: true }))).toBe(false);
    expect(shouldVault(item({ notransfer: true }))).toBe(false);
    expect(shouldVault(item({ location: { inPostmaster: true } }))).toBe(false);
  });

  it('skips things that have no vault slot or are not gear', () => {
    // Subclasses have no vault bucket
    expect(shouldVault(item({}, { vaultBucket: undefined }))).toBe(false);
    // Consumables / materials
    expect(shouldVault(item({}, { category: BucketCategory.Item }))).toBe(false);
  });
});
