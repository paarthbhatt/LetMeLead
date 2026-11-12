"use client";

import { useEffect, useRef } from "react";

export function LeadSelectionCheckbox({
  checked,
  mixed = false,
  label,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  mixed?: boolean;
  label: string;
  onChange: () => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
  return (
    <input
      ref={input}
      type="checkbox"
      checked={checked}
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      disabled={disabled}
      onChange={onChange}
      className="size-4 cursor-pointer rounded border-input accent-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}
