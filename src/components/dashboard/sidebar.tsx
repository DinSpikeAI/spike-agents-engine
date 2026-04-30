"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface NavSection {
  label: string;
  items: NavItem[];
  /** If true, this section only renders for admin users */
  adminOnly?: boolean;
}

const HomeIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12l9-9 9 9M5 10v10h14V10" />
  </svg>
);
const UsersIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3.5" /><path d="M2 21c0-3.5 3-6 7-6s7 2.5 7 6" /><circle cx="17" cy="8" r="3" /><path d="M22 21c0-3-2-5-5-5" />
  </svg>
);
const InboxIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);
const PlugIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 14l-2 2-6-6 2-2M2 22l4-4M16.5 7.5L19 5l-2-2-2.5 2.5" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const ChartIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 5-5" />
  </svg>
);
const BellIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);
const ShieldIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const SettingsIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
const LogoutIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);

// Admin-only icon: command center / radar
const AdminIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
  </svg>
);

const SECTIONS: NavSection[] = [
  {
    label: "ראשי",
    items: [
      { href: "/dashboard", label: "סקירה", icon: HomeIcon },
      { href: "/dashboard/agents", label: "הסוכנים שלי", icon: UsersIcon },
      { href: "/dashboard/approvals", label: "דורש אישור", icon: InboxIcon, badge: 4 },
    ],
  },
  {
    label: "נתונים",
    items: [
      { href: "/dashboard/integrations", label: "אינטגרציות", icon: PlugIcon },
      { href: "/dashboard/reports", label: "דוחות", icon: ChartIcon },
      { href: "/dashboard/notifications", label: "התראות", icon: BellIcon },
    ],
  },
  {
    label: "ניהול",
    adminOnly: true,
    items: [
      { href: "/admin", label: "מרכז בקרה", icon: AdminIcon },
    ],
  },
  {
    label: "חשבון",
    items: [
      { href: "/dashboard/trust", label: "אמון ופרטיות", icon: ShieldIcon },
      { href: "/dashboard/settings", label: "הגדרות", icon: SettingsIcon },
    ],
  },
];

export interface SidebarProps {
  userEmail: string;
  /**
   * Whether the current user is an admin. When true, the 'ניהול' section
   * with the link to /admin is rendered. Computed server-side via
   * isAdminEmail() so non-admin clients can't tamper with it.
   * Defaults to false for safety.
   */
  isAdmin?: boolean;
}

export function Sidebar({ userEmail, isAdmin = false }: SidebarProps) {
  const pathname = usePathname();
  const userInitial = userEmail.charAt(0).toUpperCase();
  const userName = userEmail.split("@")[0];

  // Filter out admin-only sections if user is not an admin
  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  return (
    <aside
      className="fixed inset-y-0 right-0 z-30 hidden w-[248px] flex-col p-5 backdrop-blur-md md:flex"
      style={{
        background: "rgba(6, 11, 18, 0.85)",
        borderInlineStart: "1px solid var(--spike-border)",
      }}
    >
      {/* Logo */}
      <div className="mb-2 flex items-center gap-2.5 px-2.5 pb-6 pt-1.5">
        <div
          className="flex size-[30px] flex-shrink-0 items-center justify-center rounded-[9px]"
          style={{
            background: "linear-gradient(135deg, var(--spike-teal), var(--spike-cyan))",
            boxShadow: "0 4px 14px rgba(34, 211, 176, 0.25)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#06141d" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L14.5 9H22L16 13.5L18.5 21L12 16.5L5.5 21L8 13.5L2 9H9.5L12 2Z" />
          </svg>
        </div>
        <div className="leading-tight">
          <div className="text-[11px] font-medium" style={{ color: "var(--spike-text-mute)", letterSpacing: "0.02em" }}>
            Engine
          </div>
          <div className="text-[17px] font-extrabold text-white" style={{ letterSpacing: "-0.02em" }}>
            Spik<span style={{ color: "var(--spike-teal)" }}>e</span>
          </div>
        </div>
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto spike-scroll">
        {visibleSections.map((section) => (
          <div key={section.label}>
            <div
              className="px-3 pb-2 pt-3.5 text-[10px] font-bold uppercase"
              style={{
                color: section.adminOnly
                  ? "var(--spike-amber)"
                  : "var(--spike-text-mute)",
                letterSpacing: "0.15em",
              }}
            >
              {section.label}
            </div>
            <nav className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="relative flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13.5px] font-medium transition-all"
                    style={{
                      color: active ? "var(--spike-teal-light)" : "var(--spike-text-dim)",
                      background: active
                        ? "linear-gradient(90deg, rgba(34,211,176,0.14), rgba(34,211,176,0.04))"
                        : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                        e.currentTarget.style.color = "var(--spike-text)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--spike-text-dim)";
                      }
                    }}
                  >
                    {active && (
                      <span
                        className="absolute"
                        style={{
                          insetInlineEnd: 0,
                          top: 8,
                          bottom: 8,
                          width: "2.5px",
                          background: "var(--spike-teal)",
                          borderRadius: "2px",
                        }}
                      />
                    )}
                    <span style={{ opacity: active ? 1 : 0.85 }}>{item.icon}</span>
                    <span>{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className="text-[10px] font-bold"
                        style={{
                          marginInlineStart: "auto",
                          background: "var(--spike-amber)",
                          color: "#07111A",
                          padding: "1px 7px",
                          borderRadius: "999px",
                          minWidth: 18,
                          textAlign: "center",
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* User footer */}
      <div
        className="mt-auto flex items-center gap-2.5 pt-3.5"
        style={{ borderTop: "1px solid var(--spike-border)" }}
      >
        <div
          className="flex size-[34px] flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
          style={{
            background: "linear-gradient(135deg, var(--spike-teal), var(--spike-cyan))",
            color: "#06141d",
          }}
        >
          {userInitial}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[13px] font-semibold text-white truncate">{userName}</div>
          <div className="text-[11px] truncate" style={{ color: "var(--spike-text-mute)" }}>
            {userEmail}
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md p-1.5 transition-colors"
            style={{ color: "var(--spike-text-mute)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--spike-text)";
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--spike-text-mute)";
              e.currentTarget.style.background = "transparent";
            }}
            title="התנתק"
          >
            {LogoutIcon}
          </button>
        </form>
      </div>
    </aside>
  );
}
