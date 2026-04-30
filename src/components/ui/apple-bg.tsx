/**
 * AppleBg — Calm Frosted background
 *
 * Three soft radial gradient blobs that create the signature visionOS feel.
 * Static (no animation). Sits behind everything with z-index: 0.
 *
 * MUST be the first child of any page using the Calm Frosted system.
 */

export function AppleBg() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ background: "var(--color-mist-blue)" }}
    >
      {/* Blue blob — top-start (right in RTL) */}
      <div
        className="absolute -top-[120px] -end-[100px] h-[520px] w-[520px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(184,206,255,0.85), rgba(184,206,255,0) 70%)",
        }}
      />
      {/* Lilac blob — middle-end (left in RTL) */}
      <div
        className="absolute top-[220px] -start-[120px] h-[480px] w-[480px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(214,189,233,0.75), rgba(214,189,233,0) 70%)",
        }}
      />
      {/* Mint blob — bottom */}
      <div
        className="absolute -bottom-[180px] end-[200px] h-[600px] w-[600px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(178,221,206,0.6), rgba(178,221,206,0) 70%)",
        }}
      />
    </div>
  );
}
