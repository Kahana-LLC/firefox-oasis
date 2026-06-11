export type OutreachEmailPurpose =
  | "networking"
  | "cold"
  | "follow_up"
  | "thank_you"
  | "custom";

export type OutreachEmailTone =
  | "warm"
  | "professional"
  | "concise"
  | "friendly";

export type OutreachEmailSource = {
  title: string;
  url: string;
  status: "ok" | "skipped" | "failed";
  failureReason?: string;
};

export type OutreachEmailDraft = {
  subject: string;
  body: string;
  personalizationBullets: string[];
  sources: OutreachEmailSource[];
  suggestedEdits?: string[];
  purpose: OutreachEmailPurpose;
  recipientName?: string;
  recipientRole?: string;
  scopeLabel: string;
  generatedAt: string;
};
