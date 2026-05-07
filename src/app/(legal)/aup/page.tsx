import LegalDocPage from "@/components/legal/LegalDocPage";

export const metadata = {
  title: "מדיניות שימוש מקובל - Spike Engine",
  description: "AUP - שימושים אסורים",
};

export default function Page() {
  return <LegalDocPage filename="aup-he" />;
}
