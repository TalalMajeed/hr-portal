import type {
  ApplicationStatus,
  ApprovalStatus,
  AdvertStatus,
  EventStatus,
  ListStatus,
  PanelRound,
  Recommendation,
  Role,
  RoundKind,
} from "@/lib/db/schema";

export const ORG_NAME = "Daanish University";
export const ORG_SHORT = "DU";
export const PKT = "Asia/Karachi";

export type Tone = "teal" | "success" | "warning" | "danger" | "neutral" | "sand";

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super admin",
  ed: "Executive Director",
  hr: "HR officer",
  hiring_lead: "Hiring lead",
  reviewer: "Shortlisting reviewer",
  panel: "Panel member",
  board: "Selection Board member",
  agency: "Agency",
  candidate: "Candidate",
};

export const STAFF_ROLES: Role[] = ["super_admin", "ed", "hr", "hiring_lead"];

/** Where each role lands after signing in. */
export const ROLE_HOME: Record<Role, string> = {
  super_admin: "/admin",
  ed: "/admin",
  hr: "/admin",
  hiring_lead: "/admin",
  reviewer: "/review",
  panel: "/panel",
  board: "/board",
  agency: "/agency",
  candidate: "/me",
};

export const STAGES = [
  { n: 1, name: "Position and ToRs", short: "Position" },
  { n: 2, name: "Job description", short: "JD" },
  { n: 3, name: "Advertisement", short: "Advert" },
  { n: 4, name: "Applications", short: "Applications" },
  { n: 5, name: "Shortlisting", short: "Shortlisting" },
  { n: 6, name: "Interview panel", short: "Panel" },
  { n: 7, name: "Interview", short: "Interview" },
  { n: 8, name: "Talk or second round", short: "Talk" },
  { n: 9, name: "Evaluation", short: "Evaluation" },
  { n: 10, name: "Selection Board", short: "Board" },
] as const;

export function stageName(n: number) {
  return STAGES.find((s) => s.n === n)?.name ?? "Unknown";
}

export const APPROVAL_LABELS: Record<ApprovalStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  hr_review: { label: "With HR", tone: "warning" },
  ed_review: { label: "With ED", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  returned: { label: "Returned", tone: "danger" },
};

export const ADVERT_LABELS: Record<AdvertStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Awaiting ED", tone: "warning" },
  published: { label: "Published", tone: "success" },
  unpublished: { label: "Unpublished", tone: "neutral" },
  closed: { label: "Closed", tone: "sand" },
  archived: { label: "Archived", tone: "neutral" },
};

/** C10: the statuses the candidate sees. */
export const APPLICATION_STATUS: Record<ApplicationStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  applied: { label: "Applied", tone: "teal" },
  under_review: { label: "Under review", tone: "teal" },
  shortlisted: { label: "Shortlisted", tone: "success" },
  interview_scheduled: { label: "Interview scheduled", tone: "success" },
  talk_scheduled: { label: "Talk / second round scheduled", tone: "success" },
  selected: { label: "Selected", tone: "success" },
  not_selected: { label: "Not selected", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export const LIST_STATUS: Record<ListStatus, { label: string; tone: Tone }> = {
  pending: { label: "Not screened", tone: "neutral" },
  long: { label: "Long list", tone: "teal" },
  short: { label: "Shortlist", tone: "success" },
  reserve: { label: "Reserve list", tone: "sand" },
  not_shortlisted: { label: "Not shortlisted", tone: "danger" },
};

export const ROUND_LABELS: Record<RoundKind, string> = {
  shortlisting: "Shortlisting",
  interview: "Interview",
  talk: "Faculty talk",
  second_round: "Second round",
};

export const PANEL_ROUNDS: PanelRound[] = ["interview", "talk", "second_round"];

export const EVENT_STATUS: Record<EventStatus, { label: string; tone: Tone }> = {
  invited: { label: "Pending", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  reschedule_requested: { label: "Reschedule requested", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  completed: { label: "Completed", tone: "teal" },
};

export const RECOMMENDATION_LABELS: Record<Recommendation, { label: string; tone: Tone }> = {
  recommend: { label: "Recommend", tone: "success" },
  recommend_with_reservation: { label: "Recommend with reservation", tone: "warning" },
  not_recommend: { label: "Not recommend", tone: "danger" },
};

export const DEPARTMENTS = [
  { name: "Mathematics", kind: "faculty" },
  { name: "Physics", kind: "faculty" },
  { name: "Computer Science", kind: "faculty" },
  { name: "Economics", kind: "faculty" },
  { name: "Biology", kind: "faculty" },
  { name: "Arts and Design", kind: "faculty" },
  { name: "Finance", kind: "administrative" },
  { name: "Human Resources", kind: "administrative" },
  { name: "Procurement", kind: "administrative" },
  { name: "Information Technology", kind: "administrative" },
  { name: "Registrar Office", kind: "administrative" },
] as const;

export const FACULTY_RANKS = ["Lecturer", "Assistant Professor", "Associate Professor", "Professor", "Founding Faculty"];

export const CATEGORIES = ["Faculty", "Director", "Manager", "Staff"];

export const GRADES = ["BPS-17", "BPS-18", "BPS-19", "BPS-20", "BPS-21", "TTS Assistant Professor", "TTS Associate Professor", "TTS Professor", "Market based"];

/** Degree levels used by the eligibility check. Higher number means a higher degree. */
export const DEGREE_LEVELS = [
  { value: "1", label: "Matriculation / O level" },
  { value: "2", label: "Intermediate / A level" },
  { value: "3", label: "Bachelor (14 years)" },
  { value: "4", label: "Bachelor (16 years)" },
  { value: "5", label: "Master / MS / MPhil (18 years)" },
  { value: "6", label: "PhD" },
];

export function degreeLabel(level: string) {
  return DEGREE_LEVELS.find((d) => d.value === level)?.label ?? level;
}

export const PROVINCES = ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan", "Azad Jammu and Kashmir", "Outside Pakistan"];

export const GENDERS = ["Female", "Male", "Prefer not to say"];

export const TIMEZONES = [
  { value: "Asia/Karachi", label: "Pakistan (PKT)" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Riyadh", label: "Riyadh" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Chicago", label: "Chicago" },
  { value: "America/Los_Angeles", label: "Seattle / Los Angeles" },
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
];

export const DOCUMENT_KINDS: { value: string; label: string }[] = [
  { value: "cv", label: "CV" },
  { value: "degree", label: "Degree or transcript" },
  { value: "experience_letter", label: "Experience letter" },
  { value: "cnic", label: "CNIC copy" },
  { value: "photo", label: "Photograph" },
  { value: "other", label: "Other" },
];

export function documentKindLabel(kind: string) {
  return DOCUMENT_KINDS.find((d) => d.value === kind)?.label ?? kind.replace(/_/g, " ");
}

export const AD_CHANNELS = ["DU careers page", "Dawn", "The News", "Jang", "LinkedIn", "Facebook", "X (Twitter)", "Rozee.pk", "Other"];
