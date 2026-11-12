"use client";

import { AccountAgents } from "@/components/account-agents";
import { AccountSettingsNav, useSettingsSection } from "@/components/account-ui";
import { AccountWebhooks } from "@/components/account-webhooks";
import { AccountTeam, AccountWorkspace } from "@/components/account-workspace";
import { PageHeader } from "@/components/shell";

export default function SettingsPage() {
  const { section, setSection } = useSettingsSection();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your workspace, your team, and the tools connected to both." />
      <AccountSettingsNav section={section} onChange={setSection} />
      <div className="max-w-4xl">
        {/* Keep panels mounted so a one-time API key survives section changes. */}
        <section id="workspace" aria-label="Workspace settings" hidden={section !== "workspace"} className="scroll-mt-6">
          <AccountWorkspace />
        </section>
        <section id="team" aria-label="Team settings" hidden={section !== "team"} className="scroll-mt-6">
          <AccountTeam />
        </section>
        <section id="agents" aria-label="Agent and API settings" hidden={section !== "agents"} className="scroll-mt-6">
          <AccountAgents />
        </section>
        <section id="webhooks" aria-label="Webhook settings" hidden={section !== "webhooks"} className="scroll-mt-6">
          <AccountWebhooks />
        </section>
      </div>
    </div>
  );
}
