import { cn } from "@/shared/lib/cn";

interface SegmentedProps<T extends string> {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** "inverse" sits on the ink header */
  tone?: "default" | "inverse";
  size?: "sm" | "md";
  className?: string;
}

/** A set of mutually exclusive options (filters, language, kind of suggestion). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  tone = "default",
  size = "md",
  className,
}: SegmentedProps<T>) {
  const inverse = tone === "inverse";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full gap-0.5 overflow-x-auto rounded-md p-0.5",
        inverse ? "bg-ink-hover" : "bg-sunken",
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap transition-colors",
              size === "sm" ? "h-7 px-2 text-caption" : "h-8 px-3 text-small",
              inverse
                ? on
                  ? "bg-ink-line text-white"
                  : "text-on-ink-muted hover:text-white"
                : on
                  ? "bg-white text-ink shadow-raised"
                  : "text-muted hover:text-ink",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cn("tabular-nums", on ? "text-muted" : "text-subtle")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
