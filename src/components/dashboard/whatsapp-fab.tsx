import { MessageCircle } from "lucide-react";

/**
 * WhatsApp Floating Action Button — bottom-end (left in RTL)
 * Calm Frosted style — soft green gradient, refined shadow.
 */
export function WhatsAppFab() {
  return (
    <a
      href="https://wa.me/972000000000"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="פתח וואטסאפ"
      className="fixed bottom-[22px] end-[18px] z-30 flex h-[50px] w-[50px] items-center justify-center rounded-full text-white transition-transform hover:scale-105"
      style={{
        background: "linear-gradient(135deg, #25D366, #1A9F4E)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.3) inset, 0 10px 24px rgba(31,185,112,0.4)",
      }}
    >
      <MessageCircle size={22} strokeWidth={1.75} />
    </a>
  );
}
