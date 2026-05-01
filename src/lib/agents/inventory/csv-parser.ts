/**
 * Spike Engine — Day 18: Inventory CSV Parser
 *
 * Parses CSVs from Israeli POS / inventory systems (AP, Tranzila, Rivhit,
 * Caspit, Linet, etc.) plus generic Excel-style exports. Column headers
 * are matched against a synonym dictionary covering both Hebrew and
 * English variations.
 *
 * Strategy:
 *   1. Parse CSV (handles BOM, quoted values, embedded commas)
 *   2. Detect headers row (first non-empty row)
 *   3. Match each header against the synonym dictionary
 *   4. Build typed product rows; collect warnings for unparseable rows
 *
 * Failure modes:
 *   - Required field missing → throw with Hebrew message
 *   - Optional field missing → silently skip that column
 *   - Cell unparseable (e.g., "כמה?" instead of a number) → warning
 *
 * Design constraints:
 *   - Pure function (no DB, no I/O)
 *   - No external dependencies (parses CSV by hand to keep bundle small)
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface InventoryProduct {
  productName: string;
  productCode: string | null;
  currentStock: number;
  soldLast30Days: number;
  unit: string | null;
  safetyStock: number | null;
}

export type ColumnField =
  | "productName"
  | "productCode"
  | "currentStock"
  | "soldLast30Days"
  | "unit"
  | "safetyStock";

export interface ColumnMapping {
  /** Index in the CSV row → which logical field it maps to */
  [csvColumnIndex: number]: ColumnField;
}

export interface ParseResult {
  products: InventoryProduct[];
  rowCount: number;
  columnMapping: Record<string, ColumnField>; // header text → field
  warnings: string[];
}

export class InventoryParseError extends Error {
  constructor(
    public messageHe: string,
    public detail?: string
  ) {
    super(messageHe);
    this.name = "InventoryParseError";
  }
}

// ─────────────────────────────────────────────────────────────
// Synonym dictionary — Hebrew + English variations
// ─────────────────────────────────────────────────────────────
//
// Each field has a list of substrings. Matching is case-insensitive
// and tolerant of common punctuation (״, ", _, -, spaces).

const COLUMN_SYNONYMS: Record<ColumnField, string[]> = {
  productName: [
    // Hebrew
    "שם מוצר",
    "שם פריט",
    "תיאור פריט",
    "תיאור",
    "מוצר",
    "פריט",
    "המוצר",
    "מוצרים",
    "שם",
    // English
    "product name",
    "item name",
    "description",
    "product",
    "item",
    "name",
    "title",
    "sku name",
  ],

  productCode: [
    // Hebrew
    "קוד מוצר",
    "קוד פריט",
    "ברקוד",
    "מק״ט",
    "מקט",
    "מספר פריט",
    "מספר מוצר",
    "קוד",
    // English
    "product code",
    "item code",
    "barcode",
    "sku",
    "id",
    "code",
  ],

  currentStock: [
    // Hebrew
    "כמות במלאי",
    "מלאי נוכחי",
    "יתרת מלאי",
    "כמות נוכחית",
    "כמות בפועל",
    "כמות זמינה",
    "במלאי",
    "מלאי",
    "יתרה",
    "כמות",
    // English
    "current stock",
    "on hand",
    "in stock",
    "available",
    "balance",
    "inventory",
    "stock",
    "quantity",
    "qty",
  ],

  soldLast30Days: [
    // Hebrew
    "נמכר ב-30 יום",
    "נמכר ב 30 יום",
    "מכירות 30 יום",
    "מכירות חודשיות",
    "נמכר בחודש האחרון",
    "נמכר בחודש",
    "מכירות בחודש",
    "תנועה חודשית",
    "מכירה חודשית",
    "מכירות",
    "נמכר",
    // English
    "sold last 30 days",
    "30 day sales",
    "30d sales",
    "monthly sales",
    "last month sales",
    "sold per month",
    "monthly",
    "sales",
    "sold",
  ],

  unit: [
    // Hebrew
    "יחידת מידה",
    "יחידה",
    "מידה",
    "מידות",
    // English
    "unit of measure",
    "unit",
    "uom",
    "measure",
  ],

  safetyStock: [
    // Hebrew
    "מלאי בטיחות",
    "מלאי מינימום",
    "סף מינימום",
    "מינימום",
    // English
    "safety stock",
    "minimum stock",
    "min stock",
    "reorder point",
    "minimum",
  ],
};

// ─────────────────────────────────────────────────────────────
// Header matching
// ─────────────────────────────────────────────────────────────

/**
 * Normalize a header for matching: lowercase, replace common
 * punctuation with spaces, collapse whitespace.
 */
function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/[״"'_\-,/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match a header string against the synonym dictionary.
 * Longer synonyms win (more specific).
 *
 * Returns null if no match — caller decides how to handle unmapped columns.
 */
function matchHeader(header: string): ColumnField | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;

  let bestMatch: { field: ColumnField; matchLength: number } | null = null;

  for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS) as [
    ColumnField,
    string[]
  ][]) {
    for (const syn of synonyms) {
      const synNorm = normalizeHeader(syn);
      if (normalized.includes(synNorm)) {
        // Prefer the longest matching synonym
        if (!bestMatch || synNorm.length > bestMatch.matchLength) {
          bestMatch = { field, matchLength: synNorm.length };
        }
      }
    }
  }

  return bestMatch?.field ?? null;
}

// ─────────────────────────────────────────────────────────────
// CSV row parser (handles BOM, quoted values, embedded commas)
// ─────────────────────────────────────────────────────────────

/**
 * Parse a single CSV line into cells. Handles:
 *   - Quoted strings: "hello, world" → "hello, world" (one cell)
 *   - Escaped quotes: "she said ""hi""" → 'she said "hi"'
 *   - Trailing commas
 *   - Empty cells
 */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ",") {
      cells.push(current);
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  cells.push(current);
  return cells.map((c) => c.trim());
}

// ─────────────────────────────────────────────────────────────
// Number parser — tolerant of Hebrew formatting
// ─────────────────────────────────────────────────────────────

/**
 * Parse a numeric cell. Tolerates:
 *   - "1,234" (thousands separator)
 *   - "1.5" / "1,5" (decimal)
 *   - "12 ק״ג" (with unit suffix — strips non-numeric)
 *   - Negative: "-5"
 *
 * Returns null if not parseable.
 */
function parseNumber(raw: string): number | null {
  if (!raw || raw.trim() === "") return null;

  // Strip Hebrew text and units, keep digits + . , -
  const cleaned = raw
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, "."); // comma → dot for decimal

  if (!cleaned) return null;

  // Handle multiple dots (e.g., "1.234.56" → take first as decimal)
  const parts = cleaned.split(".");
  let normalized: string;
  if (parts.length <= 2) {
    normalized = cleaned;
  } else {
    // Likely "1.234.56" thousands separator with last as decimal
    const decimal = parts.pop();
    normalized = parts.join("") + "." + decimal;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// ─────────────────────────────────────────────────────────────
// Main entry: parse CSV string → InventoryProduct[]
// ─────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into structured inventory products.
 *
 * Throws InventoryParseError with Hebrew message if the file is fundamentally
 * unusable (no headers, no required fields). Otherwise returns warnings
 * for individual rows that couldn't be parsed.
 */
export function parseInventoryCsv(rawCsv: string): ParseResult {
  // Strip UTF-8 BOM
  const csv = rawCsv.replace(/^\uFEFF/, "");

  // Split into lines, ignoring trailing empties
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new InventoryParseError(
      "הקובץ ריק או חסר שורות נתונים. ודא שיש כותרות ושורת נתונים אחת לפחות."
    );
  }

  // First non-empty line = header row
  const headers = parseCsvLine(lines[0]);
  if (headers.length === 0) {
    throw new InventoryParseError("לא נמצאה שורת כותרות בקובץ.");
  }

  // Match each header
  const columnMapping: Record<string, ColumnField> = {};
  const indexToField: Record<number, ColumnField> = {};

  for (let i = 0; i < headers.length; i++) {
    const field = matchHeader(headers[i]);
    if (field) {
      columnMapping[headers[i]] = field;
      indexToField[i] = field;
    }
  }

  // Verify required fields
  const mappedFields = new Set(Object.values(indexToField));
  const missingRequired: string[] = [];
  if (!mappedFields.has("productName")) missingRequired.push("שם המוצר");
  if (!mappedFields.has("currentStock")) missingRequired.push("כמות במלאי");
  if (!mappedFields.has("soldLast30Days"))
    missingRequired.push("נמכר ב-30 יום");

  if (missingRequired.length > 0) {
    throw new InventoryParseError(
      `הקובץ חסר עמודות חיוניות: ${missingRequired.join(
        ", "
      )}. ודא שהקובץ מכיל לפחות שם מוצר, כמות במלאי, ומכירות ב-30 יום.`,
      `Headers found: ${headers.join(", ")}`
    );
  }

  // Parse data rows
  const products: InventoryProduct[] = [];
  const warnings: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length === 0 || cells.every((c) => !c)) continue;

    const product: Partial<InventoryProduct> = {
      productName: "",
      productCode: null,
      currentStock: 0,
      soldLast30Days: 0,
      unit: null,
      safetyStock: null,
    };

    let isValidRow = true;

    for (let colIdx = 0; colIdx < cells.length; colIdx++) {
      const field = indexToField[colIdx];
      if (!field) continue;

      const cell = cells[colIdx];

      switch (field) {
        case "productName": {
          if (!cell) {
            warnings.push(`שורה ${i + 1}: שם מוצר חסר, מדלג.`);
            isValidRow = false;
            break;
          }
          product.productName = cell;
          break;
        }
        case "productCode": {
          product.productCode = cell || null;
          break;
        }
        case "currentStock": {
          const n = parseNumber(cell);
          if (n === null) {
            warnings.push(
              `שורה ${i + 1}: לא ניתן לקרוא כמות מלאי ("${cell}"), מדלג.`
            );
            isValidRow = false;
            break;
          }
          product.currentStock = Math.max(0, n);
          break;
        }
        case "soldLast30Days": {
          const n = parseNumber(cell);
          if (n === null) {
            warnings.push(
              `שורה ${i + 1}: לא ניתן לקרוא מכירות חודשיות ("${cell}"), משתמש ב-0.`
            );
            product.soldLast30Days = 0;
            break;
          }
          product.soldLast30Days = Math.max(0, n);
          break;
        }
        case "unit": {
          product.unit = cell || null;
          break;
        }
        case "safetyStock": {
          const n = parseNumber(cell);
          product.safetyStock = n !== null ? Math.max(0, n) : null;
          break;
        }
      }
    }

    if (isValidRow && product.productName) {
      products.push(product as InventoryProduct);
    }
  }

  if (products.length === 0) {
    throw new InventoryParseError(
      "לא נמצאו שורות נתונים תקינות בקובץ. ודא שיש לפחות שורה אחת עם שם מוצר, כמות מלאי, ומכירות חודשיות."
    );
  }

  return {
    products,
    rowCount: products.length,
    columnMapping,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────
// Status calculator — pure function, no LLM
// ─────────────────────────────────────────────────────────────
//
// Days of coverage = currentStock / dailyAvg
// Where dailyAvg = soldLast30Days / 30 (with floor protection)

export type ProductStatus = "critical" | "low" | "ok" | "overstocked" | "no_movement";

export interface ProductAnalysis {
  productName: string;
  productCode: string | null;
  currentStock: number;
  unit: string | null;
  dailyAvgSales: number;
  daysOfCoverage: number | null; // null when no movement
  status: ProductStatus;
}

export function analyzeProduct(p: InventoryProduct): ProductAnalysis {
  const dailyAvg = p.soldLast30Days / 30;

  // No movement → can't compute coverage
  if (dailyAvg < 0.05) {
    return {
      productName: p.productName,
      productCode: p.productCode,
      currentStock: p.currentStock,
      unit: p.unit,
      dailyAvgSales: dailyAvg,
      daysOfCoverage: null,
      status: p.currentStock === 0 ? "critical" : "no_movement",
    };
  }

  const daysOfCoverage = p.currentStock / dailyAvg;

  let status: ProductStatus;
  if (daysOfCoverage <= 1) status = "critical";
  else if (daysOfCoverage <= 5) status = "low";
  else if (daysOfCoverage <= 30) status = "ok";
  else status = "overstocked";

  return {
    productName: p.productName,
    productCode: p.productCode,
    currentStock: p.currentStock,
    unit: p.unit,
    dailyAvgSales: dailyAvg,
    daysOfCoverage: Math.round(daysOfCoverage * 10) / 10, // 1 decimal
    status,
  };
}

export function analyzeAll(products: InventoryProduct[]): ProductAnalysis[] {
  return products.map(analyzeProduct);
}
