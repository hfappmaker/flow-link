import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { logoutUser } from "@/lib/actions";
import {
  buildJobRecommendation,
  rankJobRecommendations,
  sortJobRecommendations,
} from "@/lib/job-recommendations";
import { requireFreelancerProfile } from "@/lib/page-guards";
import { prisma } from "@/lib/prisma";
import { getFreelancerReadiness } from "@/lib/readiness";
import {
  directContractChecklist,
  formatDateTime,
  visiblePreferenceReasons,
  workPreferenceCompleteness,
} from "@/lib/utils";
import { Shell, TopNav, PageHeader, StatCard, Card, EmptyState, StatusBadge, icons } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FreelancerDashboard() {
  const { user, profile } = await requireFreelancerProfile({
    currentPath: "/freelancer",
    include: {
      applications: true,
      documents: true,
      careerHistory: true,
      savedJobs: {
        include: { jobPost: { include: { companyProfile: { include: { verificationRequests: true } } } } },
        orderBy: { createdAt: "desc" },
      },
      savedJobSearches: { orderBy: { createdAt: "desc" }, take: 3 },
      workPreference: true,
      _count: { select: { savedJobs: true } },
    },
  });
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  const interviewQueue = await prisma.jobApplication.findMany({
    where: {
      status: "screening_passed",
      freelancerProfile: { userId: user.id },
      OR: [
        { interviewThread: { is: null } },
        { interviewThread: { is: { status: "open" } } },
        { interviewThread: { is: { meetingUrl: null } } },
      ],
    },
    include: {
      jobPost: { include: { companyProfile: true } },
      interviewThread: {
        include: {
          messages: {
            where: { messageType: "proposed_time", proposedAt: { not: null } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { screenedAt: "desc" },
    take: 5,
  });
  const readiness = getFreelancerReadiness(profile);
  const preferenceCompleteness = workPreferenceCompleteness(profile.workPreference);
  const appliedJobIds = new Set(profile.applications.map((application) => application.jobPostId));
  const savedJobIds = new Set(profile.savedJobs.map((savedJob) => savedJob.jobPostId));
  const recommendationCandidates = await prisma.jobPost.findMany({
    where: {
      status: "published",
      applicationStatus: "open",
      id: { notIn: Array.from(appliedJobIds) },
    },
    include: { companyProfile: { include: { verificationRequests: true } } },
    orderBy: { createdAt: "desc" },
  });
  const recommendedJobs = rankJobRecommendations(recommendationCandidates, {
    appliedJobIds,
    freelancerReadinessPercent: readiness.percent,
    freelancerSkills: profile.skills,
    savedJobIds,
    workPreference: profile.workPreference,
  }).slice(0, 3);
  const savedJobByJobId = new Map(profile.savedJobs.map((savedJob) => [savedJob.jobPostId, savedJob]));
  const rankedSavedJobs = sortJobRecommendations(
    profile.savedJobs.map((savedJob) => buildJobRecommendation(savedJob.jobPost, {
      appliedJobIds,
      freelancerReadinessPercent: readiness.percent,
      freelancerSkills: profile.skills,
      savedJobIds,
      workPreference: profile.workPreference,
    }, { preferenceReasonLimit: 3 })),
  )
    .map((recommendation) => {
      const savedJob = savedJobByJobId.get(recommendation.job.id);
      return savedJob ? { savedJob, recommendation } : null;
    })
    .filter((item) => item !== null);

  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-7xl px-5 py-8">
        <PageHeader
          title="フリーランス ダッシュボード"
          description="プロフィール、書類、応募状況、選考結果を管理します。"
          action={<form action={logoutUser}><button className="btn btn-secondary">ログアウト</button></form>}
        />
        <div className="mt-6 grid gap-4 md:grid-cols-5">
          <StatCard label="応募数" value={profile.applications.length} icon={icons.jobs} />
          <StatCard label="登録書類" value={profile.documents.length} icon={icons.files} />
          <StatCard label="未読通知" value={unread} icon={icons.ok} />
          <StatCard label="面談調整" value={interviewQueue.length} icon={icons.chat} />
          <StatCard label="検討リスト" value={profile._count.savedJobs} icon={icons.ok} />
        </div>
        <Card className="mt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">応募準備チェック</h2>
              <p className="mt-1 text-sm text-stone-600">
                企業が書類選考で確認する情報を揃えると、応募前の不備を減らせます。
              </p>
            </div>
            <div className="text-left md:text-right">
              <p className="text-3xl font-semibold">{readiness.percent}%</p>
              <p className="text-sm text-stone-500">{readiness.completed}/{readiness.total} 完了</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 md:grid-cols-3">
            {readiness.items.map((item) => (
              <Link
                className={`rounded border px-3 py-2 text-sm font-semibold ${
                  item.done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
                href={item.href}
                key={item.key}
              >
                {item.done ? "完了" : "未完了"}: {item.label}
              </Link>
            ))}
          </div>
        </Card>
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">面談調整の未完了</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                書類選考OK後に必要な、候補日時の確認、面談日時の確定、会議URLの確認をここから進められます。
              </p>
            </div>
            <Link className="btn btn-secondary" href="/freelancer/applications">応募済み案件を見る</Link>
          </div>
          {interviewQueue.length > 0 ? (
            <Card className="p-0">
              <div className="divide-y divide-stone-200">
                {interviewQueue.map((application) => (
                  <InterviewQueueRow application={application} key={application.id} />
                ))}
              </div>
            </Card>
          ) : (
            <EmptyState
              title="未完了の面談調整はありません。"
              description="書類選考OK後、候補日時や会議URLの確認が必要な案件がここに表示されます。"
              action={<Link className="btn btn-secondary" href="/freelancer/applications">応募状況を確認</Link>}
            />
          )}
        </section>
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">登録内容に近い受付中案件</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                仕事探しの希望条件、スキル、応募準備、案件側の条件公開を合わせて、次に確認しやすい案件を表示します。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="btn btn-secondary" href="/freelancer/preferences">希望条件を更新</Link>
              <Link className="btn btn-secondary" href="/jobs?accepting=open&sort=direct">案件をもっと見る</Link>
            </div>
          </div>
          {(!preferenceCompleteness.usable || preferenceCompleteness.stale) && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              希望条件が{preferenceCompleteness.stale ? "古い、または未確認です" : "まだ少ない状態です"}。候補がないとは判断せず、希望条件を更新すると単価・稼働量・働き方の理由を含めて並び替えます。
            </div>
          )}
          {recommendedJobs.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {recommendedJobs.map(({ job, contractReadinessPercent, matchPercent, matched, preferenceReasons, directScore }) => (
                <RecommendedJobCard
                  contractPercent={contractReadinessPercent}
                  job={job}
                  key={job.id}
                  matched={matched}
                  matchPercent={matchPercent}
                  preferenceReasons={preferenceReasons}
                  readinessComplete={readiness.isReady}
                  score={directScore}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="表示できる受付中案件はありません。"
              description="希望条件が未設定または古い場合は、候補なしではなく低信頼の状態として扱います。希望条件を更新してから公開案件を確認してください。"
              action={<Link className="btn btn-primary" href="/freelancer/preferences">希望条件を更新</Link>}
            />
          )}
        </section>
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">検討リスト</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                応募前に条件確認や提案文の準備をしたい案件を見返せます。
              </p>
            </div>
            <Link className="btn btn-secondary" href="/freelancer/saved-jobs">検討リストを見る</Link>
          </div>
          {profile.savedJobs.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {rankedSavedJobs
                .slice(0, 3)
                .map(({ savedJob, recommendation }) => (
                <SavedJobCard
                  job={savedJob.jobPost}
                  key={savedJob.id}
                  preferenceReasons={recommendation.preferenceReasons}
                  savedAt={savedJob.createdAt}
                  savedNote={savedJob.note}
                  score={recommendation.directScore}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="検討中の案件はまだありません。"
              description="気になる案件を保存すると、応募前の条件確認と提案準備をここから進められます。"
              action={<Link className="btn btn-primary" href="/jobs?accepting=open&sort=direct">案件を探す</Link>}
            />
          )}
        </section>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ActionCard href="/freelancer/profile" title="プロフィール編集" body="希望職種、スキル、稼働条件を更新します。" />
          <ActionCard href="/freelancer/preferences" title="仕事探しの希望条件" body="単価、稼働量、働き方、保存フィードを管理します。" />
          <ActionCard href="/freelancer/career" title="職務経歴フォーム" body="検索や選考時に確認される職務経歴を整えます。" />
          <ActionCard href="/freelancer/documents" title="PDF書類" body="履歴書PDFと職務経歴書PDFをアップロードします。" />
          <ActionCard href="/freelancer/applications" title="応募済み案件" body="応募履歴と選考状況を確認します。" />
          <ActionCard href="/freelancer/saved-jobs" title="検討リスト" body="応募前に確認したい案件を見返します。" />
          <ActionCard href="/freelancer/notifications" title="通知" body="書類選考OK/NGの通知を確認します。" />
        </div>
      </div>
    </Shell>
  );
}

type SavedDashboardJob = Prisma.JobPostGetPayload<{ include: { companyProfile: { include: { verificationRequests: true } } } }>;

type InterviewQueueApplication = Prisma.JobApplicationGetPayload<{
  include: {
    jobPost: { include: { companyProfile: true } };
    interviewThread: {
      include: {
        messages: true;
      };
    };
  };
}>;

function InterviewQueueRow({ application }: { application: InterviewQueueApplication }) {
  const thread = application.interviewThread;
  const latestProposedAt = thread?.messages[0]?.proposedAt ?? null;
  const scheduledAt = thread?.scheduledAt ?? null;
  const missingMeetingUrl = !thread?.meetingUrl;
  const nextAction = !scheduledAt
    ? latestProposedAt
      ? "候補日時を確認"
      : "候補日時を送る"
    : missingMeetingUrl
      ? "会議URLを確認"
      : "面談前の条件確認";
  const nextActionDetail = !scheduledAt
    ? latestProposedAt
      ? `最新候補: ${formatDateTime(latestProposedAt)}`
      : "面談可能な日時を複数提示すると、企業が選びやすくなります。"
    : missingMeetingUrl
      ? `確定日時: ${formatDateTime(scheduledAt)}。会議URLが共有されたらこの画面で確認できます。`
      : "面談前に契約・支払い条件と確認事項を整理してください。";

  return (
    <div className="grid gap-4 p-5 lg:grid-cols-[1fr_220px] lg:items-center">
      <div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={scheduledAt ? "good" : "warn"}>
            {scheduledAt ? "日時確定" : "日時未確定"}
          </StatusBadge>
          <StatusBadge tone={missingMeetingUrl ? "warn" : "good"}>
            {missingMeetingUrl ? "会議URL未共有" : "会議URL共有済み"}
          </StatusBadge>
          {latestProposedAt && <StatusBadge>最新候補 {formatDateTime(latestProposedAt)}</StatusBadge>}
        </div>
        <h3 className="mt-3 font-semibold">{application.jobPost.title}</h3>
        <p className="mt-1 text-sm text-stone-500">{application.jobPost.companyProfile.name}</p>
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
          <QueueSignal label="次のアクション" value={nextAction} tone={scheduledAt && !missingMeetingUrl ? "good" : "warn"} />
          <QueueSignal
            label="稼働開始目安"
            value={application.proposedStart ?? "未設定"}
            tone={application.proposedStart ? "good" : "neutral"}
          />
          <QueueSignal
            label="連絡希望"
            value={application.contactPreference ?? "この画面で調整"}
            tone={application.contactPreference ? "good" : "neutral"}
          />
        </div>
        <p className="mt-3 text-sm leading-6 text-stone-600">{nextActionDetail}</p>
      </div>
      <div className="grid gap-2">
        {thread ? (
          <Link className="btn btn-primary" href={`/interviews/${thread.id}`}>面談チャット</Link>
        ) : (
          <Link className="btn btn-primary" href="/freelancer/applications">応募状況を見る</Link>
        )}
        <Link className="btn btn-secondary" href={`/jobs/${application.jobPost.id}`}>案件条件を見る</Link>
      </div>
    </div>
  );
}

function QueueSignal({
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

function SavedJobCard({
  job,
  preferenceReasons,
  savedAt,
  savedNote,
  score,
}: {
  job: SavedDashboardJob;
  preferenceReasons: ReturnType<typeof visiblePreferenceReasons>;
  savedAt: Date;
  savedNote?: string | null;
  score: number;
}) {
  const contractReadiness = directContractChecklist(job);

  return (
    <Card>
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={job.applicationStatus === "open" ? "good" : "warn"}>
          {job.applicationStatus === "open" ? "受付中" : "受付停止"}
        </StatusBadge>
        <StatusBadge tone={contractReadiness.isReady ? "good" : contractReadiness.percent >= 60 ? "neutral" : "warn"}>
          条件確認 {contractReadiness.percent}%
        </StatusBadge>
        <StatusBadge tone={score >= 70 ? "good" : score >= 45 ? "neutral" : "warn"}>希望条件 {score}%</StatusBadge>
      </div>
      <h3 className="mt-3 line-clamp-2 font-semibold">{job.title}</h3>
      <p className="mt-1 text-sm text-stone-500">{job.companyProfile.name}</p>
      <p className="mt-3 text-xs text-stone-500">保存 {formatDateTime(savedAt)}</p>
      <div className="mt-3 grid gap-2">
        {preferenceReasons.slice(0, 2).map((reason) => (
          <RecommendationReason reason={reason} key={`${job.id}-${reason.label}`} />
        ))}
      </div>
      {savedNote && <p className="mt-3 line-clamp-2 text-sm leading-6 text-stone-600">{savedNote}</p>}
      <Link className="btn btn-primary mt-4 w-full" href={`/jobs/${job.id}`}>条件確認・応募準備</Link>
    </Card>
  );
}

type RecommendedJob = Prisma.JobPostGetPayload<{ include: { companyProfile: { include: { verificationRequests: true } } } }>;

function RecommendedJobCard({
  contractPercent,
  job,
  matched,
  matchPercent,
  preferenceReasons,
  readinessComplete,
  score,
}: {
  contractPercent: number;
  job: RecommendedJob;
  matched: string[];
  matchPercent: number | null;
  preferenceReasons: ReturnType<typeof visiblePreferenceReasons>;
  readinessComplete: boolean;
  score: number;
}) {
  const nextAction = !readinessComplete
    ? "応募準備を整えてから条件確認"
    : contractPercent < 100
      ? "条件確認をしてから応募"
      : "提案文を作って応募";

  return (
    <Card>
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={score >= 70 ? "good" : score >= 45 ? "neutral" : "warn"}>応募しやすさ {score}%</StatusBadge>
        <StatusBadge tone={matchPercent === null ? "neutral" : matchPercent >= 50 ? "good" : matchPercent > 0 ? "neutral" : "warn"}>
          必須一致 {matchPercent === null ? "要確認" : `${matchPercent}%`}
        </StatusBadge>
      </div>
      <h3 className="mt-3 line-clamp-2 font-semibold">{job.title}</h3>
      <p className="mt-1 text-sm text-stone-500">{job.companyProfile.name}</p>
      <div className="mt-4 grid gap-2 text-sm">
        <RecommendationSignal label="単価" value={job.rate ?? "未設定"} />
        <RecommendationSignal label="稼働率" value={job.workload ?? "未設定"} />
        <RecommendationSignal label="条件確認" value={`${contractPercent}%`} />
      </div>
      {matched.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {matched.slice(0, 4).map((skill) => (
            <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800" key={skill}>
              {skill}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 grid gap-2">
        {preferenceReasons.map((reason) => (
          <RecommendationReason reason={reason} key={`${job.id}-${reason.label}`} />
        ))}
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-600">{nextAction}</p>
      <Link className="btn btn-primary mt-4 w-full" href={`/jobs/${job.id}`}>案件条件を見る</Link>
    </Card>
  );
}

function RecommendationReason({ reason }: { reason: ReturnType<typeof visiblePreferenceReasons>[number] }) {
  const toneClasses = {
    neutral: "border-stone-200 bg-stone-50 text-stone-700",
    good: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
  };

  return (
    <div className={`rounded border px-3 py-2 ${toneClasses[reason.tone]}`}>
      <p className="text-xs font-semibold">{reason.label}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">{reason.detail}</p>
    </div>
  );
}

function RecommendationSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-stone-200 bg-stone-50 px-3 py-2">
      <span className="text-xs text-stone-500">{label}</span>
      <span className="truncate text-right text-xs font-semibold text-stone-800">{value}</span>
    </div>
  );
}

function ActionCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Card>
      <Link href={href} className="block">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">{body}</p>
      </Link>
    </Card>
  );
}
