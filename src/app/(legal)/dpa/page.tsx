import LegalDocPage from "@/components/legal/LegalDocPage";

export const metadata = {
  title: "DPA - Spike Engine",
  description: "Data Processing Agreement template",
};

export default function Page() {
  return <LegalDocPage filename="dpa-template-he" />;
}
