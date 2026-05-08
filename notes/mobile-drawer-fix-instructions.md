# Quick Fix — mobile-drawer drift (Tech-debt B from Sprint 2 Batch 2B review)

**Issue identified by parallel session:** `src/components/dashboard/mobile-drawer.tsx` is out of sync with `src/components/dashboard/sidebar.tsx`. Two specific drifts:

1. **Missing `integrations` link** — sidebar has it (added in 1.14.2), drawer doesn't.
2. **Trust link points to `/dashboard/trust` (404)** — sidebar was updated to point to `/privacy` (or removed entirely) in 1.14, drawer still has the broken path.

**Why this slipped:** Whenever sidebar gets updated, mobile-drawer needs the same update. There's no automatic sync — it's two separate files. Easy to forget.

**Why now:** Sub-stage 1.15.1 added `הזדמנויות` (Growth) to BOTH sidebar and mobile-drawer. While we were there, the parallel Claude session noticed these older drifts.

---

## Manual fix (5 minutes, zero risk)

Open `src/components/dashboard/mobile-drawer.tsx` and:

### Fix 1: Add `integrations` to the nav items array

Look for the array of nav items (likely an array of objects like `{ id, label, href, icon }` or similar — match whatever shape the file uses). Add an entry for integrations **between settings and growth** (or wherever it sits in `sidebar.tsx`).

Example (adjust to match your actual nav shape):

```typescript
// Look for this pattern:
const navItems = [
  { id: "approvals",    label: "אישורים",    href: "/dashboard/approvals",    icon: Inbox },
  { id: "leads",        label: "לידים חמים",  href: "/dashboard/leads",        icon: Flame },
  { id: "reports",      label: "דוחות",      href: "/dashboard/reports",      icon: FileText },
  { id: "alerts",       label: "התראות",     href: "/dashboard/alerts",       icon: Bell },
  { id: "growth",       label: "הזדמנויות",  href: "/dashboard/growth",       icon: Sprout },   // already added in 1.15.1
  // ADD THIS LINE:
  { id: "integrations", label: "אינטגרציות",  href: "/dashboard/integrations", icon: Plug },
  { id: "settings",     label: "הגדרות",     href: "/dashboard/settings",     icon: Settings },
  // ... etc
];
```

(The exact icon and position should match `sidebar.tsx` — open both side by side and align them.)

### Fix 2: Trust/Privacy link

Search the file for `/dashboard/trust` or `אמון` and either:
- **Replace** with `/privacy` (matches what sidebar does in 1.14)
- **Remove entirely** if sidebar doesn't have a corresponding entry anymore

Look at sidebar.tsx for the canonical answer. If sidebar has a "trust"/"privacy" link, mirror it in drawer. If sidebar doesn't, remove from drawer.

---

## Verification

```powershell
cd C:\Users\Din\Desktop\spike-engine
npx tsc --noEmit
```

Should pass with 0 errors.

Then test manually:
1. Open `app.spikeai.co.il` on mobile (or Chrome DevTools mobile emulation)
2. Tap the menu icon → drawer opens
3. Verify "אינטגרציות" appears in the list
4. Tap "אינטגרציות" → loads `/dashboard/integrations` correctly
5. Verify no "trust" / 404 entry remains

---

## Commit

```powershell
git add src\components\dashboard\mobile-drawer.tsx
git commit -m "fix(mobile-drawer): add integrations link, remove broken trust link (sync with sidebar)"
git push
```

---

## Future improvement (not now)

To prevent this drift in future, refactor sidebar nav items into a shared module:

```
src/lib/nav/dashboard-items.ts
  → exports the canonical nav items array
  → both sidebar.tsx AND mobile-drawer.tsx import from here
```

Then any nav addition is a single-source update. **Not in scope for this fix** — just file as a future tech-debt item if it bites again.
