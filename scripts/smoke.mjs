import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.MCP_URL || "http://127.0.0.1:8787/mcp");
const transport = new StreamableHTTPClientTransport(url);
const client = new Client({ name: "smoke", version: "0.0.1" });

await client.connect(transport);
console.log("connected");

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const status = await client.callTool({ name: "get_setup_status", arguments: {} });
console.log("get_setup_status:", status.content?.[0]?.text);

const found = await client.callTool({ name: "get_targets", arguments: {} });
console.log("get_targets:", found.content?.[0]?.text);

await client.close();
console.log("ok");
