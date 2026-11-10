import { createApp } from "./web.js";
import { config } from "./config.js";
import { getDb } from "./db.js";

getDb();
const app = createApp();
app.listen(config.port, () => {
  const base = `http://127.0.0.1:${config.port}`;
  console.log("");
  console.log("  Epimetheus Leads - personal lead engine");
  console.log("  ---------------------------------------");
  console.log(`  Dashboard : ${base}/`);
  console.log(`  MCP (HTTP): ${base}/mcp`);
  console.log(`  Health    : ${base}/health`);
  console.log(`  LLM       : ${config.llm.enabled ? `on (${config.llm.model})` : "off (heuristic mode)"}`);
  console.log(`  DB        : ${config.dbPath}`);
  console.log("");
});
