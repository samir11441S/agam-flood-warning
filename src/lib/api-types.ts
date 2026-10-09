import type { AlertFacts, AlertContent, Check } from "./alerts";
import type { DispatchPlan } from "./households";
import type { Reply } from "./store";
export type { Reply };

export type OutboxEntry = { channel: string; mode: "live" | "test" | "simulated"; recipients: number; sent: number; failed: number; sample: string; note?: string };
export type AlertStatus = {
  status: "pending" | "sent" | "rejected" | "superseded";
  code: string;
  approvals: { officer: string; at: string; via: string }[];
  approvalsNeeded: number;
  escalations: { at: string; to: string }[];
  outbox: OutboxEntry[] | null;
  calls: { total: number; answered: number; inProgress: number; toVolunteer: { headBn: string; village: string }[] };
  replies: Reply[];
};
import type { Assessment } from "./types";

export type RiskResponse = {
  scenario: { mode: "live" } | { mode: "replay"; replayId: string; date: string };
  asOf: string;
  replay: { id: string; title: string; titleBn: string; focus: string[]; dates: string[] } | null;
  assessments: Assessment[];
};

export type AlertResponse = {
  alertId: string;
  code: string;
  approvalsNeeded: number;
  facts: AlertFacts;
  result: { content: AlertContent; source: "claude" | "template"; checks: Check[]; note?: string };
  announcement: string;
  plan: DispatchPlan;
};
