"use client";

import { WarningCircle } from "@phosphor-icons/react";

/**
 * Form validation surfaces.
 *
 * Field-level errors already live next to the input (`SurfaceField`, and
 * `FieldError` below for forms that don't use it). `FormErrorSummary` is the
 * part most forms are missing: a single focusable alert at the top of the form
 * so keyboard and screen-reader users learn that submission failed and which
 * fields to fix, without hunting the page.
 */

export type FieldErrors = Record<string, string>;

/** Inline error under a single field. Mirrors SurfaceField's error styling. */
export function FieldError({ id, message }: { id?: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm text-red-500">
      {message}
    </p>
  );
}

/**
 * Top-of-form summary of every invalid field.
 *
 * Wires to the fields via `aria-describedby`/ids in the caller; clicking an
 * entry moves focus to that control so the user lands on the mistake.
 */
export function FormErrorSummary({
  errors,
  fieldLabels,
  onFocusField,
  className = "",
}: {
  errors: FieldErrors;
  /** field name -> human label, e.g. { email: "Email" } */
  fieldLabels?: Record<string, string>;
  /** Optional: focus the offending control when an entry is activated. */
  onFocusField?: (field: string) => void;
  className?: string;
}) {
  const fields = Object.entries(errors).filter(([, message]) => Boolean(message));
  if (fields.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      tabIndex={-1}
      className={`rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3 text-left ${className}`}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-red-400">
        <WarningCircle aria-hidden="true" className="h-4 w-4 flex-shrink-0" />
        {fields.length === 1
          ? "1 field needs your attention"
          : `${fields.length} fields need your attention`}
      </p>
      <ul className="mt-2 space-y-1 pl-6">
        {fields.map(([field, message]) => (
          <li key={field} className="text-xs leading-relaxed text-red-400/90">
            {onFocusField ? (
              <button
                type="button"
                onClick={() => onFocusField(field)}
                className="text-left underline underline-offset-2"
              >
                <span className="font-medium">{fieldLabels?.[field] ?? field}</span>: {message}
              </button>
            ) : (
              <>
                <span className="font-medium">{fieldLabels?.[field] ?? field}</span>: {message}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
