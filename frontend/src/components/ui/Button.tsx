"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

const variantCls: Record<Variant, string> = {
  primary: "bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white shadow-sm",
  secondary: "bg-[var(--surface-2)] hover:bg-[#2d3543] text-[var(--foreground)]",
  ghost: "bg-transparent hover:bg-[var(--surface-2)] text-[var(--foreground)]",
  danger: "bg-[var(--danger)] hover:bg-red-600 text-white",
  outline: "border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--foreground)]",
};

const sizeCls: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-md",
  md: "h-10 px-4 text-sm rounded-lg",
  lg: "h-12 px-6 text-base rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40",
        variantCls[variant],
        sizeCls[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="size-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
      ) : null}
      {children}
    </button>
  );
});
