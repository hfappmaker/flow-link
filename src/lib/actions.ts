"use server";

import { put } from "@vercel/blob";
import {
  ApplicationStatus,
  InteractionFeedbackDirection,
  InteractionFeedbackModerationStatus,
  InterviewMessageType,
  JobPostStatus,
  Prisma,
  type UserRole,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, authorizeCredentials, signIn, signOut } from "@/lib/auth";
import {
  parseApplicationStatus,
  parseInterviewMessageType,
  parseJobPostStatus,
  parseResumeDocumentType,
  parseScreeningResultStatus,
  parseUserRole,
} from "@/lib/form-enums";
import { prisma } from "@/lib/prisma";
import { getFreelancerReadiness } from "@/lib/readiness";
import { buildScreeningPassedHandoffMessage, daysSince, directContractChecklist, toOptionalText, toText } from "@/lib/utils";

async function currentUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("ログインが必要です。");
  return session.user;
}

async function currentFreelancer() {
  const user = await currentUser();
  if (user.role !== "freelancer") throw new Error("フリーランス権限が必要です。");
  const profile = await prisma.freelancerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new Error("プロフィール登録が必要です。");
  return { user, profile };
}

async function currentCompanyUser() {
  const user = await currentUser();
  if (user.role !== "company_user") throw new Error("企業権限が必要です。");
  const companyUser = await prisma.companyUser.findUnique({
    where: { userId: user.id },
    include: { companyProfile: true },
  });
  if (!companyUser) throw new Error("企業プロフィール登録が必要です。");
  return { user, companyUser };
}

export async function registerUser(formData: FormData) {
  const email = toText(formData.get("email")).toLowerCase();
  const password = toText(formData.get("password"));
  const role = parseUserRole(formData.get("role"));
  const callbackUrl = safeReturnPath(toText(formData.get("callbackUrl")) || "/");

  if (!email || password.length < 8) {
    throw new Error("登録内容を確認してください。");
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hash(password, 12),
        role,
        freelancer:
          role === "freelancer"
            ? {
                create: {
                  fullName: toText(formData.get("name")) || email,
                },
              }
            : undefined,
        companyUser:
          role === "company_user"
            ? {
                create: {
                  companyProfile: {
                    create: {
                      name: toText(formData.get("name")) || "未設定の企業",
                    },
                  },
                },
              }
            : undefined,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const registerUrl = new URLSearchParams({ error: "email-exists" });
      if (callbackUrl !== "/") {
        registerUrl.set("callbackUrl", callbackUrl);
      }
      redirect(`/register?${registerUrl.toString()}`);
    }
    throw error;
  }

  const redirectTo = registrationRedirectForRole(role, callbackUrl);

  await signIn("credentials", {
    email: user.email,
    password,
    redirectTo,
  });
}

export async function loginUser(formData: FormData) {
  const email = toText(formData.get("email")).toLowerCase();
  const password = toText(formData.get("password"));
  const callbackUrl = safeReturnPath(toText(formData.get("callbackUrl")) || "/");

  const user = await authorizeCredentials({ email, password });
  if (!user) {
    redirect("/login?error=CredentialsSignin");
  }
  const redirectTo = callbackUrl === "/" ? (user.role === "freelancer" ? "/freelancer" : "/company") : callbackUrl;

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=CredentialsSignin");
    }
    throw error;
  }
}

export async function logoutUser() {
  await signOut({ redirectTo: "/" });
}

export async function saveFreelancerProfile(formData: FormData) {
  const user = await currentUser();
  if (user.role !== "freelancer") throw new Error("フリーランス権限が必要です。");

  await prisma.freelancerProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      fullName: toText(formData.get("fullName")),
      desiredOccupation: toOptionalText(formData.get("desiredOccupation")),
      skills: toOptionalText(formData.get("skills")),
      yearsOfExperience: Number(toText(formData.get("yearsOfExperience"))) || null,
      desiredRate: toOptionalText(formData.get("desiredRate")),
      availability: toOptionalText(formData.get("availability")),
      availableFrom: toOptionalText(formData.get("availableFrom")),
      preferredLocation: toOptionalText(formData.get("preferredLocation")),
      remotePreference: toOptionalText(formData.get("remotePreference")),
    },
    update: {
      fullName: toText(formData.get("fullName")),
      desiredOccupation: toOptionalText(formData.get("desiredOccupation")),
      skills: toOptionalText(formData.get("skills")),
      yearsOfExperience: Number(toText(formData.get("yearsOfExperience"))) || null,
      desiredRate: toOptionalText(formData.get("desiredRate")),
      availability: toOptionalText(formData.get("availability")),
      availableFrom: toOptionalText(formData.get("availableFrom")),
      preferredLocation: toOptionalText(formData.get("preferredLocation")),
      remotePreference: toOptionalText(formData.get("remotePreference")),
    },
  });

  revalidatePath("/freelancer/profile");
  redirect("/freelancer");
}

export async function saveCareerHistory(formData: FormData) {
  const { profile } = await currentFreelancer();
  await prisma.careerHistory.upsert({
    where: { freelancerProfileId: profile.id },
    create: {
      freelancerProfileId: profile.id,
      summary: toOptionalText(formData.get("summary")),
      workExperiences: toOptionalText(formData.get("workExperiences")),
      projects: toOptionalText(formData.get("projects")),
      certifications: toOptionalText(formData.get("certifications")),
      education: toOptionalText(formData.get("education")),
    },
    update: {
      summary: toOptionalText(formData.get("summary")),
      workExperiences: toOptionalText(formData.get("workExperiences")),
      projects: toOptionalText(formData.get("projects")),
      certifications: toOptionalText(formData.get("certifications")),
      education: toOptionalText(formData.get("education")),
    },
  });

  revalidatePath("/freelancer/career");
  redirect("/freelancer");
}

export async function uploadResumeDocument(formData: FormData) {
  const { profile } = await currentFreelancer();
  const type = parseResumeDocumentType(formData.get("documentType"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("PDFファイルを選択してください。");
  }
  if (file.type !== "application/pdf") throw new Error("PDFのみアップロードできます。");

  const blob = await put(`freelancers/${profile.id}/${type}-${Date.now()}-${file.name}`, file, {
    access: "private",
  });

  await prisma.resumeDocument.upsert({
    where: {
      freelancerProfileId_documentType: {
        freelancerProfileId: profile.id,
        documentType: type,
      },
    },
    create: {
      freelancerProfileId: profile.id,
      documentType: type,
      fileUrl: blob.url,
      originalFilename: file.name,
    },
    update: {
      fileUrl: blob.url,
      originalFilename: file.name,
      uploadedAt: new Date(),
    },
  });

  revalidatePath("/freelancer/documents");
}

export async function saveCompanyProfile(formData: FormData) {
  const { companyUser } = await currentCompanyUser();
  const contactTeam = toOptionalText(formData.get("contactTeam"));
  const operatingArea = toOptionalText(formData.get("operatingArea"));
  const paymentPolicy = toOptionalText(formData.get("paymentPolicy"));
  if ((contactTeam?.length ?? 0) > 600 || (operatingArea?.length ?? 0) > 240 || (paymentPolicy?.length ?? 0) > 600) {
    throw new Error("会社情報の補足は指定文字数以内で入力してください。");
  }
  await prisma.companyProfile.update({
    where: { id: companyUser.companyProfileId },
    data: {
      name: toText(formData.get("name")),
      description: toOptionalText(formData.get("description")),
      websiteUrl: toOptionalText(formData.get("websiteUrl")),
      contactTeam,
      operatingArea,
      paymentPolicy,
    },
  });
  revalidatePath("/company/profile");
  redirect("/company");
}

export async function saveJobPost(formData: FormData) {
  const { companyUser } = await currentCompanyUser();
  const id = toOptionalText(formData.get("id"));
  const selectionFlow = toOptionalText(formData.get("selectionFlow"));
  const contractTerms = toOptionalText(formData.get("contractTerms"));
  if ((selectionFlow?.length ?? 0) > 800 || (contractTerms?.length ?? 0) > 800) {
    throw new Error("選考フローと契約・支払い条件は800文字以内で入力してください。");
  }
  const requestedStatus = parseJobPostStatus(formData.get("status"));
  const applicationStatus = parseApplicationStatus(formData.get("applicationStatus"));
  const data = {
    companyProfileId: companyUser.companyProfileId,
    title: toText(formData.get("title")),
    description: toText(formData.get("description")),
    requiredSkills: toOptionalText(formData.get("requiredSkills")),
    preferredSkills: toOptionalText(formData.get("preferredSkills")),
    rate: toOptionalText(formData.get("rate")),
    workload: toOptionalText(formData.get("workload")),
    contractPeriod: toOptionalText(formData.get("contractPeriod")),
    selectionFlow,
    contractTerms,
    location: toOptionalText(formData.get("location")),
    remotePolicy: toOptionalText(formData.get("remotePolicy")),
    openings: Number(toText(formData.get("openings"))) || null,
    status: requestedStatus,
    applicationStatus,
  };
  if (!data.title || !data.description) {
    throw new Error("タイトルと業務内容を入力してください。");
  }
  const publishReadiness = directContractChecklist(data);
  const heldAsDraft = requestedStatus === "published" && !publishReadiness.isReady;
  if (heldAsDraft) {
    data.status = JobPostStatus.draft;
    data.applicationStatus = ApplicationStatus.paused;
  }

  if (id) {
    await prisma.jobPost.update({
      where: { id, companyProfileId: companyUser.companyProfileId },
      data,
    });
  } else {
    await prisma.jobPost.create({ data });
  }

  revalidatePath("/company/jobs");
  redirect(heldAsDraft ? "/company/jobs?publish=needs-conditions" : "/company/jobs");
}

export async function applyToJob(formData: FormData) {
  const { profile } = await currentFreelancer();
  const jobPostId = toText(formData.get("jobPostId"));
  const proposalMessage = toText(formData.get("proposalMessage"));
  const proposedStart = toOptionalText(formData.get("proposedStart"));
  const contactPreference = toOptionalText(formData.get("contactPreference"));
  if (proposalMessage.length < 40 || proposalMessage.length > 1200) {
    throw new Error("応募メッセージは40文字以上1200文字以内で入力してください。");
  }
  if ((proposedStart?.length ?? 0) > 120 || (contactPreference?.length ?? 0) > 120) {
    throw new Error("稼働開始目安と連絡希望は120文字以内で入力してください。");
  }
  const readinessProfile = await prisma.freelancerProfile.findUnique({
    where: { id: profile.id },
    include: { documents: true, careerHistory: true },
  });
  const readiness = getFreelancerReadiness(readinessProfile);
  if (!readiness.isReady) {
    throw new Error("応募前にプロフィール、職務経歴フォーム、履歴書PDF、職務経歴書PDFを登録してください。");
  }
  const job = await prisma.jobPost.findUnique({ where: { id: jobPostId } });
  if (!job || job.status !== "published" || job.applicationStatus !== "open") {
    throw new Error("この案件には応募できません。");
  }
  const existingApplication = await prisma.jobApplication.findUnique({
    where: {
      jobPostId_freelancerProfileId: {
        jobPostId,
        freelancerProfileId: profile.id,
      },
    },
  });
  if (existingApplication) {
    throw new Error("この案件には応募済みです。");
  }

  await prisma.jobApplication.create({
    data: {
      jobPostId,
      freelancerProfileId: profile.id,
      proposalMessage,
      proposedStart,
      contactPreference,
    },
  });

  revalidatePath("/jobs");
  redirect("/freelancer/applications");
}

export async function saveJobForReview(formData: FormData) {
  const { profile } = await currentFreelancer();
  const jobPostId = toText(formData.get("jobPostId"));
  const returnTo = safeReturnPath(toText(formData.get("returnTo")) || `/jobs/${jobPostId}`);
  const note = toOptionalText(formData.get("note"));
  if ((note?.length ?? 0) > 400) {
    throw new Error("検討メモは400文字以内で入力してください。");
  }

  const job = await prisma.jobPost.findFirst({
    where: { id: jobPostId, status: "published" },
    select: { id: true },
  });
  if (!job) throw new Error("保存できる案件が見つかりません。");

  await prisma.savedJob.upsert({
    where: {
      freelancerProfileId_jobPostId: {
        freelancerProfileId: profile.id,
        jobPostId,
      },
    },
    create: {
      freelancerProfileId: profile.id,
      jobPostId,
      note,
    },
    update: {
      note,
    },
  });

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobPostId}`);
  revalidatePath("/freelancer");
  revalidatePath("/freelancer/saved-jobs");
  redirect(returnTo);
}

export async function removeSavedJob(formData: FormData) {
  const { profile } = await currentFreelancer();
  const jobPostId = toText(formData.get("jobPostId"));
  const returnTo = safeReturnPath(toText(formData.get("returnTo")) || "/freelancer/saved-jobs");

  await prisma.savedJob.deleteMany({
    where: {
      freelancerProfileId: profile.id,
      jobPostId,
    },
  });

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobPostId}`);
  revalidatePath("/freelancer");
  revalidatePath("/freelancer/saved-jobs");
  redirect(returnTo);
}

export async function saveScreeningNote(formData: FormData) {
  const { companyUser } = await currentCompanyUser();
  const applicationId = toText(formData.get("applicationId"));
  await assertOwnsApplication(companyUser.companyProfileId, applicationId);
  await prisma.screeningNote.create({
    data: {
      jobApplicationId: applicationId,
      companyUserId: companyUser.id,
      note: toText(formData.get("note")),
    },
  });
  revalidatePath(`/company/applications/${applicationId}`);
}

export async function screenApplication(formData: FormData) {
  const { companyUser } = await currentCompanyUser();
  const applicationId = toText(formData.get("applicationId"));
  const status = parseScreeningResultStatus(formData.get("status"));
  const handoffMessage = toOptionalText(formData.get("handoffMessage"));
  if (status === "screening_passed" && formData.get("handoffConfirmed") !== "on") {
    throw new Error("初回連絡文の確認にチェックを入れてください。");
  }
  if ((handoffMessage?.length ?? 0) > 1600) {
    throw new Error("初回連絡文は1600文字以内で入力してください。");
  }

  const application = await assertOwnsApplication(companyUser.companyProfileId, applicationId);
  let interviewThreadId: string | null = null;
  await prisma.$transaction(async (tx) => {
    await tx.jobApplication.update({
      where: { id: applicationId },
      data: {
        status,
        screenedAt: new Date(),
        screenedByCompanyUserId: companyUser.id,
      },
    });
    await tx.notification.create({
      data: {
        userId: application.freelancerProfile.userId,
        type: status === "screening_passed" ? "screening_passed" : "screening_rejected",
        title: status === "screening_passed" ? "書類選考を通過しました" : "書類選考結果のお知らせ",
        body:
          status === "screening_passed"
            ? `${application.jobPost.title} の書類選考を通過しました。面談日程調整へ進んでください。`
            : `${application.jobPost.title} は今回は見送りとなりました。`,
      },
    });
    if (status === "screening_passed") {
      const thread = await tx.interviewThread.upsert({
        where: { jobApplicationId: applicationId },
        create: { jobApplicationId: applicationId },
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
            senderUserId: companyUser.userId,
            messageType: InterviewMessageType.text,
            body:
              handoffMessage ||
              buildScreeningPassedHandoffMessage({
                companyName: companyUser.companyProfile.name,
                freelancerName: application.freelancerProfile.fullName,
                jobTitle: application.jobPost.title,
                proposedStart: application.proposedStart,
                contactPreference: application.contactPreference,
                selectionFlow: application.jobPost.selectionFlow,
                contractTerms: application.jobPost.contractTerms,
              }),
          },
        });
      }
    }
  });

  revalidatePath(`/company/applications/${applicationId}`);
  if (interviewThreadId) revalidatePath(`/interviews/${interviewThreadId}`);
  redirect(`/company/applications/${applicationId}`);
}

export async function markNotificationRead(formData: FormData) {
  const user = await currentUser();
  await prisma.notification.update({
    where: { id: toText(formData.get("notificationId")), userId: user.id },
    data: { readAt: new Date() },
  });
  revalidatePath("/freelancer/notifications");
}

export async function sendInterviewMessage(formData: FormData) {
  const user = await currentUser();
  const threadId = toText(formData.get("threadId"));
  const messageType = parseInterviewMessageType(formData.get("messageType"));
  await assertCanUseThread(user.id, threadId);

  const proposedAtText = toOptionalText(formData.get("proposedAt"));
  const body = toText(formData.get("body")) || proposedAtText || "";
  const proposedAt = proposedAtText ? new Date(proposedAtText) : null;
  if ((messageType === "proposed_time" || messageType === "accepted_time") && (!proposedAt || Number.isNaN(proposedAt.getTime()))) {
    throw new Error("候補日時を入力してください。");
  }
  if (messageType === "meeting_url" && !isHttpUrl(body)) {
    throw new Error("会議URLは http:// または https:// から始まるURLを入力してください。");
  }
  await prisma.$transaction(async (tx) => {
    await tx.interviewMessage.create({
      data: {
        interviewThreadId: threadId,
        senderUserId: user.id,
        messageType,
        body,
        proposedAt,
      },
    });
    if (messageType === "accepted_time" && proposedAt) {
      await tx.interviewThread.update({
        where: { id: threadId },
        data: { status: "scheduled", scheduledAt: proposedAt },
      });
    }
    if (messageType === "meeting_url") {
      await tx.interviewThread.update({
        where: { id: threadId },
        data: { meetingUrl: body },
      });
    }
  });

  revalidatePath(`/interviews/${threadId}`);
}

export async function sendInterviewTimeOptions(formData: FormData) {
  const user = await currentUser();
  const threadId = toText(formData.get("threadId"));
  await assertCanUseThread(user.id, threadId);

  const note = toOptionalText(formData.get("body"));
  if ((note?.length ?? 0) > 800) {
    throw new Error("補足は800文字以内で入力してください。");
  }

  const proposedTimes = ["proposedAt1", "proposedAt2", "proposedAt3"]
    .map((name) => toOptionalText(formData.get(name)))
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value));

  if (proposedTimes.length === 0 || proposedTimes.some((date) => Number.isNaN(date.getTime()))) {
    throw new Error("候補日時を1つ以上入力してください。");
  }

  await prisma.$transaction(
    proposedTimes.map((proposedAt, index) =>
      prisma.interviewMessage.create({
        data: {
          interviewThreadId: threadId,
          senderUserId: user.id,
          messageType: InterviewMessageType.proposed_time,
          proposedAt,
          body: [
            `面談候補${index + 1}: ${formatDateForMessage(proposedAt)}`,
            note ? `補足: ${note}` : null,
          ].filter(Boolean).join("\n"),
        },
      }),
    ),
  );

  revalidatePath(`/interviews/${threadId}`);
}

export async function submitInteractionFeedback(formData: FormData) {
  const user = await currentUser();
  const threadId = toText(formData.get("threadId"));
  const thread = await assertCanUseThread(user.id, threadId);
  const isCompanyAuthor = thread.jobApplication.jobPost.companyProfile.users.some((companyUser) => companyUser.userId === user.id);
  const isFreelancerAuthor = thread.jobApplication.freelancerProfile.userId === user.id;
  if (!isCompanyAuthor && !isFreelancerAuthor) throw new Error("このフィードバックは送信できません。");
  if (!thread.scheduledAt) {
    throw new Error("面談日時が確定したやりとりだけフィードバックを送信できます。");
  }

  const direction = isCompanyAuthor
    ? InteractionFeedbackDirection.company_to_freelancer
    : InteractionFeedbackDirection.freelancer_to_company;
  const followThroughRating = parseRating(formData.get("followThroughRating"), "返信・フォローの評価を選択してください。");
  const collaborationRating = parseRating(formData.get("collaborationRating"), "協働しやすさの評価を選択してください。");
  const privateNote = toOptionalText(formData.get("privateNote"));
  if ((privateNote?.length ?? 0) > 800) {
    throw new Error("非公開メモは800文字以内で入力してください。");
  }
  const moderationStatus = formData.get("needsModeration") === "on"
    ? InteractionFeedbackModerationStatus.reported
    : InteractionFeedbackModerationStatus.visible;
  const existingFeedback = await prisma.interactionFeedback.findUnique({
    where: {
      jobApplicationId_direction_authorUserId: {
        jobApplicationId: thread.jobApplicationId,
        direction,
        authorUserId: user.id,
      },
    },
  });
  if (existingFeedback && daysSince(existingFeedback.createdAt) > 14) {
    throw new Error("フィードバックの編集期限を過ぎています。");
  }

  await prisma.interactionFeedback.upsert({
    where: {
      jobApplicationId_direction_authorUserId: {
        jobApplicationId: thread.jobApplicationId,
        direction,
        authorUserId: user.id,
      },
    },
    create: {
      jobApplicationId: thread.jobApplicationId,
      authorUserId: user.id,
      direction,
      targetCompanyProfileId: isFreelancerAuthor ? thread.jobApplication.jobPost.companyProfileId : null,
      targetFreelancerProfileId: isCompanyAuthor ? thread.jobApplication.freelancerProfileId : null,
      followThroughRating,
      collaborationRating,
      interactionCompleted: formData.get("interactionCompleted") === "on",
      wouldWorkAgain: parseOptionalBoolean(formData.get("wouldWorkAgain")),
      privateNote,
      moderationStatus,
    },
    update: {
      followThroughRating,
      collaborationRating,
      interactionCompleted: formData.get("interactionCompleted") === "on",
      wouldWorkAgain: parseOptionalBoolean(formData.get("wouldWorkAgain")),
      privateNote,
      moderationStatus,
    },
  });

  revalidatePath(`/interviews/${threadId}`);
  revalidatePath(`/jobs/${thread.jobApplication.jobPostId}`);
  revalidatePath(`/company/applications/${thread.jobApplicationId}`);
  revalidatePath(`/company/jobs/${thread.jobApplication.jobPostId}/applications`);
}

function formatDateForMessage(value: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function safeReturnPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function parseRating(value: FormDataEntryValue | null, errorMessage: string) {
  const rating = Number(toText(value));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error(errorMessage);
  return rating;
}

function parseOptionalBoolean(value: FormDataEntryValue | null) {
  const text = toText(value);
  if (text === "yes") return true;
  if (text === "no") return false;
  return null;
}

function registrationRedirectForRole(role: UserRole, callbackUrl: string) {
  const defaultPath = role === "freelancer" ? "/freelancer" : "/company";
  if (callbackUrl === "/") return defaultPath;
  if (role === "freelancer" && callbackUrl.startsWith("/company")) return defaultPath;
  if (role === "company_user" && callbackUrl.startsWith("/freelancer")) return defaultPath;
  return callbackUrl;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function assertOwnsApplication(companyProfileId: string, applicationId: string) {
  const application = await prisma.jobApplication.findFirst({
    where: {
      id: applicationId,
      jobPost: { companyProfileId },
    },
    include: {
      jobPost: true,
      freelancerProfile: { include: { user: true, careerHistory: true, documents: true } },
    },
  });
  if (!application) throw new Error("応募情報を閲覧できません。");
  return application;
}

async function assertCanUseThread(userId: string, threadId: string) {
  const thread = await prisma.interviewThread.findUnique({
    where: { id: threadId },
    include: {
      jobApplication: {
        include: {
          freelancerProfile: true,
          jobPost: { include: { companyProfile: { include: { users: true } } } },
        },
      },
    },
  });
  const companyUserIds = thread?.jobApplication.jobPost.companyProfile.users.map((user) => user.userId) ?? [];
  if (!thread || (thread.jobApplication.freelancerProfile.userId !== userId && !companyUserIds.includes(userId))) {
    throw new Error("このチャットを閲覧できません。");
  }
  return thread;
}
