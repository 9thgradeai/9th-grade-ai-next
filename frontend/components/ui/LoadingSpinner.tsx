import { clsx } from "clsx";
import type { SVGProps } from "react";

interface LoadingSpinnerProps extends SVGProps<SVGSVGElement> {
  size?: number;
  label?: string;
}

export function LoadingSpinner({ size = 24, label = "Loading", className, ...props }: LoadingSpinnerProps) {
  return (
    <div className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={clsx("animate-spin text-emerald-400", className)}
        aria-hidden="true"
        {...props}
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default LoadingSpinner;
