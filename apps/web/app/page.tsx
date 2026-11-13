import type { Metadata } from "next";

import { Hero } from "@/components/marketing/hero";
import { Audiences, Compare, ProofBand } from "@/components/marketing/landing-sections";
import { PricingBand } from "@/components/marketing/pricing-band";
import { ProductDemo } from "@/components/marketing/product-demo";
import { ProductSections } from "@/components/marketing/product-sections";
import { MarketingShell } from "@/components/marketing/site-chrome";

import "./marketing.css";

export const metadata: Metadata = {
  title: "LetMeLead — buying-signal leads with the evidence attached",
  description:
    "Watch seven public sources for evidence of change, qualify it against your brief, and get decision-makers with a dated reason to reach out. Review every draft before anything sends.",
  openGraph: {
    title: "LetMeLead — buying-signal leads with the evidence attached",
    description:
      "Public evidence, qualified against your brief. Every lead carries a reason, a source and the age of the signal.",
    type: "website",
  },
};

export default function Home() {
  return (
    <MarketingShell>
      <Hero />
      <ProofBand />
      <Audiences />
      <ProductDemo />
      <ProductSections />
      <Compare />
      <PricingBand />
    </MarketingShell>
  );
}
