"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  LayoutGrid,
  Inbox,
  BarChart3,
  Bell,
  SlidersHorizontal,
  ShieldCheck,
  Settings,
  X,
} from "lucide-react";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  userEmail: string;
  ownerName?: string | null;
  businessName?: string | null;
  isAdmin?: boolean;
  pendingCount?: number;
}

const NAV_ITEMS = [
  { id: "dash", label: "סקירה", href: "/dashboard", icon: Home },
  { id: "agents", label: "הסוכנים שלי", href: "/dashboard/agents", icon: LayoutGrid },
  { id: "inbox", label: "דורש אישור", href: "/dashboard/approvals", icon: Inbox, hasBadge: true },
  { id: "reports", label: "דוחות", href: "/dashboard/reports", icon: BarChart3 },
  { id: "alerts", label: "התראות", href: "/dashboard/alerts", icon: Bell },
  { id: "control", label: "מרכז בקרה", href: "/dashboard/control", icon: SlidersHorizontal },
  { id: "trust", label: "אמון ופרטיות", href: "/dashboard/trust", icon: ShieldCheck },
  { id: "settings", label: "הגדרות", href: "/dashboard/settings", icon: Settings },
];

export function MobileDrawer({
  open,
  onClose,
  userEmail,
  ownerName,
  businessName,
  isAdmin = false,
  pendingCount = 0,
}: MobileDrawerProps) {
  const pathname = usePathname();

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const displayName =
    (ownerName && ownerName.trim()) || userEmail.split("@")[0] || "משתמש";
  const displayBusiness =
    (businessName && businessName.trim()) || "Spike Demo";
  const userInitial = (displayName.charAt(0) || "?").toUpperCase();

  return (
    <>
      {/* Backdrop scrim */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-40 transition-opacity duration-300 md:hidden"
        style={{
          background: "rgba(15, 20, 30, 0.36)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />

      {/* Drawer panel — slides in from right (RTL) */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="תפריט ניווט"
        className="fixed inset-y-0 right-0 z-50 flex h-full w-[78%] max-w-[300px] flex-col p-[14px] pt-4 md:hidden"
        style={{
          background: "rgba(255, 255, 255, 0.92)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          borderInlineStart: "1px solid var(--color-hairline)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 320ms cubic-bezier(0.32, 0.72, 0.32, 1)",
          boxShadow: open ? "-12px 0 40px rgba(15, 20, 30, 0.12)" : "none",
        }}
      >
        {/* Header — Logo + Close button */}
        <div className="flex items-center justify-between px-2 pb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[13px] font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #0A84FF, #5856D6)",
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.5) inset, 0 4px 12px rgba(10,132,255,0.25)",
              }}
            >
              S
            </div>
            <div>
              <div
                className="text-[13.5px] font-semibold tracking-tight"
                style={{ color: "var(--color-ink)" }}
              >
                Spike
              </div>
              <div
                className="text-[10.5px]"
                style={{ color: "var(--color-ink-3)" }}
              >
                Engine
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="סגור תפריט"
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:scale-95"
            style={{
              background: "rgba(15, 20, 30, 0.04)",
              color: "var(--color-ink-2)",
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex flex-1 flex-col gap-[2px] overflow-y-auto pt-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href === "/dashboard" && pathname === "/dashboard");
            const showBadge = item.hasBadge && pendingCount > 0;

            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onClose}
                className="flex items-center justify-between rounded-[10px] px-3 py-2.5 text-[14px] transition-colors active:scale-[0.98]"
                style={{
                  background: isActive ? "rgba(10, 132, 255, 0.08)" : "transparent",
                  color: isActive ? "var(--color-sys-blue)" : "var(--color-ink)",
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    size={17}
                    strokeWidth={isActive ? 2 : 1.6}
                    style={{
                      color: isActive
                        ? "var(--color-sys-blue)"
                        : "var(--color-ink-2)",
                    }}
                  />
                  {item.label}
                </span>
                {showBadge && (
                  <span
                    className="flex h-[20px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white"
                    style={{ background: "var(--color-sys-blue)" }}
                  >
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}

          {isAdmin && (
            <Link
              href="/admin"
              onClick={onClose}
              className="mt-2 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] transition-colors"
              style={{ color: "var(--color-ink-3)" }}
            >
              <ShieldCheck size={17} strokeWidth={1.6} />
              מרכז ניהול
            </Link>
          )}
        </nav>

        {/* Profile pinned to bottom */}
        <div className="mt-2 pt-3" style={{ borderTop: "1px solid var(--color-hairline)" }}>
          <div className="flex items-center gap-3 rounded-[12px] p-2.5"
            style={{ background: "rgba(255, 255, 255, 0.6)" }}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #FFB47A, #D6336C)" }}
            >
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-[13.5px] font-medium"
                style={{ color: "var(--color-ink)" }}
              >
                {displayName}
              </div>
              <div
                className="truncate text-[11.5px]"
                style={{ color: "var(--color-ink-3)" }}
              >
                {displayBusiness}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
