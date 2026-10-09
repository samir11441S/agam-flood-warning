/**
 * Open-Meteo's free API is for non-commercial use. If Agam is run as a paid service, buy an API plan and set
 * OPEN_METEO_API_KEY: requests then go to the "customer-" servers with the key attached.
 */
export function om(url: string): string {
  const key = process.env.OPEN_METEO_API_KEY;
  if (!key) return url;
  const u = new URL(url);
  u.hostname = `customer-${u.hostname}`;
  u.searchParams.set("apikey", key);
  return u.toString();
}
