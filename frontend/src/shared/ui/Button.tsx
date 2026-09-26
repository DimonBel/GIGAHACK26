import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/shared/lib/cn";

const VARIANTS = {
  primary: "bg-primary text-white shadow-md hover:bg-primary-hover hover:shadow-sm",
  secondary: "border border-line-strong bg-white text-ink hover:border-subtle hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "text-danger hover:bg-danger-soft",
  inverse: "text-on-ink hover:bg-ink-hover hover:text-white",
};

const SIZES = {
  sm: "h-8 gap-1.5 px-2.5 text-base",
  md: "h-9 gap-2 px-3.5 text-md",
  lg: "h-11 gap-2 px-5 text-md",
};

export type ButtonVariant = keyof typeof VARIANTS;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof SIZES;
  icon?: LucideIcon;
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
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-all duration-150",
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
