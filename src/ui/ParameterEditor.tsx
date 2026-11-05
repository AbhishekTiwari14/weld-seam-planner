import { useEffect, useState } from 'react';
import type { Seam, WeldingParameters } from '../domain/contracts.ts';
import { parseParameterInput } from '../planning/parameter-input.ts';

export const PARAMETER_FIELDS = [
  { key: 'travelSpeedMmPerS', label: 'Travel speed', unit: 'mm/s' },
  { key: 'currentTargetA', label: 'Current target', unit: 'A' },
  { key: 'voltageTargetV', label: 'Voltage target', unit: 'V' },
] as const;
const textValues = (parameters: WeldingParameters) => PARAMETER_FIELDS.map(({ key }) => parameters[key]?.toString() ?? '');

export function ParameterEditor({ seam, onApply, onDirtyChange }: {
  seam: Seam; onApply: (parameters: WeldingParameters) => boolean; onDirtyChange: (dirty: boolean) => void;
}) {
  const [text, setText] = useState(() => textValues(seam.parameters));
  const baseline = textValues(seam.parameters);
  const dirty = text.some((value, i) => value !== baseline[i]);
  const parsed = text.map(parseParameterInput);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  return <form className="parameter-editor" aria-label="Welding parameters" onSubmit={(event) => {
    event.preventDefault();
    const [speed, current, voltage] = parsed;
    if (!speed?.valid || !current?.valid || !voltage?.valid) return;
    const parameters = { travelSpeedMmPerS: speed.value, currentTargetA: current.value, voltageTargetV: voltage.value };
    if (onApply(parameters)) setText(textValues(parameters));
  }}>
    <h3>Welding parameters</h3><p className="small muted">Enter your process targets. Blank values remain unset; no machine settings are assumed.</p>
    {PARAMETER_FIELDS.map(({ key, label, unit }, i) => {
      const result = parsed[i]!;
      return <div className="field" key={key}>
        <label htmlFor={key}>{label} <span>{unit}</span></label>
        <input id={key} name={key} type="text" inputMode="decimal" autoComplete="off" placeholder="Unset" value={text[i] ?? ''}
          aria-invalid={!result.valid} aria-describedby={!result.valid ? `${key}-error` : undefined}
          onChange={(event) => setText((values) => values.map((value, index) => index === i ? event.target.value : value))} />
        {!result.valid && <p className="field-error" id={`${key}-error`}>{result.message}</p>}
      </div>;
    })}
    <div className="compact-actions"><button type="submit" className="primary" disabled={!dirty || parsed.some((result) => !result.valid)}>Apply parameters</button>
      <button type="button" disabled={!dirty} onClick={() => setText(baseline)}>Discard edits</button></div>
    <p className="small muted" role="status">{dirty ? 'Unapplied changes. Apply or discard before leaving this seam.' : 'Parameters saved in the plan.'}</p>
  </form>;
}
