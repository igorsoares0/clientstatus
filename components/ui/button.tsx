import Link from "next/link";
import type { ComponentProps } from "react";

// Controls (design README): primary = ink bg / white 600; secondary = white /
// 1px border-strong; destructive = down. Square corners, no shadows.

type Variant = "primary" | "secondary" | "destructive" | "link";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-55";

const variants: Record<Variant, string> = {
  primary: "border-0 bg-ink font-semibold text-white hover:bg-ink-2",
  secondary: "border border-border-strong bg-surface text-ink hover:bg-nav-hover",
  destructive: "border-0 bg-down font-semibold text-white hover:opacity-90",
  link: "border-0 bg-transparent p-0 text-ink underline underline-offset-2 hover:text-muted",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-[38px] px-3.5 text-[13px]",
  lg: "h-[42px] px-4 text-sm",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return [base, variants[variant], variant === "link" ? "text-[13px]" : sizes[size], extra].filter(Boolean).join(" ");
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant = "primary", size = "md", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant = "primary", size = "md", className = "", ...props }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, size, `no-underline hover:text-inherit ${className}`)} {...props} />;
}
