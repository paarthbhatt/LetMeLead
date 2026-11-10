import express from "express";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, setupStatus } from "./mcp/server.js";
import { config } from "./config.js";
import {
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
  listRequests,
  listSignalsForLead,
} from "./store.js";
import { generateBrief } from "./engine/brief.js";
import { findMoreLeads, loadTargets } from "./engine/signals.js";
import { enrichLead } from "./engine/enrich.js";
import { runOutreach } from "./engine/outreach.js";
import { sourceStatus } from "./sources/index.js";

const ACCOUNT_ID = 1;

function authOk(req: express.Request): boolean {
  if (!config.localMcpKey) return true;
  return req.headers.authorization === `Bearer ${config.localMcpKey}`;
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const here = dirname(fileURLToPath(import.meta.url));
  app.use(express.static(join(here, "..", "public")));

  app.get("/health", (_req, res) => res.json({ ok: true, name: "epimetheus-leads", version: "0.1.0" }));

  // ---- MCP (Streamable HTTP, session-based) ----
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", async (req, res) => {
    if (!authOk(req)) return res.status(401).json({ error: "Unauthorized" });
    const sessionId = req.headers["mcp-session-id"];
    const existing = typeof sessionId === "string" ? transports.get(sessionId) : undefined;
    if (existing) {
      try {
        await existing.handleRequest(req, res, req.body);
      } catch (err) {
        if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
      }
      return;
    }
    const server = createMcpServer();
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id: string) => {
        transports.set(id, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
      server.close();
    };
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
    }
  });

  const bySession = (req: express.Request, res: express.Response) => {
    const sessionId = req.headers["mcp-session-id"];
    const transport = typeof sessionId === "string" ? transports.get(sessionId) : undefined;
    if (!transport) return res.status(404).json({ error: "Unknown or missing MCP session." });
    return transport.handleRequest(req, res);
  };
  app.get("/mcp", bySession);
  app.delete("/mcp", bySession);

  // ---- REST for the dashboard ----
  app.get("/api/status", (_req, res) => res.json(setupStatus()));

  app.get("/api/settings", (_req, res) => res.json({ settings: getSettings(ACCOUNT_ID), credits: getBalance(ACCOUNT_ID) }));

  app.put("/api/settings", (req, res) => {
    const b = req.body ?? {};
    const patch: Record<string, unknown> = {};
    for (const k of ["website", "offer", "buyers", "roles", "region", "exclusions", "target_list", "sources"] as const) {
      if (b[k] !== undefined) patch[k] = b[k];
    }
    const cur = getSettings(ACCOUNT_ID);
    patch.brief_complete = Boolean((patch.offer as string) ?? cur.offer) && ((patch.buyers as string[]) ?? cur.buyers).length > 0;
    res.json({ settings: updateSettings(ACCOUNT_ID, patch as never) });
  });

  app.post("/api/brief", async (req, res) => {
    const website = (req.body?.website as string) || getSettings(ACCOUNT_ID).website;
    if (!website) return res.status(400).json({ error: "No website provided" });
    try {
      res.json(await generateBrief(ACCOUNT_ID, website));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/leads", (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ leads: listLeads(ACCOUNT_ID, { limit, status }) });
  });

  app.patch("/api/leads/:id", (req, res) => {
    const id = Number(req.params.id);
    const b = req.body ?? {};
    res.json({ lead: updateLead(id, { status: b.status, fit: b.fit, email: b.email, phone: b.phone, linkedin: b.linkedin }) ?? null });
  });

  app.get("/api/leads/:id/explain", (req, res) => {
    const id = Number(req.params.id);
    const lead = getLead(id);
    if (!lead) return res.status(404).json({ error: "Not found" });
    res.json({ lead, signals: listSignalsForLead(id) });
  });

  app.post("/api/leads/:id/enrich", async (req, res) => {
    const id = Number(req.params.id);
    const lead = getLead(id);
    if (!lead) return res.status(404).json({ error: "Not found" });
    const settings = getSettings(ACCOUNT_ID);
    const e = await enrichLead(settings, lead.company || lead.domain || "", lead.domain || "", lead.signal_label || "");
    const updated = updateLead(id, { linkedin: e.linkedin || undefined, email: e.email || undefined, phone: e.phone || undefined });
    res.json({ lead: updated ?? null, note: e.note });
  });

  app.get("/api/sources", (_req, res) => res.json({ sources: sourceStatus(getSettings(ACCOUNT_ID)) }));

  app.get("/api/targets", (_req, res) => {
    const targets = loadTargets(getSettings(ACCOUNT_ID));
    res.json({ count: targets.length, targets });
  });

  app.post("/api/find", async (req, res) => {
    try {
      const b = req.body ?? {};
      const result = await findMoreLeads(ACCOUNT_ID, { limit: b.count, targets: b.targets, roles: b.roles, days: b.days, sources: b.sources });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/balance", (_req, res) => res.json({ credits: getBalance(ACCOUNT_ID), payment_needed: false }));

  app.get("/api/linkedin", (_req, res) => res.json({ accounts: listLinkedinAccounts(ACCOUNT_ID) }));

  app.get("/api/requests", (_req, res) => res.json({ requests: listRequests(ACCOUNT_ID) }));

  app.get("/api/campaigns", (_req, res) => res.json({ campaigns: listCampaigns(ACCOUNT_ID) }));

  app.post("/api/campaigns", (req, res) => {
    const name = (req.body?.name as string) || "Untitled campaign";
    res.json({ campaign: createCampaign(ACCOUNT_ID, name) });
  });

  app.get("/api/campaigns/:id", (req, res) => {
    const id = Number(req.params.id);
    const c = getCampaign(id);
    if (!c) return res.status(404).json({ error: "Not found" });
    res.json({ campaign: c, sequence: getSequences(id), activity: campaignActivity(id) });
  });

  app.post("/api/campaigns/:id/sequence", (req, res) => {
    const id = Number(req.params.id);
    if (!getCampaign(id)) return res.status(404).json({ error: "Not found" });
    const steps = Array.isArray(req.body?.steps) ? (req.body.steps as string[]) : [];
    setSequence(id, steps);
    res.json({ sequence: getSequences(id) });
  });

  app.post("/api/campaigns/:id/leads", (req, res) => {
    const id = Number(req.params.id);
    if (!getCampaign(id)) return res.status(404).json({ error: "Not found" });
    const leadIds = Array.isArray(req.body?.lead_ids) ? (req.body.lead_ids as number[]) : [];
    res.json({ added: addLeadsToCampaign(id, leadIds) });
  });

  app.post("/api/campaigns/:id/status", (req, res) => {
    const id = Number(req.params.id);
    const status = String(req.body?.status || "draft");
    res.json({ campaign: setCampaignStatus(id, status) ?? null });
  });

  app.post("/api/campaigns/:id/flags", (req, res) => {
    const id = Number(req.params.id);
    res.json({ campaign: setCampaignFlags(id, { send_automatically: req.body?.send_automatically, warm_up: req.body?.warm_up }) ?? null });
  });

  app.post("/api/campaigns/:id/sender", (req, res) => {
    const id = Number(req.params.id);
    res.json({ campaign: setCampaignSender(id, String(req.body?.sender || "manual")) ?? null });
  });

  app.post("/api/campaigns/:id/outreach", async (req, res) => {
    try {
      res.json(await runOutreach(Number(req.params.id)));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return app;
}
