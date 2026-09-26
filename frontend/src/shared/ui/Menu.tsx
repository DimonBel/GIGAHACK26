import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { useOutsideClick } from "@/shared/hooks/useOutsideClick";
import { cn } from "@/shared/lib/cn";

interface MenuProps {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
  panelClassName?: string;
}

/** A trigger with a dropdown below it; closes on Escape or a click outside. */
export function Menu({ open, onClose, trigger, children, panelClassName }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, onClose, open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      {trigger}
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute top-[calc(100%+6px)] z-30 flex min-w-56 flex-col rounded-lg border border-line bg-white p-1 text-ink shadow-pop",
            panelClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  hint?: ReactNode;
}

export function MenuItem({ icon: Icon, hint, className, children, type = "button", ...props }: MenuItemProps) {
  return (
    <button
      type={type}
      role="menuitem"
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-body transition-colors hover:bg-sunken",
        "disabled:pointer-events-none disabled:opacity-45",
        className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden className="size-4 shrink-0 text-muted" strokeWidth={1.75} />}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-caption text-muted">{hint}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-line-soft" />;
}
