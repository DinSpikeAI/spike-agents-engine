"use client";

import { useState } from "react";
import type {
  InventoryAgentOutput,
  InventoryProductInsight,
  ProductStatus,
} from "@/lib/agents/types";
import { Glass } from "@/components/ui/glass";
import {
  AlertTriangle,
  TrendingDown,
  CheckCircle2,
  Boxes,
  Pause,
  BarChart3,
  Search,
  Package,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Status metadata — single source of truth for colors and labels
// ─────────────────────────────────────────────────────────────

type StatusMeta = {
  label: string;
  bg: string;
  border: string;
  text: string;
  Icon: typeof AlertTriangle;
};

const STATUS_META: Record<ProductStatus, StatusMeta> = {
  critical: {
    label: "קריטי",
    bg: "rgba(214, 51, 108, 0.10)",
    border: "rgba(214, 51, 108, 0.30)",
    text: "var(--color-sys-pink)",
    Icon: AlertTriangle,
  },
  low: {
    label: "נמוך",
    bg: "rgba(224, 169, 61, 0.12)",
    border: "rgba(224, 169, 61, 0.30)",
    text: "var(--color-sys-amber)",
    Icon: TrendingDown,
  },
  ok: {
    label: "תקין",
    bg: "var(--color-sys-green-soft)",
    border: "rgba(48, 179, 107, 0.25)",
    text: "var(--color-sys-green)",
    Icon: CheckCircle2,
  },
  overstocked: {
    label: "עודף",
    bg: "var(--color-sys-blue-soft)",
    border: "rgba(10, 132, 255, 0.25)",
    text: "var(--color-sys-blue)",
    Icon: Boxes,
  },
  no_movement: {
    label: "ללא תנועה",
    bg: "rgba(114, 121, 136, 0.10)",
    border: "rgba(114, 121, 136, 0.20)",
    text: "var(--color-ink-3)",
    Icon: Pause,
  },
};

// Statuses that demand owner attention (rendered prominently, expanded by default).
const ATTENTION_STATUSES: ProductStatus[] = ["critical", "low"];

function isAttention(s: ProductStatus): boolean {
  return ATTENTION_STATUSES.includes(s);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStock(n: number, unit: string | null): string {
  // Show integer for whole quantities, 1 decimal for fractional
  const num = Number.isInteger(n) ? `${n}` : `${Math.round(n * 10) / 10}`;
  return unit ? `${num} ${unit}` : num;
}

// ─────────────────────────────────────────────────────────────
// Main card
// ─────────────────────────────────────────────────────────────

export function InventoryResultsCard({
  analysis,
  analyzedAt,
  isLatest = true,
}: {
  analysis: InventoryAgentOutput;
  analyzedAt: string;
  isLatest?: boolean;
}) {
  const isCritical = analysis.counts.critical > 0;

  // Split products into "needs attention" (critical+low) and "stable"
  const attention = analysis.products.filter((p) => isAttention(p.status));
  const stable = analysis.products.filter((p) => !isAttention(p.status));

  return (
    <Glass
      deep={isLatest}
      className="p-6"
      style={
        isCritical
          ? {
              borderColor: "rgba(214, 51, 108, 0.35)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 28px rgba(214,51,108,0.10), 0 1px 3px rgba(15,20,30,0.05)",
            }
          : undefined
      }
    >
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div
            className="mb-1.5 text-[11px]"
            style={{ color: "var(--color-ink-3)" }}
          >
            הניתוח בוצע: {formatDate(analyzedAt)} · {analysis.totalProducts}{" "}
            {analysis.totalProducts === 1 ? "מוצר" : "מוצרים"}
          </div>
          <h2
            className="text-[19px] font-semibold tracking-[-0.01em]"
            style={{ color: "var(--color-ink)" }}
          >
            {analysis.summary}
          </h2>
        </div>
        {isCritical && (
          <div
            className="flex flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: "rgba(214, 51, 108, 0.10)",
              border: "1px solid rgba(214, 51, 108, 0.30)",
              color: "var(--color-sys-pink)",
            }}
          >
            <AlertTriangle size={11} strokeWidth={2} />
            דחוף
          </div>
        )}
      </div>

      <div className="space-y-5">
        {/* 1. Status counts grid */}
        <Section title="התפלגות סטטוס" Icon={BarChart3}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatusMetric
              label="קריטי"
              count={analysis.counts.critical}
              status="critical"
            />
            <StatusMetric
              label="נמוך"
              count={analysis.counts.low}
              status="low"
            />
            <StatusMetric label="תקין" count={analysis.counts.ok} status="ok" />
            <StatusMetric
              label="עודף"
              count={analysis.counts.overstocked}
              status="overstocked"
            />
            <StatusMetric
              label="ללא תנועה"
              count={analysis.counts.noMovement}
              status="no_movement"
            />
          </div>
        </Section>

        {/* 2. Top concerns prose */}
        <Section title="דאגות מרכזיות" Icon={Search}>
          <p
            className="text-[12.5px] leading-relaxed"
            style={{ color: "var(--color-ink-2)" }}
          >
            {analysis.topConcernsHe}
          </p>
        </Section>

        {/* 3. Product list */}
        <Section title="פירוט מוצרים" Icon={Package}>
          {analysis.products.length === 0 ? (
            <p
              className="text-[12.5px]"
              style={{ color: "var(--color-ink-3)" }}
            >
              אין מוצרים להציג
            </p>
          ) : (
            <ProductsBreakdown attention={attention} stable={stable} />
          )}
        </Section>
      </div>

      <div
        className="mt-4 border-t pt-3 text-[11px]"
        style={{
          borderColor: "var(--color-hairline)",
          color: "var(--color-ink-3)",
        }}
      >
        ניתוח נוצר: {formatDate(analyzedAt)}
      </div>
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function Section({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[14px] p-4"
      style={{
        background: "rgba(255,255,255,0.5)",
        border: "1px solid var(--color-hairline)",
      }}
    >
      <h3
        className="mb-2.5 flex items-center gap-2 text-[14px] font-semibold tracking-tight"
        style={{ color: "var(--color-ink)" }}
      >
        <Icon
          size={14}
          strokeWidth={1.75}
          style={{ color: "var(--color-ink-2)" }}
        />
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatusMetric({
  label,
  count,
  status,
}: {
  label: string;
  count: number;
  status: ProductStatus;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.Icon;
  const active = count > 0;

  return (
    <div
      className="rounded-md px-3 py-2"
      style={{
        background: active ? meta.bg : "rgba(255,255,255,0.7)",
        border: active
          ? `1px solid ${meta.border}`
          : "1px solid var(--color-hairline)",
      }}
    >
      <div
        className="mb-0.5 flex items-center gap-1 text-[10px]"
        style={{ color: active ? meta.text : "var(--color-ink-3)" }}
      >
        <Icon size={11} strokeWidth={1.75} />
        {label}
      </div>
      <div
        className="text-[18px] font-semibold tracking-[-0.02em]"
        style={{ color: active ? meta.text : "var(--color-ink)" }}
      >
        {count}
      </div>
    </div>
  );
}

function ProductsBreakdown({
  attention,
  stable,
}: {
  attention: InventoryProductInsight[];
  stable: InventoryProductInsight[];
}) {
  const [showStable, setShowStable] = useState(false);

  return (
    <>
      {attention.length > 0 && (
        <>
          <div
            className="mb-2 text-[11.5px] font-medium"
            style={{ color: "var(--color-ink-2)" }}
          >
            דורש תשומת לב ({attention.length})
          </div>
          <div className="space-y-2">
            {attention.map((p, idx) => (
              <ProductRow
                key={p.productCode ?? `${p.productName}-${idx}`}
                product={p}
              />
            ))}
          </div>
        </>
      )}

      {stable.length > 0 && (
        <div className={attention.length > 0 ? "mt-4" : ""}>
          <button
            type="button"
            onClick={() => setShowStable((s) => !s)}
            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-[11.5px] font-medium transition-colors"
            style={{
              background: "rgba(255,255,255,0.6)",
              border: "1px solid var(--color-hairline)",
              color: "var(--color-ink-2)",
            }}
            aria-expanded={showStable}
          >
            <span>מצב יציב ({stable.length})</span>
            {showStable ? (
              <ChevronUp size={13} strokeWidth={1.75} />
            ) : (
              <ChevronDown size={13} strokeWidth={1.75} />
            )}
          </button>
          {showStable && (
            <div className="mt-2 space-y-2">
              {stable.map((p, idx) => (
                <ProductRow
                  key={p.productCode ?? `${p.productName}-${idx}`}
                  product={p}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {attention.length === 0 && stable.length === 0 && (
        <p
          className="text-[12.5px]"
          style={{ color: "var(--color-ink-3)" }}
        >
          אין מוצרים להציג
        </p>
      )}
    </>
  );
}

function ProductRow({ product }: { product: InventoryProductInsight }) {
  const meta = STATUS_META[product.status];
  const Icon = meta.Icon;
  const prominent = isAttention(product.status);

  // Build the "facts line" — current stock, days of coverage, daily avg
  const facts: string[] = [];
  facts.push(formatStock(product.currentStock, product.unit));
  if (product.daysOfCoverage !== null) {
    const days = product.daysOfCoverage;
    facts.push(
      `${days} ${days === 1 ? "יום כיסוי" : "ימי כיסוי"}`
    );
  } else {
    facts.push("ללא תנועה");
  }
  if (product.dailyAvgSales >= 0.05) {
    facts.push(`ממוצע יומי: ${product.dailyAvgSales.toFixed(1)}`);
  }

  return (
    <div
      className="rounded-md p-3"
      style={{
        background: prominent ? meta.bg : "rgba(255,255,255,0.55)",
        border: prominent
          ? `1px solid ${meta.border}`
          : "1px solid var(--color-hairline)",
      }}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span
          className="text-[13.5px] font-semibold"
          style={{ color: "var(--color-ink)" }}
        >
          {product.productName}
        </span>
        {product.productCode && (
          <span
            className="text-[10.5px]"
            style={{ color: "var(--color-ink-3)" }}
          >
            ({product.productCode})
          </span>
        )}
        <span
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold"
          style={{
            background: meta.bg,
            border: `1px solid ${meta.border}`,
            color: meta.text,
          }}
        >
          <Icon size={10} strokeWidth={2} />
          {meta.label}
        </span>
      </div>
      <div
        className="mb-1 text-[11.5px]"
        style={{ color: "var(--color-ink-3)" }}
      >
        {facts.join(" · ")}
      </div>
      <p
        className="text-[12.5px] leading-relaxed"
        style={{ color: "var(--color-ink-2)" }}
      >
        {product.insight}
      </p>
    </div>
  );
}
