import type { JdContent } from "../../src/lib/db/schema";

export const EMAIL_TEMPLATES: { key: string; name: string; subject: string; body: string }[] = [
  {
    key: "verify_email",
    name: "Account verification",
    subject: "Verify your DU careers account",
    body: "Dear {{name}},\n\nThank you for registering with Daanish University careers. Open this link to verify your email and activate your account:\n\n{{link}}\n\nIf you didn't create this account, you can ignore this email.\n\nDU Human Resources",
  },
  {
    key: "password_reset",
    name: "Password reset",
    subject: "Reset your DU careers password",
    body: "Dear {{name}},\n\nUse this link to choose a new password. It works for one hour:\n\n{{link}}\n\nIf you didn't ask for this, your password stays the same.\n\nDU Human Resources",
  },
  {
    key: "two_factor_code",
    name: "Sign-in code",
    subject: "Your DU portal sign-in code: {{code}}",
    body: "Dear {{name}},\n\nYour sign-in code is {{code}}. It works for this sign-in only.\n\nIf you didn't try to sign in, tell IT at once.\n\nDU IT",
  },
  {
    key: "application_received",
    name: "Application received",
    subject: "Application received: {{position}} ({{app_no}})",
    body: "Dear {{name}},\n\nWe have received your application for {{position}}.\n\nApplication number: {{app_no}}\nSubmitted: {{submitted_at}}\n\nYou can follow its status from your dashboard: {{portal_url}}/me\n\nDU Human Resources",
  },
  {
    key: "status_changed",
    name: "Application status changed",
    subject: "Update on your application for {{position}}",
    body: "Dear {{name}},\n\nThe status of your application {{app_no}} for {{position}} is now: {{status}}.\n\n{{message}}\n\nSee the details on your dashboard: {{portal_url}}/me\n\nDU Human Resources",
  },
  {
    key: "interview_invite",
    name: "Interview invitation",
    subject: "Interview invitation: {{position}}",
    body: "Dear {{name}},\n\nYou are invited to an interview for {{position}}.\n\nDate and time: {{when}}\nMode: {{mode}}\n{{venue_or_link}}\n\nPlease prepare: {{prep}}\n\nConfirm, decline or ask for another time from your dashboard: {{portal_url}}/me\n\nDU Human Resources",
  },
  {
    key: "talk_invite",
    name: "Faculty talk invitation",
    subject: "Faculty talk invitation: {{position}}",
    body: "Dear {{name}},\n\nYou are invited to give a faculty talk for {{position}}.\n\nTopic: {{topic}}\nAudience: {{audience}}\nDate and time: {{when}}\nDuration: {{duration}} minutes\nMode: {{mode}}\n{{venue_or_link}}\n\nConfirm, decline or ask for another time from your dashboard: {{portal_url}}/me\n\nDU Human Resources",
  },
  {
    key: "second_round_invite",
    name: "Second round invitation",
    subject: "Second round invitation: {{position}}",
    body: "Dear {{name}},\n\nYou are invited to a second round for {{position}}.\n\nBrief: {{brief}}\nDate and time: {{when}}\nMode: {{mode}}\n{{venue_or_link}}\n\nConfirm, decline or ask for another time from your dashboard: {{portal_url}}/me\n\nDU Human Resources",
  },
  {
    key: "event_rescheduled",
    name: "Session rescheduled",
    subject: "New time for your {{session}}: {{position}}",
    body: "Dear {{name}},\n\nYour {{session}} for {{position}} has moved.\n\nNew date and time: {{when}}\nMode: {{mode}}\n{{venue_or_link}}\n\nDU Human Resources",
  },
  {
    key: "event_reminder",
    name: "Session reminder",
    subject: "Reminder: {{session}} {{when_relative}}",
    body: "Dear {{name}},\n\nThis is a reminder of your {{session}} for {{position}}.\n\nDate and time: {{when}}\n{{venue_or_link}}\n\nDU Human Resources",
  },
  {
    key: "panel_invite",
    name: "Panel invitation",
    subject: "Invitation to serve on the {{round}} panel: {{position}}",
    body: "Dear {{name}},\n\nDaanish University invites you to serve on the {{round}} panel for {{position}}.\n\nThe terms of reference, rubric and candidate files are in the portal. Please accept or decline and mark the slots you can attend:\n\n{{link}}\n\nDU Human Resources",
  },
  {
    key: "reviewer_invite",
    name: "Shortlisting review request",
    subject: "Applications to review: {{position}}",
    body: "Dear {{name}},\n\nYou have {{count}} applications to score for {{position}}. Open them here:\n\n{{link}}\n\nPlease score against the rubric and add your remarks.\n\nDU Human Resources",
  },
  {
    key: "evaluation_reminder",
    name: "Evaluation reminder",
    subject: "Evaluation pending: {{position}}",
    body: "Dear {{name}},\n\nYour evaluation of {{candidate}} ({{round}}) for {{position}} is still open. Please submit it here:\n\n{{link}}\n\nDU Human Resources",
  },
  {
    key: "document_request",
    name: "Document request",
    subject: "Document needed for your application {{app_no}}",
    body: "Dear {{name}},\n\nTo continue with your application for {{position}}, please upload: {{document}}.\n\nUpload it from your dashboard: {{portal_url}}/me\n\nDU Human Resources",
  },
  {
    key: "regret",
    name: "Regret",
    subject: "Your application for {{position}}",
    body: "Dear {{name}},\n\nThank you for your interest in {{position}} at Daanish University. After careful review, we will not take your application further on this occasion.\n\n{{reason}}\n\nWe encourage you to apply for future positions.\n\nDU Human Resources",
  },
  {
    key: "offer",
    name: "Offer",
    subject: "Offer of appointment: {{position}}",
    body: "Dear {{name}},\n\nWe are pleased to offer you the position of {{position}} at Daanish University.\n\n{{offer_body}}\n\nPlease accept or decline from your dashboard: {{portal_url}}/me\n\nDU Human Resources",
  },
  {
    key: "closing_reminder",
    name: "Closing date reminder",
    subject: "{{position}} closes {{closing}}",
    body: "Dear {{name}},\n\nYou started an application for {{position}} but haven't submitted it. Applications close on {{closing}}.\n\nFinish it here: {{link}}\n\nDU Human Resources",
  },
];

export const JD_TEMPLATES: { name: string; type: "faculty" | "administrative"; content: JdContent }[] = [
  {
    name: "Faculty (teaching and research)",
    type: "faculty",
    content: {
      summary: "Daanish University seeks faculty who will teach, build research programmes and help shape a new university from its first intake.",
      duties: [
        "Teach undergraduate and graduate courses in the discipline",
        "Design new courses and curriculum with the department",
        "Lead a research programme and seek external funding",
        "Supervise student projects and theses",
        "Take part in university service and outreach",
      ],
      requiredQualifications: ["PhD in the relevant discipline from an HEC-recognised university"],
      preferredQualifications: ["Postdoctoral or international teaching experience", "Publications in recognised journals"],
      experience: "Teaching or research experience after the PhD, as set by the rank.",
      skills: ["Teaching", "Research", "Communication", "Mentoring"],
      requiredDocuments: ["cv", "degree", "cnic", "photo"],
    },
  },
  {
    name: "Administrative (manager or director)",
    type: "administrative",
    content: {
      summary: "Daanish University seeks an experienced professional to lead a core administrative function as the university grows.",
      duties: [
        "Lead the function and its team",
        "Set policies and procedures in line with university and government rules",
        "Prepare budgets, plans and reports for senior management",
        "Work with academic departments and external partners",
      ],
      requiredQualifications: ["Master's degree (16 years of education) in a relevant field"],
      preferredQualifications: ["Professional certification in the field"],
      experience: "Relevant experience in a university, public sector or large organisation.",
      skills: ["Leadership", "Planning", "Communication", "Reporting"],
      requiredDocuments: ["cv", "degree", "experience_letter", "cnic"],
    },
  },
];
