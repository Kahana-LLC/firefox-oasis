import { h } from "preact";
import type { QuotaLimitVariant } from "../utils/quotaLimitUi";
import { OASIS_PRICING_URL } from "../utils/quotaLimitUi";

function bodyForVariant(variant: QuotaLimitVariant): string {
  switch (variant) {
    case "daily":
      return "You have used your included AI commands for today. Your limit resets each day, or you can upgrade for more.";
    case "monthly":
      return "You have used your included AI commands for this billing period. Upgrade anytime for a higher monthly allowance.";
    default:
      return "You have reached the usage cap for your current plan.";
  }
}

function titleForVariant(variant: QuotaLimitVariant): string {
  switch (variant) {
    case "daily":
      return "Daily limit reached";
    case "monthly":
      return "Monthly limit reached";
    default:
      return "Usage limit reached";
  }
}

export function QuotaLimitCallout({ variant }: { variant: QuotaLimitVariant }) {
  return (
    <div className="quota-limit-callout" role="status">
      <div className="quota-limit-callout-main">
        <p className="quota-limit-callout-title">{titleForVariant(variant)}</p>
        <p className="quota-limit-callout-body">{bodyForVariant(variant)}</p>
        <p className="quota-limit-callout-cta">
          <a
            className="quota-limit-callout-link"
            href={OASIS_PRICING_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            View plans and upgrade
          </a>
        </p>
      </div>
    </div>
  );
}
