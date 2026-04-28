"use client";

import { MessageCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const WHATSAPP_NUMBER = "972000000000";
const PRESET_MESSAGE = "שלום, אני משתמש ב-Spike Engine וזקוק לעזרה";

export function WhatsAppFab() {
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(PRESET_MESSAGE)}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="פתח WhatsApp לתמיכה"
          className="fixed bottom-6 end-6 z-40 w-14 h-14 rounded-full bg-[#25D366] hover:bg-[#1FB855] shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
        >
          <MessageCircle className="h-6 w-6 text-white group-hover:scale-110 transition-transform" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>צריך עזרה? שלח הודעה ב-WhatsApp</p>
      </TooltipContent>
    </Tooltip>
  );
}