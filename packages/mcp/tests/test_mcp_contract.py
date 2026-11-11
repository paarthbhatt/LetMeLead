"""MCP contract: the documented manifest must equal what the server registers."""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

MCP_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MCP_DIR))

os.environ.setdefault("LETMELEAD_API_URL", "http://localhost:8000")

from letmelead_mcp import server as mcp_server  # noqa: E402
from letmelead_mcp.manifest import TOOLS  # noqa: E402


def _registered() -> dict[str, object]:
    tools = asyncio.run(mcp_server.server.list_tools())
    return {tool.name: tool for tool in tools}


def test_manifest_names_match_registered_tools():
    registered = _registered()
    assert set(registered) == {tool["name"] for tool in TOOLS}


def test_every_tool_has_a_description_and_schema():
    for tool in TOOLS:
        schema = tool["input_schema"]
        assert tool["description"], tool["name"]
        assert schema["type"] == "object"
        assert "properties" in schema


def test_required_fields_exist_in_properties():
    for tool in TOOLS:
        schema = tool["input_schema"]
        for required in schema.get("required", []):
            assert required in schema["properties"], f"{tool['name']}: {required}"


def test_registered_schemas_are_objects():
    for name, tool in _registered().items():
        schema = tool.input_schema  # type: ignore[attr-defined]
        assert schema.get("type") == "object", name
        assert "properties" in schema, name
