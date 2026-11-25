import { useState } from 'react';
import * as styles from './ColorSettings.m.scss';
import {
  CustomColors,
  DEFAULT_COLORS,
  loadCustomColors,
  luminance,
  saveCustomColors,
} from './custom-colors';

const ACCENT_PRESETS = ['#d56520', '#f2b705', '#e04747', '#4fa3ff', '#2ecc71', '#b05cff'];
const BACKGROUND_PRESETS = ['#000000', '#0d0f14', '#121212', '#1e222a', '#1a1426'];

/** Settings controls for the custom background and accent colors. */
export default function ColorSettings() {
  const [colors, setColors] = useState<CustomColors>(loadCustomColors);

  const update = (changes: Partial<CustomColors>) => {
    const next = { ...colors, ...changes };
    setColors(next);
    saveCustomColors(next);
  };

  return (
    <div className={styles.colors}>
      <ColorRow
        label="Background color"
        value={colors.background}
        presets={BACKGROUND_PRESETS}
        onChange={(background) => update({ background })}
      />
      <ColorRow
        label="Accent color"
        value={colors.accent}
        presets={ACCENT_PRESETS}
        onChange={(accent) => update({ accent })}
      />
      {luminance(colors.background) > 0.4 && (
        <p className={styles.note}>
          Light backgrounds are only partly supported - some parts of DIM may be hard to read.
        </p>
      )}
      <button
        type="button"
        className="dim-button"
        onClick={() => update(DEFAULT_COLORS)}
        disabled={
          colors.background === DEFAULT_COLORS.background && colors.accent === DEFAULT_COLORS.accent
        }
      >
        Reset colors
      </button>
    </div>
  );
}

function ColorRow({
  label,
  value,
  presets,
  onChange,
}: {
  label: string;
  value: string;
  presets: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.row}>
      <label className={styles.label}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <span>{label}</span>
        <code className={styles.hex}>{value}</code>
      </label>
      <div className={styles.presets}>
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={styles.swatch}
            style={{ backgroundColor: preset }}
            title={preset}
            aria-label={`${label}: ${preset}`}
            aria-pressed={preset.toLowerCase() === value.toLowerCase()}
            onClick={() => onChange(preset)}
          />
        ))}
      </div>
    </div>
  );
}
