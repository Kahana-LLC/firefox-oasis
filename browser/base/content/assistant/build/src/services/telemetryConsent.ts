/**
 * Oasis assistant telemetry consent — mirrors Privacy settings
 * "Send technical and interaction data to Oasis" (Firefox health report pref).
 */
import { getChromeContext } from "./firefoxFacade.js";

export const OASIS_DATA_COLLECTION_PREF = "datareporting.healthreport.uploadEnabled";

/** True when the user opted in to identifiable Oasis data collection (pref ON). */
export function isOasisDataCollectionIdentified(): boolean {
  const { Services } = getChromeContext();
  if (!Services?.prefs?.getBoolPref) {
    return false;
  }
  try {
    return Services.prefs.getBoolPref(OASIS_DATA_COLLECTION_PREF, false);
  } catch {
    return false;
  }
}
