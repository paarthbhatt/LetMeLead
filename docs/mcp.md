# MCP

The MCP server exposes the same tool set as the REST API, authenticated with a tenant API key. It is a separate process (`packages/mcp`) that calls the REST API with the caller's key, so permissions, credits and audit are identical no matter who drives it.

* Endpoint: `POST /mcp` (Streamable HTTP, stateless) on port 8765, `/health` unauthenticated.
* Auth: `X-API-Key: lml_...` or `Authorization: Bearer lml_...`. The key selects the tenant.
* `GET /v1/tenant` is what the server uses to validate a key; the result is cached for 60 seconds.
* Responses are `{"ok": true, "data": ...}` or `{"ok": false, "error": {"code", "message", "details"}}`.

## Tools

| Tool | What it does | Key inputs |
| --- | --- | --- |
| `find_leads` | Runs the engine now and returns new leads | `sources`, `limit_targets` |
| `list_leads` | Ranked leads with reason, age, fit | `limit`, `status`, `fit`, `min_score`, `query` |
| `get_lead` | One lead with every signal, URL and age | `lead_id` |
| `claim_lead` | Claims with credits (first 10 free) | `lead_id`, `idempotency_key` |
| `mark_not_fit` | Rejects with a reason that trains qualification | `lead_id`, `reason` |
| `create_campaign` | New campaign with the default sequence | `name`, `lead_ids` |
| `pause_campaign` | Immediate stop of all pending sends | `campaign_id`, `reason` |
| `send_outreach` | Queues next steps and sends what is due | `campaign_id`, `lead_ids` |
| `list_replies` | Reply inbox, newest first | `limit`, `unread_only` |
| `get_credits` | Balance, free allowance, spend report | — |
| `top_up` | Stripe checkout for credit packs | `pack` (100 credits each) |
| `list_campaigns` | Campaigns with sent/pending/reply counts | — |
| `preview_message` | Render the next message, without sending | `campaign_id`, `lead_id` |

The manifest in `packages/mcp/letmelead_mcp/manifest.py` is contract-tested against the server's registered tools (`apps/../packages/mcp/tests/test_mcp_contract.py`), so docs cannot drift from behaviour.

## Client setup

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "letmelead": {
      "type": "http",
      "url": "https://your-host/mcp",
      "headers": { "Authorization": "Bearer lml_YOUR_KEY" }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json`, same block.

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.letmelead]
url = "https://your-host/mcp"
http_headers = { Authorization = "Bearer lml_YOUR_KEY" }
```

### Stdio (desktop-only, local machine)

```bash
LETMELEAD_API_URL=http://localhost:8000 \
LETMELEAD_API_KEY=lml_... \
MCP_TRANSPORT=stdio \
python -m letmelead_mcp.server
```

## Suggested agent loop

1. `get_credits` — know the budget before spending it.
2. `find_leads` or `list_leads` — show each lead's reason and signal age.
3. `get_lead` for anything the user wants to inspect; quote the source URLs.
4. `claim_lead` **only after the user agrees** — it costs credits.
5. `create_campaign`, `preview_message`, then `send_outreach`.
6. `list_replies` regularly; a reply already stops the sequence, so no extra call is needed.

The server's instructions tell the model the same thing, including never claiming or sending without explicit approval.

## CLI client

```bash
LETMELEAD_API_KEY=lml_... python -m letmelead_mcp.client --url http://localhost:8765/mcp tools
LETMELEAD_API_KEY=lml_... python -m letmelead_mcp.client --url ... call get_credits
LETMELEAD_API_KEY=lml_... python -m letmelead_mcp.client --url ... call list_leads --args '{"limit":5}'
```

## Rate limits and quotas

The MCP endpoint inherits the API's rate limits and credit rules. API keys are member-level: they cannot create other keys, invite members or change billing — those stay owner-only in the dashboard.
