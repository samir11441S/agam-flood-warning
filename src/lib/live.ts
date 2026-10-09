import "server-only";
import { cacheLife } from "next/cache";
import { fetchLiveInputs } from "./live-fetch";
import type { Inputs } from "./types";

export async function liveInputs(): Promise<Inputs> {
  "use cache";
  cacheLife("hours");
  return fetchLiveInputs();
}
