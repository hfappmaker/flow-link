import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { applyToJob, removeSavedJob, saveJobForReview } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { publicDbRead } from "@/lib/public-db";
import { getFreelancerReadiness, getJobPublishingReadiness } from "@/lib/readiness";
import { getCompanyReputationSummary } from "@/lib/reputation";
import { activeSafetyReviewSummary } from "@/lib/safety-reports";
import {
  applicationStatusLabel,
  buildTrustConfidence,
  formatDateTime,
  formatOpenings,
  matchedSkills,
  parseSkills,
  unmatchedSkills,
  visiblePreferenceReasons,
  type TrustConfidenceStatus,
} from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, StatusBadge, SubmitButton, TextArea, TextField } from "@/components/ui";
import { ReputationSummaryCard } from "@/components/reputation";
import { RecommendationFeedbackForm } from "@/components/recommendation-feedback";
import { SafetyReportPanel } from "@/components/safety-reporting";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ safetyReport?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = process.env.AUTH_SECRET ? await auth().catch(() => null) : null;
  const job = await publicDbRead(
    () =>
      prisma.jobPost.findFirst({
        where: { id, status: "published" },
        include: {
          companyProfile: {
            include: {
              safetyReports: {
                where: { status: { not: "resolved" } },
                select: { status: true, reportType: true },
              },
              verificationRequests: {
                orderBy: { createdAt: "desc" },
                take: 4,
              },
            },
          },
        },
      }),
    null,
  );
  const freelancerProfile =
    session?.user?.role === "freelancer"
      ? await publicDbRead(
          () =>
            prisma.freelancerProfile.findUnique({
              where: { userId: session.user.id },
              include: {
                documents: true,
                careerHistory: true,
                workPreference: true,
                recommendationFeedback: {
                  where: { jobPostId: id },
                  take: 1,
                },
              },
            }),
          null,
        )
      : null;
  const readiness = getFreelancerReadiness(freelancerProfile);
  const existingApplication = freelancerProfile
    ? await publicDbRead(
        () =>
          prisma.jobApplication.findUnique({
            where: {
              jobPostId_freelancerProfileId: {
                jobPostId: id,
                freelancerProfileId: freelancerProfile.id,
              },
            },
            include: { interviewThread: true },
          }),
        null,
      )
    : null;
  const savedJob = freelancerProfile
    ? await publicDbRead(
        () =>
          prisma.savedJob.findUnique({
            where: {
              freelancerProfileId_jobPostId: {
                freelancerProfileId: freelancerProfile.id,
                jobPostId: id,
              },
            },
          }),
        null,
      )
    : null;
  const reporterSafetyReports =
    session?.user?.role === "freelancer"
      ? await publicDbRead(
          () =>
            prisma.companySafetyReport.findMany({
              where: { reporterUserId: session.user.id, jobPostId: id },
              orderBy: { createdAt: "desc" },
              take: 5,
            }),
          [],
        )
      : [];

  if (!job) {
    notFound();
  }
  const companyReputation = await publicDbRead(
    () => getCompanyReputationSummary(job.companyProfileId),
    {
      feedbackCount: 0,
      completedInteractionCount: 0,
      averageFollowThrough: null,
      averageCollaboration: null,
      hasEnoughHistory: false,
    },
  );
  const requiredSkills = parseSkills(job.requiredSkills);
  const requiredSkillMatches = freelancerProfile ? matchedSkills(job.requiredSkills, freelancerProfile.skills) : [];
  const requiredSkillGaps = freelancerProfile ? unmatchedSkills(job.requiredSkills, freelancerProfile.skills) : requiredSkills;
  const matchPercent = requiredSkills.length > 0 ? Math.round((requiredSkillMatches.length / requiredSkills.length) * 100) : null;
  const contractReadiness = getJobPublishingReadiness(job, job.companyProfile);
  const companyConfidence = buildTrustConfidence({ company: job.companyProfile, job });
  const activeSafetyReview = activeSafetyReviewSummary(job.companyProfile.safetyReports);
  const preferenceReasons = freelancerProfile
    ? visiblePreferenceReasons({
        ...job,
        freelancerReadinessPercent: readiness.percent,
        freelancerSkills: freelancerProfile.skills,
        workPreference: freelancerProfile.workPreference,
      })
    : [];
  const proposalDraft = freelancerProfile
    ? buildProposalDraft({
        companyName: job.companyProfile.name,
        jobTitle: job.title,
        matchedSkills: requiredSkillMatches,
        skillGaps: requiredSkillGaps,
        summary: freelancerProfile.careerHistory?.summary,
        startSignal: freelancerProfile.availableFrom || freelancerProfile.availability,
        rateSignal: freelancerProfile.desiredRate,
        contactSignal: freelancerProfile.remotePreference,
      })
    : "";
  const defaultRateExpectation = freelancerProfile?.workPreference?.targetRate || freelancerProfile?.desiredRate || "";
  const defaultWorkloadExpectation = freelancerProfile?.workPreference?.workload || freelancerProfile?.availability || "";
  const jobRateReference = defaultRateExpectation ? "" : job.rate || "";
  const jobWorkloadReference = defaultWorkloadExpectation ? "" : job.workload || "";
  const jobCallbackUrl = `/jobs/${job.id}`;
  const jobRegisterHref = `/register?${new URLSearchParams({ callbackUrl: jobCallbackUrl }).toString()}`;
  const jobLoginHref = `/login?${new URLSearchParams({ callbackUrl: jobCallbackUrl }).toString()}`;

  return (
    <Shell>
      <TopNav activeSection="jobs" sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-5xl px-5 py-8">
        <PageHeader title={job.title} description={job.companyProfile.name} />
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_280px]">
          <Card>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={job.applicationStatus === "open" ? "good" : "warn"}>
                {job.applicationStatus === "open" ? "受付中" : "受付停止"}
              </StatusBadge>
              <StatusBadge>{job.remotePolicy ?? "リモート未設定"}</StatusBadge>
            </div>
            <h2 className="mt-6 text-lg font-semibold">業務内容</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-700">{job.description}</p>
            <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
              <Info label="必須スキル" value={job.requiredSkills} />
              <Info label="歓迎スキル" value={job.preferredSkills} />
              <Info label="単価" value={job.rate} />
              <Info label="稼働率" value={job.workload} />
              <Info label="契約期間" value={job.contractPeriod} />
              <Info label="勤務地" value={job.location} />
              <Info label="募集人数" value={formatOpenings(job.openings)} />
            </dl>
            {(job.selectionFlow || job.contractTerms) && (
              <div className="mt-6 rounded border border-emerald-100 bg-emerald-50/60 p-4">
                <h2 className="font-semibold">選考・条件の確認</h2>
                <dl className="mt-3 grid gap-3 text-sm">
                  <DirectInfo label="選考フロー" value={job.selectionFlow} />
                  <DirectInfo label="契約・支払い条件" value={job.contractTerms} />
                </dl>
              </div>
            )}
          </Card>
          <div className="grid h-fit gap-5">
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">応募前に確認できる情報</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    Flow Linkが確認した項目と、企業が自己申告している項目を分けて表示します。支払い保証や法務確認を示すものではありません。
                  </p>
                </div>
                <StatusBadge tone={companyConfidence.tone}>{companyConfidence.label}</StatusBadge>
              </div>
              <div className="mt-4 grid gap-2">
                {companyConfidence.items.map((item) => (
                  <TrustSnapshotItem detail={item.detail} key={item.label} label={item.label} status={item.status} />
                ))}
              </div>
              {companyConfidence.tone !== "good" && (
                <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                  支払い・会社情報が未確認、確認中、期限切れ、または再提出待ちの場合でも応募は可能です。応募前に検討リストへ保存し、提案文や面談で契約主体、締め日、支払い時期、外部支払い依頼の有無を確認してください。
                </div>
              )}
              {activeSafetyReview && (
                <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-900">
                  この企業には現在、Flow Linkが確認中の安全性レポートがあります。個別の報告内容や報告者は公開しませんが、外部支払い依頼や不審なリンクなどがあれば応募前に安全性レポートを送ってください。
                </div>
              )}
            </Card>

            <ReputationSummaryCard
              title="Flow Linkでの企業履歴"
              summary={companyReputation}
              subjectLabel="company"
            />

            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">応募前の確認</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    応募前に、案件側で確認できる条件です。
                  </p>
                </div>
                <StatusBadge tone={contractReadiness.isReady ? "good" : "warn"}>{contractReadiness.percent}%</StatusBadge>
              </div>
              <div className="mt-4 grid gap-2">
                {contractReadiness.items.map((item) => (
                  <ContractReadinessItem detail={item.detail ?? ""} done={item.done} key={item.key} label={item.label} />
                ))}
              </div>
            </Card>

            {freelancerProfile && (
              <Card>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">応募準備チェック</h2>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      応募前に、企業へ伝えるべき一致点と確認点を整理します。
                    </p>
                  </div>
                  <StatusBadge tone={matchPercent === null ? "neutral" : matchPercent >= 60 ? "good" : matchPercent > 0 ? "neutral" : "warn"}>
                    {matchPercent === null ? "要確認" : `${matchPercent}%一致`}
                  </StatusBadge>
                </div>

                <div className="mt-4 grid gap-3">
                  <MatchSignal label="応募準備" value={`${readiness.percent}%`} tone={readiness.isReady ? "good" : "warn"} />
                  <MatchSignal
                    label="必須スキル"
                    value={requiredSkills.length > 0 ? `${requiredSkillMatches.length}/${requiredSkills.length}` : "未設定"}
                    tone={requiredSkills.length === 0 ? "neutral" : requiredSkillMatches.length > 0 ? "good" : "warn"}
                  />
                  <MatchSignal
                    label="開始条件"
                    value={freelancerProfile.availableFrom || freelancerProfile.availability || "未設定"}
                    tone={freelancerProfile.availableFrom || freelancerProfile.availability ? "good" : "warn"}
                  />
                </div>

                {requiredSkillMatches.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-stone-500">提案文で強調する一致点</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {requiredSkillMatches.map((skill) => (
                        <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800" key={skill}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {requiredSkillGaps.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-stone-500">応募前に補足したい確認点</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {requiredSkillGaps.slice(0, 5).map((skill) => (
                        <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800" key={skill}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="mt-4 text-sm leading-6 text-stone-600">
                  提案文では、一致スキル、近い実績、開始可能時期、初回面談で確認したい条件を先に書くと、企業が判断しやすくなります。
                </p>
              </Card>
            )}

            <Card>
              {session?.user?.role === "freelancer" && !existingApplication && (
                <div className="mb-4 rounded border border-stone-200 bg-stone-50 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">{savedJob ? "検討リストに保存済み" : "応募前に検討リストへ保存"}</p>
                      <p className="mt-1 text-sm leading-6 text-stone-600">
                        条件確認や提案文の準備が必要な案件を、応募前にまとめて見返せます。
                      </p>
                    </div>
                    <form action={savedJob ? removeSavedJob : saveJobForReview}>
                      <input type="hidden" name="jobPostId" value={job.id} />
                      <input type="hidden" name="returnTo" value={`/jobs/${job.id}`} />
                      <SubmitButton className="btn btn-secondary w-full sm:w-auto" pendingLabel="更新中">
                        {savedJob ? "検討リストから外す" : "検討リストに保存"}
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              )}
              {session?.user?.role === "freelancer" && !existingApplication && (
                <div className="mb-4">
                  <RecommendationFeedbackForm
                    currentReason={freelancerProfile?.recommendationFeedback[0]?.reason}
                    jobPostId={job.id}
                    returnTo={`/jobs/${job.id}`}
                    source="job_detail"
                    sourceContext={`/jobs/${job.id}`}
                    visibleReasons={preferenceReasons}
                  />
                </div>
              )}
              {session?.user?.role === "freelancer" && (
                <div className="mb-4">
                  <SafetyReportPanel
                    acknowledgement={query.safetyReport === "submitted"}
                    compact
                    context={{
                      jobPostId: job.id,
                      jobApplicationId: existingApplication?.id,
                      interviewThreadId: existingApplication?.interviewThread?.id,
                    }}
                    reports={reporterSafetyReports}
                    returnTo={`/jobs/${job.id}`}
                  />
                </div>
              )}
              {existingApplication ? (
                <div>
                  <StatusBadge tone={existingApplication.status === "screening_passed" ? "good" : existingApplication.status === "screening_rejected" ? "bad" : "neutral"}>
                    {applicationStatusLabel(existingApplication.status)}
                  </StatusBadge>
                  <p className="mt-3 font-semibold">この案件には応募済みです</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    応募日時: {formatDateTime(existingApplication.appliedAt)}
                  </p>
                  {existingApplication.proposalMessage && (
                    <div className="mt-4 rounded border border-stone-200 bg-stone-50 p-3">
                      <p className="text-xs font-medium text-stone-500">送信した応募メッセージ</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{existingApplication.proposalMessage}</p>
                    </div>
                  )}
                  <div className="mt-4 grid gap-2">
                    {existingApplication.interviewThread && (
                      <Link className="btn btn-primary" href={`/interviews/${existingApplication.interviewThread.id}`}>面談チャット</Link>
                    )}
                    <Link className="btn btn-secondary" href="/freelancer/applications">応募済み案件を見る</Link>
                  </div>
                </div>
              ) : session?.user?.role === "freelancer" && job.applicationStatus === "open" && readiness.isReady ? (
                <form action={applyToJob} className="grid gap-3">
                  <input type="hidden" name="jobPostId" value={job.id} />
                  <div>
                    <p className="font-semibold">応募メッセージ</p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      企業が最初に読む提案として送信されます。
                    </p>
                  </div>
                  <TextArea
                    name="proposalMessage"
                    label="この案件で貢献できること"
                    defaultValue={proposalDraft}
                    required
                    minLength={40}
                    maxLength={1200}
                    placeholder="関連する経験、得意領域、案件条件との合い方を簡潔に入力"
                  />
                  <div className="rounded border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-600">
                    <p className="font-medium text-stone-800">下書きを編集して送信できます</p>
                    <p className="mt-1">
                      一致スキル、近い実績、開始可能時期、面談で確認したい条件を先に伝える形にしています。
                    </p>
                  </div>
                  <TextField
                    name="proposedStart"
                    label="稼働開始目安"
                    defaultValue={freelancerProfile?.workPreference?.availableFrom || freelancerProfile?.availableFrom || ""}
                    required
                    maxLength={120}
                    placeholder="例: 7月第1週から / 契約後2週間で開始可"
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-2">
                      <TextField
                        name="rateExpectation"
                        label="この案件での希望単価"
                        defaultValue={defaultRateExpectation}
                        required={!jobRateReference}
                        maxLength={120}
                        placeholder={jobRateReference ? `例: ${jobRateReference}で進める / 月100万円以上` : "例: 月100万円以上 / 時給8000円から"}
                      />
                      {jobRateReference && (
                        <label className="flex gap-2 rounded border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-700">
                          <input className="mt-1" type="checkbox" name="confirmJobRateExpectation" />
                          <span>案件単価 {jobRateReference} を、この応募での希望単価として確認しました</span>
                          <input type="hidden" name="confirmedRateExpectation" value={jobRateReference} />
                        </label>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <TextField
                        name="workloadExpectation"
                        label="この案件での希望稼働量"
                        defaultValue={defaultWorkloadExpectation}
                        required={!jobWorkloadReference}
                        maxLength={120}
                        placeholder={jobWorkloadReference ? `例: ${jobWorkloadReference}で進める / 週4日まで` : "例: 週4日、月128時間まで"}
                      />
                      {jobWorkloadReference && (
                        <label className="flex gap-2 rounded border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-700">
                          <input className="mt-1" type="checkbox" name="confirmJobWorkloadExpectation" />
                          <span>案件稼働量 {jobWorkloadReference} を、この応募での希望稼働量として確認しました</span>
                          <input type="hidden" name="confirmedWorkloadExpectation" value={jobWorkloadReference} />
                        </label>
                      )}
                    </div>
                  </div>
                  <TextField
                    name="contactPreference"
                    label="連絡希望"
                    defaultValue={freelancerProfile?.remotePreference || ""}
                    required
                    maxLength={120}
                    placeholder="例: 平日18時以降のオンライン面談を希望"
                  />
                  <SubmitButton className="btn btn-primary" pendingLabel="応募送信中">この案件に応募</SubmitButton>
                </form>
              ) : session?.user?.role === "freelancer" && job.applicationStatus === "open" ? (
                <div>
                  <p className="font-semibold">応募準備が未完了です</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    応募前にプロフィール、職務経歴、PDF書類を揃えてください。
                  </p>
                  <div className="mt-4 grid gap-2">
                    {readiness.items
                      .filter((item) => !item.done && item.href)
                      .map((item) => (
                        <Link className="btn btn-secondary justify-start" href={item.href!} key={item.key}>
                          {item.label}を登録
                        </Link>
                      ))}
                  </div>
                </div>
              ) : session ? (
                <p className="text-sm text-stone-600">応募にはフリーランスアカウントが必要です。</p>
              ) : (
                <div>
                  <p className="font-semibold">この案件への応募準備を始める</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    無料登録すると、この案件に戻ってプロフィールや提案文の準備を進められます。
                  </p>
                  <div className="mt-4 grid gap-2">
                    <Link className="btn btn-primary w-full" href={jobRegisterHref}>
                      登録して応募準備を始める
                    </Link>
                    <Link className="btn btn-secondary w-full" href={jobLoginHref}>
                      ログインして応募
                    </Link>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function MatchSignal({
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
    <div className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm ${toneClasses[tone]}`}>
      <span className="font-medium">{label}</span>
      <span className="text-right text-xs font-semibold">{value}</span>
    </div>
  );
}

function ContractReadinessItem({ label, detail, done }: { label: string; detail: string; done: boolean }) {
  return (
    <div
      className={`rounded border px-3 py-2 text-sm ${
        done ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{label}</span>
        <span className="text-xs font-semibold">{done ? "確認可" : "要確認"}</span>
      </div>
      <p className="mt-1 leading-6 text-stone-600">{detail}</p>
    </div>
  );
}

function TrustSnapshotItem({ label, detail, status }: { label: string; detail: string; status: TrustConfidenceStatus }) {
  const statusClasses = {
    confirmed: "border-emerald-200 bg-emerald-50 text-emerald-900",
    pending: "border-stone-200 bg-stone-50 text-stone-800",
    selfReported: "border-stone-200 bg-stone-50 text-stone-800",
    missing: "border-amber-200 bg-amber-50 text-amber-900",
    stale: "border-amber-200 bg-amber-50 text-amber-900",
    rejected: "border-red-200 bg-red-50 text-red-900",
  };
  const statusLabels = {
    confirmed: "Flow Link確認済み",
    pending: "確認リクエスト中",
    selfReported: "自己申告",
    missing: "未記載",
    stale: "更新確認が必要",
    rejected: "再提出が必要",
  };
  return (
    <div className={`rounded border px-3 py-2 text-sm ${statusClasses[status]}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{label}</span>
        <span className="text-right text-xs font-semibold">{statusLabels[status]}</span>
      </div>
      <p className="mt-1 leading-6 text-stone-600">{detail}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className="mt-1 font-medium">{value || "未設定"}</dd>
    </div>
  );
}

function DirectInfo({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap leading-6 text-stone-700">{value || "未設定"}</dd>
    </div>
  );
}

function buildProposalDraft({
  companyName,
  jobTitle,
  matchedSkills,
  skillGaps,
  summary,
  startSignal,
  rateSignal,
  contactSignal,
}: {
  companyName: string;
  jobTitle: string;
  matchedSkills: string[];
  skillGaps: string[];
  summary?: string | null;
  startSignal?: string | null;
  rateSignal?: string | null;
  contactSignal?: string | null;
}) {
  const matchedSkillText = matchedSkills.slice(0, 4).join("、");
  const gapText = skillGaps.slice(0, 3).join("、");
  const experienceLine = summary
    ? `関連実績: ${summary.slice(0, 160)}${summary.length > 160 ? "..." : ""}`
    : "関連実績: 職務経歴に記載した開発経験をもとに、要件整理から実装・改善まで対応できます。";

  return [
    `${companyName} ご担当者さま`,
    "",
    `${jobTitle}の案件について、${matchedSkillText ? `${matchedSkillText}の経験を活かして` : "これまでの開発経験を活かして"}貢献できます。`,
    experienceLine,
    `稼働開始目安: ${startSignal || "面談で相談"}`,
    `契約・支払い条件: ${rateSignal ? `${rateSignal}を目安に相談希望` : "面談で確認希望"}`,
    `企業とのやりとり: ${contactSignal || "候補日時と確認事項をこの画面から共有できます"}`,
    gapText ? `面談で確認したいこと: ${gapText}に近い経験の活かし方と、初期に期待される役割を確認したいです。` : "面談で確認したいこと: 初期に期待される役割、進め方、優先度を確認したいです。",
    "",
    "よろしくお願いいたします。",
  ].join("\n");
}
