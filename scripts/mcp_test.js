// Spin up the server over stdio via the MCP SDK client and list tools.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: [new URL("../src/index.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")],
  env: { ...process.env },
});
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
console.log(`tools registered: ${tools.length}`);
for (const t of tools) console.log(" -", t.name);
await client.close();
process.exit(0);
