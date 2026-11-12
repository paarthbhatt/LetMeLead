import type { Metadata } from "next";
import Link from "next/link";

import { MktFooter, MktHeader } from "@/components/marketing/mkt-chrome";
import styles from "@/components/marketing/sections-styles.module.css";

import "../marketing.css";

export const metadata: Metadata = {
  title: "Integrations — LetMeLead",
  description:
    "The LetMeLead REST API, MCP server, authentication model, rate limits and provider configuration keys.",
};

const API_GROUPS = [
  {
    title: "Authentication and workspace",
    rows: [
      ["POST", "/v1/auth/signup", "Create a user and workspace."],
      ["POST", "/v1/auth/login", "Exchange email and password for a token pair."],
      ["POST", "/v1/auth/refresh", "Rotate an access and refresh token pair."],
      ["POST", "/v1/auth/logout", "Revoke the current refresh token."],
      ["GET", "/v1/auth/me", "Current user, memberships and active tenant."],
      ["POST", "/v1/auth/switch-tenant?tenant_id=", "Issue a token pair for another membership."],
      ["GET", "/v1/auth/google", "Start the optional Google OAuth flow."],
      ["GET / PATCH", "/v1/tenant", "Read or update the workspace and ICP brief."],
      ["POST", "/v1/tenant/onboarding", "Save the website and buyer brief."],
      ["GET / POST", "/v1/tenant/members", "List or invite workspace members."],
      ["PATCH / DELETE", "/v1/tenant/members/{membership_id}", "Change a role or remove a member."],
      ["GET / POST", "/v1/tenant/api-keys", "List keys or create one. Plaintext is shown once."],
      ["DELETE", "/v1/tenant/api-keys/{key_id}", "Revoke an API key."],
    ],
  },
  {
    title: "Sources, signals and targets",
    rows: [
      ["GET", "/v1/sources", "The tenant's adapter rows, quota, last run and last error."],
      ["PATCH", "/v1/sources/{source_id}", "Enable, disable, set a quota or edit adapter config."],
      ["POST", "/v1/sources/scan", "Run a scan now, in the background or with wait=true."],
      ["GET", "/v1/signals/catalog", "All 51 signals in 8 categories, merged with tenant toggles."],
      ["PUT", "/v1/signals/{signal_id}", "Toggle an automatic signal on or off."],
      ["GET / POST", "/v1/targets", "List or add a target company and domain."],
      ["POST", "/v1/targets/import?text=", "Import company,domain CSV rows."],
      ["DELETE", "/v1/targets/{target_id}", "Remove a target from the watchlist."],
    ],
  },
  {
    title: "Leads",
    rows: [
      ["GET", "/v1/leads", "Ranked leads with reason, age, fit, score and contact status."],
      ["GET", "/v1/leads/{lead_id}", "The full dossier: evidence, contacts and fit evidence."],
      ["PATCH", "/v1/leads/{lead_id}", "Update the lead's status."],
      ["POST", "/v1/leads/{lead_id}/claim", "Claim with credits. Send an Idempotency-Key."],
      ["POST", "/v1/leads/{lead_id}/not-fit", "Record a rejection reason for qualification."],
      ["GET", "/v1/leads/{lead_id}/replies", "Replies recorded against one lead."],
    ],
  },
  {
    title: "Campaigns and replies",
    rows: [
      ["GET / POST", "/v1/campaigns", "List campaigns or create one with a lead set."],
      ["GET / PATCH", "/v1/campaigns/{campaign_id}", "Read or update campaign settings."],
      ["POST", "/v1/campaigns/{campaign_id}/pause", "Halt pending sends immediately."],
      ["POST", "/v1/campaigns/{campaign_id}/resume", "Resume a paused campaign."],
      ["PUT", "/v1/campaigns/{campaign_id}/sequence", "Replace the sequence steps."],
      ["POST", "/v1/campaigns/{campaign_id}/queue", "Queue selected leads for the sequence."],
      ["POST", "/v1/campaigns/{campaign_id}/send", "Send what is due under the current caps."],
      ["GET", "/v1/campaigns/{campaign_id}/messages", "Message log with status and errors."],
      ["GET", "/v1/campaigns/{campaign_id}/preview/{lead_id}", "Render the next message without sending."],
      ["GET", "/v1/replies", "Reply inbox, newest first; unread_only is supported."],
      ["POST", "/v1/replies/ingest", "Record an inbound reply and stop the sequence."],
      ["POST", "/v1/replies/{reply_id}/read", "Mark a reply as read."],
      ["GET", "/v1/replies/threads", "Thread summaries for the inbox."],
    ],
  },
  {
    title: "LinkedIn and billing",
    rows: [
      ["GET", "/v1/linkedin", "Connected accounts. The session blob is never returned."],
      ["POST", "/v1/linkedin/connect", "Store an encrypted Playwright storage state."],
      ["POST", "/v1/linkedin/pause", "Pause sending for an account."],
      ["POST", "/v1/linkedin/resume", "Resume an account."],
      ["GET", "/v1/linkedin/limits", "Connection state, daily cap, dry-run and outreach flags."],
      ["DELETE", "/v1/linkedin/{account_id}", "Disconnect and remove a session."],
      ["GET", "/v1/credits", "Balance, free claims used and the spend report."],
      ["GET", "/v1/credits/ledger", "Append-only ledger page."],
      ["POST", "/v1/orders/top-up", "Create a credit order. Send an Idempotency-Key."],
      ["GET", "/v1/orders", "Orders for the tenant."],
      ["GET", "/v1/invoices", "Invoice rows when the billing provider issued one."],
      ["POST", "/v1/webhooks/stripe", "Signed Stripe webhook. Grants credits idempotently."],
    ],
  },
  {
    title: "Operations",
    rows: [
      ["GET", "/v1/health", "Status plus configured provider flags."],
      ["GET", "/v1/stats", "Signals in the last seven days and unread replies."],
      ["GET", "/v1/audit", "Actor, action, target and time for workspace events."],
      ["GET / POST", "/v1/webhooks", "List or create outbound webhooks."],
      ["DELETE", "/v1/webhooks/{webhook_id}", "Remove an outbound webhook."],
    ],
  },
] as const;

const MCP_TOOLS = [
  ["find_leads", "Run the engine now and return new leads."],
  ["list_leads", "Ranked leads with reason, age and fit."],
  ["get_lead", "One lead with every signal, URL and age."],
  ["claim_lead", "Claim with credits. The first 10 are free."],
  ["mark_not_fit", "Reject with a reason that trains qualification."],
  ["create_campaign", "Create a campaign with the default sequence."],
  ["pause_campaign", "Stop all pending sends immediately."],
  ["send_outreach", "Queue the next steps and send what is due."],
  ["list_replies", "Reply inbox, newest first."],
  ["get_credits", "Balance, free allowance and spend report."],
  ["top_up", "Stripe checkout for a credit pack."],
  ["list_campaigns", "Campaigns with sent, pending and reply counts."],
  ["preview_message", "Render the next message without sending."],
] as const;

const CONFIG_KEYS = [
  ["LLM_PROVIDER", "none, openai, anthropic or ollama. Optional."],
  ["LLM_BASE_URL / LLM_API_KEY / LLM_MODEL", "The endpoint, key and model for the chosen provider."],
  ["ENRICHMENT_PROVIDER", "none or pattern. Pattern returns a search link, not an invented email."],
  ["ENRICHMENT_API_KEY", "Your enrichment provider key, if you add one behind the interface."],
  ["X_BEARER_TOKEN", "Enables the X adapter through the official API v2."],
  ["GOOGLE_MAPS_API_KEY / MAPS_QUERY", "Enables the local-business adapter for one mapped query."],
  ["FB_ACCESS_TOKEN / FB_PAGE_IDS", "Enables Facebook page posts for the pages you list."],
  ["REVIEWS_FEED_URL", "A JSON array of review items. Only three stars or less becomes a signal."],
  ["SESSION_ENCRYPTION_KEY", "Encrypts the LinkedIn storage state at rest. No default."],
  ["STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET", "Enables real Checkout and signed credit grants."],
  ["OUTREACH_ENABLED / OUTREACH_DRY_RUN", "Both default to the safe setting: off and dry run."],
] as const;

export default function IntegrationsPage() {
  return (
    <div className={`mkt-root ${styles.root}`}>
      <MktHeader back />

      <main className={styles.page} id="main">
        <header className={styles.pageHead}>
          <p className={styles.eyebrow}>Integrations</p>
          <h1 className={styles.pageTitle}>The dashboard, the API and the agent share one surface.</h1>
          <p className={styles.pageLede}>
            Every dashboard action has a REST route under <code>/v1</code>. The MCP server calls the
            same API with a tenant key, so permissions, credits and audit cannot disagree. Bring your
            own model and enrichment keys, or run with the labelled fallbacks.
          </p>
          <p className={styles.pageMeta}>
            No provider is required to boot except a database and JWT_SECRET. Provider failures
            degrade explicitly rather than silently inventing an answer.
          </p>
          <div className={styles.pageActions}>
            <Link href="/signup" className={`${styles.btn} ${styles.btnSolid} ${styles.btnLarge}`}>
              Create a workspace
            </Link>
            <Link href="/trust" className={`${styles.btn} ${styles.btnLarge}`}>
              Trust and data notes
            </Link>
          </div>
        </header>

        <div className={styles.docBody}>
          <section className={styles.docSection} aria-labelledby="auth-title">
            <h2 id="auth-title">Authentication model.</h2>
            <p className={styles.docLead}>
              A request carries either a JWT access token or a tenant API key. The token selects the
              user and active tenant; an API key selects the tenant directly. Every query is scoped
              to that tenant, and a foreign id returns 404 rather than leaking existence.
            </p>

            <dl className={styles.definitionList}>
              <div className={styles.definitionRow}>
                <dt>JWT</dt>
                <dd>
                  <code>Authorization: Bearer &lt;jwt&gt;</code>. Access tokens last 30 minutes by
                  default; refresh tokens last 30 days and rotate on use.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>API key</dt>
                <dd>
                  <code>X-API-Key: lml_...</code> or a Bearer token with the same prefix. Keys are
                  SHA-256 hashed with an 8-character lookup prefix, shown once, revocable and always
                  member-level.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Tenant</dt>
                <dd>
                  The active tenant comes from the token. A caller can add{" "}
                  <code>X-Tenant-Id</code> for a membership it already holds.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Roles</dt>
                <dd>
                  Owner, member and viewer. Owners manage members, keys and billing. Members write.
                  Viewers read. API keys cannot create other keys or change billing.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Errors</dt>
                <dd>
                  <code>{`{"error": {"code", "message", "details", "request_id"}}`}</code> with a
                  stable HTTP status. Rate limiting returns 429 and a retry_after value.
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.docSection} aria-labelledby="rest-title">
            <h2 id="rest-title">REST endpoints.</h2>
            <p className={styles.docLead}>
              These are the routes the dashboard client calls. Paths use the <code>/v1</code> prefix.
              List endpoints use cursor pagination with <code>?limit=</code> and{" "}
              <code>?cursor=</code>.
            </p>

            {API_GROUPS.map((group) => (
              <div key={group.title}>
                <h3>{group.title}</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th scope="col">Method</th>
                        <th scope="col">Path</th>
                        <th scope="col">What it does</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map(([method, path, note]) => (
                        <tr key={`${method}-${path}`}>
                          <td>{method}</td>
                          <td>
                            <code>{path}</code>
                          </td>
                          <td>{note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>

          <section className={styles.docSection} aria-labelledby="mcp-title">
            <h2 id="mcp-title">MCP server.</h2>
            <p className={styles.docLead}>
              The MCP process is separate from the API and exposes 13 tools over Streamable HTTP. It
              authenticates with a tenant API key and calls the REST API, so the same rate limits,
              credits and audit rows apply.
            </p>

            <div className={styles.example}>
              <strong>Default local endpoint.</strong> <code>http://localhost:8765/mcp</code>, with
              an unauthenticated <code>/health</code>. The server is stateless; every call carries
              its own key.
            </div>

            <p className={styles.codeCaption}>Claude Desktop or Cursor MCP configuration</p>
            <pre className={styles.codeBlock}>
              <code>{`{
  "mcpServers": {
    "letmelead": {
      "type": "http",
      "url": "http://localhost:8765/mcp",
      "headers": {
        "Authorization": "Bearer lml_YOUR_KEY"
      }
    }
  }
}`}</code>
            </pre>

            <p className={styles.codeCaption}>Codex configuration, ~/.codex/config.toml</p>
            <pre className={styles.codeBlock}>
              <code>{`[mcp_servers.letmelead]
url = "http://localhost:8765/mcp"
http_headers = { Authorization = "Bearer lml_YOUR_KEY" }`}</code>
            </pre>

            <p className={styles.codeCaption}>Local stdio fallback</p>
            <pre className={styles.codeBlock}>
              <code>{`LETMELEAD_API_URL=http://localhost:8000 \\
LETMELEAD_API_KEY=lml_... \\
MCP_TRANSPORT=stdio \\
python -m letmelead_mcp.server`}</code>
            </pre>
          </section>

          <section className={styles.docSection} aria-labelledby="tools-title">
            <h2 id="tools-title">MCP tools.</h2>
            <p className={styles.docLead}>
              Tools mirror the REST surface. The server instructions tell a model to check credits
              first and never claim or send without the user&apos;s explicit approval.
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th scope="col">Tool</th>
                    <th scope="col">What it does</th>
                  </tr>
                </thead>
                <tbody>
                  {MCP_TOOLS.map(([tool, note]) => (
                    <tr key={tool}>
                      <td>
                        <code>{tool}</code>
                      </td>
                      <td>{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.docSection} aria-labelledby="limits-title">
            <h2 id="limits-title">Rate limits and idempotency.</h2>
            <p className={styles.docLead}>
              Limits are per identity and per route bucket, so a noisy agent cannot exhaust a
              browser session&apos;s quota. A request that would exceed a limit receives 429 with a
              retry_after value.
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th scope="col">Limit</th>
                    <th scope="col">Default</th>
                    <th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Auth routes</td>
                    <td>20 per minute</td>
                    <td>Per identity. Signup, login, refresh and related routes.</td>
                  </tr>
                  <tr>
                    <td>Other API routes</td>
                    <td>600 per minute</td>
                    <td>Per identity, per bucket. MCP inherits this.</td>
                  </tr>
                  <tr>
                    <td>Source quota</td>
                    <td>200 per day</td>
                    <td>Per adapter row. Configurable from 1 to 1000.</td>
                  </tr>
                  <tr>
                    <td>Idempotency</td>
                    <td>Caller supplied</td>
                    <td>
                      <code>Idempotency-Key</code> prevents a retried claim or top-up from charging
                      twice.
                    </td>
                  </tr>
                  <tr>
                    <td>Credit floor</td>
                    <td>0</td>
                    <td>The append-only ledger refuses to record a negative balance.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.docSection} aria-labelledby="keys-title">
            <h2 id="keys-title">Key configuration.</h2>
            <p className={styles.docLead}>
              Everything is environment-driven. A missing provider is reported in the health endpoint
              and the scan report; it is not replaced with fabricated data.
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th scope="col">Key</th>
                    <th scope="col">What it enables</th>
                  </tr>
                </thead>
                <tbody>
                  {CONFIG_KEYS.map(([key, note]) => (
                    <tr key={key}>
                      <td>
                        <code>{key}</code>
                      </td>
                      <td>{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <aside className={styles.callout}>
              <strong>Keep secrets on the server.</strong> Provider and session keys belong in the
              API environment. The MCP client only needs its tenant API key. The dashboard never
              receives a decrypted LinkedIn storage state.
            </aside>

            <div className={styles.pager}>
              <Link href="/how-it-works">The full workflow</Link>
              <Link href="/trust">Trust and data notes</Link>
            </div>
          </section>
        </div>
      </main>

      <MktFooter />
    </div>
  );
}
