import { customColorVariables, luminance, raise } from './custom-colors';

describe('custom colors', () => {
  it('measures luminance', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1);
  });

  it('raises dark colors toward white and light colors toward black', () => {
    expect(raise('#000000', 0.1)).toBe('#1a1a1a');
    expect(raise('#ffffff', 0.1)).toBe('#e6e6e6');
  });

  it('builds variables for a dark background', () => {
    const vars = customColorVariables({ background: '#000000', accent: '#4fa3ff' });
    expect(vars['--theme-app-bg']).toBe('#000000');
    expect(vars['--theme-accent-primary']).toBe('#4fa3ff');
    expect(vars['--theme-text']).toBe('#efefef');
  });

  it('switches to dark text on a light background', () => {
    expect(customColorVariables({ background: '#f0f0f0', accent: '#d56520' })['--theme-text']).toBe(
      '#111111',
    );
  });
});
