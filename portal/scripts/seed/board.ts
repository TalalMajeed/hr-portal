import { eq } from "drizzle-orm";
import { db, schema, daysAgo } from "./db";
import type { SeedContext } from "./base";

const { boards, boardDecisions, offers, emails, applications, applicationStatusHistory } = schema;

/** Selection Board, decisions and offers (H): the Physics lecturer post is decided and filled. */
export function seedBoard(ctx: SeedContext) {
  const { phys } = ctx.positions;
  const { omar, hina, saad } = ctx.apps.phys;
  const { hr, boardChair } = ctx.users;

  db.insert(boards)
    .values({
      positionId: phys.id,
      meetingDate: daysAgo(31).slice(0, 10),
      proposedSalary: "PKR 285,000 a month",
      terms: "Regular appointment in BPS-18 with one year of probation, university housing allowance and medical cover as per DU rules.",
      minutes:
        "The Board reviewed the pack and the panel's ranked recommendation. It agreed with the panel: Omar Farooq is recommended for appointment, with Hina Malik on the reserve list. Saad Qureshi is not recommended.",
      packGeneratedAt: daysAgo(33),
      edSignedOffAt: daysAgo(30),
      updatedAt: daysAgo(30),
    })
    .run();

  const decide = (applicationId: number, decision: "recommended" | "not_recommended", rank: number | null, notes: string) =>
    db.insert(boardDecisions).values({ positionId: phys.id, applicationId, decision, rank, notes, userId: boardChair.id, createdAt: daysAgo(31) }).run();
  decide(omar.id, "recommended", 1, "Strongest teaching demonstration and lab experience.");
  decide(hina.id, "recommended", 2, "Reserve candidate.");
  decide(saad.id, "not_recommended", null, "");

  db.insert(offers)
    .values({
      applicationId: omar.id,
      positionId: phys.id,
      salary: "PKR 285,000 a month",
      body: "Position: Lecturer, Physics\nGrade: BPS-18\nSalary: PKR 285,000 a month\nReporting to: Dean of Sciences\n\nRegular appointment with one year of probation, university housing allowance and medical cover as per DU rules.\n\nThis offer is valid for 14 days.",
      status: "accepted",
      sentAt: daysAgo(30),
      respondedAt: daysAgo(27),
      joinedAt: daysAgo(6).slice(0, 10),
    })
    .run();
  db.insert(emails)
    .values({
      toEmail: ctx.candidates.omar.email,
      toUserId: ctx.candidates.omar.id,
      subject: "Offer of appointment: Lecturer, Physics",
      body: "Dear Omar Farooq,\n\nWe are pleased to offer you the position of Lecturer, Physics at Daanish University.\n\nPlease accept or decline from your dashboard.\n\nDU Human Resources",
      templateKey: "offer",
      applicationId: omar.id,
      positionId: phys.id,
      createdAt: daysAgo(30),
    })
    .run();
  db.insert(emails)
    .values({
      toEmail: ctx.candidates.saad.email,
      toUserId: ctx.candidates.saad.id,
      subject: "Your application for Lecturer, Physics",
      body: "Dear Saad Qureshi,\n\nThank you for your interest in Lecturer, Physics at Daanish University. After careful review, we will not take your application further on this occasion.\n\nWe encourage you to apply for future positions.\n\nDU Human Resources",
      templateKey: "regret",
      applicationId: saad.id,
      positionId: phys.id,
      createdAt: daysAgo(28),
    })
    .run();

  // Hina stays on the reserve list; record that the Board placed her there.
  db.update(applications).set({ status: "shortlisted" }).where(eq(applications.id, hina.id)).run();
  db.insert(applicationStatusHistory)
    .values({ applicationId: hina.id, fromStatus: "interview_scheduled", toStatus: "shortlisted", note: "Reserve list after the Selection Board", userId: hr.id, createdAt: daysAgo(30) })
    .run();
}
