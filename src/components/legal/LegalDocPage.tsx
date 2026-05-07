import fs from "fs";
import path from "path";
import { marked } from "marked";

type Props = {
  filename: string;
};

const STYLES = `
.legal-doc h1 { font-size: 1.875rem; font-weight: 700; margin-bottom: 1rem; line-height: 1.2; }
.legal-doc h2 { font-size: 1.5rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.75rem; line-height: 1.3; }
.legal-doc h3 { font-size: 1.25rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; }
.legal-doc h4 { font-size: 1.1rem; font-weight: 600; margin-top: 1rem; margin-bottom: 0.5rem; }
.legal-doc p { margin-bottom: 1rem; line-height: 1.75; }
.legal-doc a { color: #2563eb; text-decoration: underline; }
.legal-doc a:hover { color: #1d4ed8; }
.legal-doc table { width: 100%; margin: 1rem 0; border-collapse: collapse; }
.legal-doc th { background: #f3f4f6; padding: 0.5rem; text-align: right; font-weight: 600; border: 1px solid #e5e7eb; }
.legal-doc td { padding: 0.5rem; border: 1px solid #e5e7eb; }
.legal-doc ul { list-style-type: disc; margin-right: 1.5rem; margin-bottom: 1rem; }
.legal-doc ol { list-style-type: decimal; margin-right: 1.5rem; margin-bottom: 1rem; }
.legal-doc li { margin-bottom: 0.25rem; }
.legal-doc code { background: #f3f4f6; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-family: monospace; font-size: 0.875em; }
.legal-doc pre { background: #1f2937; color: white; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin: 1rem 0; }
.legal-doc pre code { background: transparent; color: inherit; padding: 0; }
.legal-doc blockquote { border-right: 4px solid #d1d5db; padding-right: 1rem; color: #4b5563; margin: 1rem 0; font-style: italic; }
.legal-doc hr { margin: 2rem 0; border: none; border-top: 1px solid #e5e7eb; }
.legal-doc strong { font-weight: 700; }
`;

export default function LegalDocPage({ filename }: Props) {
  const filePath = path.join(process.cwd(), "src/content/legal", `${filename}.md`);

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    content = "# מסמך לא נמצא\n\nאנא צור קשר ב-legal@spikeai.co.il";
  }

  const html = marked.parse(content, { gfm: true, breaks: true }) as string;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <article dir="rtl" className="legal-doc mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </>
  );
}
