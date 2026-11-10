import { config } from "../config.js";
import { callLlm, extractJson } from "../llm.js";
import {
  getCampaign,
  getSequences,
  getSettings,
  getLead,
  queuedCampaignLeads,
  setCampaignLeadState,
  logActivity,
  type LeadRow,
  type Settings,
} from "../store.js";

export async function composeSequence(settings: Settings, lead: LeadRow): Promise<string[]> {
  if (config.llm.enabled) {
    const prompt = `Write a short LinkedIn outreach sequence (2 messages) to ${lead.company || lead.domain}.
The reason to reach out: ${lead.signal_label} (${lead.reason || "buying signal"}).
What we sell: ${settings.offer}.
Rules: 1-2 sentences each, reference the signal plainly, no fake familiarity, no links, no claims we cannot back, sign as the user. Return STRICT JSON {"steps": ["...", "..."]}.`;
    const res = await callLlm(
      [
        { role: "system", content: "You write concise, honest B2B outreach. Output only JSON." },
        { role: "user", content: prompt },
      ],
      { json: true, maxTokens: 400 }
    );
    if (res.ok) {
      const parsed = extractJson<{ steps?: string[] }>(res.text);
      if (parsed?.steps?.length) return parsed.steps.map(String);
    }
  }
  const company = lead.company || lead.domain;
  const signal = lead.signal_label || lead.reason || "a recent signal";
  return [
    `Hi — I saw ${signal} at ${company}. ${settings.offer}. Worth a quick chat about how this usually plays out?`,
    `Following up on my note about ${company}. Happy to share what similar teams did at this stage — no pitch.`,
  ];
}

export interface OutreachResult {
  sent: number;
  ready: number;
  messages: Array<{ lead_id: number; company: string | null; messages: string[] }>;
  note?: string;
}

export async function runOutreach(campaignId: number): Promise<OutreachResult> {
  const campaign = getCampaign(campaignId);
  if (!campaign) return { sent: 0, ready: 0, messages: [], note: "Campaign not found." };

  if (campaign.sender === "linkedin" && process.env.ENABLE_LINKEDIN_AUTOMATION !== "true") {
    return {
      sent: 0,
      ready: 0,
      messages: [],
      note:
        "LinkedIn automation is disabled. LinkedIn's terms prohibit automated messaging and it risks account bans. " +
        "Use the manual sender (copy/paste), or a webhook to a compliant outreach service. Set ENABLE_LINKEDIN_AUTOMATION=true only if you accept the risk; this build does not implement browser automation.",
    };
  }

  const settings = getSettings(campaign.account_id);
  const sequence = getSequences(campaignId).map((s) => s.body);
  const dailyLimit = campaign.warm_up ? 5 : 20;
  const leadIds = queuedCampaignLeads(campaignId, dailyLimit);
  const messages: OutreachResult["messages"] = [];
  let sent = 0;

  for (const leadId of leadIds) {
    const lead = getLead(leadId);
    if (!lead) continue;
    const steps = sequence.length ? sequence : await composeSequence(settings, lead);

    if (campaign.sender === "webhook") {
      const url = process.env.OUTREACH_WEBHOOK_URL;
      if (!url) return { sent, ready: messages.length, messages, note: "Set OUTREACH_WEBHOOK_URL for the webhook sender." };
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaign_id: campaignId, lead: { id: lead.id, company: lead.company, domain: lead.domain, linkedin: lead.linkedin }, messages: steps }),
        });
        if (!res.ok) throw new Error(`webhook HTTP ${res.status}`);
        setCampaignLeadState(campaignId, leadId, "sent");
        logActivity(campaignId, leadId, "requested");
        sent++;
      } catch (err) {
        return { sent, ready: messages.length, messages, note: `Webhook failed: ${(err as Error).message}` };
      }
    } else {
      // manual / linkedin-gated: prepare messages for the human to send
      setCampaignLeadState(campaignId, leadId, "ready");
      messages.push({ lead_id: lead.id, company: lead.company, messages: steps });
    }
  }

  return {
    sent,
    ready: messages.length,
    messages,
    note:
      campaign.sender === "manual"
        ? `Prepared ${messages.length} message set(s) for manual sending (warm-up limit ${dailyLimit}/run).`
        : undefined,
  };
}
