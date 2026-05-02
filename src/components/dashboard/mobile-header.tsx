"use client";

import { useState } from "react";
import { Bell, Menu } from "lucide-react";
import { MobileDrawer } from "./mobile-drawer";

interface MobileHeaderProps {
  userEmail: string;
  ownerName?: string | null;
  businessName?: string | null;
  isAdmin?: boolean;
  pendingCount?: number;
}

export function MobileHeader({
  userEmail,
  ownerName,
  businessName,
  isAdmin,
  pendingCount = 0,
}: MobileHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const displayBusiness =
    (businessName && businessName.trim()) || "Spike";

  return (
    <>
      {/* Sticky mobile-only header */}
      <header
        className="sticky top-0 z-30 flex h-[52px] items-center gap-3 px-4 md:hidden"
        style={{
          background: "rgba(255, 255, 255, 0.78)",
          backdropFilter: "blur(30px) saturate(180%)",
          WebkitBackdropFilter: "blur(30px) saturate(180%)",
          borderBlockEnd: "1px solid var(--color-hairline)",
        }}
      >
        {/* Logo + brand */}
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-[12.5px] font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #0A84FF, #5856D6)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.5) inset, 0 3px 8px rgba(10,132,255,0.22)",
            }}
          >
            S
          </div>
          <div className="min-w-0">
            <div
              className="truncate text-[13.5px] font-semibold leading-tight tracking-tight"
              style={{ color: "var(--color-ink)" }}
            >
              {displayBusiness}
            </div>
            <div
              className="text-[10px] leading-tight"
              style={{ color: "var(--color-ink-3)" }}
            >
              Spike Engine
            </div>
          </div>
        </div>

        <div className="flex-1" />

        {/* Notifications button */}
        <button
          type="button"
          aria-label="התראות"
          className="relative flex h-9 w-9 items-center justify-center rounded-full transition-colors active:scale-95"
          style={{
            background: "rgba(15, 20, 30, 0.04)",
          }}
        >
          <Bell
            size={16}
            strokeWidth={1.6}
            style={{ color: "var(--color-ink-2)" }}
          />
        </button>

        {/* Hamburger */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="תפריט"
          aria-expanded={drawerOpen}
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:scale-95"
          style={{
            background: "rgba(15, 20, 30, 0.04)",
          }}
        >
          <Menu
            size={17}
            strokeWidth={1.8}
            style={{ color: "var(--color-ink)" }}
          />
        </button>
      </header>

      {/* Drawer */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userEmail={userEmail}
        ownerName={ownerName}
        businessName={businessName}
        isAdmin={isAdmin}
        pendingCount={pendingCount}
      />
    </>
  );
}
