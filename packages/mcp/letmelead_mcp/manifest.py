"""Static tool manifest: names, descriptions and input schemas.

`tests/test_mcp_contract.py` asserts this matches the tools the server actually
registers, so documentation cannot drift from behaviour.
"""

from __future__ import annotations

from typing import Any

TOOLS: list[dict[str, Any]] = [
    {
        "name": "find_leads",
        "description": "Run the signal engine now and return the fresh, qualified leads it produced.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sources": {"type": "array", "items": {"type": "string"}},
                "limit_targets": {"type": "integer", "minimum": 1, "maximum": 200, "default": 50},
            },
        },
    },
    {
        "name": "list_leads",
        "description": "List ranked leads with the plain-text reason, signal age, fit and contact state.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25},
                "status": {"type": "string", "enum": ["new", "claimed", "contacted", "replied", "meeting", "archived"]},
                "fit": {"type": "string", "enum": ["fit", "not_fit", "unknown"]},
                "min_score": {"type": "number"},
                "query": {"type": "string"},
            },
        },
    },
    {
        "name": "get_lead",
        "description": "Full lead detail: every signal with source URL and age, contacts, and the qualification evidence.",
        "input_schema": {
            "type": "object",
            "properties": {"lead_id": {"type": "string"}},
            "required": ["lead_id"],
        },
    },
    {
        "name": "claim_lead",
        "description": "Claim a lead with credits (the first 10 per workspace are free). Returns the charge and balance.",
        "input_schema": {
            "type": "object",
            "properties": {"lead_id": {"type": "string"}, "idempotency_key": {"type": "string"}},
            "required": ["lead_id"],
        },
    },
    {
        "name": "mark_not_fit",
        "description": "Reject a lead with a reason. The reason is fed back into future qualification.",
        "input_schema": {
            "type": "object",
            "properties": {"lead_id": {"type": "string"}, "reason": {"type": "string", "minLength": 3}},
            "required": ["lead_id", "reason"],
        },
    },
    {
        "name": "create_campaign",
        "description": "Create a campaign with the default signal-led sequence.",
        "input_schema": {
            "type": "object",
            "properties": {"name": {"type": "string"}, "lead_ids": {"type": "array", "items": {"type": "string"}}},
            "required": ["name"],
        },
    },
    {
        "name": "pause_campaign",
        "description": "Pause a campaign immediately (one-click stop for all pending sends).",
        "input_schema": {
            "type": "object",
            "properties": {"campaign_id": {"type": "string"}, "reason": {"type": "string"}},
            "required": ["campaign_id"],
        },
    },
    {
        "name": "send_outreach",
        "description": "Queue the next step for the campaign's leads and send what is due, respecting the daily cap.",
        "input_schema": {
            "type": "object",
            "properties": {"campaign_id": {"type": "string"}, "lead_ids": {"type": "array", "items": {"type": "string"}}},
            "required": ["campaign_id"],
        },
    },
    {
        "name": "list_replies",
        "description": "Replies from leads, newest first. A reply stops that lead's sequence automatically.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25},
                "unread_only": {"type": "boolean", "default": False},
            },
        },
    },
    {
        "name": "get_credits",
        "description": "Credit balance, free-lead allowance and spend report.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "top_up",
        "description": "Create a Stripe checkout for a credit pack (100 credits per pack).",
        "input_schema": {
            "type": "object",
            "properties": {"pack": {"type": "integer", "minimum": 1, "maximum": 20, "default": 1},
                           "idempotency_key": {"type": "string"}},
        },
    },
    {
        "name": "list_campaigns",
        "description": "Campaigns with status, sent/pending counts and replies.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "preview_message",
        "description": "Render the next personalized message for one lead without queueing it.",
        "input_schema": {
            "type": "object",
            "properties": {"campaign_id": {"type": "string"}, "lead_id": {"type": "string"}},
            "required": ["campaign_id", "lead_id"],
        },
    },
]

TOOL_NAMES = [tool["name"] for tool in TOOLS]
