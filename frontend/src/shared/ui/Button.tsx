import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/shared/lib/cn";

const VARIANTS = {
  /** the one main action of a view — teal, the 10 % */
  primary: "bg-primary text-white hover:bg-primary-hover",
  /** everything else that matters */
  secondary: "border border-line-strong bg-white text-ink hover:border-subtle hover:bg-canvas",
  /** low-emphasis actions inside content */
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "text-danger hover:bg-danger-soft",
  /** on the ink header */
  inverse: "text-on-ink hover:bg-ink-hover hover:text-white",
};

const SIZES = {
  sm: "h-8 gap-1.5 px-2.5 text-small",
  md: "h-9 gap-2 px-3.5 text-body",
  lg: "h-11 gap-2 px-5 text-body",
};

export type ButtonVariant = keyof typeof VARIANTS;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof SIZES;
  icon?: LucideIcon;
  /** icon after the label (e.g. an arrow) */
  trailingIcon?: LucideIcon;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  trailingIcon: Trailing,
  className,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />}
      {children}
      {Trailing && <Trailing aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  variant?: ButtonVariant;
}

/** Square button with only an icon; the label is for screen readers and the tooltip. */
export function IconButton({ icon: Icon, label, variant = "ghost", className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
        VARIANTS[variant],
        variant === "ghost" && "text-subtle",
        className,
      )}
      {...props}
    >
      <Icon aria-hidden className="size-4" strokeWidth={1.75} />
    </button>
  );
}
