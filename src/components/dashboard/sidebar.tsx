// src/components/dashboard/sidebar.tsx
//
// Right-side primary sidebar (Hebrew RTL convention).
// 240px expanded / 64px collapsed (desktop), drawer from right edge on mobile.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Home,
  Bot,
  Inbox,
  Plug,
  BarChart3,
  Bell,
  Shield,
  Settings,
  User,
  Menu,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "סקירה", icon: Home },
  { href: "/dashboard/agents", label: "הסוכנים שלי", icon: Bot },
  { href: "/dashboard/inbox", label: "דורש אישור", icon: Inbox, badge: 0 },
  { href: "/dashboard/integrations", label: "אינטגרציות", icon: Plug },
  { href: "/dashboard/reports", label: "דוחות", icon: BarChart3 },
  { href: "/dashboard/notifications", label: "התראות", icon: Bell },
  { href: "/dashboard/trust", label: "אמון ופרטיות", icon: Shield },
  { href: "/dashboard/settings", label: "הגדרות", icon: Settings },
];

interface SidebarProps {
  userEmail: string;
}

function SidebarContent({ userEmail }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-card border-s border-border">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-2xl font-bold bg-gradient-to-r from-[#22D3B0] to-[#5BD0F2] bg-clip-text text-transparent">
            Spike
          </span>
          <span className="text-xs text-muted-foreground">Engine</span>
        </Link>
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {typeof item.badge === "number" && item.badge > 0 && (
                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <Separator />

      {/* User */}
      <div className="p-4">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate" dir="ltr">
              {userEmail}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ userEmail }: SidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar - fixed right side */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 lg:end-0 lg:z-30">
        <SidebarContent userEmail={userEmail} />
      </aside>

      {/* Mobile trigger */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="פתח תפריט"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-72 p-0">
          <SheetTitle className="sr-only">תפריט ראשי</SheetTitle>
          <SidebarContent userEmail={userEmail} />
        </SheetContent>
      </Sheet>
    </>
  );
}