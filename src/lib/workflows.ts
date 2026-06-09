import {
  ApplicationStatus,
  InteractionFeedbackDirection,
  InteractionFeedbackModerationStatus,
  InterviewMessageType,
  JobPostStatus,
  PostInterviewOutcomeStatus,
  type PostInterviewDeclineReason,
  type JobApplicationStatus,
  type PrismaClient,
} from "@prisma/client";
import { getFreelancerReadiness, type FreelancerReadinessProfile } from "./readiness.ts";
import { buildScreeningPassedHandoffMessage, daysSince } from "./utils.ts";

type WorkflowDb = Pick<
  PrismaClient,
  "$transaction" | "freelancerProfile" | "jobPost" | "jobApplication" | "interactionFeedback" | "postInterviewOutcome"
>;

type ApplyToJobInput = {
  freelancerProfileId: string;
  jobPostId: string;
  proposalMessage: string;
  proposedStart: string | null;
  contactPreference: string | null;
};

export async function applyToJobWorkflow(db: WorkflowDb, input: ApplyToJobInput) {
  const readinessProfile = await db.freelancerProfile.findUnique({
    where: { id: input.freelancerProfileId },
    include: { documents: true, careerHistory: true },
  });
  const readiness = getFreelancerReadiness(readinessProfile as FreelancerReadinessProfile | null);
  if (!readiness.isReady) {
    throw new Error("応募前にプロフィール、職務経歴フォーム、履歴書PDF、職務経歴書PDFを登録してください。");
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

export async function submitInteractionFeedbackWorkflow(db: WorkflowDb, input: SubmitInteractionFeedbackInput) {
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
      followThroughRating: input.followThroughRating,
      collaborationRating: input.collaborationRating,
      interactionCompleted: input.interactionCompleted,
      wouldWorkAgain: input.wouldWorkAgain,
      privateNote: input.privateNote,
      moderationStatus: input.moderationStatus,
    },
    update: {
      followThroughRating: input.followThroughRating,
      collaborationRating: input.collaborationRating,
      interactionCompleted: input.interactionCompleted,
      wouldWorkAgain: input.wouldWorkAgain,
      privateNote: input.privateNote,
      moderationStatus: input.moderationStatus,
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
  if (
    input.status === PostInterviewOutcomeStatus.accepted ||
    input.status === PostInterviewOutcomeStatus.contract_agreed ||
    input.status === PostInterviewOutcomeStatus.work_started
  ) {
    if (!input.agreedStartDate && !input.proposedStartDate) {
      throw new Error("承諾以降のステータスでは開始日または開始予定を入力してください。");
    }
  }

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
  if (input.status === PostInterviewOutcomeStatus.declined_by_freelancer && !input.declineReason) {
    throw new Error("辞退理由を選択してください。");
  }

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
