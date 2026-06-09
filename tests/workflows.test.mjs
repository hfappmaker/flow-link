import assert from "node:assert/strict";
import test from "node:test";
import {
  ApplicationStatus,
  InteractionFeedbackModerationStatus,
  InterviewMessageType,
  JobPostStatus,
  PostInterviewDeclineReason,
  PostInterviewOutcomeStatus,
} from "@prisma/client";

const {
  applyToJobWorkflow,
  recordCompanyPostInterviewOutcomeWorkflow,
  recordFreelancerPostInterviewOutcomeWorkflow,
  screenApplicationWorkflow,
  sendInterviewMessageWorkflow,
  submitInteractionFeedbackWorkflow,
} = await import("../src/lib/workflows.ts");

function readyProfile() {
  return {
    id: "freelancer-profile-1",
    fullName: "山田 太郎",
    desiredOccupation: "PM",
    skills: "Next.js, Prisma",
    careerHistory: { summary: "SaaS projects" },
    documents: [{ documentType: "resume" }, { documentType: "career_history" }],
  };
}

function workflowDb(overrides = {}) {
  const calls = [];
  const tx = {
    jobApplication: {
      update: async (args) => calls.push(["jobApplication.update", args]),
    },
    jobPost: {
      update: async (args) => calls.push(["jobPost.update", args]),
    },
    notification: {
      create: async (args) => calls.push(["notification.create", args]),
    },
    postInterviewOutcome: {
      upsert: async (args) => calls.push(["postInterviewOutcome.upsert", args]),
    },
    interviewThread: {
      upsert: async (args) => {
        calls.push(["interviewThread.upsert", args]);
        return { id: overrides.threadId ?? "thread-1" };
      },
      update: async (args) => calls.push(["interviewThread.update", args]),
    },
    interviewMessage: {
      count: async (args) => {
        calls.push(["interviewMessage.count", args]);
        return overrides.messageCount ?? 0;
      },
      create: async (args) => calls.push(["interviewMessage.create", args]),
    },
  };
  const db = {
    calls,
    freelancerProfile: {
      findUnique: async () => overrides.readinessProfile ?? readyProfile(),
    },
    jobPost: {
      findUnique: async () =>
        overrides.job ?? {
          id: "job-1",
          status: JobPostStatus.published,
          applicationStatus: ApplicationStatus.open,
        },
    },
    jobApplication: {
      findUnique: async () => overrides.existingApplication ?? null,
      create: async (args) => {
        calls.push(["jobApplication.create", args]);
        return { id: "application-1" };
      },
      update: async (args) => calls.push(["jobPost.update", args]),
    },
    interactionFeedback: {
      findUnique: async () => overrides.existingFeedback ?? null,
      upsert: async (args) => calls.push(["interactionFeedback.upsert", args]),
    },
    postInterviewOutcome: {
      upsert: async (args) => calls.push(["postInterviewOutcome.upsert", args]),
    },
    $transaction: async (callbackOrOperations) => {
      if (typeof callbackOrOperations === "function") return callbackOrOperations(tx);
      return Promise.all(callbackOrOperations);
    },
  };
  return db;
}

const applicationInput = {
  freelancerProfileId: "freelancer-profile-1",
  jobPostId: "job-1",
  proposalMessage: "応募メッセージ".repeat(10),
  proposedStart: "来月",
  contactPreference: "メール",
};

test("unready freelancer cannot apply", async () => {
  const db = workflowDb({
    readinessProfile: {
      ...readyProfile(),
      documents: [{ documentType: "resume" }],
    },
  });

  await assert.rejects(
    () => applyToJobWorkflow(db, applicationInput),
    /応募前にプロフィール、職務経歴フォーム、履歴書PDF、職務経歴書PDFを登録してください。/,
  );
  assert.equal(db.calls.length, 0);
});

test("closed or paused jobs cannot receive applications", async () => {
  for (const job of [
    { status: JobPostStatus.closed, applicationStatus: ApplicationStatus.open },
    { status: JobPostStatus.published, applicationStatus: ApplicationStatus.paused },
  ]) {
    const db = workflowDb({ job });
    await assert.rejects(() => applyToJobWorkflow(db, applicationInput), /この案件には応募できません。/);
    assert.equal(db.calls.length, 0);
  }
});

test("screening pass creates or reuses one interview thread and only writes an initial message for empty threads", async () => {
  const application = {
    freelancerProfile: { userId: "freelancer-user-1", fullName: "山田 太郎" },
    jobPost: { title: "PM案件", selectionFlow: "1回面談", contractTerms: "月末締め" },
    proposedStart: "来月",
    contactPreference: "メール",
  };
  const companyUser = {
    id: "company-user-1",
    userId: "company-auth-user-1",
    companyProfile: { name: "Flow Co" },
  };

  const firstDb = workflowDb();
  const firstResult = await screenApplicationWorkflow(firstDb, {
    applicationId: "application-1",
    status: "screening_passed",
    handoffMessage: "面談に進みましょう。",
    application,
    companyUser,
  });

  assert.equal(firstResult.interviewThreadId, "thread-1");
  assert.equal(firstDb.calls.filter(([name]) => name === "interviewThread.upsert").length, 1);
  const initialMessages = firstDb.calls.filter(([name]) => name === "interviewMessage.create");
  assert.equal(initialMessages.length, 1);
  assert.equal(initialMessages[0][1].data.body, "面談に進みましょう。");

  const existingThreadDb = workflowDb({ messageCount: 1, threadId: "thread-existing" });
  const existingResult = await screenApplicationWorkflow(existingThreadDb, {
    applicationId: "application-1",
    status: "screening_passed",
    handoffMessage: "二重送信しない",
    application,
    companyUser,
  });

  assert.equal(existingResult.interviewThreadId, "thread-existing");
  assert.equal(existingThreadDb.calls.filter(([name]) => name === "interviewThread.upsert").length, 1);
  assert.equal(existingThreadDb.calls.filter(([name]) => name === "interviewMessage.create").length, 0);
});

test("accepted interview time schedules the thread", async () => {
  const db = workflowDb();
  const proposedAt = new Date("2026-06-20T01:00:00.000Z");

  await sendInterviewMessageWorkflow(db, {
    threadId: "thread-1",
    senderUserId: "user-1",
    messageType: InterviewMessageType.accepted_time,
    body: "この日時でお願いします。",
    proposedAt,
  });

  const updates = db.calls.filter(([name]) => name === "interviewThread.update");
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0][1].data, { status: "scheduled", scheduledAt: proposedAt });
});

test("meeting URL updates only for valid URLs", async () => {
  const invalidDb = workflowDb();
  await assert.rejects(
    () =>
      sendInterviewMessageWorkflow(invalidDb, {
        threadId: "thread-1",
        senderUserId: "user-1",
        messageType: InterviewMessageType.meeting_url,
        body: "not-a-url",
        proposedAt: null,
      }),
    /会議URLは http:\/\/ または https:\/\/ から始まるURLを入力してください。/,
  );
  assert.equal(invalidDb.calls.length, 0);

  const validDb = workflowDb();
  await sendInterviewMessageWorkflow(validDb, {
    threadId: "thread-1",
    senderUserId: "user-1",
    messageType: InterviewMessageType.meeting_url,
    body: "https://meet.example.com/abc",
    proposedAt: null,
  });

  const updates = validDb.calls.filter(([name]) => name === "interviewThread.update");
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0][1].data, { meetingUrl: "https://meet.example.com/abc" });
});

test("company post-interview outcome stores agreement snapshot and manual job decision", async () => {
  const db = workflowDb();

  await recordCompanyPostInterviewOutcomeWorkflow(db, {
    jobApplicationId: "application-1",
    jobPostId: "job-1",
    status: PostInterviewOutcomeStatus.accepted,
    proposedStartDate: "2026-07-01",
    agreedStartDate: "2026-07-01",
    agreedRate: "月80万円",
    agreedWorkload: "週4日",
    contractPaymentNotes: "外部契約書で支払いサイト確認",
    externalConfirmationNeeded: "契約主体の最終確認",
    responseDeadline: "2026-06-15",
    declineReason: null,
    privateOutcomeNote: "複数名採用のため募集は継続",
    jobPostAction: "keep_open",
    updatedAt: new Date("2026-06-10T00:00:00.000Z"),
  });

  const upsert = db.calls.find(([name]) => name === "postInterviewOutcome.upsert");
  assert.equal(upsert[1].update.status, PostInterviewOutcomeStatus.accepted);
  assert.equal(upsert[1].update.agreedRate, "月80万円");
  assert.equal(upsert[1].update.jobShouldStayOpen, true);
  assert.equal(db.calls.filter(([name]) => name === "jobPost.update").length, 0);
});

test("company can pause applications after accepted or started outcome", async () => {
  const db = workflowDb();

  await recordCompanyPostInterviewOutcomeWorkflow(db, {
    jobApplicationId: "application-1",
    jobPostId: "job-1",
    status: PostInterviewOutcomeStatus.work_started,
    proposedStartDate: null,
    agreedStartDate: "2026-07-01",
    agreedRate: null,
    agreedWorkload: null,
    contractPaymentNotes: null,
    externalConfirmationNeeded: null,
    responseDeadline: null,
    declineReason: null,
    privateOutcomeNote: null,
    jobPostAction: "pause_applications",
  });

  const jobUpdate = db.calls.find(([name]) => name === "jobPost.update");
  assert.deepEqual(jobUpdate[1].data, { applicationStatus: ApplicationStatus.paused });
});

test("freelancer decline requires a structured private reason", async () => {
  const db = workflowDb();

  await assert.rejects(
    () =>
      recordFreelancerPostInterviewOutcomeWorkflow(db, {
        jobApplicationId: "application-1",
        status: PostInterviewOutcomeStatus.declined_by_freelancer,
        declineReason: null,
        agreedStartDate: null,
        agreedRate: null,
        agreedWorkload: null,
        externalConfirmationNeeded: null,
        privateOutcomeNote: null,
      }),
    /辞退理由を選択してください。/,
  );

  await recordFreelancerPostInterviewOutcomeWorkflow(db, {
    jobApplicationId: "application-1",
    status: PostInterviewOutcomeStatus.declined_by_freelancer,
    declineReason: PostInterviewDeclineReason.contract_payment_concern,
    agreedStartDate: null,
    agreedRate: null,
    agreedWorkload: null,
    externalConfirmationNeeded: "支払いサイトが合わない",
    privateOutcomeNote: "公開評価ではなく進捗メモ",
  });

  const upsert = db.calls.find(([name]) => name === "postInterviewOutcome.upsert");
  assert.equal(upsert[1].update.declineReason, PostInterviewDeclineReason.contract_payment_concern);
  assert.equal(upsert[1].update.privateOutcomeNote, "公開評価ではなく進捗メモ");
});

test("feedback edit attempts after 14 days are rejected", async () => {
  const db = workflowDb({
    existingFeedback: { createdAt: new Date("2026-05-01T00:00:00.000Z") },
  });

  await assert.rejects(
    () =>
      submitInteractionFeedbackWorkflow(db, {
        thread: {
          scheduledAt: new Date("2026-05-02T00:00:00.000Z"),
          jobApplicationId: "application-1",
          jobApplication: {
            jobPostId: "job-1",
            freelancerProfileId: "freelancer-profile-1",
            freelancerProfile: { userId: "freelancer-user-1" },
            jobPost: {
              companyProfileId: "company-profile-1",
              companyProfile: { users: [{ userId: "company-auth-user-1" }] },
            },
          },
        },
        authorUserId: "company-auth-user-1",
        followThroughRating: 4,
        collaborationRating: 5,
        interactionCompleted: true,
        wouldWorkAgain: true,
        privateNote: "再依頼したい",
        moderationStatus: InteractionFeedbackModerationStatus.visible,
        now: new Date("2026-05-16T00:00:00.000Z"),
      }),
    /フィードバックの編集期限を過ぎています。/,
  );
  assert.equal(db.calls.filter(([name]) => name === "interactionFeedback.upsert").length, 0);
});
