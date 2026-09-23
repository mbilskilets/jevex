export const kinds = {
  bug: "something is broken or behaves wrong",
  feature: "a request for something new",
  billing: "pricing, invoices, refunds",
  question: "the user asks how something works",
  praise: "the user is happy",
} as const;

export type Kind = keyof typeof kinds;

export const urgencies = ["low", "medium", "high", "critical"] as const;

export type Urgency = (typeof urgencies)[number];

export const MAX_FEEDBACK_LENGTH = 600;

export const CHURN_ALERT = 0.85;
