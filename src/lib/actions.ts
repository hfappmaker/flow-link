"use server";

import { put } from "@vercel/blob";
import {
  ApplicationStatus,
  InterviewMessageType,
  JobApplicationStatus,
  JobPostStatus,
  Prisma,
  ResumeDocumentType,
  UserRole,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, authorizeCredentials, signIn, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFreelancerReadiness } from "@/lib/readiness";
import { toOptionalText, toText } from "@/lib/utils";

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
  const role = toText(formData.get("role")) as UserRole;

  if (!email || password.length < 8 || !["freelancer", "company_user"].includes(role)) {
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
      redirect("/register?error=email-exists");
    }
    throw error;
  }

  await signIn("credentials", {
    email: user.email,
    password,
    redirectTo: role === "freelancer" ? "/freelancer" : "/company",
  });
}

export async function loginUser(formData: FormData) {
  const email = toText(formData.get("email")).toLowerCase();
  const password = toText(formData.get("password"));
  const callbackUrl = toText(formData.get("callbackUrl")) || "/";

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
  const type = toText(formData.get("documentType")) as ResumeDocumentType;
  const file = formData.get("file");
  if (!["resume", "career_history"].includes(type) || !(file instanceof File) || file.size === 0) {
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
  await prisma.companyProfile.update({
    where: { id: companyUser.companyProfileId },
    data: {
      name: toText(formData.get("name")),
      description: toOptionalText(formData.get("description")),
      websiteUrl: toOptionalText(formData.get("websiteUrl")),
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
    throw new Error("選考フローと直接契約・支払い条件は800文字以内で入力してください。");
  }
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
    status: toText(formData.get("status")) as JobPostStatus,
    applicationStatus: toText(formData.get("applicationStatus")) as ApplicationStatus,
  };

  if (id) {
    await prisma.jobPost.update({
      where: { id, companyProfileId: companyUser.companyProfileId },
      data,
    });
  } else {
    await prisma.jobPost.create({ data });
  }

  revalidatePath("/company/jobs");
  redirect("/company/jobs");
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
  const status = toText(formData.get("status")) as JobApplicationStatus;
  if (!["screening_passed", "screening_rejected"].includes(status)) {
    throw new Error("選考結果が不正です。");
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
            body: buildScreeningPassedHandoffMessage({
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
  const messageType = toText(formData.get("messageType")) as InterviewMessageType;
  await assertCanUseThread(user.id, threadId);

  const proposedAtText = toOptionalText(formData.get("proposedAt"));
  const body = toText(formData.get("body")) || proposedAtText || "";
  await prisma.$transaction(async (tx) => {
    await tx.interviewMessage.create({
      data: {
        interviewThreadId: threadId,
        senderUserId: user.id,
        messageType,
        body,
        proposedAt: proposedAtText ? new Date(proposedAtText) : null,
      },
    });
    if (messageType === "accepted_time" && proposedAtText) {
      await tx.interviewThread.update({
        where: { id: threadId },
        data: { status: "scheduled", scheduledAt: new Date(proposedAtText) },
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

function buildScreeningPassedHandoffMessage({
  companyName,
  freelancerName,
  jobTitle,
  proposedStart,
  contactPreference,
  selectionFlow,
  contractTerms,
}: {
  companyName: string;
  freelancerName: string;
  jobTitle: string;
  proposedStart?: string | null;
  contactPreference?: string | null;
  selectionFlow?: string | null;
  contractTerms?: string | null;
}) {
  return [
    `${freelancerName}さん`,
    "",
    `${jobTitle}へのご応募ありがとうございます。書類確認が完了しましたので、${companyName}と直接面談調整を進めさせてください。`,
    "",
    `応募時の開始目安: ${proposedStart || "面談で確認"}`,
    `応募時の連絡希望: ${contactPreference || "このチャットで調整"}`,
    `選考フロー: ${selectionFlow || "面談で確認"}`,
    `直接契約・支払い条件: ${contractTerms || "面談で確認"}`,
    "",
    "まずは候補日時と、面談前に確認したい条件があればこのチャットで共有してください。",
    companyName,
  ].join("\n");
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
