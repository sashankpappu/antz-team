import { cn } from "@/lib/cn";
import { forwardRef } from "react";

type Variant = "primary" | "ghost" | "needs";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-deep focus-visible:ring-accent/40",
  ghost:
    "bg-transparent text-ink border border-line hover:bg-accent-tint/50 focus-visible:ring-accent/30",
  // gold — reserved for decision forks that need a human (§6).
  needs:
    "bg-needs text-white hover:brightness-95 focus-visible:ring-needs/40",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
