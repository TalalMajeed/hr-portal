import { APPLICATION_STATUS, APPROVAL_LABELS, ADVERT_LABELS, EVENT_STATUS, LIST_STATUS, RECOMMENDATION_LABELS } from "@/lib/constants";
import type { AdvertStatus, ApplicationStatus, ApprovalStatus, EventStatus, ListStatus, Recommendation } from "@/lib/db/schema";
import { Badge } from "./badge";

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const s = APPLICATION_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const s = APPROVAL_LABELS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function AdvertBadge({ status }: { status: AdvertStatus }) {
  const s = ADVERT_LABELS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ListStatusBadge({ status }: { status: ListStatus }) {
  const s = LIST_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const s = EVENT_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function RecommendationBadge({ value }: { value: Recommendation | "" }) {
  if (!value) return <Badge>Not given</Badge>;
  const s = RECOMMENDATION_LABELS[value];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function EligibilityBadge({ passed, overridden }: { passed: boolean; overridden?: boolean }) {
  return <Badge tone={passed ? "success" : "danger"}>{passed ? "Meets criteria" : "Does not meet criteria"}{overridden ? " (override)" : ""}</Badge>;
}
