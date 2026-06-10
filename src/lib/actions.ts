"use server";

import { put } from "@vercel/blob";
import {
  ApplicationStatus,
  CompanyVerificationKind,
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
import { evaluateSavedFeedJobAlerts, normalizeAlertCadence } from "@/lib/job-alerts";
import {
  parseApplicationStatus,
  parseCompanySafetyReportType,
  parseCompanyVerificationKind,
  parseInterviewMessageType,
  parseOptionalPostInterviewDeclineReason,
  parsePostInterviewOutcomeStatus,
  parseJobPostStatus,
  parseRecommendationFeedbackReason,
  parseResumeDocumentType,
  parseScreeningResultStatus,
  parseUserRole,
  parseWorkLocationMode,
  parseWorkPreferenceStatus,
} from "@/lib/form-enums";
import { prisma } from "@/lib/prisma";
import {
  recommendationFeedbackSentiment,
} from "@/lib/recommendation-feedback";
import { getApplicationReadiness, getJobPublishingReadiness, shouldHoldJobAsDraftForPublishing } from "@/lib/readiness";
import { loginErrorUrl } from "@/lib/registration-intent";
import { toOptionalText, toText } from "@/lib/utils";
import {
  applyToJobWorkflow,
  createCompanySafetyReportWorkflow,
  recordCompanyPostInterviewOutcomeWorkflow,
  recordFreelancerPostInterviewOutcomeWorkflow,
  screenApplicationWorkflow,
  sendInterviewMessageWorkflow,
  submitInteractionFeedbackWorkflow,
} from "@/lib/workflows";
import { companyOutcomeStatusValues, freelancerOutcomeStatusValues } from "@/lib/post-interview-outcomes";

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
    redirect(loginErrorUrl(callbackUrl));
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
      redirect(loginErrorUrl(callbackUrl));
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

export async function saveWorkPreference(formData: FormData) {
  const { profile } = await currentFreelancer();
  const excludedConditions = toOptionalText(formData.get("excludedConditions"));
  const privateNotes = toOptionalText(formData.get("privateNotes"));
  if ((excludedConditions?.length ?? 0) > 600 || (privateNotes?.length ?? 0) > 800) {
    throw new Error("避けたい条件は600文字以内、非公開メモは800文字以内で入力してください。");
  }

  await prisma.workPreference.upsert({
    where: { freelancerProfileId: profile.id },
    create: {
      freelancerProfileId: profile.id,
      status: parseWorkPreferenceStatus(formData.get("status")),
      targetRole: toOptionalText(formData.get("targetRole")),
      preferredSkills: toOptionalText(formData.get("preferredSkills")),
      targetRate: toOptionalText(formData.get("targetRate")),
      workload: toOptionalText(formData.get("workload")),
      locationMode: parseWorkLocationMode(formData.get("locationMode")),
      preferredLocation: toOptionalText(formData.get("preferredLocation")),
      availableFrom: toOptionalText(formData.get("availableFrom")),
      excludedConditions,
      notificationCadence: toOptionalText(formData.get("notificationCadence")),
      privateNotes,
      lastConfirmedAt: new Date(),
    },
    update: {
      status: parseWorkPreferenceStatus(formData.get("status")),
      targetRole: toOptionalText(formData.get("targetRole")),
      preferredSkills: toOptionalText(formData.get("preferredSkills")),
      targetRate: toOptionalText(formData.get("targetRate")),
      workload: toOptionalText(formData.get("workload")),
      locationMode: parseWorkLocationMode(formData.get("locationMode")),
      preferredLocation: toOptionalText(formData.get("preferredLocation")),
      availableFrom: toOptionalText(formData.get("availableFrom")),
      excludedConditions,
      notificationCadence: toOptionalText(formData.get("notificationCadence")),
      privateNotes,
      lastConfirmedAt: new Date(),
    },
  });

  revalidatePath("/freelancer/preferences");
  revalidatePath("/freelancer");
  revalidatePath("/jobs");
  revalidatePath("/freelancer/saved-jobs");
  redirect("/freelancer");
}

export async function saveCurrentJobSearch(formData: FormData) {
  const { profile } = await currentFreelancer();
  const name = toText(formData.get("name")) || "保存した仕事フィード";
  const returnTo = safeReturnPath(toText(formData.get("returnTo")) || "/jobs");
  if (name.length > 80) {
    throw new Error("保存フィード名は80文字以内で入力してください。");
  }

  await prisma.savedJobSearch.create({
    data: {
      freelancerProfileId: profile.id,
      name,
      query: toOptionalText(formData.get("q")),
      remote: formData.get("remote") === "remote",
      acceptingOnly: formData.get("accepting") === "open",
      directReadyOnly: formData.get("directReady") === "ready",
      fit: toOptionalText(formData.get("fit")),
      workload: toOptionalText(formData.get("workload")),
      rate: toOptionalText(formData.get("rate")),
      sort: toText(formData.get("sort")) === "new" ? "new" : "direct",
      notificationCadence: normalizeAlertCadence(formData.get("notificationCadence")),
    },
  });

  revalidatePath("/jobs");
  revalidatePath("/freelancer");
  revalidatePath("/freelancer/preferences");
  redirect(returnTo);
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

export async function submitCompanyVerificationRequest(formData: FormData) {
  const { companyUser } = await currentCompanyUser();
  const kind = parseCompanyVerificationKind(formData.get("kind"));
  const publicEvidenceUrl = toOptionalText(formData.get("publicEvidenceUrl"));
  const contactEvidence = toOptionalText(formData.get("contactEvidence"));
  const contractEvidence = toOptionalText(formData.get("contractEvidence"));
  const paymentEvidence = toOptionalText(formData.get("paymentEvidence"));
  const offPlatformPolicy = toOptionalText(formData.get("offPlatformPolicy"));
  const evidenceSummary = toText(formData.get("evidenceSummary"));
  const maxTextLength = 1000;
  if (
    [contactEvidence, contractEvidence, paymentEvidence, offPlatformPolicy, evidenceSummary].some(
      (value) => (value?.length ?? 0) > maxTextLength,
    )
  ) {
    throw new Error("確認リクエストの根拠は各1000文字以内で入力してください。");
  }
  if (!publicEvidenceUrl || !contactEvidence || !evidenceSummary) {
    throw new Error("公開URL、連絡窓口の根拠、提出内容の要約を入力してください。");
  }
  if (kind === CompanyVerificationKind.payment_policy && (!contractEvidence || !paymentEvidence || !offPlatformPolicy)) {
    throw new Error("支払い・契約方針の確認には、契約条件、支払い根拠、外部支払い依頼への対応方針が必要です。");
  }

  await prisma.companyVerificationRequest.create({
    data: {
      companyProfileId: companyUser.companyProfileId,
      requestedByCompanyUserId: companyUser.id,
      kind,
      publicEvidenceUrl,
      contactEvidence,
      contractEvidence,
      paymentEvidence,
      offPlatformPolicy,
      evidenceSummary,
    },
  });

  revalidatePath("/company/profile");
  revalidatePath("/company/verification");
  revalidatePath("/jobs");
  redirect("/company/profile?verification=submitted");
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
  const publishReadiness = getJobPublishingReadiness(data, companyUser.companyProfile);
  const heldAsDraft = shouldHoldJobAsDraftForPublishing(requestedStatus, publishReadiness);
  if (heldAsDraft) {
    data.status = JobPostStatus.draft;
    data.applicationStatus = ApplicationStatus.paused;
  }

  let savedJob;
  if (id) {
    savedJob = await prisma.jobPost.update({
      where: { id, companyProfileId: companyUser.companyProfileId },
      data,
    });
  } else {
    savedJob = await prisma.jobPost.create({ data });
  }

  if (savedJob.status === JobPostStatus.published && savedJob.applicationStatus === ApplicationStatus.open) {
    await evaluateSavedFeedJobAlerts(prisma, { jobPostId: savedJob.id });
  }

  revalidatePath("/company/jobs");
  revalidatePath("/freelancer/notifications");
  redirect(heldAsDraft ? "/company/jobs?publish=needs-conditions" : "/company/jobs");
}

export async function updateSavedJobSearch(formData: FormData) {
  const { profile } = await currentFreelancer();
  const id = toText(formData.get("savedJobSearchId"));
  const name = toText(formData.get("name")) || "保存した仕事フィード";
  if (name.length > 80) {
    throw new Error("保存フィード名は80文字以内で入力してください。");
  }

  await prisma.savedJobSearch.update({
    where: { id, freelancerProfileId: profile.id },
    data: {
      name,
      notificationCadence: normalizeAlertCadence(formData.get("notificationCadence")),
    },
  });

  revalidatePath("/freelancer/preferences");
  revalidatePath("/jobs");
}

export async function deleteSavedJobSearch(formData: FormData) {
  const { profile } = await currentFreelancer();
  await prisma.savedJobSearch.deleteMany({
    where: {
      id: toText(formData.get("savedJobSearchId")),
      freelancerProfileId: profile.id,
    },
  });

  revalidatePath("/freelancer/preferences");
  revalidatePath("/jobs");
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
  const profileForReadiness = await prisma.freelancerProfile.findUnique({
    where: { id: profile.id },
    include: { documents: true, careerHistory: true, workPreference: true },
  });
  const applicationReadiness = getApplicationReadiness(profileForReadiness, {
    proposalMessage,
    proposedStart,
    contactPreference,
  });
  if (!applicationReadiness.isReady) {
    throw new Error(`応募前に${applicationReadiness.missingRequired.map((item) => item.label).join("、")}を登録してください。`);
  }
  await applyToJobWorkflow(prisma, {
    freelancerProfileId: profile.id,
    jobPostId,
    proposalMessage,
    proposedStart,
    contactPreference,
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

export async function submitRecommendationFeedback(formData: FormData) {
  const { profile } = await currentFreelancer();
  const jobPostId = toText(formData.get("jobPostId"));
  const returnTo = safeReturnPath(toText(formData.get("returnTo")) || "/jobs");
  const reason = parseRecommendationFeedbackReason(formData.get("reason"));
  const note = toOptionalText(formData.get("note"));
  const source = toText(formData.get("source")) || "unknown";
  const sourceContext = toOptionalText(formData.get("sourceContext"));
  const visibleReasons = toOptionalText(formData.get("visibleReasons"));
  if ((note?.length ?? 0) > 400 || (sourceContext?.length ?? 0) > 1200 || (visibleReasons?.length ?? 0) > 1200) {
    throw new Error("推薦フィードバックの入力内容が長すぎます。");
  }

  const job = await prisma.jobPost.findFirst({
    where: { id: jobPostId, status: "published" },
    select: { id: true },
  });
  if (!job) throw new Error("フィードバックできる案件が見つかりません。");

  const existingApplication = await prisma.jobApplication.findUnique({
    where: {
      jobPostId_freelancerProfileId: {
        freelancerProfileId: profile.id,
        jobPostId,
      },
    },
    select: { id: true },
  });
  if (existingApplication) throw new Error("応募済み案件は応募履歴で管理してください。");

  await prisma.recommendationFeedback.upsert({
    where: {
      freelancerProfileId_jobPostId: {
        freelancerProfileId: profile.id,
        jobPostId,
      },
    },
    create: {
      freelancerProfileId: profile.id,
      jobPostId,
      reason,
      sentiment: recommendationFeedbackSentiment(reason),
      hideSimilar: reason === "hide_similar",
      visibleReasons,
      source,
      sourceContext,
      note,
    },
    update: {
      reason,
      sentiment: recommendationFeedbackSentiment(reason),
      hideSimilar: reason === "hide_similar",
      visibleReasons,
      source,
      sourceContext,
      note,
    },
  });

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobPostId}`);
  revalidatePath("/freelancer");
  revalidatePath("/freelancer/saved-jobs");
  revalidatePath("/company/jobs");
  revalidatePath(`/company/jobs/${jobPostId}`);
  redirect(returnTo);
}

export async function submitCompanySafetyReport(formData: FormData) {
  const { user, profile } = await currentFreelancer();
  const reportType = parseCompanySafetyReportType(formData.get("reportType"));
  const detail = toText(formData.get("detail"));
  const returnTo = safetyReportReturnPath(safeReturnPath(toText(formData.get("returnTo")) || "/freelancer/applications"));
  const jobPostId = toOptionalText(formData.get("jobPostId"));
  const jobApplicationId = toOptionalText(formData.get("jobApplicationId"));
  const interviewThreadId = toOptionalText(formData.get("interviewThreadId"));

  if (detail.length < 20 || detail.length > 1200) {
    throw new Error("安全性レポートの詳細は20文字以上1200文字以内で入力してください。");
  }

  const context = await resolveSafetyReportContext({
    freelancerProfileId: profile.id,
    jobPostId,
    jobApplicationId,
    interviewThreadId,
  });

  await createCompanySafetyReportWorkflow(prisma, {
    companyProfileId: context.companyProfileId,
    reporterUserId: user.id,
    jobPostId: context.jobPostId,
    jobApplicationId: context.jobApplicationId,
    interviewThreadId: context.interviewThreadId,
    reportType,
    detail,
  });

  revalidatePath("/jobs");
  if (context.jobPostId) revalidatePath(`/jobs/${context.jobPostId}`);
  revalidatePath("/freelancer/applications");
  if (context.interviewThreadId) revalidatePath(`/interviews/${context.interviewThreadId}`);
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
  const { interviewThreadId } = await screenApplicationWorkflow(prisma, {
    applicationId,
    status,
    handoffMessage,
    application,
    companyUser,
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
  await sendInterviewMessageWorkflow(prisma, {
    threadId,
    senderUserId: user.id,
    messageType,
    body,
    proposedAt,
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
  const followThroughRating = parseRating(formData.get("followThroughRating"), "返信・フォローの評価を選択してください。");
  const collaborationRating = parseRating(formData.get("collaborationRating"), "協働しやすさの評価を選択してください。");
  const privateNote = toOptionalText(formData.get("privateNote"));
  if ((privateNote?.length ?? 0) > 800) {
    throw new Error("非公開メモは800文字以内で入力してください。");
  }
  const moderationStatus = formData.get("needsModeration") === "on"
    ? InteractionFeedbackModerationStatus.reported
    : InteractionFeedbackModerationStatus.visible;
  await submitInteractionFeedbackWorkflow(prisma, {
    thread,
    authorUserId: user.id,
    followThroughRating,
    collaborationRating,
    interactionCompleted: formData.get("interactionCompleted") === "on",
    wouldWorkAgain: parseOptionalBoolean(formData.get("wouldWorkAgain")),
    privateNote,
    moderationStatus,
  });

  revalidatePath(`/interviews/${threadId}`);
  revalidatePath(`/jobs/${thread.jobApplication.jobPostId}`);
  revalidatePath(`/company/applications/${thread.jobApplicationId}`);
  revalidatePath(`/company/jobs/${thread.jobApplication.jobPostId}/applications`);
}

export async function recordCompanyPostInterviewOutcome(formData: FormData) {
  const { companyUser } = await currentCompanyUser();
  const threadId = toText(formData.get("threadId"));
  const thread = await assertCanUseThread(companyUser.userId, threadId);
  if (thread.jobApplication.jobPost.companyProfileId !== companyUser.companyProfileId) {
    throw new Error("この面談結果は更新できません。");
  }

  const status = parsePostInterviewOutcomeStatus(formData.get("status"), companyOutcomeStatusValues);
  const textFields = outcomeTextFields(formData);
  await recordCompanyPostInterviewOutcomeWorkflow(prisma, {
    jobApplicationId: thread.jobApplicationId,
    jobPostId: thread.jobApplication.jobPostId,
    status,
    ...textFields,
    declineReason: parseOptionalPostInterviewDeclineReason(formData.get("declineReason")),
    jobPostAction: parseJobPostAction(formData.get("jobPostAction")),
  });

  revalidateOutcomePaths(threadId, thread.jobApplicationId, thread.jobApplication.jobPostId);
}

export async function recordFreelancerPostInterviewOutcome(formData: FormData) {
  const { profile } = await currentFreelancer();
  const threadId = toText(formData.get("threadId"));
  const thread = await assertCanUseThread(profile.userId, threadId);
  if (thread.jobApplication.freelancerProfileId !== profile.id) {
    throw new Error("この面談結果は更新できません。");
  }

  const status = parsePostInterviewOutcomeStatus(formData.get("status"), freelancerOutcomeStatusValues);
  const textFields = outcomeTextFields(formData);
  await recordFreelancerPostInterviewOutcomeWorkflow(prisma, {
    jobApplicationId: thread.jobApplicationId,
    status,
    declineReason: parseOptionalPostInterviewDeclineReason(formData.get("declineReason")),
    agreedStartDate: textFields.agreedStartDate,
    agreedRate: textFields.agreedRate,
    agreedWorkload: textFields.agreedWorkload,
    externalConfirmationNeeded: textFields.externalConfirmationNeeded,
    privateOutcomeNote: textFields.privateOutcomeNote,
  });

  revalidateOutcomePaths(threadId, thread.jobApplicationId, thread.jobApplication.jobPostId);
}

function outcomeTextFields(formData: FormData) {
  const fields = {
    proposedStartDate: toOptionalText(formData.get("proposedStartDate")),
    agreedStartDate: toOptionalText(formData.get("agreedStartDate")),
    agreedRate: toOptionalText(formData.get("agreedRate")),
    agreedWorkload: toOptionalText(formData.get("agreedWorkload")),
    contractPaymentNotes: toOptionalText(formData.get("contractPaymentNotes")),
    externalConfirmationNeeded: toOptionalText(formData.get("externalConfirmationNeeded")),
    responseDeadline: toOptionalText(formData.get("responseDeadline")),
    privateOutcomeNote: toOptionalText(formData.get("privateOutcomeNote")),
  };
  const tooLong = Object.entries(fields).find(([, value]) => (value?.length ?? 0) > 800);
  if (tooLong) throw new Error("面談後ステータスの入力内容は各800文字以内で入力してください。");
  return fields;
}

function parseJobPostAction(value: FormDataEntryValue | null) {
  const text = toText(value);
  if (text === "pause_applications" || text === "close_job") return text;
  return "keep_open";
}

function revalidateOutcomePaths(threadId: string, applicationId: string, jobPostId: string) {
  revalidatePath(`/interviews/${threadId}`);
  revalidatePath(`/company/applications/${applicationId}`);
  revalidatePath(`/company/jobs/${jobPostId}/applications`);
  revalidatePath("/freelancer/applications");
  revalidatePath("/company/jobs");
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

function safetyReportReturnPath(value: string) {
  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}safetyReport=submitted`;
}

async function resolveSafetyReportContext({
  freelancerProfileId,
  jobPostId,
  jobApplicationId,
  interviewThreadId,
}: {
  freelancerProfileId: string;
  jobPostId: string | null;
  jobApplicationId: string | null;
  interviewThreadId: string | null;
}) {
  if (interviewThreadId) {
    const thread = await prisma.interviewThread.findFirst({
      where: {
        id: interviewThreadId,
        jobApplication: { freelancerProfileId },
      },
      select: {
        id: true,
        jobApplicationId: true,
        jobApplication: {
          select: {
            jobPostId: true,
            jobPost: { select: { companyProfileId: true } },
          },
        },
      },
    });
    if (!thread) throw new Error("安全性レポートを送信できる面談が見つかりません。");
    return {
      companyProfileId: thread.jobApplication.jobPost.companyProfileId,
      jobPostId: thread.jobApplication.jobPostId,
      jobApplicationId: thread.jobApplicationId,
      interviewThreadId: thread.id,
    };
  }

  if (jobApplicationId) {
    const application = await prisma.jobApplication.findFirst({
      where: { id: jobApplicationId, freelancerProfileId },
      select: {
        id: true,
        jobPostId: true,
        interviewThread: { select: { id: true } },
        jobPost: { select: { companyProfileId: true } },
      },
    });
    if (!application) throw new Error("安全性レポートを送信できる応募が見つかりません。");
    return {
      companyProfileId: application.jobPost.companyProfileId,
      jobPostId: application.jobPostId,
      jobApplicationId: application.id,
      interviewThreadId: application.interviewThread?.id ?? null,
    };
  }

  if (jobPostId) {
    const job = await prisma.jobPost.findFirst({
      where: { id: jobPostId, status: "published" },
      select: { id: true, companyProfileId: true },
    });
    if (!job) throw new Error("安全性レポートを送信できる案件が見つかりません。");
    return {
      companyProfileId: job.companyProfileId,
      jobPostId: job.id,
      jobApplicationId: null,
      interviewThreadId: null,
    };
  }

  throw new Error("安全性レポートの対象を確認してください。");
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
