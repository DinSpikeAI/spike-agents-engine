// src/components/providers/direction-provider.tsx
//
// Client-only wrapper around Radix DirectionProvider.
// We need this because DirectionProvider uses React Context, which only
// works in Client Components, but our root layout.tsx is a Server Component
// (so it can load Hebrew fonts and compute metadata on the server).
//
// The pattern: keep layout.tsx as Server Component, import this thin
// client wrapper, and let it provide RTL context to portal components
// (Dialog, Popover, DropdownMenu, Select, Tooltip).

"use client";

import { DirectionProvider as RadixDirectionProvider } from "@radix-ui/react-direction";
import type { ReactNode } from "react";

export function DirectionProvider({ children }: { children: ReactNode }) {
  return (
    <RadixDirectionProvider dir="rtl">
      {children}
    </RadixDirectionProvider>
  );
}
