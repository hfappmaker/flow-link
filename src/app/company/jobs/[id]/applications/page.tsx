import Link from "next/link";
import type { LinkProps } from "next/link";
import { JobApplicationStatus, type Prisma } from "@prisma/client";
import { requireCompanyUser } from "@/lib/page-guards";
import { parseJobApplicationStatusFilter } from "@/lib/form-enums";
import { prisma } from "@/lib/prisma";
import { outcomeNextAction, outcomeTone, postInterviewOutcomeLabels } from "@/lib/post-interview-outcomes";
import { applicationStatusLabel, buildApplicationResponseState, buildApplicationReview, formatDateTime } from "@/lib/utils";
import {
  COMPANY_APPLICANT_KEYWORD_CANDIDATE_LIMIT,
  applicantKeywordCandidateWhere,
  filterApplicantsBySearchQuery,
} from "@/lib/company-applicant-search";
import { Shell, TopNav, PageHeader, Card, EmptyState, StatusBadge, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

const applicationStatusFilterValues = [
  JobApplicationStatus.applied,
  JobApplicationStatus.screening_passed,
  JobApplicationStatus.screening_rejected,
] as const satisfies readonly JobApplicationStatus[];

const statusTabs: Array<{ label: string; value: JobApplicationStatus | "all" }> = [
  { label: "すべて", value: "all" },
  { label: "未選考", value: JobApplicationStatus.applied },
  { label: "OK", value: JobApplicationStatus.screening_passed },
  { label: "NG", value: JobApplicationStatus.screening_rejected },
];

export default async function JobApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; q?: string; ready?: string; sort?: string }>;
}) {
  const { id } = await params;
  const filters = await searchParams;
  const selectedStatus = parseJobApplicationStatusFilter(filters.status, applicationStatusFilterValues);
  const keyword = filters.q?.trim() ?? "";
  const readyOnly = filters.ready === "interview";
  const selectedSort = filters.sort === "new" ? "new" : "review";
  const { user, companyUser } = await requireCompanyUser();
  const keywordCandidateWhere = applicantKeywordCandidateWhere(keyword);
  const applicationWhere: Prisma.JobApplicationWhereInput = {
    ...(selectedStatus !== "all" ? { status: selectedStatus } : {}),
    ...(keywordCandidateWhere ?? {}),
  };
  const job = await prisma.jobPost.findFirst({
    where: { id, companyProfileId: companyUser.companyProfileId },
    include: {
      applications: {
        where: applicationWhere,
        include: {
          freelancerProfile: {
            include: {
              careerHistory: true,
              documents: true,
            },
          },
          postInterviewOutcome: true,
        },
        orderBy: { appliedAt: "desc" },
        ...(keyword ? { take: COMPANY_APPLICANT_KEYWORD_CANDIDATE_LIMIT } : {}),
      },
      _count: { select: { applications: true } },
    },
  });
  const counts = job
    ? await prisma.jobApplication.groupBy({
        by: ["status"],
        where: { jobPostId: job.id },
        _count: { status: true },
      })
    : [];
  const countByStatus = new Map(counts.map((item) => [item.status, item._count.status]));
  const total = job?._count.applications ?? 0;
  const candidateApplications = job ? filterApplicantsBySearchQuery(job.applications, keyword) : [];
  const reviewedApplications =
    job
      ? candidateApplications
          .map((application) => ({
            application,
            responseState: buildApplicationResponseState(application),
            review: buildApplicationReview({ ...application, jobPost: job }),
          }))
          .filter(({ review }) => !readyOnly || review.isInterviewReady)
          .sort((a, b) => {
            if (selectedSort === "review") {
              return (
                b.responseState.priorityBoost - a.responseState.priorityBoost ||
                b.review.interviewReadinessPercent - a.review.interviewReadinessPercent ||
                b.application.appliedAt.getTime() - a.application.appliedAt.getTime()
              );
            }
            return b.application.appliedAt.getTime() - a.application.appliedAt.getTime();
          })
      : [];
  const appliedReviews =
    job
      ? candidateApplications.map((application) => ({
          responseState: buildApplicationResponseState(application),
          review: buildApplicationReview({ ...application, jobPost: job }),
        }))
      : [];
  const interviewReadyCount = appliedReviews.filter(({ review }) => review.isInterviewReady).length;
  const needsCheckCount = appliedReviews.filter(({ review }) => review.nextChecks.length > 0).length;
  const responseDueCount = appliedReviews.filter(({ responseState }) => responseState.priorityBoost >= 15).length;
  const highlightedApplications = reviewedApplications
    .filter(({ application, review }) => application.status === "applied" && review.isInterviewReady)
    .slice(0, 3);

  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-6xl px-5 py-8">
        <PageHeader title="応募者一覧" description={job?.title} />
        {job && (
          <Card className="mt-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <form className="grid gap-3 md:grid-cols-[1fr_150px_150px_auto_auto]" action={`/company/jobs/${job.id}/applications`}>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  候補者検索
                  <input
                    className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                    name="q"
                    defaultValue={keyword}
                    placeholder="氏名、職種、スキル、勤務地"
                  />
                </label>
                <input type="hidden" name="status" value={selectedStatus === "all" ? "" : selectedStatus} />
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  面談判断
                  <select
                    className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                    name="ready"
                    defaultValue={readyOnly ? "interview" : ""}
                  >
                    <option value="">すべて</option>
                    <option value="interview">面談候補のみ</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  並び順
                  <select
                    className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                    name="sort"
                    defaultValue={selectedSort}
                  >
                    <option value="review">対応期限順</option>
                    <option value="new">新着順</option>
                  </select>
                </label>
                <SubmitButton className="btn btn-primary self-end" pendingLabel="検索中">検索</SubmitButton>
                <Link className="btn btn-secondary self-end" href={`/company/jobs/${job.id}/applications`}>クリア</Link>
              </form>
              <div className="flex items-end text-sm text-stone-600">表示 {reviewedApplications.length} / 全応募 {total} 件</div>
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              <ReviewSignal label="面談候補" value={`${interviewReadyCount}件`} tone={interviewReadyCount > 0 ? "good" : "neutral"} />
              <ReviewSignal label="未選考" value={`${countByStatus.get("applied") ?? 0}件`} tone={(countByStatus.get("applied") ?? 0) > 0 ? "warn" : "neutral"} />
              <ReviewSignal label="対応期限" value={`${responseDueCount}件`} tone={responseDueCount > 0 ? "warn" : needsCheckCount > 0 ? "neutral" : "good"} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {statusTabs.map((tab) => {
                const href = applicationsHref(job.id, tab.value, keyword, readyOnly, selectedSort);
                const count = tab.value === "all" ? total : countByStatus.get(tab.value) ?? 0;
                return (
                  <Link
                    className={`rounded border px-3 py-2 text-sm font-semibold ${
                      selectedStatus === tab.value ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-600"
                    }`}
                    href={href}
                    key={tab.value}
                  >
                    {tab.label} {count}
                  </Link>
                );
              })}
            </div>
          </Card>
        )}
        {job && highlightedApplications.length > 0 && (
          <Card className="mt-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="font-semibold">面談候補ハイライト</h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  未選考の中で、応募内容・開始条件・書類が揃っている候補者です。先に確認すると面談調整へ進めやすくなります。
                </p>
              </div>
              <Link className="btn btn-secondary" href={`/company/jobs/${job.id}/applications?status=applied&ready=interview`}>
                面談候補だけ見る
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {highlightedApplications.map(({ application, responseState, review }) => (
                <HighlightedApplicationRow application={application} key={application.id} responseState={responseState} review={review} />
              ))}
            </div>
          </Card>
        )}
        <div className="mt-6 grid gap-4">
          {reviewedApplications.map(({ application, responseState, review }) => (
            <ApplicationCard application={application} key={application.id} responseState={responseState} review={review} />
          ))}
          {job && reviewedApplications.length === 0 && (
            <EmptyState
              title="条件に合う応募者はいません。"
              description="ステータスや検索キーワードを変えて確認してください。"
              action={<Link className="btn btn-secondary" href={`/company/jobs/${job.id}/applications`}>条件をクリア</Link>}
            />
          )}
          {!job && <EmptyState title="案件が見つかりません。" description="案件が削除されたか、閲覧権限がない可能性があります。" />}
        </div>
      </div>
    </Shell>
  );
}

type JobWithApplications = Prisma.JobPostGetPayload<{
  include: {
    applications: {
      include: {
        freelancerProfile: {
          include: {
            careerHistory: true;
            documents: true;
          };
        };
        postInterviewOutcome: true;
      };
    };
  };
}>;
type ApplicationWithProfile = JobWithApplications["applications"][number];

type ApplicationReview = {
  requiredSkillMatches: string[];
  matchPercent: number | null;
  interviewReadinessPercent: number;
  isInterviewReady: boolean;
  nextChecks: string[];
  reviewQuestions: string[];
};

function HighlightedApplicationRow({
  application,
  review,
  responseState,
}: {
  application: ApplicationWithProfile;
  review: ApplicationReview;
  responseState: ReturnType<typeof buildApplicationResponseState>;
}) {
  const startSignal =
    application.proposedStart ||
    application.freelancerProfile.availableFrom ||
    application.freelancerProfile.availability ||
    "未設定";
  const skillSignal =
    review.requiredSkillMatches.length > 0
      ? review.requiredSkillMatches.slice(0, 3).join("、")
      : "職務経歴で確認";

  return (
    <div className="grid gap-3 rounded border border-stone-200 bg-stone-50 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="good">面談判断 {review.interviewReadinessPercent}%</StatusBadge>
          <StatusBadge tone={responseState.tone}>{responseState.label}</StatusBadge>
          <StatusBadge tone={review.matchPercent === null ? "neutral" : review.matchPercent >= 50 ? "good" : "neutral"}>
            必須一致 {review.matchPercent === null ? "要確認" : `${review.matchPercent}%`}
          </StatusBadge>
          <StatusBadge tone="good">PDF {application.freelancerProfile.documents.length}/2</StatusBadge>
        </div>
        <h3 className="mt-2 font-semibold">{application.freelancerProfile.fullName}</h3>
        <p className="mt-1 text-sm text-stone-600">
          {application.freelancerProfile.desiredOccupation ?? "希望職種未設定"} / 開始目安: {startSignal}
        </p>
        <p className="mt-1 text-sm leading-6 text-stone-700">強みとして確認すること: {skillSignal}</p>
      </div>
      <Link className="btn btn-primary" href={`/company/applications/${application.id}`}>
        初回連絡を確認
      </Link>
    </div>
  );
}

function ApplicationCard({
  application,
  review,
  responseState,
}: {
  application: ApplicationWithProfile;
  review: ApplicationReview;
  responseState: ReturnType<typeof buildApplicationResponseState>;
}) {
  const startSignal =
    application.proposedStart ||
    application.freelancerProfile.availableFrom ||
    application.freelancerProfile.availability ||
    "未設定";
  const contactSignal = application.contactPreference || "面談判断後に調整";
  const rateSignal = application.freelancerProfile.desiredRate || "未設定";
  const nextReviewAction = buildApplicantReviewAction({
    status: application.status,
    isInterviewReady: review.isInterviewReady,
    nextChecks: review.nextChecks,
    hasContactSignal: Boolean(application.contactPreference),
    hasStartSignal: startSignal !== "未設定",
  });
  const outcome = application.postInterviewOutcome;

  return (
    <Card>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={application.status === "screening_passed" ? "good" : application.status === "screening_rejected" ? "bad" : "neutral"}>
              {applicationStatusLabel(application.status)}
            </StatusBadge>
            {application.status === "screening_passed" && (
              <StatusBadge tone={outcomeTone(outcome?.status)}>
                {postInterviewOutcomeLabels[outcome?.status ?? "waiting_company_decision"]}
              </StatusBadge>
            )}
            <StatusBadge tone={review.interviewReadinessPercent >= 80 ? "good" : review.interviewReadinessPercent >= 50 ? "neutral" : "warn"}>
              面談判断 {review.interviewReadinessPercent}%
            </StatusBadge>
            <StatusBadge tone={responseState.tone}>{responseState.label}</StatusBadge>
            <StatusBadge tone={review.matchPercent === null ? "neutral" : review.matchPercent >= 50 ? "good" : review.matchPercent > 0 ? "neutral" : "warn"}>
              必須一致 {review.matchPercent === null ? "要確認" : `${review.matchPercent}%`}
            </StatusBadge>
          </div>
          <h2 className="mt-2 font-semibold">{application.freelancerProfile.fullName}</h2>
          <p className="text-sm text-stone-500">{application.freelancerProfile.desiredOccupation ?? "希望職種未設定"}</p>
          {application.proposalMessage && (
            <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-stone-700">{application.proposalMessage}</p>
          )}
          {review.requiredSkillMatches.length > 0 && (
            <p className="mt-2 text-sm leading-6 text-stone-700">
              一致: {review.requiredSkillMatches.slice(0, 4).join("、")}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge tone={application.freelancerProfile.documents.length >= 2 ? "good" : "warn"}>
              PDF {application.freelancerProfile.documents.length}/2
            </StatusBadge>
            <StatusBadge tone={application.freelancerProfile.careerHistory ? "good" : "warn"}>
              職務経歴{application.freelancerProfile.careerHistory ? "あり" : "未登録"}
            </StatusBadge>
            <StatusBadge tone={application.proposalMessage ? "good" : "warn"}>
              提案文{application.proposalMessage ? "あり" : "未登録"}
            </StatusBadge>
            <StatusBadge>応募 {formatDateTime(application.appliedAt)}</StatusBadge>
          </div>
          <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
            <ApplicantSignal
              label="稼働開始目安"
              value={startSignal}
              tone={startSignal === "未設定" ? "warn" : "good"}
            />
            <ApplicantSignal
              label="連絡希望"
              value={contactSignal}
              tone={application.contactPreference ? "good" : "neutral"}
            />
            <ApplicantSignal
              label="希望単価"
              value={rateSignal}
              tone={application.freelancerProfile.desiredRate ? "good" : "warn"}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {review.nextChecks.length > 0 ? (
              review.nextChecks.slice(0, 3).map((check) => (
                <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800" key={check}>
                  確認: {check}
                </span>
              ))
            ) : (
              <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                面談前の確認点は揃っています
              </span>
            )}
          </div>
          <div className="mt-3 rounded border border-stone-200 bg-stone-50 p-3">
            <p className="text-xs font-medium text-stone-500">次の確認</p>
            <p className="mt-1 text-sm font-semibold text-stone-900">
              {outcome ? postInterviewOutcomeLabels[outcome.status] : nextReviewAction.title}
            </p>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              {outcome ? outcomeNextAction({ isCompany: true, outcome }) : nextReviewAction.description}
            </p>
            {application.status === "applied" && (
              <p className="mt-2 text-sm leading-6 text-stone-600">{responseState.detail}</p>
            )}
          </div>
          {review.reviewQuestions.length > 0 && (
            <div className="mt-3 rounded border border-emerald-100 bg-emerald-50/60 p-3">
              <p className="text-xs font-medium text-emerald-900">面談で確認すること</p>
              <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-stone-700">
                {review.reviewQuestions.slice(0, 3).map((question) => (
                  <li className="flex gap-2" key={question}>
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-700" />
                    <span>{question}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Link className="btn btn-primary shrink-0" href={`/company/applications/${application.id}`}>面談判断へ</Link>
      </div>
    </Card>
  );
}

function buildApplicantReviewAction({
  status,
  isInterviewReady,
  nextChecks,
  hasContactSignal,
  hasStartSignal,
}: {
  status: JobApplicationStatus;
  isInterviewReady: boolean;
  nextChecks: string[];
  hasContactSignal: boolean;
  hasStartSignal: boolean;
}) {
  if (status === "screening_passed") {
    return {
      title: "面談調整を確認",
      description: "候補日時、会議URL、面談前に確認したい条件を応募詳細から確認してください。",
    };
  }

  if (status === "screening_rejected") {
    return {
      title: "選考結果を確認済み",
      description: "必要に応じて企業内メモを残し、同じ案件の他応募者を確認してください。",
    };
  }

  if (isInterviewReady && hasStartSignal && hasContactSignal) {
    return {
      title: "面談へ進める判断",
      description: "応募内容、開始条件、連絡希望が揃っています。応募詳細で初回連絡文を確認してください。",
    };
  }

  if (!hasStartSignal) {
    return {
      title: "開始条件を確認",
      description: "稼働開始目安が未設定です。面談へ進める前に、応募詳細で確認事項として残してください。",
    };
  }

  if (!hasContactSignal) {
    return {
      title: "連絡希望を確認",
      description: "面談候補日時や連絡しやすい時間帯を、応募詳細の初回連絡文に含めて確認してください。",
    };
  }

  return {
    title: `${nextChecks[0] ?? "応募内容"}を確認`,
    description: "不足している確認点を応募詳細で見直してから、面談へ進めるか判断してください。",
  };
}

function ApplicantSignal({
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
    <div className={`rounded border px-3 py-2 ${toneClasses[tone]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 break-words font-semibold">{value}</p>
    </div>
  );
}

function ReviewSignal({
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
    <div className={`rounded border px-3 py-2 ${toneClasses[tone]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function applicationsHref(jobId: string, status: JobApplicationStatus | "all", keyword: string, readyOnly: boolean, sort: string): LinkProps["href"] {
  return {
    pathname: `/company/jobs/${jobId}/applications`,
    query: {
      ...(status !== "all" ? { status } : {}),
      ...(keyword ? { q: keyword } : {}),
      ...(readyOnly ? { ready: "interview" } : {}),
      ...(sort !== "review" ? { sort } : {}),
    },
  };
}
