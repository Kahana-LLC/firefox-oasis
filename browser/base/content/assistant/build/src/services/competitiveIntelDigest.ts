import type { TabDigest } from "./researchBriefTypes.js";

function looksLoginWalled(url: string, content: string): string | null {
  const lowerUrl = url.toLowerCase();
  const lowerContent = content.toLowerCase();
  const combined = `${lowerUrl} ${lowerContent}`;

  if (
    /gartner\.com/.test(lowerUrl) &&
    (/sign in|log in|create an account|join now|authwall|peer insights/i.test(
      lowerContent
    ) ||
      content.trim().length < 200)
  ) {
    return "Login-walled (Gartner)";
  }

  if (
    /cf-challenge|challenge-platform|attention required|verify you are human|checking your browser|cloudflare/i.test(
      combined
    )
  ) {
    return "Blocked by bot check (Cloudflare or similar)";
  }

  if (
    /google\.com\/sorry|duckduckgo\.com/.test(lowerUrl) &&
    (/recaptcha|unusual traffic|not a robot|captcha|bots use duckduckgo|complete the following challenge|select all squares/i.test(
      lowerContent
    ) ||
      /google\.com\/sorry/.test(lowerUrl))
  ) {
    return "Blocked by CAPTCHA or rate limit";
  }

  if (
    /g2\.com/.test(lowerUrl) &&
    (/access denied|rate limit|too many requests|captcha|verify you are human|verification required|automated bot activity|rapid taps|\bretry\b/i.test(
      combined
    ) ||
      content.trim().length < 120)
  ) {
    return "Blocked by rate limit or bot check";
  }

  if (
    /page not found|404|we couldn't find|not found/i.test(lowerContent) &&
    content.trim().length < 400
  ) {
    return "Page not found";
  }

  if (
    /trustradius\.com|capterra\.com/.test(lowerUrl) &&
    (/sign in|log in|create an account|join now|authwall/i.test(lowerContent) ||
      content.trim().length < 200)
  ) {
    return "Login-walled (review site)";
  }

  return null;
}

export function applyEnrichmentDigestHints(digests: TabDigest[]): TabDigest[] {
  return digests.map(digest => {
    if (digest.status !== "ok") {
      return digest;
    }
    const reason = looksLoginWalled(digest.url, digest.content);
    if (!reason) {
      return digest;
    }
    return {
      ...digest,
      content: "",
      status: "skipped",
      failureReason: reason,
    };
  });
}
