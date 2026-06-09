import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const passwordHash = await hash("codex-triage-password", 8);
const now = new Date("2026-06-09T00:00:00.000Z");

async function main() {
  await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: "@codex-triage.local",
      },
    },
  });

  const trustedCompanyUser = await createCompanyUser({
    email: "codex-triage-trusted-company@codex-triage.local",
    companyName: "Codex Triage Trusted Studio",
    description: "支払い条件と連絡窓口が確認済みの検証用企業です。",
    websiteUrl: "https://example.com/trusted-studio",
    contactTeam: "採用チーム",
    operatingArea: "全国・リモート中心",
    paymentPolicy: "月末締め翌月末払い。契約前に条件を明示します。",
    reviewed: true,
  });

  const unverifiedCompanyUser = await createCompanyUser({
    email: "codex-triage-unverified-company@codex-triage.local",
    companyName: "Codex Triage New Company",
    description: "確認情報が不足している検証用企業です。",
    websiteUrl: "https://example.com/new-company",
    contactTeam: null,
    operatingArea: "首都圏",
    paymentPolicy: null,
    reviewed: false,
  });

  const readyFreelancer = await createFreelancer({
    email: "codex-triage-ready-freelancer@codex-triage.local",
    fullName: "Codex Triage Ready Freelancer",
    desiredOccupation: "React / Next.js エンジニア",
    skills: "React, Next.js, TypeScript, Prisma",
    yearsOfExperience: 7,
    desiredRate: "月80万円以上",
    availability: "週4日",
    availableFrom: "2026年7月",
    preferredLocation: "東京またはリモート",
    remotePreference: "リモート中心",
    withDocuments: true,
    withCareerHistory: true,
    withWorkPreference: true,
  });

  const incompleteFreelancer = await createFreelancer({
    email: "codex-triage-incomplete-freelancer@codex-triage.local",
    fullName: "Codex Triage Incomplete Freelancer",
    desiredOccupation: "UI実装エンジニア",
    skills: "React, CSS",
    yearsOfExperience: 3,
    desiredRate: null,
    availability: null,
    availableFrom: null,
    preferredLocation: null,
    remotePreference: null,
    withDocuments: false,
    withCareerHistory: false,
    withWorkPreference: false,
  });

  const conditionFreelancer = await createFreelancer({
    email: "codex-triage-conditions-freelancer@codex-triage.local",
    fullName: "Codex Triage Conditions Freelancer",
    desiredOccupation: "プロダクト改善エンジニア",
    skills: "TypeScript, UX, Design System",
    yearsOfExperience: 5,
    desiredRate: "月70万円以上",
    availability: "週2-3日",
    availableFrom: "即日",
    preferredLocation: "フルリモート",
    remotePreference: "フルリモートのみ",
    withDocuments: true,
    withCareerHistory: true,
    withWorkPreference: true,
  });

  const jobs = await createJobs({
    trustedCompanyProfileId: trustedCompanyUser.companyUser.companyProfileId,
    unverifiedCompanyProfileId: unverifiedCompanyUser.companyUser.companyProfileId,
  });

  await prisma.savedJob.createMany({
    data: [
      {
        freelancerProfileId: readyFreelancer.freelancer.id,
        jobPostId: jobs.completeRemote.id,
        note: "条件が揃っていて応募候補",
      },
      {
        freelancerProfileId: conditionFreelancer.freelancer.id,
        jobPostId: jobs.partTimeRemote.id,
        note: "週2-3日で条件が近い",
      },
    ],
  });

  await prisma.savedJobSearch.create({
    data: {
      freelancerProfileId: readyFreelancer.freelancer.id,
      name: "Codex Triage React Remote",
      query: "React",
      remote: true,
      acceptingOnly: true,
      directReadyOnly: true,
      workload: "週4日",
      rate: "80万円以上",
      sort: "direct",
      notificationCadence: "weekly",
    },
  });

  await createApplication({
    jobPostId: jobs.completeRemote.id,
    freelancerProfileId: readyFreelancer.freelancer.id,
    status: "screening_passed",
    screenedByCompanyUserId: trustedCompanyUser.companyUser.id,
    thread: true,
    senderUserId: trustedCompanyUser.id,
  });

  await createApplication({
    jobPostId: jobs.incompleteTrust.id,
    freelancerProfileId: conditionFreelancer.freelancer.id,
    status: "applied",
    screenedByCompanyUserId: null,
    thread: false,
    senderUserId: null,
  });

  await createApplication({
    jobPostId: jobs.highRateOnsite.id,
    freelancerProfileId: incompleteFreelancer.freelancer.id,
    status: "screening_rejected",
    screenedByCompanyUserId: trustedCompanyUser.companyUser.id,
    thread: false,
    senderUserId: null,
  });

  await prisma.recommendationFeedback.create({
    data: {
      freelancerProfileId: readyFreelancer.freelancer.id,
      jobPostId: jobs.completeRemote.id,
      reason: "good_fit",
      sentiment: "positive",
      hideSimilar: false,
      visibleReasons: "React/Next.js とリモート条件が一致",
      source: "codex-triage-seed",
      sourceContext: "standard seeded recommendation",
    },
  });

  await prisma.companyVerificationRequest.create({
    data: {
      companyProfileId: trustedCompanyUser.companyUser.companyProfileId,
      requestedByCompanyUserId: trustedCompanyUser.companyUser.id,
      kind: "payment_policy",
      status: "confirmed",
      publicEvidenceUrl: "https://example.com/trusted-studio/payment",
      paymentEvidence: "支払いサイトと契約条件のサンプルを確認済み",
      evidenceSummary: "支払い条件の公開情報と契約前説明フローを確認済み",
      confirmedScope: "支払い条件の明示",
      reviewedAt: now,
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    },
  });

  console.log("Seeded Codex triage data", {
    users: 5,
    jobs: Object.keys(jobs).length,
    applications: 3,
  });
}

async function createCompanyUser({
  email,
  companyName,
  description,
  websiteUrl,
  contactTeam,
  operatingArea,
  paymentPolicy,
  reviewed,
}) {
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      role: "company_user",
      companyUser: {
        create: {
          role: "admin",
          companyProfile: {
            create: {
              name: companyName,
              description,
              websiteUrl,
              contactTeam,
              operatingArea,
              paymentPolicy,
              flowLinkReviewedCompanyAt: reviewed ? now : null,
              flowLinkReviewedCompanyScope: reviewed ? "公開サイトと連絡窓口" : null,
              flowLinkReviewedPaymentAt: reviewed ? now : null,
              flowLinkReviewedPaymentScope: reviewed ? "支払い条件の明示" : null,
            },
          },
        },
      },
    },
    include: {
      companyUser: true,
    },
  });
}

async function createFreelancer({
  email,
  fullName,
  desiredOccupation,
  skills,
  yearsOfExperience,
  desiredRate,
  availability,
  availableFrom,
  preferredLocation,
  remotePreference,
  withDocuments,
  withCareerHistory,
  withWorkPreference,
}) {
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      role: "freelancer",
      freelancer: {
        create: {
          fullName,
          desiredOccupation,
          skills,
          yearsOfExperience,
          desiredRate,
          availability,
          availableFrom,
          preferredLocation,
          remotePreference,
          documents: withDocuments
            ? {
                create: [
                  {
                    documentType: "resume",
                    fileUrl: "https://example.com/codex-triage/resume.pdf",
                    originalFilename: "codex-triage-resume.pdf",
                  },
                  {
                    documentType: "career_history",
                    fileUrl: "https://example.com/codex-triage/career-history.pdf",
                    originalFilename: "codex-triage-career-history.pdf",
                  },
                ],
              }
            : undefined,
          careerHistory: withCareerHistory
            ? {
                create: {
                  summary: "SaaS と業務アプリの設計・実装を担当。",
                  workExperiences: "React / Next.js / TypeScript の開発経験。",
                  projects: "検索体験、応募導線、管理画面の改善。",
                  certifications: "なし",
                  education: "情報工学",
                },
              }
            : undefined,
          workPreference: withWorkPreference
            ? {
                create: {
                  status: "active",
                  targetRole: desiredOccupation,
                  preferredSkills: skills,
                  targetRate: desiredRate,
                  workload: availability,
                  locationMode: remotePreference?.includes("リモート") ? "remote" : "flexible",
                  preferredLocation,
                  availableFrom,
                  excludedConditions: "常駐必須は不可",
                  notificationCadence: "weekly",
                  privateNotes: "Codex triage seed",
                  lastConfirmedAt: now,
                },
              }
            : undefined,
        },
      },
    },
    include: {
      freelancer: true,
    },
  });
}

async function createJobs({ trustedCompanyProfileId, unverifiedCompanyProfileId }) {
  const completeRemote = await prisma.jobPost.create({
    data: {
      companyProfileId: trustedCompanyProfileId,
      title: "Codex Triage React Remote Platform",
      description: "Next.js と Prisma を使った応募体験改善の案件です。",
      requiredSkills: "React, Next.js, TypeScript",
      preferredSkills: "Prisma, UX改善",
      rate: "月90万円",
      workload: "週4日",
      contractPeriod: "3ヶ月更新",
      selectionFlow: "書類確認、面談1回",
      contractTerms: "準委任、月末締め翌月末払い",
      location: "東京またはリモート",
      remotePolicy: "リモート可",
      openings: 2,
      status: "published",
      applicationStatus: "open",
    },
  });

  const incompleteTrust = await prisma.jobPost.create({
    data: {
      companyProfileId: unverifiedCompanyProfileId,
      title: "Codex Triage Early Stage Dashboard",
      description: "業務ダッシュボードの初期開発支援です。",
      requiredSkills: "TypeScript, UI",
      preferredSkills: "Design System",
      rate: null,
      workload: "週3日",
      contractPeriod: null,
      selectionFlow: "面談後に相談",
      contractTerms: null,
      location: "首都圏",
      remotePolicy: "一部リモート",
      openings: 1,
      status: "published",
      applicationStatus: "open",
    },
  });

  const partTimeRemote = await prisma.jobPost.create({
    data: {
      companyProfileId: trustedCompanyProfileId,
      title: "Codex Triage Part-time UX Engineer",
      description: "応募導線と空状態を改善する週2-3日の案件です。",
      requiredSkills: "TypeScript, UX, React",
      preferredSkills: "Playwright",
      rate: "月70万円",
      workload: "週2-3日",
      contractPeriod: "2ヶ月",
      selectionFlow: "書類確認、面談1回",
      contractTerms: "準委任",
      location: "フルリモート",
      remotePolicy: "フルリモート",
      openings: 1,
      status: "published",
      applicationStatus: "open",
    },
  });

  const highRateOnsite = await prisma.jobPost.create({
    data: {
      companyProfileId: trustedCompanyProfileId,
      title: "Codex Triage High Rate Onsite",
      description: "高単価だが常駐条件の案件です。",
      requiredSkills: "Next.js, Architecture",
      preferredSkills: "PostgreSQL",
      rate: "月120万円",
      workload: "週5日",
      contractPeriod: "6ヶ月",
      selectionFlow: "面談2回",
      contractTerms: "準委任",
      location: "東京都内",
      remotePolicy: "常駐",
      openings: 1,
      status: "published",
      applicationStatus: "open",
    },
  });

  const closedJob = await prisma.jobPost.create({
    data: {
      companyProfileId: unverifiedCompanyProfileId,
      title: "Codex Triage Closed Listing",
      description: "募集停止状態の見え方を確認する案件です。",
      requiredSkills: "React",
      rate: "月60万円",
      workload: "週3日",
      location: "大阪",
      remotePolicy: "リモート可",
      status: "closed",
      applicationStatus: "paused",
    },
  });

  const draftJob = await prisma.jobPost.create({
    data: {
      companyProfileId: trustedCompanyProfileId,
      title: "Codex Triage Draft Listing",
      description: "企業側の下書き状態を確認する案件です。",
      requiredSkills: "TypeScript",
      status: "draft",
      applicationStatus: "paused",
    },
  });

  return {
    completeRemote,
    incompleteTrust,
    partTimeRemote,
    highRateOnsite,
    closedJob,
    draftJob,
  };
}

async function createApplication({
  jobPostId,
  freelancerProfileId,
  status,
  screenedByCompanyUserId,
  thread,
  senderUserId,
}) {
  const application = await prisma.jobApplication.create({
    data: {
      jobPostId,
      freelancerProfileId,
      status,
      proposalMessage: "Codex triage seed application",
      proposedStart: "2026年7月",
      contactPreference: "メール",
      screenedAt: screenedByCompanyUserId ? now : null,
      screenedByCompanyUserId,
    },
  });

  if (!thread || !senderUserId) {
    return application;
  }

  await prisma.interviewThread.create({
    data: {
      jobApplicationId: application.id,
      status: "scheduled",
      scheduledAt: new Date("2026-07-01T10:00:00.000Z"),
      meetingUrl: "https://example.com/codex-triage-meeting",
      messages: {
        create: [
          {
            senderUserId,
            messageType: "text",
            body: "面談候補日を確認しました。",
          },
        ],
      },
    },
  });

  return application;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
