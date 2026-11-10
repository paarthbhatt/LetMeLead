import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getAccount,
  getSettings,
  updateSettings,
  getBalance,
  listLeads,
  getLead,
  updateLead,
  listCampaigns,
  getCampaign,
  createCampaign,
  setSequence,
  getSequences,
  addLeadsToCampaign,
  setCampaignStatus,
  setCampaignFlags,
  setCampaignSender,
  campaignActivity,
  listLinkedinAccounts,
  addRequest,
  listRequests,
  listPlays,
  listSignalsForLead,
  countLeads,
} from "../store.js";
import { generateBrief } from "../engine/brief.js";
import { findMoreLeads, loadTargets } from "../engine/signals.js";
import { runOutreach, composeSequence } from "../engine/outreach.js";
import { enrichLead } from "../engine/enrich.js";
import { sourceStatus } from "../sources/index.js";
import { config } from "../config.js";

const ACCOUNT_ID = 1;

function json(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

export function setupStatus() {
  const account = getAccount(ACCOUNT_ID);
  const settings = getSettings(ACCOUNT_ID);
  const linkedin = listLinkedinAccounts(ACCOUNT_ID)[0];
  const balance = getBalance(ACCOUNT_ID);
  const campaigns = listCampaigns(ACCOUNT_ID);
  const delivered = countLeads(ACCOUNT_ID);
  const target = 10;

  let freeSampleStatus: string;
  if (!settings.brief_complete) freeSampleStatus = "not_started";
  else if (delivered === 0) freeSampleStatus = "running";
  else if (delivered < target) freeSampleStatus = "partially_delivered";
  else freeSampleStatus = "completed";

  let next: string;
  let message: string;
  if (!settings.brief_complete) {
    next = "complete_brief";
    message = "Your brief is not complete yet. Set your website, offer and buyers, then generate the brief.";
  } else if (delivered === 0) {
    next = "start_free_leads";
    message = "Your brief is ready. Run Find leads to scan your target list for fresh buying signals.";
  } else if (!linkedin || linkedin.status !== "connected") {
    next = "connect_linkedin";
    message = `${delivered} lead(s) ready. Review them, then connect a LinkedIn account to draft outreach.`;
  } else if (campaigns.length === 0) {
    next = "start_campaign";
    message = "You have leads and LinkedIn connected. Draft a campaign next.";
  } else {
    next = "review_leads";
    message = `You have ${delivered} lead(s) and ${campaigns.length} campaign(s). Review the freshest signals.`;
  }

  return {
    account: { id: ACCOUNT_ID, name: account.name },
    brief: { complete: settings.brief_complete, offer: settings.offer, buyers: settings.buyers, region: settings.region },
    free_sample: { status: freeSampleStatus, delivered, target },
    linkedin: { connected: Boolean(linkedin && linkedin.status === "connected"), handle: linkedin?.handle || null },
    credits: balance,
    campaigns: campaigns.length,
    onboarding_done: settings.brief_complete,
    recommended_next_action: next,
    message,
    sources: sourceStatus(settings),
    llm_enabled: config.llm.enabled,
    providers: config.providers,
  };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "letmelead", version: "0.1.0" });

  server.registerTool(
    "get_setup_status",
    {
      title: "Get setup status",
      description: "Call this first in every conversation. Returns the account brief, free-sample status, LinkedIn, credits and the recommended next action.",
      inputSchema: {},
    },
    async () => json(setupStatus())
  );

  server.registerTool(
    "get_offer",
    {
      title: "Get offer",
      description: "What this workspace sells and to whom. Works before any leads exist.",
      inputSchema: {},
    },
    async () => {
      const s = getSettings(ACCOUNT_ID);
      return json({ website: s.website, offer: s.offer, buyers: s.buyers, roles: s.roles, region: s.region, exclusions: s.exclusions });
    }
  );

  server.registerTool(
    "get_settings",
    {
      title: "Get settings",
      description: "Return the current brief and limits, plus the credit balance.",
      inputSchema: {},
    },
    async () => json({ settings: getSettings(ACCOUNT_ID), credits: getBalance(ACCOUNT_ID) })
  );

  server.registerTool(
    "update_settings",
    {
      title: "Update settings",
      description: "Change the brief or limits. Only call after the user agrees to the change.",
      inputSchema: {
        website: z.string().optional(),
        offer: z.string().optional(),
        buyers: z.array(z.string()).optional(),
        roles: z.array(z.string()).optional(),
        region: z.string().optional(),
        exclusions: z.array(z.string()).optional(),
        target_list: z.string().optional(),
        sources: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      const patch: Record<string, unknown> = {};
      for (const k of ["website", "offer", "buyers", "roles", "region", "exclusions", "target_list", "sources"] as const) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      const s = getSettings(ACCOUNT_ID);
      const offer = (patch.offer as string) ?? s.offer;
      const buyers = (patch.buyers as string[]) ?? s.buyers;
      patch.brief_complete = Boolean(offer && buyers.length);
      return json({ settings: updateSettings(ACCOUNT_ID, patch as never) });
    }
  );

  server.registerTool(
    "generate_brief",
    {
      title: "Generate brief from website",
      description: "Fetch the user's website and draft who they sell to (ICP). Uses the configured LLM when available, otherwise a heuristic. Ask before overwriting an existing brief.",
      inputSchema: { website: z.string().optional() },
    },
    async (args) => {
      const s = getSettings(ACCOUNT_ID);
      const website = args.website || s.website;
      if (!website) return json({ error: "No website set. Provide one." });
      const result = await generateBrief(ACCOUNT_ID, website);
      return json(result);
    }
  );

  server.registerTool(
    "list_plays",
    {
      title: "List plays",
      description: "The available workflows for this workspace.",
      inputSchema: {},
    },
    async () => json({ plays: listPlays() })
  );

  server.registerTool(
    "get_balance",
    {
      title: "Get balance",
      description: "Credit balance and recent ledger entries.",
      inputSchema: {},
    },
    async () => json({ credits: getBalance(ACCOUNT_ID), payment_needed: false, note: "Self-hosted personal build: no billing." })
  );

  server.registerTool(
    "list_leads",
    {
      title: "List leads",
      description: "Ranked leads with the buying signal in plain words, how old it is, and contact found.",
      inputSchema: { limit: z.number().int().min(1).max(1000).optional(), status: z.string().optional() },
    },
    async (args) => json({ leads: listLeads(ACCOUNT_ID, { limit: args.limit, status: args.status }) })
  );

  server.registerTool(
    "get_leads",
    {
      title: "Get delivered leads",
      description: "Delivered leads with the brief they were found for.",
      inputSchema: { limit: z.number().int().min(1).max(1000).optional() },
    },
    async (args) => json({ brief: getSettings(ACCOUNT_ID), leads: listLeads(ACCOUNT_ID, { limit: args.limit }) })
  );

  server.registerTool(
    "find_more_leads",
    {
      title: "Find more leads",
      description: "Run the buying-signal scan across the target list and rank accounts. Optionally pass an explicit target list. Free in this personal build.",
      inputSchema: {
        count: z.number().int().min(1).max(200).optional(),
        roles: z.array(z.string()).optional(),
        days: z.number().int().min(7).max(365).optional(),
        sources: z.array(z.string()).optional(),
        targets: z
          .array(z.object({ company: z.string(), domain: z.string(), country: z.string().optional() }))
          .optional(),
      },
    },
    async (args) =>
      json(await findMoreLeads(ACCOUNT_ID, { limit: args.count, roles: args.roles, days: args.days, sources: args.sources, targets: args.targets }))
  );

  server.registerTool(
    "update_lead",
    {
      title: "Update a lead",
      description: "Mark a lead as fit / not a fit, or change its status. Hiding a not-fit lead uses the reason to improve future scans.",
      inputSchema: {
        id: z.number().int(),
        status: z.enum(["new", "contacted", "replied", "meeting", "hidden"]).optional(),
        fit: z.enum(["fit", "not_fit", "unknown"]).optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        linkedin: z.string().optional(),
      },
    },
    async (args) => {
      const { id, ...patch } = args;
      return json({ lead: updateLead(id, patch) ?? null });
    }
  );

  server.registerTool(
    "list_requests",
    {
      title: "List requests",
      description: "Legacy lead requests left as notes.",
      inputSchema: {},
    },
    async () => json({ requests: listRequests(ACCOUNT_ID) })
  );

  server.registerTool(
    "request_leads",
    {
      title: "Request leads (legacy)",
      description: "Only leaves a note. It does not start a search; use find_more_leads for that.",
      inputSchema: { note: z.string() },
    },
    async (args) => json({ request: addRequest(ACCOUNT_ID, args.note), hint: "Use find_more_leads to actually run a scan." })
  );

  server.registerTool(
    "list_linkedin_accounts",
    {
      title: "List LinkedIn accounts",
      description: "LinkedIn accounts connected to this workspace.",
      inputSchema: {},
    },
    async () => json({ accounts: listLinkedinAccounts(ACCOUNT_ID) })
  );

  server.registerTool(
    "list_campaigns",
    {
      title: "List campaigns",
      description: "All LinkedIn campaigns and their status.",
      inputSchema: {},
    },
    async () => json({ campaigns: listCampaigns(ACCOUNT_ID) })
  );

  server.registerTool(
    "create_campaign",
    {
      title: "Create campaign",
      description: "Create a draft LinkedIn campaign. Nothing is sent until it is set active after the user approves.",
      inputSchema: { name: z.string(), sender: z.enum(["manual", "webhook", "linkedin"]).optional() },
    },
    async (args) => json({ campaign: createCampaign(ACCOUNT_ID, args.name, args.sender || "manual") })
  );

  server.registerTool(
    "write_sequence",
    {
      title: "Write sequence",
      description: "Set the message steps for a campaign. Show the full sequence to the user before anything is sent.",
      inputSchema: { campaign_id: z.number().int(), steps: z.array(z.string()).min(1) },
    },
    async (args) => {
      if (!getCampaign(args.campaign_id)) return json({ error: "Campaign not found" });
      setSequence(args.campaign_id, args.steps);
      return json({ campaign_id: args.campaign_id, sequence: getSequences(args.campaign_id) });
    }
  );

  server.registerTool(
    "update_sequence",
    {
      title: "Update sequence",
      description: "Replace the message steps for a campaign.",
      inputSchema: { campaign_id: z.number().int(), steps: z.array(z.string()).min(1) },
    },
    async (args) => {
      if (!getCampaign(args.campaign_id)) return json({ error: "Campaign not found" });
      setSequence(args.campaign_id, args.steps);
      return json({ campaign_id: args.campaign_id, sequence: getSequences(args.campaign_id) });
    }
  );

  server.registerTool(
    "add_leads_to_campaign",
    {
      title: "Add leads to campaign",
      description: "Queue leads into a campaign. Adding to a running campaign sends real requests, so confirm first.",
      inputSchema: { campaign_id: z.number().int(), lead_ids: z.array(z.number().int()).min(1) },
    },
    async (args) => {
      if (!getCampaign(args.campaign_id)) return json({ error: "Campaign not found" });
      const added = addLeadsToCampaign(args.campaign_id, args.lead_ids);
      return json({ campaign_id: args.campaign_id, added });
    }
  );

  server.registerTool(
    "set_campaign_status",
    {
      title: "Set campaign status",
      description: "draft | active | paused. Activating sends from the user's own account; get a clear yes first.",
      inputSchema: { campaign_id: z.number().int(), status: z.enum(["draft", "active", "paused"]) },
    },
    async (args) => json({ campaign: setCampaignStatus(args.campaign_id, args.status) ?? null })
  );

  server.registerTool(
    "set_send_automatically",
    {
      title: "Set send automatically",
      description: "Toggle automatic sending. In this build outreach is queued/manual unless a sender adapter is enabled.",
      inputSchema: { campaign_id: z.number().int(), on: z.boolean() },
    },
    async (args) => json({ campaign: setCampaignFlags(args.campaign_id, { send_automatically: args.on }) ?? null })
  );

  server.registerTool(
    "set_warm_up",
    {
      title: "Set warm up",
      description: "Toggle slow account warm-up (start at low daily limits).",
      inputSchema: { campaign_id: z.number().int(), on: z.boolean() },
    },
    async (args) => json({ campaign: setCampaignFlags(args.campaign_id, { warm_up: args.on }) ?? null })
  );

  server.registerTool(
    "campaign_activity",
    {
      title: "Campaign activity",
      description: "Sent, accepted, replied counts and per-state breakdown for a campaign.",
      inputSchema: { campaign_id: z.number().int() },
    },
    async (args) => json({ campaign_id: args.campaign_id, activity: campaignActivity(args.campaign_id) })
  );

  server.registerTool(
    "top_up_link",
    {
      title: "Top up link",
      description: "Agents cannot pay. In this self-hosted personal build there is no billing, so this returns a local note.",
      inputSchema: {},
    },
    async () =>
      json({
        top_up_link: null,
        payment_needed: false,
        message: "This is your personal local build. There is no billing; leads are free to generate. Add ledger credits from the dashboard only if you want usage accounting.",
      })
  );

  server.registerTool(
    "get_targets",
    {
      title: "Get targets",
      description: "Show the target companies the scan will use (from target_list or data/targets.csv).",
      inputSchema: {},
    },
    async () => {
      const targets = loadTargets(getSettings(ACCOUNT_ID));
      return json({ count: targets.length, targets });
    }
  );

  server.registerTool(
    "source_status",
    {
      title: "Source status",
      description: "Which signal sources exist, whether they are selected, and whether they are configured.",
      inputSchema: {},
    },
    async () => json({ sources: sourceStatus(getSettings(ACCOUNT_ID)) })
  );

  server.registerTool(
    "explain_lead",
    {
      title: "Explain a lead",
      description: "Full breakdown for one lead: every signal with its source, date, points, plus the fit reason and confidence.",
      inputSchema: { id: z.number().int() },
    },
    async (args) => {
      const lead = getLead(args.id);
      if (!lead) return json({ error: "Lead not found" });
      return json({ lead, signals: listSignalsForLead(args.id) });
    }
  );

  server.registerTool(
    "enrich_lead",
    {
      title: "Enrich a lead",
      description: "Resolve a LinkedIn search link and, if a provider is configured, email/phone. Updates the lead.",
      inputSchema: { id: z.number().int() },
    },
    async (args) => {
      const lead = getLead(args.id);
      if (!lead) return json({ error: "Lead not found" });
      const settings = getSettings(ACCOUNT_ID);
      const e = await enrichLead(settings, lead.company || lead.domain || "", lead.domain || "", lead.signal_label || "");
      const updated = updateLead(args.id, { linkedin: e.linkedin || undefined, email: e.email || undefined, phone: e.phone || undefined });
      return json({ lead: updated ?? null, note: e.note });
    }
  );

  server.registerTool(
    "compose_sequence",
    {
      title: "Compose sequence",
      description: "Draft a short LinkedIn sequence for one lead from its signal. Show it to the user before sending.",
      inputSchema: { lead_id: z.number().int() },
    },
    async (args) => {
      const lead = getLead(args.lead_id);
      if (!lead) return json({ error: "Lead not found" });
      return json({ lead_id: args.lead_id, steps: await composeSequence(getSettings(ACCOUNT_ID), lead) });
    }
  );

  server.registerTool(
    "run_outreach",
    {
      title: "Run outreach",
      description: "Process the campaign's queued leads with its sender. manual prepares messages for copy/paste; webhook posts to OUTREACH_WEBHOOK_URL; linkedin is gated. Confirm before running.",
      inputSchema: { campaign_id: z.number().int() },
    },
    async (args) => json(await runOutreach(args.campaign_id))
  );

  server.registerTool(
    "set_campaign_sender",
    {
      title: "Set campaign sender",
      description: "manual | webhook | linkedin. LinkedIn automation is gated and off by default due to platform terms and ban risk.",
      inputSchema: { campaign_id: z.number().int(), sender: z.enum(["manual", "webhook", "linkedin"]) },
    },
    async (args) => json({ campaign: setCampaignSender(args.campaign_id, args.sender) ?? null })
  );

  return server;
}
