export const KAHANA_PRODUCTION_ORIGIN = "https://kahana.io";
export const KAHANA_LEGACY_ORIGIN = "https://kahana.co";

export const KAHANA_PRODUCTION_HOSTS = ["kahana.io", "kahana.co"] as const;

export const KAHANA_PRODUCTION_ORIGINS = [
  KAHANA_PRODUCTION_ORIGIN,
  KAHANA_LEGACY_ORIGIN,
] as const;

export function kahanaUrl(path: string): string {
  return `${KAHANA_PRODUCTION_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export function isKahanaProductionHost(hostname: string): boolean {
  return (KAHANA_PRODUCTION_HOSTS as readonly string[]).includes(hostname);
}
