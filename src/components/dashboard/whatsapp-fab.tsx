import { MessageCircle } from "lucide-react";

/**
 * WhatsApp Floating Action Button — bottom-end (left in RTL).
 * On mobile, lifts above the BottomNav (~64px tall + safe-area).
 * On desktop, sits at the bottom-left corner.
 */
export function WhatsAppFab() {
  return (
    <a
      href="https://wa.me/972000000000"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="פתח וואטסאפ"
      className="
        fixed end-[18px] z-30 flex h-[50px] w-[50px] items-center justify-center
        rounded-full text-white transition-transform hover:scale-105 active:scale-95
        bottom-[78px]
        sm:bottom-[22px]
      "
      style={{
        background: "linear-gradient(135deg, #25D366, #1A9F4E)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.3) inset, 0 10px 24px rgba(31,185,112,0.4)",
        // Lift above safe-area inset on mobile (iPhone home indicator)
        marginBottom: "env(safe-area-inset-bottom, 0)",
      }}
    >
      <MessageCircle size={22} strokeWidth={1.75} />
    </a>
  );
}
