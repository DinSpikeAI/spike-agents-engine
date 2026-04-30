"use client";

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
} from "lucide-react";

interface SidebarProps {
  userEmail: string;
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

export function Sidebar({ userEmail, isAdmin = false, pendingCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const userInitial = userEmail.charAt(0).toUpperCase();
  const userName = userEmail.split("@")[0];

  return (
    <aside
      className="fixed inset-y-0 right-0 z-20 hidden h-full w-[232px] flex-col p-[14px] pt-5 md:flex"
      style={{
        background: "var(--color-glass-soft)",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        borderInlineStart: "1px solid var(--color-hairline)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-2 pb-[18px] pt-1">
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
          <div className="text-[10.5px]" style={{ color: "var(--color-ink-3)" }}>
            Engine
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-[1px]">
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
              className="flex items-center justify-between rounded-[9px] px-[11px] py-2 text-[13px] transition-colors"
              style={{
                background: isActive ? "rgba(255,255,255,0.85)" : "transparent",
                color: isActive ? "var(--color-ink)" : "var(--color-ink-2)",
                fontWeight: isActive ? 500 : 400,
                boxShadow: isActive ? "0 1px 2px rgba(15,20,30,0.05)" : "none",
              }}
            >
              <span className="flex items-center gap-2.5">
                <Icon
                  size={14}
                  strokeWidth={1.5}
                  style={{
                    color: isActive ? "var(--color-sys-blue)" : "var(--color-ink-2)",
                  }}
                />
                {item.label}
              </span>
              {showBadge && (
                <span
                  className="flex h-[17px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold text-white"
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
            className="mt-2 flex items-center gap-2.5 rounded-[9px] px-[11px] py-2 text-[13px] transition-colors hover:bg-white/50"
            style={{ color: "var(--color-ink-3)" }}
          >
            <ShieldCheck size={14} strokeWidth={1.5} />
            מרכז ניהול
          </Link>
        )}
      </nav>

      {/* Profile */}
      <div className="mt-auto pt-3.5">
        <div
          className="flex items-center gap-2.5 rounded-[10px] p-2.5"
          style={{ background: "rgba(255,255,255,0.5)" }}
        >
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#FFB47A,#D6336C)" }}
          >
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="text-[12.5px] font-medium"
              style={{ color: "var(--color-ink)" }}
            >
              {userName}
            </div>
            <div
              className="truncate text-[10.5px]"
              style={{ color: "var(--color-ink-3)" }}
            >
              Spike Demo
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
