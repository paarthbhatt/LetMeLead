export type DemoAudienceId = "security" | "revenue" | "agency";

export type SampleEvidence = {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly sourceUrl: `https://${string}.example/${string}`;
  readonly publishedOn: string;
  readonly publishedLabel: string;
  readonly excerpt: string;
  readonly supports: string;
};

export type SampleDossier = {
  readonly audience: DemoAudienceId;
  readonly brief: string;
  readonly offer: string;
  readonly company: {
    readonly name: string;
    readonly initials: string;
    readonly domain: `${string}.example`;
    readonly description: string;
  };
  readonly signal: {
    readonly kind: string;
    readonly title: string;
    readonly description: string;
    readonly publishedOn: string;
    readonly publishedLabel: string;
    readonly evidenceId: string;
  };
  readonly fit: readonly {
    readonly label: string;
    readonly reasoning: string;
    readonly evidenceId: string;
  }[];
  readonly contact: {
    readonly name: string;
    readonly role: string;
    readonly email: `${string}@${string}.example`;
    readonly caveat: string;
  };
  readonly uncertainty: string;
  readonly draft: {
    readonly subject: string;
    readonly body: string;
  };
  readonly evidence: readonly SampleEvidence[];
};

export const DEMO_AUDIENCES: readonly { id: DemoAudienceId; label: string }[] = [
  { id: "security", label: "Security" },
  { id: "revenue", label: "Revenue" },
  { id: "agency", label: "Agency" },
];

export const SAMPLE_DISCLOSURE =
  "All companies, people, dates and evidence here are invented. This is an illustrative sample, not live research. Contacts are unverified and nothing is sent.";

export const SAMPLE_DOSSIERS: Readonly<Record<DemoAudienceId, SampleDossier>> = {
  security: {
    audience: "security",
    brief:
      "Find B2B software teams preparing enterprise security reviews. Look for a public compliance project and a security owner; exclude consultancies.",
    offer: "Security review automation",
    company: {
      name: "Northline Systems",
      initials: "NS",
      domain: "northline.example",
      description: "B2B workflow software",
    },
    signal: {
      kind: "Hiring signal",
      title: "A first security lead, with compliance in scope",
      description:
        "The sample role lists enterprise questionnaires and SOC 2 preparation among its responsibilities.",
      publishedOn: "2026-11-04",
      publishedLabel: "4 Nov 2026",
      evidenceId: "security-role",
    },
    fit: [
      {
        label: "Audience match",
        reasoning:
          "The sample company profile describes B2B software sold to enterprise teams.",
        evidenceId: "security-profile",
      },
      {
        label: "Timing, not intent",
        reasoning:
          "The security role suggests an active review workload. It does not show a purchase plan.",
        evidenceId: "security-role",
      },
    ],
    contact: {
      name: "Mira Hale",
      role: "Head of Security",
      email: "mira@northline.example",
      caveat: "Suggested role only. Identity, email delivery and buying authority are unverified.",
    },
    uncertainty: "Current tools, project budget and buying intent are unknown.",
    draft: {
      subject: "A lighter enterprise security review",
      body: "Hi Mira,\n\nNorthline Systems’ security role mentions enterprise questionnaires and SOC 2 preparation. If reducing review overhead is a priority, would a short comparison of review workflows be useful?\n\nIf this sits with someone else, I’m happy to follow their lead.",
    },
    evidence: [
      {
        id: "security-role",
        title: "First security lead",
        kind: "Sample careers page",
        sourceUrl: "https://northline.example/careers/security-lead",
        publishedOn: "2026-11-04",
        publishedLabel: "4 Nov 2026",
        excerpt:
          "Own enterprise questionnaires and help prepare the SOC 2 program as our first security lead.",
        supports: "A timing clue for compliance work; not proof of budget or a vendor evaluation.",
      },
      {
        id: "security-profile",
        title: "Company overview",
        kind: "Sample company page",
        sourceUrl: "https://northline.example/company",
        publishedOn: "2026-11-02",
        publishedLabel: "2 Nov 2026",
        excerpt: "Northline Systems builds workflow software for enterprise operations teams.",
        supports: "Business model and audience fit; not evidence of buying intent.",
      },
    ],
  },
  revenue: {
    audience: "revenue",
    brief:
      "Find B2B data platforms building a repeatable sales process. Look for a revenue operations hire and a commercial team; exclude consumer apps.",
    offer: "Revenue workflow software",
    company: {
      name: "Harborpath",
      initials: "HP",
      domain: "harborpath.example",
      description: "B2B data platform",
    },
    signal: {
      kind: "Hiring signal",
      title: "Revenue operations becomes a dedicated role",
      description:
        "The sample job description includes lead routing, CRM ownership and pipeline reporting.",
      publishedOn: "2026-11-06",
      publishedLabel: "6 Nov 2026",
      evidenceId: "revenue-role",
    },
    fit: [
      {
        label: "Audience match",
        reasoning:
          "The sample company page describes a data platform with a B2B commercial team.",
        evidenceId: "revenue-profile",
      },
      {
        label: "Timing, not intent",
        reasoning:
          "A dedicated operations hire could mean workflows are being formalized. A tooling change is not confirmed.",
        evidenceId: "revenue-role",
      },
    ],
    contact: {
      name: "Jonah Reed",
      role: "VP of Revenue",
      email: "jonah@harborpath.example",
      caveat: "Suggested role only. Identity, email delivery and responsibility for routing are unverified.",
    },
    uncertainty: "CRM choice, routing pain and the team’s budget still need confirmation.",
    draft: {
      subject: "A question about your lead-routing workflow",
      body: "Hi Jonah,\n\nHarborpath’s revenue operations role mentions lead routing and CRM ownership. Are those workflows being shaped now, or is there an established process in place?\n\nIf useful, I can share a brief approach to keeping routing rules and handoffs clear.",
    },
    evidence: [
      {
        id: "revenue-role",
        title: "Revenue operations lead",
        kind: "Sample careers page",
        sourceUrl: "https://harborpath.example/careers/revenue-operations",
        publishedOn: "2026-11-06",
        publishedLabel: "6 Nov 2026",
        excerpt: "Shape lead routing, own our CRM workflows and build clear pipeline reporting.",
        supports: "An operations-workflow clue; not confirmation of a software purchase.",
      },
      {
        id: "revenue-profile",
        title: "Company overview",
        kind: "Sample company page",
        sourceUrl: "https://harborpath.example/company",
        publishedOn: "2026-11-01",
        publishedLabel: "1 Nov 2026",
        excerpt: "Harborpath is a data platform serving B2B commercial and operations teams.",
        supports: "Audience and business-model fit; no claim about company size or revenue.",
      },
    ],
  },
  agency: {
    audience: "agency",
    brief:
      "Find B2B companies entering a new market. Prioritize a public launch update and a marketing owner; exclude companies without a stated launch project.",
    offer: "Positioning and launch design",
    company: {
      name: "Asterfield Labs",
      initials: "AL",
      domain: "asterfield.example",
      description: "Industrial analytics software",
    },
    signal: {
      kind: "Company update",
      title: "A regional launch creates a positioning question",
      description:
        "The sample update outlines a regional launch and plans to adapt the product story for that audience.",
      publishedOn: "2026-11-03",
      publishedLabel: "3 Nov 2026",
      evidenceId: "agency-launch",
    },
    fit: [
      {
        label: "Audience match",
        reasoning:
          "The sample company profile describes a B2B analytics product, rather than an in-house design team.",
        evidenceId: "agency-profile",
      },
      {
        label: "Timing, not intent",
        reasoning:
          "Adapting the product story could fit a positioning project. It does not establish demand for an agency.",
        evidenceId: "agency-launch",
      },
    ],
    contact: {
      name: "Lena Park",
      role: "Marketing Director",
      email: "lena@asterfield.example",
      caveat: "Suggested role only. Identity, email delivery and launch ownership are unverified.",
    },
    uncertainty: "Launch timing, agency involvement and available budget are unknown.",
    draft: {
      subject: "A question about the regional launch",
      body: "Hi Lena,\n\nAsterfield Labs’ regional launch update mentions adapting the product story for a new audience. Is that positioning work being handled in-house, or are you exploring outside support?\n\nIf it would help, I can outline a few questions for reviewing the launch narrative.",
    },
    evidence: [
      {
        id: "agency-launch",
        title: "Regional launch notes",
        kind: "Sample company update",
        sourceUrl: "https://asterfield.example/updates/regional-launch",
        publishedOn: "2026-11-03",
        publishedLabel: "3 Nov 2026",
        excerpt: "We are preparing a regional launch and adapting our product story for a new audience.",
        supports: "A stated launch project; not proof that outside support is wanted.",
      },
      {
        id: "agency-profile",
        title: "Company overview",
        kind: "Sample company page",
        sourceUrl: "https://asterfield.example/company",
        publishedOn: "2026-10-30",
        publishedLabel: "30 Oct 2026",
        excerpt: "Asterfield Labs builds industrial analytics software for B2B operations teams.",
        supports: "Product and audience fit; no claim about launch results or company growth.",
      },
    ],
  },
};
