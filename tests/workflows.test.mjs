import assert from "node:assert/strict";
import test from "node:test";
import {
  ApplicationStatus,
  InteractionFeedbackModerationStatus,
  InterviewMessageType,
  JobPostStatus,
} from "@prisma/client";

const {
  applyToJobWorkflow,
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
    notification: {
      create: async (args) => calls.push(["notification.create", args]),
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
    },
    interactionFeedback: {
      findUnique: async () => overrides.existingFeedback ?? null,
      upsert: async (args) => calls.push(["interactionFeedback.upsert", args]),
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
