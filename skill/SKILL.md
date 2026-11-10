---
name: letmelead
description: Local buying-signal lead engine for any company or client. Find B2B buyers showing a real buying signal right now, review why, enrich contacts, and draft outreach, driven from Claude Code, Codex, Cursor or any MCP client through the local LetMeLead MCP server. Use when the user wants leads, wants to know who is ready to buy, wants to start or check a campaign, or asks how outreach is doing.
metadata:
  author: Parth
  version: "0.1.0"
---

# LetMeLead (local)

Find the people who want to buy, show why (the buying signal, in plain words, with
how old it is), and draft outreach. This is a self-hosted local build that works for
any company or client. It talks to a local MCP server (Streamable HTTP at
`http://127.0.0.1:8787/mcp`, or stdio via `npm run mcp:stdio`). No third-party
account or paid API is required for the default sources.

Execution mode: local. Never ask the user to paste a secret into chat.

Example requests:
- "Find me 20 companies that just posted AI-security or ML roles."
- "Who are my best leads this week, and why?"
- "Draft a LinkedIn campaign for the top 10 and show me the messages first."

## Every conversation

1. **Call `get_setup_status` first.** It returns the brief, free-sample status, LinkedIn,
   credits, campaigns and `recommended_next_action`.
2. **Act on `recommended_next_action`:**

| action | what to do |
| --- | --- |
| `complete_brief` | Ask the user to set website/offer/buyers, or call `generate_brief` from their website. |
| `start_free_leads` | Offer to run `find_more_leads`. On a clear yes, run it. |
| `connect_linkedin` | Show `list_leads`, then note that sending stays manual/approved in this build. |
| `start_campaign` | Offer to `create_campaign` and `write_sequence`, showing the full draft first. |
| `review_leads` | Call `list_leads`, show the freshest signals, ask for fit feedback via `update_lead`. |
| `top_up` | Not applicable: this build has no billing. Say so. |

## Tools

| Job | Tools |
| --- | --- |
| Understand the offer/account | `get_setup_status` (first), `get_offer`, `get_settings`, `list_plays`, `get_balance` |
| Sources | `source_status` |
| See leads | `list_leads`, `get_leads`, `explain_lead` |
| Get more leads | `find_more_leads` (pass `sources` to pick), `get_targets`, `list_requests`, `request_leads` (legacy note) |
| Review / contact | `update_lead` (fit / not_fit / status), `enrich_lead` |
| Campaigns | `list_linkedin_accounts`, `list_campaigns`, `create_campaign`, `write_sequence`, `update_sequence`, `add_leads_to_campaign`, `set_campaign_status`, `set_send_automatically`, `set_warm_up`, `set_campaign_sender`, `campaign_activity` |
| Outreach | `compose_sequence`, `run_outreach` |
| Brief | `generate_brief`, `update_settings` |
| Credits | `get_balance`, `top_up_link` (no billing here) |

## Method

1. Start from the account, not guesses. After `get_setup_status`, use `get_settings`.
2. Show leads with the reason: name/company, the buying signal in one line, how old it
   is, its source, fit and confidence, and contact found. Lead with the freshest,
   strongest signals. Use `explain_lead` when the user asks "why this lead?".
   Never invent a signal, contact, or company detail the tool did not return.
3. `find_more_leads` is free here, but still confirm before a long scan. It reads
   `data/targets.csv` unless targets are passed. Check `source_status` first and pass
   `sources` only for those the user wants.
4. Enrich only on request: `enrich_lead` resolves a LinkedIn search link and, if a
   provider is configured, email/phone.
5. Campaigns: create, draft with `compose_sequence`, show the full sequence. Set a
   campaign active only after a clear yes.
6. Outreach: `run_outreach` with sender `manual` returns messages for the user to
   copy/paste. `webhook` posts to a configured URL. Never use the `linkedin` sender.
7. Report in plain words. Use `campaign_activity` for sent/accepted/replied.

## Rules

- Ask before anything that would send on LinkedIn. This build never auto-sends.
- Never use the `linkedin` sender or set `ENABLE_LINKEDIN_AUTOMATION=true`; LinkedIn's
  terms prohibit automated messaging and it risks account bans. Use `manual` or `webhook`.
- Messages go out under the user's name. Keep them short, signal-specific, honest.
- Respect exclusions and anyone who asked not to be contacted.
- Signals show timing, not intent to buy. Never claim a company "is in market."
- Company-level public data only. No LinkedIn scraping, no logged-in pages, no bypassing
  bot protection.
