import { parseNumberedName } from './LoadoutPicker';

describe('parseNumberedName', () => {
  it('splits numbered set names', () => {
    expect(parseNumberedName('Gos 11 - Trials')).toEqual({
      prefix: 'Gos',
      num: '11',
      label: 'Trials',
    });
    expect(parseNumberedName('Current loadouts (copy) 20 - Arc')).toEqual({
      prefix: 'Current loadouts (copy)',
      num: '20',
      label: 'Arc',
    });
  });

  it('leaves other names alone', () => {
    expect(parseNumberedName('Wish 1st')).toBeUndefined();
    expect(parseNumberedName('EQ|H1|Harrow')).toBeUndefined();
    expect(parseNumberedName('Pre boss dmg loadout')).toBeUndefined();
    expect(parseNumberedName('12 - Arc')).toBeUndefined();
    expect(parseNumberedName('Gos x - Raid')).toBeUndefined();
  });
});
