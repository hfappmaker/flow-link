import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { applyToJob, removeSavedJob, saveJobForReview } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { publicDbRead } from "@/lib/public-db";
import { getFreelancerReadiness } from "@/lib/readiness";
import { applicationStatusLabel, directContractChecklist, formatDateTime, formatOpenings, matchedSkills, parseSkills } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, StatusBadge, TextArea, TextField } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = process.env.AUTH_SECRET ? await auth().catch(() => null) : null;
  const job = await publicDbRead(
    () =>
      prisma.jobPost.findFirst({
        where: { id, status: "published" },
        include: { companyProfile: true },
      }),
    null,
  );
  const freelancerProfile =
    session?.user?.role === "freelancer"
      ? await publicDbRead(
          () =>
            prisma.freelancerProfile.findUnique({
              where: { userId: session.user.id },
              include: { documents: true, careerHistory: true },
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

  if (!job) {
    notFound();
  }
  const requiredSkills = parseSkills(job.requiredSkills);
  const requiredSkillMatches = freelancerProfile ? matchedSkills(job.requiredSkills, freelancerProfile.skills) : [];
  const matchedSkillSet = new Set(requiredSkillMatches.map((skill) => skill.toLowerCase()));
  const requiredSkillGaps = requiredSkills.filter((skill) => !matchedSkillSet.has(skill.toLowerCase()));
  const matchPercent = requiredSkills.length > 0 ? Math.round((requiredSkillMatches.length / requiredSkills.length) * 100) : null;
  const contractReadiness = directContractChecklist(job);
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

  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
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
                  <h2 className="font-semibold">応募前の確認</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    応募前に、案件側で確認できる条件です。
                  </p>
                </div>
                <StatusBadge tone={contractReadiness.isReady ? "good" : "warn"}>{contractReadiness.percent}%</StatusBadge>
              </div>
              <div className="mt-4 grid gap-2">
                {contractReadiness.items.map((item) => (
                  <ContractReadinessItem detail={item.detail} done={item.done} key={item.key} label={item.label} />
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
                      <button className="btn btn-secondary w-full sm:w-auto" type="submit">
                        {savedJob ? "検討リストから外す" : "検討リストに保存"}
                      </button>
                    </form>
                  </div>
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
                    maxLength={120}
                    placeholder="例: 7月第1週から / 契約後2週間で開始可"
                  />
                  <TextField
                    name="contactPreference"
                    label="連絡希望"
                    maxLength={120}
                    placeholder="例: 平日18時以降のオンライン面談を希望"
                  />
                  <button className="btn btn-primary" type="submit">この案件に応募</button>
                </form>
              ) : session?.user?.role === "freelancer" && job.applicationStatus === "open" ? (
                <div>
                  <p className="font-semibold">応募準備が未完了です</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    応募前にプロフィール、職務経歴、PDF書類を揃えてください。
                  </p>
                  <div className="mt-4 grid gap-2">
                    {readiness.items
                      .filter((item) => !item.done)
                      .map((item) => (
                        <Link className="btn btn-secondary justify-start" href={item.href} key={item.key}>
                          {item.label}を登録
                        </Link>
                      ))}
                  </div>
                </div>
              ) : session ? (
                <p className="text-sm text-stone-600">応募にはフリーランスアカウントが必要です。</p>
              ) : (
                <Link className="btn btn-primary w-full" href={`/login?callbackUrl=/jobs/${job.id}`}>ログインして応募</Link>
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
