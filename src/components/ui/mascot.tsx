// src/components/ui/mascot.tsx
//
// Spike — the friendly teal robot mascot. Used in three poses across the app:
//   - laptop:      hero-style, Spike with a laptop & data balloons (login page)
//   - phone-left:  Spike holding a phone, body angled left (onboarding)
//   - phone-right: Spike holding a phone with energy (empty states)
//
// Image source: /public/mascot/{pose}.png
//
// Server-component safe: no styled-jsx. The optional float animation lives
// in globals.css under .mascot-float (respects prefers-reduced-motion).

import Image from "next/image";

type MascotPose = "laptop" | "phone-left" | "phone-right";

interface MascotProps {
  pose: MascotPose;
  size?: number;
  /** Optional hover/idle float animation. Default false (calm). */
  float?: boolean;
  /** Tailwind classes for positioning */
  className?: string;
  /** Aria-label override */
  alt?: string;
  /** Optional priority hint for above-the-fold use (login hero) */
  priority?: boolean;
}

const POSE_FILES: Record<MascotPose, string> = {
  laptop: "/mascot/mascot-laptop.png",
  "phone-left": "/mascot/mascot-phone-left.png",
  "phone-right": "/mascot/mascot-phone-right.png",
};

const POSE_DEFAULT_ALT: Record<MascotPose, string> = {
  laptop: "Spike — הסוכן שלך",
  "phone-left": "Spike מברך אותך",
  "phone-right": "Spike מצביע על משהו",
};

export function Mascot({
  pose,
  size = 200,
  float = false,
  className,
  alt,
  priority = false,
}: MascotProps) {
  const wrapperClass = [
    "relative",
    float ? "mascot-float" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={wrapperClass}
      style={{
        width: size,
        height: size,
      }}
    >
      <Image
        src={POSE_FILES[pose]}
        alt={alt ?? POSE_DEFAULT_ALT[pose]}
        width={size}
        height={size}
        priority={priority}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          // Subtle drop-shadow that respects transparent PNG cleanly
          filter: "drop-shadow(0 12px 24px rgba(15, 20, 30, 0.12))",
        }}
      />
      {/* Soft pedestal — adds polish even when image is loading */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          insetInline: "12%",
          bottom: "-2%",
          height: 16,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse at center, rgba(15,20,30,0.10), transparent 70%)",
          zIndex: -1,
        }}
      />
    </div>
  );
}
