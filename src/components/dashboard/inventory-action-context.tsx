// src/components/dashboard/inventory-action-context.tsx
//
// Sub-stage 1.12 — Cross-component coordination for the inventory page.
//
// Problem (was tracked in CLAUDE.md §11.2 as "Race in inventory-upload-zone +
// run-inventory-button"):
//   The Inventory page renders two independent Client Components — the upload
//   zone and the run button — that share NO state. When the user clicks "Run"
//   during an in-progress upload, the trigger action reads the OLD snapshot
//   from the DB (the new one isn't INSERTED yet) and runs the Inventory agent
//   on stale data. The user sees "Analysis complete!" but it's the previous
//   snapshot, not the one they just uploaded. SILENT data bug.
//
// The parent (src/app/dashboard/inventory/page.tsx) is a Server Component and
// can't hold useState, so we can't lift state into the parent directly. The
// natural React solution is a Context Provider that wraps the section where
// both components live.
//
// Contract:
//   - InventoryUploadZone: writes its own `isPending` (from useTransition) into
//     the context every time it changes. On unmount, resets to false so a
//     stale "true" doesn't outlive the component.
//   - RunInventoryButton: reads `uploadInProgress` and ORs it with its own
//     `isPending` to compute `disabled`. Also shows a small hint text below
//     the button while uploadInProgress is true.
//
// Default value:
//   The default value (uploadInProgress=false, no-op setter) means components
//   that import the hook but render OUTSIDE this Provider keep working as
//   before — they just don't coordinate. Useful for any future page that
//   wants to use one of these components without the other.

"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface InventoryActionContextValue {
  uploadInProgress: boolean;
  setUploadInProgress: (value: boolean) => void;
}

const InventoryActionContext = createContext<InventoryActionContextValue>({
  uploadInProgress: false,
  setUploadInProgress: () => {},
});

export function InventoryActionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [uploadInProgress, setUploadInProgress] = useState(false);
  return (
    <InventoryActionContext.Provider
      value={{ uploadInProgress, setUploadInProgress }}
    >
      {children}
    </InventoryActionContext.Provider>
  );
}

export function useInventoryAction() {
  return useContext(InventoryActionContext);
}
