"""Small MCP client used by tests, the smoke check and humans.

    LETMELEAD_API_KEY=... python -m letmelead_mcp.client --url http://localhost:8765/mcp tools
    LETMELEAD_API_KEY=... python -m letmelead_mcp.client --url ... call get_credits
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from contextlib import asynccontextmanager
from typing import Any

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client


@asynccontextmanager
async def _session(url: str, key: str):
    client = httpx.AsyncClient(headers={"X-API-Key": key}, timeout=60)
    try:
        async with streamable_http_client(url, http_client=client) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session
    finally:
        await client.aclose()


async def call_tool(url: str, key: str, name: str, args: dict[str, Any]) -> dict[str, Any]:
    async with _session(url, key) as session:
        result = await session.call_tool(name, args)
        payloads = []
        for block in result.content:
            text = getattr(block, "text", None)
            if text is not None:
                try:
                    payloads.append(json.loads(text))
                except json.JSONDecodeError:
                    payloads.append(text)
        return {"isError": bool(getattr(result, "is_error", False)), "content": payloads}


async def list_tools(url: str, key: str) -> list[dict[str, Any]]:
    async with _session(url, key) as session:
        tools = await session.list_tools()
        return [
            {"name": t.name, "description": t.description, "input_schema": t.input_schema}
            for t in tools.tools
        ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="LetMeLead MCP client")
    parser.add_argument("--url", default=os.getenv("LETMELEAD_MCP_URL", "http://localhost:8765/mcp"))
    parser.add_argument("--key", default=os.getenv("LETMELEAD_API_KEY", ""))
    parser.add_argument("command", choices=["tools", "call"])
    parser.add_argument("tool", nargs="?")
    parser.add_argument("--args", default="{}", help="JSON object for call")
    opts = parser.parse_args(argv)

    if not opts.key:
        print("Set LETMELEAD_API_KEY (Settings → API keys).", file=sys.stderr)
        return 2

    if opts.command == "tools":
        print(json.dumps(asyncio.run(list_tools(opts.url, opts.key)), indent=2))
        return 0
    if not opts.tool:
        print("Pass a tool name to call.", file=sys.stderr)
        return 2
    try:
        args = json.loads(opts.args)
    except json.JSONDecodeError as exc:
        print(f"--args is not valid JSON: {exc}", file=sys.stderr)
        return 2
    result = asyncio.run(call_tool(opts.url, opts.key, opts.tool, args))
    print(json.dumps(result, indent=2))
    return 1 if result["isError"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
