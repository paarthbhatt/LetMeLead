import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "LetMeLead — buying-signal leads with evidence",
  description:
    "Find companies with a reason to buy now, see the evidence, claim qualified leads with credits and run paced LinkedIn outreach.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <script dangerouslySetInnerHTML={{ __html: `try{const t=localStorage.getItem('letmelead.theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))}catch{document.documentElement.classList.add('dark')}` }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
