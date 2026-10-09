// Agam MCP server (stdio): lets any MCP client (Claude Desktop, Claude Code, ...) ask for flood risk
// in Bangladesh and get a verified Bangla alert draft. Run: npx tsx mcp/server.mts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildFacts, templateAlert, validateAlert } from "../src/lib/alerts";
import { areaById, areas, rainThresholds, replayInputs, replaySteps, riverThresholds, stations, tideThresholds, type Replay } from "../src/lib/data";
import { fetchLiveInputs } from "../src/lib/live-fetch";
import { assessArea } from "../src/lib/risk";
import { LEVELS, type Inputs } from "../src/lib/types";

const REPLAY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/data/replays");
const loadReplay = (id: string) => JSON.parse(fs.readFileSync(path.join(REPLAY_DIR, `${id}.json`), "utf8")) as Replay;
const REPLAYS = fs.readdirSync(REPLAY_DIR).map((f) => f.replace(/\.json$/, ""));

async function inputsFor(replay?: string, date?: string): Promise<Inputs> {
  if (!replay) return fetchLiveInputs();
  const r = loadReplay(replay);
  const steps = replaySteps(r);
  const step = date && (steps.includes(date) ? date : steps.includes(`${date}T24`) ? `${date}T24` : null);
  return replayInputs(r, step ?? steps[0]);
}

const server = new McpServer({ name: "agam-flood-warning", version: "0.1.0" });

const scenario = {
  replay: z.enum(REPLAYS as [string, ...string[]]).optional().describe("Replay a past flood instead of using live data"),
  date: z.string().optional().describe("Replay time: YYYY-MM-DD (end of day) or YYYY-MM-DDTHH (HH = 06, 12, 18 or 24)"),
};

server.registerTool(
  "list_areas",
  { title: "List monitored areas", description: "Flood-prone upazilas in Bangladesh that Agam monitors, with their rivers and upstream rain stations (many in India)." },
  async () => ({
    content: [{ type: "text", text: JSON.stringify(areas.map((a) => ({ id: a.id, name: a.name, nameBn: a.nameBn, district: a.district, river: a.river, hazard: a.hazard, upstream: a.upstream.map((u) => ({ station: stations[u.station].name, travelHours: u.hours })) })), null, 2) }],
  }),
);

server.registerTool(
  "get_flood_risk",
  {
    title: "Get flood risk",
    description: "Current flood alert level (Normal/Watch/Warning/Danger) for monitored areas, with the evidence (upstream rain, local rain, forecast, river flow vs. local historical thresholds) and expected arrival time. Omit area_id for all areas.",
    inputSchema: { area_id: z.string().optional().describe("Area id from list_areas"), ...scenario },
  },
  async ({ area_id, replay, date }) => {
    const inputs = await inputsFor(replay, date);
    const list = (area_id ? [areaById[area_id]].filter(Boolean) : areas).map((a) => {
      const r = assessArea(a, inputs, stations, rainThresholds, riverThresholds, tideThresholds);
      return { area: a.name, id: a.id, level: LEVELS[r.level].en, etaHours: r.etaHours, heldFromDaysAgo: r.heldFromDaysAgo, evidence: r.signals };
    });
    if (!list.length) return { isError: true, content: [{ type: "text", text: `Unknown area_id ${area_id}` }] };
    return { content: [{ type: "text", text: JSON.stringify({ asOf: inputs.asOf, areas: list }, null, 2) }] };
  },
);

server.registerTool(
  "draft_alert",
  {
    title: "Draft verified Bangla alert",
    description: "Verified template alert (SMS, voice script, checklist) in Bangla for an area at its current level, plus the safety checks it passed. A human officer must approve before sending.",
    inputSchema: { area_id: z.string().describe("Area id from list_areas"), ...scenario },
  },
  async ({ area_id, replay, date }) => {
    const area = areaById[area_id];
    if (!area) return { isError: true, content: [{ type: "text", text: `Unknown area_id ${area_id}` }] };
    const a = assessArea(area, await inputsFor(replay, date), stations, rainThresholds, riverThresholds, tideThresholds);
    if (a.level === 0) return { content: [{ type: "text", text: `${area.name}: level Normal — no alert needed.` }] };
    const facts = buildFacts(area, a);
    const alert = templateAlert(facts);
    return { content: [{ type: "text", text: JSON.stringify({ level: facts.levelEn, alert, checks: validateAlert(alert, facts) }, null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
