import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";
import { getDb } from "../db.js";

getDb();
const server = createMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("epimetheus-leads MCP server running on stdio");
