export function formatQuotaExceededMessage(raw: string): string {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s) {
    return "You have reached your AI usage limit for this plan.";
  }
  if (s.includes("daily_limit") || s === "daily_limit_exceeded") {
    return "You have reached your daily AI usage limit. Your allocation resets every day.";
  }
  if (s.includes("monthly_limit") || s === "monthly_limit_exceeded") {
    return "You have reached your monthly AI usage limit. Your allocation resets at the start of your next billing cycle.";
  }
  if (s.includes("quota_exceeded") || s.includes("quota exceeded")) {
    return "You have reached your AI usage limit for this plan.";
  }
  if (/^[a-z0-9_]+$/.test(String(raw || "").trim())) {
    return "You have reached your AI usage limit for this plan.";
  }
  return String(raw || "").trim();
}
