"use client";
import { useFormStatus } from "react-dom";
export function SyncSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="button primary"
      disabled={disabled || pending}
      aria-disabled={disabled || pending}
    >
      {pending ? "Consultando Meta…" : "Sincronizar datos de Meta"}
    </button>
  );
}
