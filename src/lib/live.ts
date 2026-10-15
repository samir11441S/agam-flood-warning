import "server-only";
import { cacheLife } from "next/cache";
import { fetchLiveInputs } from "./live-fetch";
import type { Inputs } from "./types";

export async function liveInputs(): Promise<Inputs> {
  "use cache";
  // Flash floods arrive within hours: refresh every 15 minutes (the worker's own detection interval).
  cacheLife({ stale: 300, revalidate: 900, expire: 3600 });
  return fetchLiveInputs();
}
