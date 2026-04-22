'use client';

import { useState, useRef } from 'react';

export default function ChipInput({ value, onChange, placeholder = 'Lägg till och tryck Enter', disabled }) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const add = (raw) => {
    const v = (raw ?? draft).trim();
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setDraft('');
  };

  const remove = (v) => onChange(value.filter((x) => x !== v));

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      remove(value[value.length - 1]);
    }
  };

  return (
    <div className="chip-input" onClick={() => inputRef.current?.focus()}>
      {value.map((v) => (
        <span key={v} className="chip">
          {v}
          {!disabled && (
            <button type="button" className="chip-x" onClick={() => remove(v)}>×</button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft && add()}
          placeholder={value.length === 0 ? placeholder : ''}
        />
      )}
    </div>
  );
}
