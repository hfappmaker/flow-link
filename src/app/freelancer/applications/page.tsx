import Link from "next/link";
import type { LinkProps } from "next/link";
import { JobApplicationStatus } from "@prisma/client";
import { parseJobApplicationStatusFilter } from "@/lib/form-enums";
import { requireFreelancerProfile } from "@/lib/page-guards";
import { outcomeNextAction, outcomeTone, postInterviewOutcomeLabels } from "@/lib/post-interview-outcomes";
import { prisma } from "@/lib/prisma";
import { getFreelancerReadiness } from "@/lib/readiness";
import {
  applicationStatusLabel,
  directContractChecklist,
  formatDateTime,
  matchedSkills,
  parseSkills,
  skillMatchPercent,
} from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, EmptyState, StatusBadge, SubmitButton } from "@/components/ui";
import { SafetyReportPanel } from "@/components/safety-reporting";

export const dynamic = "force-dynamic";

const applicationStatusFilterValues = [
  JobApplicationStatus.applied,
  JobApplicationStatus.screening_passed,
  JobApplicationStatus.screening_rejected,
] as const satisfies readonly JobApplicationStatus[];

const statusTabs: Array<{ label: string; value: JobApplicationStatus | "all" }> = [
  { label: "すべて", value: "all" },
  { label: "選考中", value: JobApplicationStatus.applied },
  { label: "面談調整", value: JobApplicationStatus.screening_passed },
  { label: "見送り", value: JobApplicationStatus.screening_rejected },
];

export default async function FreelancerApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; action?: string; sort?: string; safetyReport?: string }>;
}) {
  const filters = await searchParams;
  const selectedStatus = parseJobApplicationStatusFilter(filters.status, applicationStatusFilterValues);
  const selectedAction = ["interview", "waiting", "final"].includes(filters.action ?? "") ? filters.action! : "";
  const selectedSort = filters.sort === "new" ? "new" : "priority";
  const { user, profile } = await requireFreelancerProfile({
    currentPath: "/freelancer/applications",
    include: {
      documents: true,
      careerHistory: true,
      applications: {
        include: { jobPost: { include: { companyProfile: true } }, interviewThread: true, postInterviewOutcome: true },
        orderBy: { appliedAt: "desc" },
      },
    },
  });
  const applicationIds = profile.applications.map((application) => application.id);
  const safetyReports =
    applicationIds.length > 0
      ? await prisma.companySafetyReport.findMany({
          where: {
            reporterUserId: user.id,
            jobApplicationId: { in: applicationIds },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];
  const safetyReportsByApplication = new Map<string, typeof safetyReports>();
  for (const report of safetyReports) {
    if (!report.jobApplicationId) continue;
    safetyReportsByApplication.set(report.jobApplicationId, [
      ...(safetyReportsByApplication.get(report.jobApplicationId) ?? []),
      report,
    ]);
  }
  const readiness = getFreelancerReadiness(profile);
  const applications =
    profile.applications.map((application) => {
      const contractReadiness = directContractChecklist(application.jobPost);
      const skillPercent = skillMatchPercent(application.jobPost.requiredSkills, profile.skills);
      const requiredSkills = parseSkills(application.jobPost.requiredSkills);
      const requiredSkillMatches = matchedSkills(application.jobPost.requiredSkills, profile.skills);
      const missingReadinessItems = readiness.items.filter((item) => !item.done);
      const nextAction = getApplicationNextAction({
        status: application.status,
        hasInterviewThread: Boolean(application.interviewThread),
        interviewStatus: application.interviewThread?.status,
        interviewHref: application.interviewThread ? `/interviews/${application.interviewThread.id}` : undefined,
        outcomeStatus: application.postInterviewOutcome?.status,
        outcomeNextActionText: outcomeNextAction({ isCompany: false, outcome: application.postInterviewOutcome }),
        hasMeetingUrl: Boolean(application.interviewThread?.meetingUrl),
        readinessComplete: readiness.isReady,
        contractReady: contractReadiness.isReady,
        missingReadinessLabel: missingReadinessItems[0]?.label,
        missingReadinessHref: missingReadinessItems[0]?.href,
      });
      const actionKey = getApplicationActionKey({
        status: application.status,
        hasInterviewThread: Boolean(application.interviewThread),
        interviewStatus: application.interviewThread?.status,
        hasMeetingUrl: Boolean(application.interviewThread?.meetingUrl),
      });

      return {
        application,
        actionKey,
        contractReadiness,
        nextAction,
        requiredSkillMatches,
        requiredSkills,
        skillPercent,
      };
    });
  const countByStatus = new Map<JobApplicationStatus, number>();
  for (const item of applications) {
    countByStatus.set(item.application.status, (countByStatus.get(item.application.status) ?? 0) + 1);
  }
  const filteredApplications = applications
    .filter(({ application }) => selectedStatus === "all" || application.status === selectedStatus)
    .filter(({ actionKey }) => !selectedAction || actionKey === selectedAction)
    .sort((a, b) => {
      if (selectedSort === "new") {
        return b.application.appliedAt.getTime() - a.application.appliedAt.getTime();
      }
      return (
        applicationPriority(b.actionKey) - applicationPriority(a.actionKey) ||
        b.application.appliedAt.getTime() - a.application.appliedAt.getTime()
      );
    });
  const actionCounts = applications.reduce(
    (counts, item) => ({
      ...counts,
      [item.actionKey]: counts[item.actionKey] + 1,
    }),
    { interview: 0, waiting: 0, final: 0, closed: 0 },
  );

  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-5xl px-5 py-8">
        <PageHeader
          title="応募済み案件"
          description="応募後の状況、面談調整、条件確認をここで整理できます。"
          action={<Link className="btn btn-secondary" href="/jobs">案件を探す</Link>}
        />
        {profile.applications.length > 0 && (
          <Card className="mt-6">
            <div className="grid gap-4 md:grid-cols-[1fr_220px] md:items-center">
              <div>
                <h2 className="font-semibold">応募後の進め方</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  書類選考中は応募内容と条件を確認し、書類選考OK後は面談チャットで候補日時と会議URLを揃えてください。
                </p>
              </div>
              <div className="rounded border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-medium text-stone-500">応募準備</p>
                <p className="mt-1 text-3xl font-semibold">{readiness.percent}%</p>
                <p className="mt-1 text-sm text-stone-600">
                  {readiness.completed}/{readiness.total}項目完了
                </p>
              </div>
            </div>
          </Card>
        )}
        {profile.applications.length > 0 && (
          <Card className="mt-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <form className="grid gap-3 md:grid-cols-[160px_170px_150px_auto_auto]" action="/freelancer/applications">
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  選考状況
                  <select
                    className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                    name="status"
                    defaultValue={selectedStatus === "all" ? "" : selectedStatus}
                  >
                    <option value="">すべて</option>
                    <option value="applied">選考中</option>
                    <option value="screening_passed">面談調整</option>
                    <option value="screening_rejected">見送り</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  次のアクション
                  <select
                    className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                    name="action"
                    defaultValue={selectedAction}
                  >
                    <option value="">すべて</option>
                    <option value="interview">面談調整が必要</option>
                    <option value="waiting">企業からの連絡待ち</option>
                    <option value="final">面談前の最終確認</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  並び順
                  <select
                    className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                    name="sort"
                    defaultValue={selectedSort}
                  >
                    <option value="priority">対応が必要な順</option>
                    <option value="new">新着順</option>
                  </select>
                </label>
                <SubmitButton className="btn btn-primary self-end" pendingLabel="絞り込み中">絞り込み</SubmitButton>
                <Link className="btn btn-secondary self-end" href="/freelancer/applications">クリア</Link>
              </form>
              <div className="flex items-end text-sm text-stone-600">
                表示 {filteredApplications.length} / 全応募 {profile.applications.length} 件
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              <ApplicationSignal
                label="面談調整が必要"
                value={`${actionCounts.interview}件`}
                tone={actionCounts.interview > 0 ? "warn" : "neutral"}
              />
              <ApplicationSignal
                label="企業からの連絡待ち"
                value={`${actionCounts.waiting}件`}
                tone={actionCounts.waiting > 0 ? "neutral" : "good"}
              />
              <ApplicationSignal
                label="面談前の最終確認"
                value={`${actionCounts.final}件`}
                tone={actionCounts.final > 0 ? "good" : "neutral"}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {statusTabs.map((tab) => {
                const count = tab.value === "all" ? profile.applications.length : countByStatus.get(tab.value) ?? 0;
                return (
                  <Link
                    className={`rounded border px-3 py-2 text-sm font-semibold ${
                      selectedStatus === tab.value ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-600"
                    }`}
                    href={freelancerApplicationsHref(tab.value, selectedAction, selectedSort)}
                    key={tab.value}
                  >
                    {tab.label} {count}
                  </Link>
                );
              })}
            </div>
          </Card>
        )}
        <div className="mt-6 grid gap-4">
          {filteredApplications.map(({ application, contractReadiness, nextAction, requiredSkillMatches, requiredSkills, skillPercent }) => {
            return (
              <Card key={application.id}>
                <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={application.status === "screening_passed" ? "good" : application.status === "screening_rejected" ? "bad" : "neutral"}>
                        {applicationStatusLabel(application.status)}
                      </StatusBadge>
                      {application.status === "screening_passed" && (
                        <StatusBadge tone={outcomeTone(application.postInterviewOutcome?.status)}>
                          {postInterviewOutcomeLabels[application.postInterviewOutcome?.status ?? "waiting_company_decision"]}
                        </StatusBadge>
                      )}
                      <StatusBadge>応募日時: {formatDateTime(application.appliedAt)}</StatusBadge>
                      {application.interviewThread?.scheduledAt && (
                        <StatusBadge tone="good">面談日時: {formatDateTime(application.interviewThread.scheduledAt)}</StatusBadge>
                      )}
                    </div>
                    <h2 className="mt-3 font-semibold">{application.jobPost.title}</h2>
                    <p className="text-sm text-stone-500">{application.jobPost.companyProfile.name}</p>
                    {application.proposalMessage && (
                      <p className="mt-3 line-clamp-2 max-w-3xl text-sm leading-6 text-stone-700">{application.proposalMessage}</p>
                    )}

                    <div className="mt-4 grid gap-2 md:grid-cols-3">
                      <ApplicationSignal
                        label="必須スキル"
                        value={skillPercent === null ? "未設定" : `${requiredSkillMatches.length}/${requiredSkills.length}`}
                        tone={skillPercent === null ? "neutral" : skillPercent >= 60 ? "good" : skillPercent > 0 ? "neutral" : "warn"}
                      />
                      <ApplicationSignal
                        label="応募準備"
                        value={`${readiness.percent}%`}
                        tone={readiness.isReady ? "good" : "warn"}
                      />
                      <ApplicationSignal
                        label="条件確認"
                        value={`${contractReadiness.percent}%`}
                        tone={contractReadiness.isReady ? "good" : contractReadiness.percent >= 60 ? "neutral" : "warn"}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {application.proposedStart && <StatusBadge>開始目安: {application.proposedStart}</StatusBadge>}
                      {application.contactPreference && <StatusBadge>連絡希望: {application.contactPreference}</StatusBadge>}
                      {application.interviewThread?.meetingUrl && <StatusBadge tone="good">会議URL共有済み</StatusBadge>}
                    </div>
                    <div className="mt-4">
                      <SafetyReportPanel
                        acknowledgement={filters.safetyReport === "submitted"}
                        compact
                        context={{
                          jobPostId: application.jobPost.id,
                          jobApplicationId: application.id,
                          interviewThreadId: application.interviewThread?.id,
                        }}
                        reports={safetyReportsByApplication.get(application.id)}
                        returnTo="/freelancer/applications"
                      />
                    </div>
                  </div>

                  <div className="rounded border border-stone-200 bg-stone-50 p-4">
                    <p className="text-xs font-medium text-stone-500">次のアクション</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-stone-800">{nextAction.title}</p>
                    <p className="mt-2 text-sm leading-6 text-stone-600">{nextAction.description}</p>
                    <div className="mt-4 grid gap-2">
                      <Link className={`btn ${nextAction.primary ? "btn-primary" : "btn-secondary"}`} href={nextAction.href}>
                        {nextAction.label}
                      </Link>
                      <Link className="btn btn-secondary" href={`/jobs/${application.jobPost.id}`}>案件条件を見る</Link>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
          {profile.applications.length === 0 && (
            <EmptyState
              title="応募はまだありません。"
              description="気になる案件を見つけたら、詳細ページから応募できます。"
              action={<Link className="btn btn-primary" href="/jobs">案件を見る</Link>}
            />
          )}
          {profile.applications.length > 0 && filteredApplications.length === 0 && (
            <EmptyState
              title="この条件で表示できる応募はありません。"
              description="選考状況や次のアクションの条件を外して確認してください。"
              action={<Link className="btn btn-secondary" href="/freelancer/applications">条件をクリア</Link>}
            />
          )}
        </div>
      </div>
    </Shell>
  );
}

function getApplicationNextAction({
  status,
  hasInterviewThread,
  interviewStatus,
  interviewHref,
  outcomeStatus,
  outcomeNextActionText,
  hasMeetingUrl,
  readinessComplete,
  contractReady,
  missingReadinessLabel,
  missingReadinessHref,
}: {
  status: string;
  hasInterviewThread: boolean;
  interviewStatus?: string;
  interviewHref?: string;
  outcomeStatus?: string;
  outcomeNextActionText?: string;
  hasMeetingUrl: boolean;
  readinessComplete: boolean;
  contractReady: boolean;
  missingReadinessLabel?: string;
  missingReadinessHref?: string;
}) {
  if (status === "screening_rejected") {
    return {
      title: "別の案件を検討",
      description: "応募内容を見直し、条件が合う案件へ切り替えましょう。",
      href: "/jobs",
      label: "案件を探す",
      primary: false,
    };
  }

  if (outcomeStatus) {
    return {
      title: postInterviewOutcomeLabels[outcomeStatus as keyof typeof postInterviewOutcomeLabels] ?? "面談後ステータス",
      description: outcomeNextActionText ?? "面談後の進捗を確認してください。",
      href: interviewHref ?? "/freelancer/applications",
      label: "面談後ステータスを確認",
      primary: outcomeStatus === "offer_sent" || outcomeStatus === "clarification_requested",
    };
  }

  if (hasInterviewThread) {
    if (interviewStatus === "scheduled" && hasMeetingUrl) {
      return {
        title: "面談前の最終確認",
        description: "面談日時と会議URLが揃っています。質問したい条件をチャットで整理してください。",
        href: interviewHref ?? "/freelancer/applications",
        label: "面談チャットを開く",
        primary: true,
      };
    }
    return {
      title: interviewStatus === "scheduled" ? "会議URLを確認" : "候補日時を調整",
      description:
        interviewStatus === "scheduled"
          ? "面談日時は確定済みです。会議URLと確認事項を揃えてください。"
          : "候補日時、連絡方法、面談前に確認したい条件を共有してください。",
      href: interviewHref ?? "/freelancer/applications",
      label: "面談チャットを開く",
      primary: true,
    };
  }

  if (!readinessComplete) {
    return {
      title: "応募書類を補強",
      description: `${missingReadinessLabel ?? "未完了項目"}を整えると、企業から追加確認が来たときにすぐ対応できます。`,
      href: missingReadinessHref ?? "/freelancer",
      label: "応募準備を確認",
      primary: false,
    };
  }

  if (!contractReady) {
    return {
      title: "条件確認を準備",
      description: "単価、稼働率、契約・支払い条件など、面談で確認したい点を応募内容と一緒に整理してください。",
      href: "/freelancer/applications",
      label: "応募一覧で確認",
      primary: false,
    };
  }

  return {
    title: "企業からの連絡待ち",
    description: "応募内容と条件は確認しやすい状態です。書類選考OK後は面談調整へ進みます。",
    href: "/freelancer/notifications",
    label: "通知を見る",
    primary: false,
  };
}

type ApplicationActionKey = "interview" | "waiting" | "final" | "closed";

function getApplicationActionKey({
  status,
  hasInterviewThread,
  interviewStatus,
  hasMeetingUrl,
}: {
  status: string;
  hasInterviewThread: boolean;
  interviewStatus?: string;
  hasMeetingUrl: boolean;
}): ApplicationActionKey {
  if (status === "screening_rejected") return "closed";
  if (hasInterviewThread && interviewStatus === "scheduled" && hasMeetingUrl) return "final";
  if (hasInterviewThread) return "interview";
  return "waiting";
}

function applicationPriority(actionKey: ApplicationActionKey) {
  const priorities: Record<ApplicationActionKey, number> = {
    interview: 4,
    final: 3,
    waiting: 2,
    closed: 1,
  };
  return priorities[actionKey];
}

function freelancerApplicationsHref(status: JobApplicationStatus | "all", action: string, sort: string): LinkProps["href"] {
  return {
    pathname: "/freelancer/applications",
    query: {
      ...(status !== "all" ? { status } : {}),
      ...(action ? { action } : {}),
      ...(sort !== "priority" ? { sort } : {}),
    },
  };
}

function ApplicationSignal({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "good" | "warn";
}) {
  const toneClasses = {
    neutral: "border-stone-200 bg-stone-50 text-stone-700",
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return (
    <div className={`rounded border px-3 py-2 text-sm ${toneClasses[tone]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
