# Third-party notices

This project vendors and builds on open-source work by **Ekos Labs**.

## vendor/buying-signal-scan

- Source: https://github.com/Ekos-Labs/skills (folder `skills/buying-signal-scan`)
- License: MIT (see `vendor/buying-signal-scan/LICENSE-ekos-skills`)
- What it does: collects public buying signals (job postings, hiring volume, news,
  website/tech checks) and scores them with time decay.

The signal-detection scripts and the scoring weights are used as-is by the lead
engine. The agent tool contract in `src/mcp/server.ts` and `skill/SKILL.md` is a
from-scratch, functionally-equivalent local implementation inspired by the public
`ekos-leads` skill documentation (also MIT).

## What is NOT included

- No Ekos private backend code, no scraping of app.ekoslabs.com, no use of their
  API keys or MCP server.
- No LinkedIn automation. This build models campaigns and queues outreach; it does
  not send messages.

MIT License text for Ekos Labs' skills is preserved alongside the vendored folder.
