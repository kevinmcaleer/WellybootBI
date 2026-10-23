import { useState } from 'react';
import { TextInput } from '../ui';

/** A whole number typed in a box: kept as typed, and passed on whenever it is one in range. */
export function WholeNumberInput({ id, value, min, max, onChange }: { id: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const [was, setWas] = useState(value);
  // A change from outside (undo) shows; what is being typed stays.
  if (was !== value) {
    setWas(value);
    if (Number(text) !== value) setText(String(value));
  }
  const n = Number(text.trim());
  const ok = text.trim() !== '' && Number.isInteger(n) && n >= min && n <= max;
  return (
    <TextInput
      id={id}
      inputMode="numeric"
      value={text}
      error={!ok}
      aria-invalid={!ok || undefined}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value.trim());
        if (e.target.value.trim() !== '' && Number.isInteger(v) && v >= min && v <= max) onChange(v);
      }}
    />
  );
}
