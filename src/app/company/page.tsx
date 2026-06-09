import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { logoutUser } from "@/lib/actions";
import { requireCompanyUser } from "@/lib/page-guards";
import { prisma } from "@/lib/prisma";
import { getFreelancerReadiness } from "@/lib/readiness";
import { buildApplicationResponseState, buildApplicationReview, directMatchScore, formatDateTime, skillMatchPercent } from "@/lib/utils";
import { Shell, TopNav, PageHeader, StatCard, Card, EmptyState, StatusBadge, icons } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CompanyDashboard() {
  const { user, companyUser } = await requireCompanyUser();
  const [jobs, applications, openApplications, contactQueueCandidates, interviewQueue] = await Promise.all([
    prisma.jobPost.count({ where: { companyProfileId: companyUser.companyProfileId } }),
    prisma.jobApplication.count({ where: { jobPost: { companyProfileId: companyUser.companyProfileId } } }),
    prisma.jobApplication.count({
      where: {
        status: "applied",
        jobPost: { companyProfileId: companyUser.companyProfileId },
      },
    }),
    prisma.jobApplication.findMany({
      where: {
        status: "applied",
        jobPost: {
          companyProfileId: companyUser.companyProfileId,
          status: "published",
          applicationStatus: "open",
        },
      },
      include: {
        jobPost: true,
        freelancerProfile: {
          include: {
            careerHistory: true,
            documents: true,
          },
        },
      },
      orderBy: { appliedAt: "desc" },
      take: 12,
    }),
    prisma.jobApplication.findMany({
      where: {
        status: "screening_passed",
        jobPost: { companyProfileId: companyUser.companyProfileId },
        OR: [
          { interviewThread: { is: null } },
          { interviewThread: { is: { status: "open" } } },
          { interviewThread: { is: { meetingUrl: null } } },
        ],
      },
      include: {
        jobPost: true,
        freelancerProfile: true,
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
    }),
  ]);
  const contactQueue = contactQueueCandidates
    .map((application) => {
      const readiness = getFreelancerReadiness(application.freelancerProfile);
      const review = buildApplicationReview(application);
      const responseState = buildApplicationResponseState(application);
      const score = directMatchScore({
        ...application.jobPost,
        freelancerReadinessPercent: readiness.percent,
        freelancerSkills: application.freelancerProfile.skills,
      });

      return { application, readiness, review, responseState, score: Math.min(100, score + responseState.priorityBoost) };
    })
    .sort((a, b) => b.score - a.score || b.application.appliedAt.getTime() - a.application.appliedAt.getTime())
    .slice(0, 4);

  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-7xl px-5 py-8">
        <PageHeader
          title="企業 ダッシュボード"
          description="案件、応募者、書類選考、面談調整を管理します。"
          action={<form action={logoutUser}><button className="btn btn-secondary">ログアウト</button></form>}
        />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <StatCard label="案件数" value={jobs} icon={icons.jobs} />
          <StatCard label="応募者数" value={applications} icon={icons.users} />
          <StatCard label="未選考" value={openApplications} icon={icons.ok} />
        </div>
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">面談調整の未完了</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                書類選考OK後に止まりやすい、候補日時の確定と会議URL共有を優先して確認します。
              </p>
            </div>
            <Link className="btn btn-secondary" href="/company/jobs">案件別に見る</Link>
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
              description="書類選考OK後、候補日時や会議URLが未完了の応募者がここに表示されます。"
              action={<Link className="btn btn-secondary" href="/company/jobs">応募者を確認</Link>}
            />
          )}
        </section>
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">次に連絡する応募者</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                次に連絡すべき応募者を、案件条件・提案内容・応募準備から優先表示します。
              </p>
            </div>
            <Link className="btn btn-secondary" href="/company/jobs">案件別に見る</Link>
          </div>
          {contactQueue.length > 0 ? (
            <Card className="p-0">
              <div className="divide-y divide-stone-200">
                {contactQueue.map(({ application, readiness, responseState, review, score }) => (
                  <ContactQueueRow
                    application={application}
                    key={application.id}
                    matchedSkills={review.requiredSkillMatches}
                    nextChecks={review.nextChecks}
                    readinessPercent={readiness.percent}
                    responseState={responseState}
                    score={score}
                  />
                ))}
              </div>
            </Card>
          ) : (
            <EmptyState
              title="連絡待ちの応募者はいません。"
              description="公開中かつ受付中の案件に未選考の応募が届くと、ここに優先順で表示されます。"
              action={<Link className="btn btn-primary" href="/company/jobs/create">案件を作成</Link>}
            />
          )}
        </section>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ActionCard href="/company/profile" title="企業プロフィール" body="企業名、概要、Webサイト、会社・支払い確認リクエストを管理します。" />
          <ActionCard href="/company/jobs" title="案件一覧" body="案件の作成、編集、公開状態、受付状態を管理します。" />
        </div>
      </div>
    </Shell>
  );
}

type ContactQueueApplication = Prisma.JobApplicationGetPayload<{
  include: {
    jobPost: true;
    freelancerProfile: {
      include: {
        careerHistory: true;
        documents: true;
      };
    };
  };
}>;

type InterviewQueueApplication = Prisma.JobApplicationGetPayload<{
  include: {
    jobPost: true;
    freelancerProfile: true;
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
      ? "会議URLを共有"
      : "面談前の条件確認";
  const nextActionDetail = !scheduledAt
    ? latestProposedAt
      ? `最新候補: ${formatDateTime(latestProposedAt)}`
      : "面談可能な日時を複数提示すると、相手が選びやすくなります。"
    : missingMeetingUrl
      ? `確定日時: ${formatDateTime(scheduledAt)}`
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
        <h3 className="mt-3 font-semibold">{application.freelancerProfile.fullName}</h3>
        <p className="mt-1 text-sm text-stone-500">{application.jobPost.title}</p>
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
          <QueueSignal label="次のアクション" value={nextAction} tone={scheduledAt && !missingMeetingUrl ? "good" : "warn"} />
          <QueueSignal
            label="稼働開始目安"
            value={application.proposedStart ?? application.freelancerProfile.availableFrom ?? "未設定"}
            tone={application.proposedStart || application.freelancerProfile.availableFrom ? "good" : "neutral"}
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
          <Link className="btn btn-primary" href={`/company/applications/${application.id}`}>詳細確認</Link>
        )}
        <Link className="btn btn-secondary" href={`/company/applications/${application.id}`}>応募詳細</Link>
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

function ContactQueueRow({
  application,
  matchedSkills,
  nextChecks,
  readinessPercent,
  responseState,
  score,
}: {
  application: ContactQueueApplication;
  matchedSkills: string[];
  nextChecks: string[];
  readinessPercent: number;
  responseState: ReturnType<typeof buildApplicationResponseState>;
  score: number;
}) {
  const matchPercent = skillMatchPercent(application.jobPost.requiredSkills, application.freelancerProfile.skills);
  const hasStartSignal = Boolean(
    application.proposedStart ||
      application.freelancerProfile.availableFrom ||
      application.freelancerProfile.availability,
  );

  return (
    <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={score >= 80 ? "good" : score >= 55 ? "neutral" : "warn"}>連絡優先 {score}%</StatusBadge>
          <StatusBadge tone={responseState.tone}>{responseState.label}</StatusBadge>
          <StatusBadge tone={matchPercent === null ? "neutral" : matchPercent >= 50 ? "good" : matchPercent > 0 ? "neutral" : "warn"}>
            必須一致 {matchPercent === null ? "要確認" : `${matchPercent}%`}
          </StatusBadge>
          <StatusBadge tone={readinessPercent === 100 ? "good" : "warn"}>応募準備 {readinessPercent}%</StatusBadge>
          <StatusBadge tone={hasStartSignal ? "good" : "warn"}>開始目安{hasStartSignal ? "あり" : "未設定"}</StatusBadge>
        </div>
        <h3 className="mt-3 font-semibold">{application.freelancerProfile.fullName}</h3>
        <p className="mt-1 text-sm text-stone-500">
          {application.freelancerProfile.desiredOccupation ?? "希望職種未設定"} / {application.jobPost.title}
        </p>
        {application.proposalMessage && (
          <p className="mt-2 line-clamp-2 max-w-4xl text-sm leading-6 text-stone-700">{application.proposalMessage}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
          <span>応募 {formatDateTime(application.appliedAt)}</span>
          {application.proposedStart && <span>開始: {application.proposedStart}</span>}
          {application.contactPreference && <span>連絡: {application.contactPreference}</span>}
        </div>
        <p className="mt-2 text-sm leading-6 text-stone-600">{responseState.detail}</p>
        {matchedSkills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {matchedSkills.slice(0, 5).map((skill) => (
              <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800" key={skill}>
                {skill}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {nextChecks.length > 0 ? (
            nextChecks.slice(0, 3).map((check) => (
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
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:w-40 lg:grid-cols-1">
        <Link className="btn btn-primary" href={`/company/applications/${application.id}`}>詳細確認</Link>
        <Link className="btn btn-secondary" href={`/company/jobs/${application.jobPostId}/applications?status=applied`}>同じ案件</Link>
      </div>
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
