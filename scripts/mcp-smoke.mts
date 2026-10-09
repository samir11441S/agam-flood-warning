// Starts the Agam MCP server and calls each tool once. Run: npx tsx scripts/mcp-smoke.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "agam-smoke", version: "0.0.1" });
await client.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "mcp/server.mts"] }));

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

const text = (r: Awaited<ReturnType<typeof client.callTool>>) => (r.content as { type: string; text: string }[])[0].text;

const risk = await client.callTool({ name: "get_flood_risk", arguments: { area_id: "parshuram", replay: "feni-2024", date: "2024-08-19" } });
console.log("get_flood_risk:", text(risk).slice(0, 400));

const alert = await client.callTool({ name: "draft_alert", arguments: { area_id: "parshuram", replay: "feni-2024", date: "2024-08-19" } });
console.log("draft_alert:", text(alert).slice(0, 400));

await client.close();
