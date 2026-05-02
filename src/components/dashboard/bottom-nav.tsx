"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Inbox, LayoutGrid, BarChart3 } from "lucide-react";

interface BottomNavProps {
  pendingCount?: number;
}

const TABS = [
  { id: "dash", label: "סקירה", href: "/dashboard", icon: Home },
  {
    id: "approvals",
    label: "אישורים",
    href: "/dashboard/approvals",
    icon: Inbox,
    hasBadge: true,
  },
  {
    id: "agents",
    label: "סוכנים",
    href: "/dashboard/agents",
    icon: LayoutGrid,
  },
  { id: "reports", label: "דוחות", href: "/dashboard/reports", icon: BarChart3 },
];

export function BottomNav({ pendingCount = 0 }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch md:hidden"
      style={{
        background: "rgba(255, 255, 255, 0.92)",
        backdropFilter: "blur(30px) saturate(180%)",
        WebkitBackdropFilter: "blur(30px) saturate(180%)",
        borderBlockStart: "1px solid var(--color-hairline)",
        // safe-area inset for iPhone home indicator
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive =
          tab.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname === tab.href || pathname.startsWith(tab.href + "/");
        const showBadge = tab.hasBadge && pendingCount > 0;

        return (
          <Link
            key={tab.id}
            href={tab.href}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors active:bg-black/[0.02]"
            aria-current={isActive ? "page" : undefined}
          >
            <div className="relative">
              <Icon
                size={21}
                strokeWidth={isActive ? 2.1 : 1.7}
                style={{
                  color: isActive
                    ? "var(--color-sys-blue)"
                    : "var(--color-ink-3)",
                }}
              />
              {showBadge && (
                <span
                  className="absolute -top-1 left-3 flex h-[16px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white"
                  style={{
                    background: "var(--color-sys-pink)",
                    boxShadow: "0 0 0 2px rgba(255,255,255,0.95)",
                  }}
                >
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </div>
            <span
              className="text-[10.5px] font-medium leading-none"
              style={{
                color: isActive
                  ? "var(--color-sys-blue)"
                  : "var(--color-ink-3)",
              }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
