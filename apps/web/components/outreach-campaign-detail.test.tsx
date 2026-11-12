import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CampaignDetailPage from "@/app/(app)/campaigns/[id]/page";
import { api, type CampaignDetail, type LeadDetail } from "@/lib/api";
import { leadDraftKey, type LeadDraftReview } from "@/lib/lead-drafts";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "campaign-one" }),
  useSearchParams: () => new URLSearchParams("review=1"),
}));

vi.mock("@/components/shell", () => ({
  PageHeader: ({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) => <header><h1>{title}</h1><p>{description}</p>{actions}</header>,
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    api: {
      ...original.api,
      campaign: vi.fn(), campaignMessages: vi.fn(), leads: vi.fn(), lead: vi.fn(), linkedinLimits: vi.fn(),
      createCampaign: vi.fn(), queueCampaign: vi.fn(), resumeCampaign: vi.fn(), sendCampaign: vi.fn(),
      pauseCampaign: vi.fn(), updateSequence: vi.fn(), preview: vi.fn(),
    },
  };
});

const campaign: CampaignDetail = {
  id: "campaign-one", name: "Reviewed outreach", status: "draft", daily_cap: null, pause_reason: null,
  created_at: "2026-11-11T12:00:00Z", lead_count: 0, messages_sent: 0, pending: 0, replies: 0,
  sequence: { id: "sequence", name: "Evidence-led outreach", steps: [{ step_no: 1, kind: "connect", body_template: "Hi {company}, I noticed {signal}. Would love to connect.", delay_days: 0 }] },
};

function lead(id: string, status = "claimed"): LeadDetail {
  return {
    id, company: id, domain: `${id}.example`, reason: "A relevant hiring signal", signal_at: null,
    signal_age_days: null, score: 70, fit: "fit", fit_confidence: 0.8, fit_reason: null,
    verification_status: "verified", status, linkedin_url: null, email: null, claimed_at: "2026-11-11T11:00:00Z",
    created_at: "2026-11-11T10:00:00Z", contact: null, evidence: [], contacts: [], fit_evidence: {},
  };
}

const review: LeadDraftReview = {
  version: 1, campaignId: campaign.id, createdAt: campaign.created_at, excludedCount: 1,
  recipients: [
    { leadId: "reviewed-one", company: "Acme", contactName: "Alex", body: "Original Acme preview", kind: "connect", stepNo: 1, error: null },
    { leadId: "outside-first-page", company: "Northstar", contactName: null, body: null, kind: null, stepNo: null, error: "Preview could not be generated." },
  ],
};

function renderCampaign(storedReview: LeadDraftReview | null) {
  if (storedReview) window.sessionStorage.setItem(leadDraftKey(campaign.id), JSON.stringify(storedReview));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><CampaignDetailPage /></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(api.campaign).mockResolvedValue(campaign);
  vi.mocked(api.campaignMessages).mockResolvedValue([]);
  // The reviewed recipients are deliberately outside the globally loaded claimed-lead page.
  vi.mocked(api.leads).mockResolvedValue({ items: [lead("unreviewed")], next_cursor: "more-claimed-leads" });
  vi.mocked(api.lead).mockImplementation(async (id) => lead(id));
  vi.mocked(api.linkedinLimits).mockResolvedValue({ connected: true, current_daily_cap: 10, dry_run: true, outreach_enabled: true });
  vi.mocked(api.queueCampaign).mockResolvedValue({ queued: 2 });
});

describe("campaign recipient review handoff", () => {
  it("loads the tab-local review without attaching, activating, queueing, previewing, or sending", async () => {
    renderCampaign(review);
    await screen.findByRole("heading", { name: "Reviewed recipients" });
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Northstar" })).toBeTruthy();
    expect(screen.getByText("Not attached")).toBeTruthy();
    expect(screen.getByText(/Creating the draft did not attach these recipients/)).toBeTruthy();
    expect(api.createCampaign).not.toHaveBeenCalled();
    expect(api.queueCampaign).not.toHaveBeenCalled();
    expect(api.resumeCampaign).not.toHaveBeenCalled();
    expect(api.sendCampaign).not.toHaveBeenCalled();
    expect(api.preview).not.toHaveBeenCalled();
  });

  it("does not substitute other claimed leads when this tab has no review", async () => {
    renderCampaign(null);
    await screen.findByText(/The recipient review is unavailable in this tab/);
    expect((screen.getByRole("button", { name: "Queue reviewed" }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.queueCampaign).not.toHaveBeenCalled();
  });

  it("queues only the selected reviewed IDs, and only after separate confirmation", async () => {
    renderCampaign(review);
    const queueButton = await screen.findByRole("button", { name: "Queue reviewed recipients" });
    fireEvent.click(queueButton);
    const dialog = within(screen.getByRole("dialog"));
    const confirm = dialog.getByRole("button", { name: "Confirm & queue" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(api.queueCampaign).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("checkbox"));
    fireEvent.click(confirm);
    await waitFor(() => expect(api.queueCampaign).toHaveBeenCalledWith(campaign.id, ["reviewed-one", "outside-first-page"]));
    expect(api.lead).toHaveBeenCalledWith("reviewed-one");
    expect(api.lead).toHaveBeenCalledWith("outside-first-page");
    expect(api.resumeCampaign).not.toHaveBeenCalled();
    expect(api.sendCampaign).not.toHaveBeenCalled();
  });

  it("aborts before queueing if a reviewed recipient is no longer claimed", async () => {
    vi.mocked(api.lead).mockImplementation(async (id) => lead(id, id === "reviewed-one" ? "replied" : "claimed"));
    renderCampaign(review);
    fireEvent.click(await screen.findByRole("button", { name: "Queue reviewed recipients" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("checkbox"));
    fireEvent.click(dialog.getByRole("button", { name: "Confirm & queue" }));
    await screen.findByText(/One or more recipients are no longer eligible claimed leads/);
    expect(api.queueCampaign).not.toHaveBeenCalled();
    expect(api.resumeCampaign).not.toHaveBeenCalled();
    expect(api.sendCampaign).not.toHaveBeenCalled();
  });
});
