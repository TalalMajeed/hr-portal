import { db, schema, daysAgo, daysAhead } from "./db";
import type { SeedContext } from "./base";
import type { Recommendation, Scores } from "../../src/lib/db/schema";

const { reviewAssignments, approvals, panels, panelMembers, panelSlots, panelAvailability, conflicts, events, evaluations, consensus, emails } = schema;

function zoom(seed: number) {
  const id = String(80000000000 + seed * 7919);
  const passcode = String(100000 + ((seed * 4271) % 900000));
  return { meetingProvider: "zoom" as const, meetingUrl: `https://zoom.us/j/${id}?pwd=simulated${passcode}`, meetingId: id, passcode, waitingRoom: true };
}

function panel(positionId: number, round: "interview" | "talk" | "second_round", name: string, createdDaysAgo: number, actors: { hr: number; ed: number }) {
  const p = db.insert(panels).values({ positionId, round, name, status: "approved", createdAt: daysAgo(createdDaysAgo) }).returning().get();
  db.insert(approvals).values({ positionId, subject: "panel", action: "submitted", comment: name, userId: actors.hr, createdAt: daysAgo(createdDaysAgo - 1) }).run();
  db.insert(approvals).values({ positionId, subject: "panel", action: "ed_approved", comment: `${name} approved.`, userId: actors.ed, createdAt: daysAgo(createdDaysAgo - 2) }).run();
  return p;
}

function member(panelId: number, userId: number, isChair: boolean, invitedDaysAgo: number) {
  db.insert(panelMembers)
    .values({ panelId, userId, isChair, inviteStatus: "accepted", invitedAt: daysAgo(invitedDaysAgo), respondedAt: daysAgo(invitedDaysAgo - 1), createdAt: daysAgo(invitedDaysAgo + 1) })
    .run();
}

function evaluation(eventId: number, applicationId: number, panelistId: number, round: "interview" | "talk" | "second_round", scores: Scores, rec: Recommendation, strengths: string, concerns: string, submittedDaysAgo: number) {
  db.insert(evaluations)
    .values({ eventId, applicationId, panelistId, round, scores, strengths, concerns, recommendation: rec, status: "submitted", submittedAt: daysAgo(submittedDaysAgo, 16), updatedAt: daysAgo(submittedDaysAgo, 16) })
    .run();
}

/** Shortlisting reviews, panels, schedules and evaluations (D, E, F, G). */
export function seedProcess(ctx: SeedContext) {
  const { users: u, positions: p, apps } = ctx;
  const actors = { hr: u.hr.id, ed: u.ed.id };

  /* Computer Science: stage 9 ------------------------------------------ */
  const cs = p.cs;
  const csReviews: [number, Scores, Scores, string][] = [
    [apps.cs.ayesha.id, { qualifications: 9, experience: 8, research: 9, fit: 9 }, { qualifications: 9, experience: 7, research: 9, fit: 8 }, "Strong publication record in Q1 journals; clear fit with the ML group."],
    [apps.cs.bilal.id, { qualifications: 9, experience: 9, research: 8, fit: 7 }, { qualifications: 9, experience: 9, research: 7, fit: 8 }, "Industry research leader; teaching experience is limited."],
    [apps.cs.sana.id, { qualifications: 8, experience: 8, research: 7, fit: 8 }, { qualifications: 8, experience: 7, research: 6, fit: 8 }, "Good software engineering profile and teaching record."],
    [apps.cs.usman.id, { qualifications: 7, experience: 8, research: 6, fit: 6 }, { qualifications: 7, experience: 7, research: 5, fit: 6 }, "Embedded systems focus is outside the current needs."],
    [apps.cs.hamza.id, { qualifications: 4, experience: 5, research: 2, fit: 5 }, { qualifications: 3, experience: 5, research: 2, fit: 4 }, "No PhD, which the post requires."],
  ];
  for (const [appId, a, b, remarks] of csReviews) {
    db.insert(reviewAssignments).values({ applicationId: appId, reviewerId: u.revInt.id, scores: a, remarks, submittedAt: daysAgo(34, 15), assignedBy: u.hr.id, createdAt: daysAgo(37) }).run();
    db.insert(reviewAssignments).values({ applicationId: appId, reviewerId: u.revExt.id, scores: b, remarks: "", submittedAt: daysAgo(33, 18), assignedBy: u.hr.id, createdAt: daysAgo(37) }).run();
  }
  // Fatima: one review in, the external one still open.
  db.insert(reviewAssignments).values({ applicationId: apps.cs.fatima.id, reviewerId: u.revInt.id, scores: { qualifications: 8, experience: 7, research: 7, fit: 7 }, remarks: "Solid security research.", submittedAt: daysAgo(30, 12), assignedBy: u.hr.id, createdAt: daysAgo(32) }).run();
  db.insert(reviewAssignments).values({ applicationId: apps.cs.fatima.id, reviewerId: u.revExt.id, assignedBy: u.hr.id, createdAt: daysAgo(32) }).run();
  db.insert(emails)
    .values({
      toEmail: u.revExt.email,
      toUserId: u.revExt.id,
      subject: `Applications to review: ${cs.title}`,
      body: `Dear ${u.revExt.name},\n\nYou have 6 applications to score for ${cs.title}. Open them here:\n\nhttp://localhost:3000/x/${u.revExt.accessToken}\n\nDU Human Resources`,
      templateKey: "reviewer_invite",
      positionId: cs.id,
      createdAt: daysAgo(37),
    })
    .run();

  // D7: shortlist approved by the ED
  db.insert(approvals).values({ positionId: cs.id, subject: "shortlist", action: "submitted", comment: "Three on the shortlist, Usman on reserve.", userId: u.hr.id, createdAt: daysAgo(29) }).run();
  db.insert(approvals).values({ positionId: cs.id, subject: "shortlist", action: "ed_approved", comment: "Approved.", userId: u.ed.id, createdAt: daysAgo(27) }).run();

  // E2: interview panel and talk panel
  const csInterview = panel(cs.id, "interview", "Computer Science interview panel", 27, actors);
  member(csInterview.id, u.panelChair.id, true, 26);
  member(csInterview.id, u.panelA.id, false, 26);
  member(csInterview.id, u.panelB.id, false, 26);
  const csTalk = panel(cs.id, "talk", "Computer Science faculty talk panel", 10, actors);
  member(csTalk.id, u.panelChair.id, true, 10);
  member(csTalk.id, u.panelA.id, false, 10);

  // E4: availability poll, past and upcoming slots
  const slotTimes: [number, number][] = [
    [-20, 10],
    [-20, 11],
    [3, 21],
    [4, 21],
    [6, 10],
    [6, 14],
  ];
  for (const [d, h] of slotTimes) {
    const slot = db.insert(panelSlots).values({ panelId: csInterview.id, startsAt: d < 0 ? daysAgo(-d, h) : daysAhead(d, h), durationMin: 45 }).returning().get();
    const yes: Record<number, boolean> = {
      [u.panelChair.id]: !(d === 6 && h === 14),
      [u.panelA.id]: !(d === 3),
      [u.panelB.id]: !(d === 6 && h === 10),
    };
    for (const [uid, available] of Object.entries(yes)) db.insert(panelAvailability).values({ slotId: slot.id, userId: Number(uid), available }).run();
  }
  for (const [d, h] of [
    [5, 11],
    [5, 15],
  ]) {
    const slot = db.insert(panelSlots).values({ panelId: csTalk.id, startsAt: daysAhead(d, h), durationMin: 30 }).returning().get();
    db.insert(panelAvailability).values({ slotId: slot.id, userId: u.panelChair.id, available: true }).run();
    db.insert(panelAvailability).values({ slotId: slot.id, userId: u.panelA.id, available: h === 11 }).run();
  }

  // E5: declarations, including Dr. Kashif Raza's conflict with Usman
  for (const appId of [apps.cs.ayesha.id, apps.cs.bilal.id, apps.cs.sana.id, apps.cs.usman.id]) {
    for (const uid of [u.panelChair.id, u.panelA.id, u.panelB.id]) {
      const conflict = uid === u.panelB.id && appId === apps.cs.usman.id;
      db.insert(conflicts)
        .values({ panelId: csInterview.id, userId: uid, applicationId: appId, hasConflict: conflict, note: conflict ? "Former PhD supervisor of the candidate" : "", createdAt: daysAgo(24) })
        .run();
    }
  }

  // F: sessions
  const ayeshaInterview = db
    .insert(events)
    .values({ positionId: cs.id, panelId: csInterview.id, applicationId: apps.cs.ayesha.id, round: "interview", startsAt: daysAgo(20, 10), durationMin: 45, mode: "online", ...zoom(1), prepNote: "Join five minutes early.", status: "completed", createdAt: daysAgo(22), updatedAt: daysAgo(20, 11), reminders: ["24h", "day", "1h"] })
    .returning()
    .get();
  const sanaInterview = db
    .insert(events)
    .values({ positionId: cs.id, panelId: csInterview.id, applicationId: apps.cs.sana.id, round: "interview", startsAt: daysAgo(20, 11), durationMin: 45, mode: "in_person", venue: "Committee Room 1, Admin Block", prepNote: "Bring your CNIC and original degrees.", status: "completed", createdAt: daysAgo(22), updatedAt: daysAgo(20, 12), reminders: ["24h", "day", "1h"] })
    .returning()
    .get();
  db.insert(events)
    .values({
      positionId: cs.id,
      panelId: csInterview.id,
      applicationId: apps.cs.bilal.id,
      round: "interview",
      startsAt: daysAhead(3, 21),
      durationMin: 45,
      mode: "online",
      ...zoom(2),
      prepNote: "A 5-minute overview of your research, then questions.",
      status: "reschedule_requested",
      candidateNote: "I teach at 8:00 Seattle time that day. Could we move to the next day at the same time?",
      createdAt: daysAgo(6),
      updatedAt: daysAgo(2),
    })
    .run();
  const ayeshaTalk = db
    .insert(events)
    .values({
      positionId: cs.id,
      panelId: csTalk.id,
      applicationId: apps.cs.ayesha.id,
      round: "talk",
      startsAt: daysAhead(5, 11),
      durationMin: 30,
      mode: "in_person",
      venue: "Lecture Theatre 2, Academic Block A",
      topic: "Fairness in ranking systems",
      audience: "Panel and faculty",
      prepNote: "A 20-minute talk followed by 10 minutes of questions. A projector with HDMI is available.",
      status: "invited",
      createdAt: daysAgo(9),
      updatedAt: daysAgo(9),
    })
    .returning()
    .get();
  db.insert(emails)
    .values([
      {
        toEmail: ctx.candidates.bilal.email,
        toUserId: ctx.candidates.bilal.id,
        subject: `Interview invitation: ${cs.title}`,
        body: `Dear Bilal Ahmed,\n\nYou are invited to an interview for ${cs.title}. Confirm, decline or ask for another time from your dashboard.\n\nDU Human Resources`,
        templateKey: "interview_invite",
        applicationId: apps.cs.bilal.id,
        positionId: cs.id,
        createdAt: daysAgo(6),
      },
      {
        toEmail: ctx.candidates.ayesha.email,
        toUserId: ctx.candidates.ayesha.id,
        subject: `Faculty talk invitation: ${cs.title}`,
        body: `Dear Ayesha Khan,\n\nYou are invited to give a faculty talk for ${cs.title}.\n\nTopic: Fairness in ranking systems\nAudience: Panel and faculty\n\nConfirm, decline or ask for another time from your dashboard.\n\nDU Human Resources`,
        templateKey: "talk_invite",
        applicationId: apps.cs.ayesha.id,
        positionId: cs.id,
        createdAt: daysAgo(9),
      },
    ])
    .run();
  void ayeshaTalk;

  // G: evaluations. Dr. Kashif Raza's evaluation of Sana is still missing (G7).
  evaluation(ayeshaInterview.id, apps.cs.ayesha.id, u.panelChair.id, "interview", { knowledge: 9, teaching: 8, research_vision: 9, communication: 8 }, "recommend", "Deep command of ML fairness; clear plan for a research group.", "Limited experience with large classes.", 19);
  evaluation(ayeshaInterview.id, apps.cs.ayesha.id, u.panelA.id, "interview", { knowledge: 9, teaching: 9, research_vision: 8, communication: 9 }, "recommend", "Excellent teaching examples and student mentoring.", "", 19);
  evaluation(ayeshaInterview.id, apps.cs.ayesha.id, u.panelB.id, "interview", { knowledge: 8, teaching: 7, research_vision: 9, communication: 8 }, "recommend", "Strong publication pipeline.", "Should broaden collaboration beyond ML.", 18);
  evaluation(sanaInterview.id, apps.cs.sana.id, u.panelChair.id, "interview", { knowledge: 8, teaching: 8, research_vision: 6, communication: 8 }, "recommend_with_reservation", "Practical software engineering teacher.", "Research agenda needs sharpening.", 19);
  evaluation(sanaInterview.id, apps.cs.sana.id, u.panelA.id, "interview", { knowledge: 7, teaching: 8, research_vision: 6, communication: 7 }, "recommend_with_reservation", "Industry links would help students.", "Few recent first-author papers.", 18);

  /* Physics: stage 10, full round done ------------------------------------ */
  const ph = p.phys;
  for (const [appId, s] of [
    [apps.phys.omar.id, { qualifications: 9, experience: 7, research: 7, fit: 9 }],
    [apps.phys.hina.id, { qualifications: 8, experience: 6, research: 5, fit: 8 }],
    [apps.phys.saad.id, { qualifications: 7, experience: 6, research: 4, fit: 6 }],
  ] as [number, Scores][]) {
    db.insert(reviewAssignments).values({ applicationId: appId, reviewerId: u.revInt.id, scores: s, remarks: "", submittedAt: daysAgo(64), assignedBy: u.hr.id, createdAt: daysAgo(67) }).run();
  }
  db.insert(approvals).values({ positionId: ph.id, subject: "shortlist", action: "submitted", comment: "", userId: u.hr.id, createdAt: daysAgo(62) }).run();
  db.insert(approvals).values({ positionId: ph.id, subject: "shortlist", action: "ed_approved", comment: "Approved.", userId: u.ed.id, createdAt: daysAgo(60) }).run();
  const phPanel = panel(ph.id, "interview", "Physics interview panel", 60, actors);
  member(phPanel.id, u.panelC.id, true, 59);
  member(phPanel.id, u.panelD.id, false, 59);
  member(phPanel.id, u.panelChair.id, false, 59);
  const phScores: [number, number, Scores[], Recommendation[]][] = [
    [apps.phys.omar.id, 10, [
      { knowledge: 9, teaching: 9, research_vision: 8, communication: 9 },
      { knowledge: 9, teaching: 8, research_vision: 7, communication: 9 },
      { knowledge: 8, teaching: 9, research_vision: 8, communication: 8 },
    ], ["recommend", "recommend", "recommend"]],
    [apps.phys.hina.id, 11, [
      { knowledge: 8, teaching: 8, research_vision: 6, communication: 8 },
      { knowledge: 7, teaching: 8, research_vision: 6, communication: 8 },
      { knowledge: 7, teaching: 7, research_vision: 6, communication: 7 },
    ], ["recommend_with_reservation", "recommend", "recommend_with_reservation"]],
    [apps.phys.saad.id, 12, [
      { knowledge: 6, teaching: 6, research_vision: 4, communication: 6 },
      { knowledge: 6, teaching: 5, research_vision: 5, communication: 6 },
      { knowledge: 5, teaching: 6, research_vision: 4, communication: 5 },
    ], ["not_recommend", "recommend_with_reservation", "not_recommend"]],
  ];
  for (const [appId, hour, scores, recs] of phScores) {
    const e = db
      .insert(events)
      .values({ positionId: ph.id, panelId: phPanel.id, applicationId: appId, round: "interview", startsAt: daysAgo(46, hour), durationMin: 40, mode: "in_person", venue: "Committee Room 2, Admin Block", status: "completed", createdAt: daysAgo(52), updatedAt: daysAgo(46, hour + 1), reminders: ["24h", "day", "1h"] })
      .returning()
      .get();
    [u.panelC.id, u.panelD.id, u.panelChair.id].forEach((uid, i) =>
      evaluation(e.id, appId, uid, "interview", scores[i], recs[i], i === 0 ? "Clear explanations and strong lab experience." : "Good grasp of fundamentals.", i === 2 ? "Research output is still early." : "", 45),
    );
  }
  db.insert(consensus)
    .values({
      positionId: ph.id,
      round: "interview",
      note: "The panel agreed Omar Farooq is the strongest teacher with real lab experience. Hina Malik is a sound reserve. Saad Qureshi is not recommended at this stage.",
      ranking: [apps.phys.omar.id, apps.phys.hina.id, apps.phys.saad.id],
      chairId: u.panelC.id,
      signedOffAt: daysAgo(40),
      updatedAt: daysAgo(40),
    })
    .run();
}
