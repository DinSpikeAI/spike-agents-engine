/**
 * Glass — Calm Frosted card primitive
 *
 * The foundational component. Every panel uses this.
 * - Default: rgba(255,255,255,0.72) glass with 30px blur
 * - deep: rgba(255,255,255,0.86) for emphasis (KPI primary, urgent banners)
 *
 * RTL-aware shadows and borders.
 */

import { cn } from "@/lib/utils";
import { ComponentPropsWithoutRef, forwardRef } from "react";

interface GlassProps extends ComponentPropsWithoutRef<"div"> {
  deep?: boolean;
}

export const Glass = forwardRef<HTMLDivElement, GlassProps>(
  ({ deep, className, children, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-[18px] border",
          "transition-all duration-200",
          className
        )}
        style={{
          background: deep ? "var(--color-glass-deep)" : "var(--color-glass)",
          backdropFilter: "blur(30px) saturate(180%)",
          WebkitBackdropFilter: "blur(30px) saturate(180%)",
          borderColor: "var(--color-frost-edge)",
          boxShadow: deep
            ? "var(--shadow-glass-deep)"
            : "var(--shadow-glass)",
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Glass.displayName = "Glass";
