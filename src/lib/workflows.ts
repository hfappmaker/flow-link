import {
  ApplicationStatus,
  CompanySafetyReportStatus,
  type CompanySafetyReportType,
  CompanyVerificationStatus,
  InteractionFeedbackDirection,
  InteractionFeedbackModerationStatus,
  InterviewMessageType,
  JobPostStatus,
  PostInterviewOutcomeStatus,
  type PostInterviewDeclineReason,
  type JobApplicationStatus,
  type PrismaClient,
} from "@prisma/client";
import { enqueueSavedFeedJobAlertDispatch, shouldDispatchSavedFeedJobAlerts } from "./job-alerts.ts";
import {
  getApplicationReadiness,
  getJobPublishingReadiness,
  shouldHoldJobAsDraftForPublishing,
  type CompanyPublishingReadinessInput,
  type FreelancerReadinessProfile,
  type JobPublishingReadinessInput,
} from "./readiness.ts";
import { validatePostInterviewOutcomePolicy } from "./post-interview-outcomes.ts";
import { buildScreeningPassedHandoffMessage, daysSince } from "./utils.ts";

type WorkflowDb = Pick<
  PrismaClient,
  | "$transaction"
  | "companySafetyReport"
  | "companyVerificationRequest"
  | "freelancerProfile"
  | "jobAlertDispatch"
  | "jobPost"
  | "jobApplication"
  | "interactionFeedback"
  | "postInterviewOutcome"
>;

type SaveCompanyJobPostInput = {
  companyProfileId: string;
  companyProfile: CompanyPublishingReadinessInput | null;
  jobPostId?: string | null;
  data: JobPublishingReadinessInput & {
    companyProfileId: string;
    title: string;
    description: string;
    status: JobPostStatus;
    applicationStatus: ApplicationStatus;
  };
};

export async function saveCompanyJobPostWorkflow(db: WorkflowDb, input: SaveCompanyJobPostInput) {
  const data = { ...input.data };
  const publishReadiness = getJobPublishingReadiness(data, input.companyProfile);
  const heldAsDraft = shouldHoldJobAsDraftForPublishing(data.status, publishReadiness);
  if (heldAsDraft) {
    data.status = JobPostStatus.draft;
    data.applicationStatus = ApplicationStatus.paused;
  }

  let savedJob: typeof data & { id: string };
  await db.$transaction(async (tx) => {
    if (input.jobPostId) {
      savedJob = await tx.jobPost.update({
        where: { id: input.jobPostId, companyProfileId: input.companyProfileId },
        data,
      });
    } else {
      savedJob = await tx.jobPost.create({ data });
    }

    if (shouldDispatchSavedFeedJobAlerts(savedJob)) {
      await enqueueSavedFeedJobAlertDispatch(tx, { jobPostId: savedJob.id });
    }
  });

  return { savedJob: savedJob!, heldAsDraft };
}

type ApplyToJobInput = {
  freelancerProfileId: string;
  jobPostId: string;
  proposalMessage: string;
  proposedStart: string | null;
  rateExpectation: string | null;
  workloadExpectation: string | null;
  contactPreference: string | null;
};

export async function applyToJobWorkflow(db: WorkflowDb, input: ApplyToJobInput) {
  const readinessProfile = await db.freelancerProfile.findUnique({
    where: { id: input.freelancerProfileId },
    include: { documents: true, careerHistory: true, workPreference: true },
  });
  const readiness = getApplicationReadiness(readinessProfile as FreelancerReadinessProfile | null, input);
  if (!readiness.isReady) {
    throw new Error(`応募前に${readiness.missingRequired.map((item) => item.label).join("、")}を登録してください。`);
  }

  const job = await db.jobPost.findUnique({ where: { id: input.jobPostId } });
  if (!job || job.status !== JobPostStatus.published || job.applicationStatus !== ApplicationStatus.open) {
    throw new Error("この案件には応募できません。");
  }

  const existingApplication = await db.jobApplication.findUnique({
    where: {
      jobPostId_freelancerProfileId: {
        jobPostId: input.jobPostId,
        freelancerProfileId: input.freelancerProfileId,
      },
    },
  });
  if (existingApplication) {
    throw new Error("この案件には応募済みです。");
  }

  return db.jobApplication.create({
    data: {
      jobPostId: input.jobPostId,
      freelancerProfileId: input.freelancerProfileId,
      proposalMessage: input.proposalMessage,
      proposedStart: input.proposedStart,
      rateExpectation: input.rateExpectation,
      workloadExpectation: input.workloadExpectation,
      contactPreference: input.contactPreference,
    },
  });
}

type ScreeningApplication = {
  freelancerProfile: {
    userId: string;
    fullName: string;
  };
  jobPost: {
    title: string;
    selectionFlow: string | null;
    contractTerms: string | null;
  };
  proposedStart: string | null;
  rateExpectation: string | null;
  workloadExpectation: string | null;
  contactPreference: string | null;
};

type ScreeningCompanyUser = {
  id: string;
  userId: string;
  companyProfile: {
    name: string;
  };
};

type ScreenApplicationInput = {
  applicationId: string;
  status: JobApplicationStatus;
  handoffMessage: string | null;
  application: ScreeningApplication;
  companyUser: ScreeningCompanyUser;
  screenedAt?: Date;
};

export async function screenApplicationWorkflow(db: WorkflowDb, input: ScreenApplicationInput) {
  let interviewThreadId: string | null = null;
  await db.$transaction(async (tx) => {
    await tx.jobApplication.update({
      where: { id: input.applicationId },
      data: {
        status: input.status,
        screenedAt: input.screenedAt ?? new Date(),
        screenedByCompanyUserId: input.companyUser.id,
      },
    });
    await tx.notification.create({
      data: {
        userId: input.application.freelancerProfile.userId,
        type: input.status === "screening_passed" ? "screening_passed" : "screening_rejected",
        title: input.status === "screening_passed" ? "書類選考を通過しました" : "書類選考結果のお知らせ",
        body:
          input.status === "screening_passed"
            ? `${input.application.jobPost.title} の書類選考を通過しました。面談日程調整へ進んでください。`
            : `${input.application.jobPost.title} は今回は見送りとなりました。`,
      },
    });

    if (input.status !== "screening_passed") return;

    const thread = await tx.interviewThread.upsert({
      where: { jobApplicationId: input.applicationId },
      create: { jobApplicationId: input.applicationId },
      update: {},
    });
    interviewThreadId = thread.id;

    const messageCount = await tx.interviewMessage.count({
      where: { interviewThreadId: thread.id },
    });
    if (messageCount === 0) {
      await tx.interviewMessage.create({
        data: {
          interviewThreadId: thread.id,
          senderUserId: input.companyUser.userId,
          messageType: InterviewMessageType.text,
          body:
            input.handoffMessage ||
            buildScreeningPassedHandoffMessage({
              companyName: input.companyUser.companyProfile.name,
              freelancerName: input.application.freelancerProfile.fullName,
              jobTitle: input.application.jobPost.title,
              proposedStart: input.application.proposedStart,
              rateExpectation: input.application.rateExpectation,
              workloadExpectation: input.application.workloadExpectation,
              contactPreference: input.application.contactPreference,
              selectionFlow: input.application.jobPost.selectionFlow,
              contractTerms: input.application.jobPost.contractTerms,
            }),
        },
      });
    }
  });

  return { interviewThreadId };
}

type SendInterviewMessageInput = {
  threadId: string;
  senderUserId: string;
  messageType: InterviewMessageType;
  body: string;
  proposedAt: Date | null;
};

export async function sendInterviewMessageWorkflow(db: WorkflowDb, input: SendInterviewMessageInput) {
  if (
    (input.messageType === InterviewMessageType.proposed_time ||
      input.messageType === InterviewMessageType.accepted_time) &&
    (!input.proposedAt || Number.isNaN(input.proposedAt.getTime()))
  ) {
    throw new Error("候補日時を入力してください。");
  }
  if (input.messageType === InterviewMessageType.meeting_url && !isHttpUrl(input.body)) {
    throw new Error("会議URLは http:// または https:// から始まるURLを入力してください。");
  }

  await db.$transaction(async (tx) => {
    await tx.interviewMessage.create({
      data: {
        interviewThreadId: input.threadId,
        senderUserId: input.senderUserId,
        messageType: input.messageType,
        body: input.body,
        proposedAt: input.proposedAt,
      },
    });
    if (input.messageType === InterviewMessageType.accepted_time && input.proposedAt) {
      await tx.interviewThread.update({
        where: { id: input.threadId },
        data: { status: "scheduled", scheduledAt: input.proposedAt },
      });
    }
    if (input.messageType === InterviewMessageType.meeting_url) {
      await tx.interviewThread.update({
        where: { id: input.threadId },
        data: { meetingUrl: input.body },
      });
    }
  });
}

type FeedbackThread = {
  scheduledAt: Date | string | null;
  jobApplicationId: string;
  jobApplication: {
    jobPostId: string;
    freelancerProfileId: string;
    freelancerProfile: { userId: string };
    jobPost: {
      companyProfileId: string;
      companyProfile: {
        users: Array<{ userId: string }>;
      };
    };
  };
};

type SubmitInteractionFeedbackInput = {
  thread: FeedbackThread;
  authorUserId: string;
  followThroughRating: number;
  collaborationRating: number;
  interactionCompleted: boolean;
  wouldWorkAgain: boolean | null;
  privateNote: string | null;
  moderationStatus: InteractionFeedbackModerationStatus;
  now?: Date;
};

export function parseInteractionFeedbackRating(value: unknown, errorMessage = "評価は1〜5の整数で入力してください。"): number {
  const rating = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error(errorMessage);
  return rating;
}

export async function submitInteractionFeedbackWorkflow(db: WorkflowDb, input: SubmitInteractionFeedbackInput) {
  const followThroughRating = parseInteractionFeedbackRating(input.followThroughRating);
  const collaborationRating = parseInteractionFeedbackRating(input.collaborationRating);
  const isCompanyAuthor = input.thread.jobApplication.jobPost.companyProfile.users.some(
    (companyUser) => companyUser.userId === input.authorUserId,
  );
  const isFreelancerAuthor = input.thread.jobApplication.freelancerProfile.userId === input.authorUserId;
  if (!isCompanyAuthor && !isFreelancerAuthor) throw new Error("このフィードバックは送信できません。");
  if (!input.thread.scheduledAt) {
    throw new Error("面談日時が確定したやりとりだけフィードバックを送信できます。");
  }

  const direction = isCompanyAuthor
    ? InteractionFeedbackDirection.company_to_freelancer
    : InteractionFeedbackDirection.freelancer_to_company;
  const existingFeedback = await db.interactionFeedback.findUnique({
    where: {
      jobApplicationId_direction_authorUserId: {
        jobApplicationId: input.thread.jobApplicationId,
        direction,
        authorUserId: input.authorUserId,
      },
    },
  });
  if (existingFeedback && daysSince(existingFeedback.createdAt, input.now ?? new Date()) > 14) {
    throw new Error("フィードバックの編集期限を過ぎています。");
  }

  await db.interactionFeedback.upsert({
    where: {
      jobApplicationId_direction_authorUserId: {
        jobApplicationId: input.thread.jobApplicationId,
        direction,
        authorUserId: input.authorUserId,
      },
    },
    create: {
      jobApplicationId: input.thread.jobApplicationId,
      authorUserId: input.authorUserId,
      direction,
      targetCompanyProfileId: isFreelancerAuthor ? input.thread.jobApplication.jobPost.companyProfileId : null,
      targetFreelancerProfileId: isCompanyAuthor ? input.thread.jobApplication.freelancerProfileId : null,
      followThroughRating,
      collaborationRating,
      interactionCompleted: input.interactionCompleted,
      wouldWorkAgain: input.wouldWorkAgain,
      privateNote: input.privateNote,
      moderationStatus: input.moderationStatus,
    },
    update: {
      followThroughRating,
      collaborationRating,
      interactionCompleted: input.interactionCompleted,
      wouldWorkAgain: input.wouldWorkAgain,
      privateNote: input.privateNote,
      moderationStatus: input.moderationStatus,
    },
  });
}

const VERIFICATION_REVIEW_TRANSITIONS: Record<CompanyVerificationStatus, CompanyVerificationStatus[]> = {
  [CompanyVerificationStatus.submitted]: [CompanyVerificationStatus.confirmed, CompanyVerificationStatus.rejected],
  [CompanyVerificationStatus.confirmed]: [CompanyVerificationStatus.confirmed, CompanyVerificationStatus.needs_renewal, CompanyVerificationStatus.rejected],
  [CompanyVerificationStatus.needs_renewal]: [CompanyVerificationStatus.confirmed, CompanyVerificationStatus.rejected],
  [CompanyVerificationStatus.rejected]: [],
};

type ReviewCompanyVerificationInput = {
  requestId: string;
  status: CompanyVerificationStatus;
  reviewerNotes: string | null;
  reasonCode: string | null;
  confirmedScope: string | null;
  reviewedAt?: Date;
  expiresAt: Date | null;
  renewalRequestedAt?: Date | null;
};

export async function reviewCompanyVerificationWorkflow(db: WorkflowDb, input: ReviewCompanyVerificationInput) {
  const request = await db.companyVerificationRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, status: true },
  });
  if (!request) throw new Error("確認リクエストが見つかりません。");

  const allowedStatuses = VERIFICATION_REVIEW_TRANSITIONS[request.status as CompanyVerificationStatus] ?? [];
  if (!allowedStatuses.includes(input.status)) {
    throw new Error(`確認リクエストを ${request.status} から ${input.status} へ変更することはできません。`);
  }

  const reviewedAt = input.reviewedAt ?? new Date();
  if (input.status === CompanyVerificationStatus.confirmed) {
    if (!input.confirmedScope) throw new Error("承認する確認範囲を入力してください。");
    if (input.expiresAt && input.expiresAt.getTime() <= reviewedAt.getTime()) {
      throw new Error("有効期限はレビュー日時より後に設定してください。");
    }
  }
  if (input.status === CompanyVerificationStatus.rejected && !input.reasonCode && !input.reviewerNotes) {
    throw new Error("却下理由コードまたはレビューメモを入力してください。");
  }
  if (input.status === CompanyVerificationStatus.needs_renewal && !input.reasonCode && !input.reviewerNotes) {
    throw new Error("更新依頼の理由コードまたはレビューメモを入力してください。");
  }

  return db.companyVerificationRequest.update({
    where: { id: input.requestId },
    data: {
      status: input.status,
      confirmedScope: input.status === CompanyVerificationStatus.confirmed ? input.confirmedScope : null,
      reviewerNotes: input.reviewerNotes,
      reasonCode: input.reasonCode,
      reviewedAt,
      expiresAt: input.status === CompanyVerificationStatus.confirmed ? input.expiresAt : null,
      renewalRequestedAt:
        input.status === CompanyVerificationStatus.needs_renewal ? (input.renewalRequestedAt ?? reviewedAt) : null,
    },
  });
}

type CreateCompanySafetyReportInput = {
  companyProfileId: string;
  reporterUserId: string | null;
  jobPostId: string | null;
  jobApplicationId?: string | null;
  interviewThreadId?: string | null;
  reportType: CompanySafetyReportType;
  detail: string;
};

export async function createCompanySafetyReportWorkflow(db: WorkflowDb, input: CreateCompanySafetyReportInput) {
  if (!input.detail.trim()) throw new Error("安全性レポートの詳細を入力してください。");
  if (input.detail.length > 1200) throw new Error("安全性レポートの詳細は1200文字以内で入力してください。");

  return db.companySafetyReport.create({
    data: {
      companyProfileId: input.companyProfileId,
      reporterUserId: input.reporterUserId,
      jobPostId: input.jobPostId,
      jobApplicationId: input.jobApplicationId ?? null,
      interviewThreadId: input.interviewThreadId ?? null,
      reportType: input.reportType,
      detail: input.detail,
      status: CompanySafetyReportStatus.submitted,
    },
  });
}

type ResolveCompanySafetyReportInput = {
  reportId: string;
  internalNote: string;
  affectedUserNote: string;
  resolvedAt?: Date;
};

export async function resolveCompanySafetyReportWorkflow(db: WorkflowDb, input: ResolveCompanySafetyReportInput) {
  const report = await db.companySafetyReport.findUnique({
    where: { id: input.reportId },
    select: { id: true, status: true },
  });
  if (!report) throw new Error("安全性レポートが見つかりません。");
  if (report.status === CompanySafetyReportStatus.resolved) {
    throw new Error("解決済みの安全性レポートは再解決できません。");
  }
  if (!input.internalNote.trim()) throw new Error("社内向けの対応メモを入力してください。");
  if (!input.affectedUserNote.trim()) throw new Error("影響を受けるユーザー向けの案内を入力してください。");

  return db.companySafetyReport.update({
    where: { id: input.reportId },
    data: {
      status: CompanySafetyReportStatus.resolved,
      internalNote: input.internalNote,
      affectedUserNote: input.affectedUserNote,
      resolvedAt: input.resolvedAt ?? new Date(),
    },
  });
}

type CompanyPostInterviewOutcomeInput = {
  jobApplicationId: string;
  jobPostId: string;
  status: PostInterviewOutcomeStatus;
  proposedStartDate: string | null;
  agreedStartDate: string | null;
  agreedRate: string | null;
  agreedWorkload: string | null;
  contractPaymentNotes: string | null;
  externalConfirmationNeeded: string | null;
  responseDeadline: string | null;
  declineReason: PostInterviewDeclineReason | null;
  privateOutcomeNote: string | null;
  jobPostAction: "keep_open" | "pause_applications" | "close_job";
  updatedAt?: Date;
};

export async function recordCompanyPostInterviewOutcomeWorkflow(
  db: WorkflowDb,
  input: CompanyPostInterviewOutcomeInput,
) {
  validatePostInterviewOutcomePolicy("company", input);

  await db.$transaction(async (tx) => {
    await tx.postInterviewOutcome.upsert({
      where: { jobApplicationId: input.jobApplicationId },
      create: {
        jobApplicationId: input.jobApplicationId,
        status: input.status,
        proposedStartDate: input.proposedStartDate,
        agreedStartDate: input.agreedStartDate,
        agreedRate: input.agreedRate,
        agreedWorkload: input.agreedWorkload,
        contractPaymentNotes: input.contractPaymentNotes,
        externalConfirmationNeeded: input.externalConfirmationNeeded,
        responseDeadline: input.responseDeadline,
        declineReason: input.declineReason,
        privateOutcomeNote: input.privateOutcomeNote,
        jobShouldStayOpen: input.jobPostAction === "keep_open",
        companyUpdatedAt: input.updatedAt ?? new Date(),
      },
      update: {
        status: input.status,
        proposedStartDate: input.proposedStartDate,
        agreedStartDate: input.agreedStartDate,
        agreedRate: input.agreedRate,
        agreedWorkload: input.agreedWorkload,
        contractPaymentNotes: input.contractPaymentNotes,
        externalConfirmationNeeded: input.externalConfirmationNeeded,
        responseDeadline: input.responseDeadline,
        declineReason: input.declineReason,
        privateOutcomeNote: input.privateOutcomeNote,
        jobShouldStayOpen: input.jobPostAction === "keep_open",
        companyUpdatedAt: input.updatedAt ?? new Date(),
      },
    });

    if (input.jobPostAction === "pause_applications") {
      await tx.jobPost.update({
        where: { id: input.jobPostId },
        data: { applicationStatus: ApplicationStatus.paused },
      });
    }
    if (input.jobPostAction === "close_job") {
      await tx.jobPost.update({
        where: { id: input.jobPostId },
        data: { status: JobPostStatus.closed, applicationStatus: ApplicationStatus.paused },
      });
    }
  });
}

type FreelancerPostInterviewOutcomeInput = {
  jobApplicationId: string;
  status: PostInterviewOutcomeStatus;
  declineReason: PostInterviewDeclineReason | null;
  agreedStartDate: string | null;
  agreedRate: string | null;
  agreedWorkload: string | null;
  externalConfirmationNeeded: string | null;
  privateOutcomeNote: string | null;
  updatedAt?: Date;
};

export async function recordFreelancerPostInterviewOutcomeWorkflow(
  db: WorkflowDb,
  input: FreelancerPostInterviewOutcomeInput,
) {
  validatePostInterviewOutcomePolicy("freelancer", input);

  await db.postInterviewOutcome.upsert({
    where: { jobApplicationId: input.jobApplicationId },
    create: {
      jobApplicationId: input.jobApplicationId,
      status: input.status,
      declineReason: input.declineReason,
      agreedStartDate: input.agreedStartDate,
      agreedRate: input.agreedRate,
      agreedWorkload: input.agreedWorkload,
      externalConfirmationNeeded: input.externalConfirmationNeeded,
      privateOutcomeNote: input.privateOutcomeNote,
      freelancerUpdatedAt: input.updatedAt ?? new Date(),
    },
    update: {
      status: input.status,
      declineReason: input.declineReason,
      agreedStartDate: input.agreedStartDate,
      agreedRate: input.agreedRate,
      agreedWorkload: input.agreedWorkload,
      externalConfirmationNeeded: input.externalConfirmationNeeded,
      privateOutcomeNote: input.privateOutcomeNote,
      freelancerUpdatedAt: input.updatedAt ?? new Date(),
    },
  });
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
