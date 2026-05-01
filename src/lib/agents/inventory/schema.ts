/**
 * Spike Engine — Inventory Agent JSON Schema
 *
 * Native JSON Schema (NOT tool_use) — Anthropic's structured output format.
 * Sonnet 4.6 will produce strictly this shape.
 *
 * The LLM does NOT compute daysOfCoverage / status — those are computed
 * in code from CSV data and passed to the LLM as facts. The LLM's job is:
 *   1. Write a Hebrew insight per product (1-line natural language)
 *   2. Assign priority (1 = most important)
 *   3. Write the overall summary and topConcernsHe prose
 *
 * Why split it this way:
 *   - Math is deterministic — never trust LLM with arithmetic
 *   - Status thresholds are policy — code owns the policy
 *   - Hebrew copy is creative — that's where the LLM shines
 */

export const INVENTORY_AGENT_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "סיכום בעברית במשפט אחד של מצב המלאי הכללי. עד 80 תווים.",
    },
    totalProducts: {
      type: "integer",
      description: "מספר המוצרים שנותחו.",
    },
    counts: {
      type: "object",
      properties: {
        critical: { type: "integer" },
        low: { type: "integer" },
        ok: { type: "integer" },
        overstocked: { type: "integer" },
        noMovement: { type: "integer" },
      },
      required: ["critical", "low", "ok", "overstocked", "noMovement"],
      additionalProperties: false,
    },
    products: {
      type: "array",
      description:
        "רשימת המוצרים עם תובנות. ממוין לפי priority — critical+low קודם.",
      items: {
        type: "object",
        properties: {
          productName: { type: "string" },
          productCode: { type: ["string", "null"] },
          currentStock: { type: "number" },
          unit: { type: ["string", "null"] },
          dailyAvgSales: { type: "number" },
          daysOfCoverage: { type: ["number", "null"] },
          status: {
            type: "string",
            enum: ["critical", "low", "ok", "overstocked", "no_movement"],
          },
          insight: {
            type: "string",
            description:
              "תובנה בעברית במשפט אחד על המוצר הזה. למשל: 'המלאי יחזיק כ-3 ימים לפי קצב המכירה'. אסור לכלול הוראות הזמנה.",
          },
          priority: {
            type: "integer",
            minimum: 1,
            description:
              "1 = הכי דחוף לתשומת לב הבעלים. critical תמיד 1, low תמיד 2, ok ו-overstocked 3+.",
          },
        },
        required: [
          "productName",
          "productCode",
          "currentStock",
          "unit",
          "dailyAvgSales",
          "daysOfCoverage",
          "status",
          "insight",
          "priority",
        ],
        additionalProperties: false,
      },
    },
    topConcernsHe: {
      type: "string",
      description:
        "פסקה בעברית שמסכמת את הדאגות המרכזיות. אם אין critical/low — תכתוב משפט שלילי כמו 'המלאי במצב יציב'. אסור לתת הוראות הזמנה.",
    },
  },
  required: ["summary", "totalProducts", "counts", "products", "topConcernsHe"],
  additionalProperties: false,
} as const;
