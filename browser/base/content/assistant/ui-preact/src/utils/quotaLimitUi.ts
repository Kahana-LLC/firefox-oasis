export const OASIS_PRICING_URL = "https://kahana.io/oasis-pricing";
export const OASIS_BILLING_URL =
  "https://billing.stripe.com/p/login/bIYg16d6l3FqelieUU";

export type QuotaLimitVariant = "daily" | "monthly" | "generic";

export function detectQuotaLimitMessage(
  content: string
): QuotaLimitVariant | null {
  const trimmed = String(content || "").trim();
  if (!trimmed) {
    return null;
  }
  const low = trimmed.toLowerCase();

  if (
    low.includes("daily_limit_exceeded") ||
    low.includes("daily_limit") ||
    low.includes("you have reached your daily ai usage") ||
    low.includes("you've reached your daily ai usage")
  ) {
    return "daily";
  }

  if (
    low.includes("monthly_limit_exceeded") ||
    low.includes("monthly_limit") ||
    low.includes("you have reached your monthly ai usage") ||
    low.includes("you've reached your monthly ai usage")
  ) {
    return "monthly";
  }

  if (
    low.includes("quota_exceeded") ||
    low.includes("you have reached your ai usage limit for this plan") ||
    low.includes("you've reached your ai usage limit for this plan") ||
    low.includes("please upgrade your plan via the menu")
  ) {
    return "generic";
  }

  return null;
}
