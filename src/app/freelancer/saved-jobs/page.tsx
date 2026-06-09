import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { removeSavedJob, saveJobForReview } from "@/lib/actions";
import { requireFreelancerProfile } from "@/lib/page-guards";
import { getFreelancerReadiness } from "@/lib/readiness";
import {
  directContractChecklist,
  formatDateTime,
  matchedSkills,
  parseSkills,
  preferenceAwareMatchScore,
  skillMatchPercent,
  visiblePreferenceReasons,
  workPreferenceCompleteness,
} from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, EmptyState, StatusBadge, TextArea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SavedJobsPage() {
  const { user, profile } = await requireFreelancerProfile({
    currentPath: "/freelancer/saved-jobs",
    include: {
      documents: true,
      careerHistory: true,
      workPreference: true,
      applications: { select: { jobPostId: true, status: true } },
      savedJobs: {
        include: { jobPost: { include: { companyProfile: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  const readiness = getFreelancerReadiness(profile);
  const preferenceCompleteness = workPreferenceCompleteness(profile.workPreference);
  const appliedByJobId = new Map(profile.applications.map((application) => [application.jobPostId, application.status]));
  const savedJobs =
    profile.savedJobs
      .map((savedJob) => {
        const job = savedJob.jobPost;
        const contractReadiness = directContractChecklist(job);
        const requiredSkills = parseSkills(job.requiredSkills);
        const matchPercent = skillMatchPercent(job.requiredSkills, profile.skills);
        const matched = matchedSkills(job.requiredSkills, profile.skills);
        const matchedSkillSet = new Set(matched.map((skill) => skill.toLowerCase()));
        const skillGaps = requiredSkills.filter((skill) => !matchedSkillSet.has(skill.toLowerCase()));
        const score = preferenceAwareMatchScore({
          ...job,
          freelancerReadinessPercent: readiness.percent,
          freelancerSkills: profile.skills,
          workPreference: profile.workPreference,
        });
        const preferenceReasons = visiblePreferenceReasons({ ...job, workPreference: profile.workPreference }, 5);
        const prepSheet = buildSavedJobPrepSheet({
          matched,
          skillGaps,
          contractMissingLabels: contractReadiness.items.filter((item) => !item.done).map((item) => item.label),
          missingReadinessLabels: readiness.items.filter((item) => !item.done).map((item) => item.label),
          availableFrom: profile.availableFrom,
          availability: profile.availability,
          desiredRate: profile.desiredRate,
          remotePreference: profile.remotePreference,
        });

        return {
          savedJob,
          contractReadiness,
          matchPercent,
          matched,
          prepSheet,
          preferenceReasons,
          score,
          appliedStatus: appliedByJobId.get(job.id),
          nextStep: buildSavedJobNextStep({
            applicationOpen: job.applicationStatus === "open",
            applied: Boolean(appliedByJobId.get(job.id)),
            contractMissingLabel: contractReadiness.items.find((item) => !item.done)?.label,
            missingReadinessLabel: readiness.items.find((item) => !item.done)?.label,
            note: savedJob.note,
            score,
          }),
        };
      })
      .sort((a, b) => b.score - a.score || b.savedJob.createdAt.getTime() - a.savedJob.createdAt.getTime());
  const openSavedCount = savedJobs.filter(({ savedJob, appliedStatus }) => !appliedStatus && savedJob.jobPost.applicationStatus === "open").length;
  const notedSavedCount = savedJobs.filter(({ savedJob }) => Boolean(savedJob.note)).length;
  const readySavedCount = savedJobs.filter(
    ({ appliedStatus, contractReadiness, score, savedJob }) =>
      !appliedStatus && savedJob.jobPost.applicationStatus === "open" && score >= 70 && contractReadiness.percent >= 80,
  ).length;

  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-6xl px-5 py-8">
        <PageHeader
          title="検討リスト"
          description="応募前に気になる案件を保存し、条件確認と応募準備をまとめて進めます。"
          action={<Link className="btn btn-secondary" href="/jobs?accepting=open&sort=direct">案件を探す</Link>}
        />
        {savedJobs.length > 0 && (
          <Card className="mt-6">
            <div className="grid gap-4 md:grid-cols-[1fr_220px] md:items-center">
              <div>
                <h2 className="font-semibold">応募前の優先確認</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                応募しやすさ、必須スキル、契約・支払い条件、検討メモを見て、先に準備する案件を選べます。
                  希望条件がある場合は、単価・稼働量・働き方の一致とミスマッチも優先度に反映します。
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
                <PrepStat label="応募準備" value={`${readiness.percent}%`} detail={`${readiness.completed}/${readiness.total}項目完了`} />
                <PrepStat label="応募へ進める候補" value={`${readySavedCount}件`} detail={`受付中 ${openSavedCount}件 / メモあり ${notedSavedCount}件`} />
              </div>
            </div>
          </Card>
        )}
        {savedJobs.length > 0 && (!preferenceCompleteness.usable || preferenceCompleteness.stale) && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            希望条件が{preferenceCompleteness.stale ? "古い、または未確認です" : "まだ少ない状態です"}。検討リストは表示しますが、優先度の信頼度を上げるには希望条件を更新してください。
            <Link className="ml-2 font-semibold text-amber-950 underline" href="/freelancer/preferences">希望条件を更新</Link>
          </div>
        )}
        <div className="mt-6 grid gap-4">
          {savedJobs.map(({ savedJob, contractReadiness, matchPercent, matched, prepSheet, preferenceReasons, score, appliedStatus, nextStep }) => (
            <SavedJobRow
              appliedStatus={appliedStatus}
              contractMissingItems={contractReadiness.items.filter((item) => !item.done)}
              contractPercent={contractReadiness.percent}
              job={savedJob.jobPost}
              key={savedJob.id}
              matched={matched}
              matchPercent={matchPercent}
              nextStep={nextStep}
              note={savedJob.note}
              prepSheet={prepSheet}
              preferenceReasons={preferenceReasons}
              savedAt={savedJob.createdAt}
              score={score}
            />
          ))}
          {savedJobs.length === 0 && (
            <EmptyState
              title="検討中の案件はまだありません。"
              description="公開案件から気になる案件を保存すると、応募前の条件確認と提案準備をここで続けられます。"
              action={<Link className="btn btn-primary" href="/jobs?accepting=open&sort=direct">公開案件を見る</Link>}
            />
          )}
        </div>
      </div>
    </Shell>
  );
}

type SavedJobPost = Prisma.JobPostGetPayload<{ include: { companyProfile: true } }>;
type ContractMissingItem = ReturnType<typeof directContractChecklist>["items"][number];
type SavedJobNextStep = {
  title: string;
  description: string;
  tone: "neutral" | "good" | "warn";
};
type SavedJobPrepSheet = {
  applicationPoints: string[];
  interviewChecks: string[];
  remainingTasks: string[];
};

function SavedJobRow({
  appliedStatus,
  contractMissingItems,
  contractPercent,
  job,
  matched,
  matchPercent,
  nextStep,
  note,
  prepSheet,
  preferenceReasons,
  savedAt,
  score,
}: {
  appliedStatus?: string;
  contractMissingItems: ContractMissingItem[];
  contractPercent: number;
  job: SavedJobPost;
  matched: string[];
  matchPercent: number | null;
  nextStep: SavedJobNextStep;
  note?: string | null;
  prepSheet: SavedJobPrepSheet;
  preferenceReasons: ReturnType<typeof visiblePreferenceReasons>;
  savedAt: Date;
  score: number;
}) {
  return (
    <Card>
      <div className="grid gap-4 lg:grid-cols-[1fr_220px] lg:items-start">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={appliedStatus ? "good" : job.applicationStatus === "open" ? "neutral" : "warn"}>
              {appliedStatus ? "応募済み" : job.applicationStatus === "open" ? "応募可" : "受付停止"}
            </StatusBadge>
            <StatusBadge tone={score >= 70 ? "good" : score >= 45 ? "neutral" : "warn"}>応募しやすさ {score}%</StatusBadge>
            <StatusBadge tone={contractPercent === 100 ? "good" : contractPercent >= 60 ? "neutral" : "warn"}>条件確認 {contractPercent}%</StatusBadge>
            <StatusBadge tone={matchPercent === null ? "neutral" : matchPercent >= 50 ? "good" : matchPercent > 0 ? "neutral" : "warn"}>
              必須一致 {matchPercent === null ? "要確認" : `${matchPercent}%`}
            </StatusBadge>
          </div>
          <h2 className="mt-3 text-xl font-semibold">{job.title}</h2>
          <p className="mt-1 text-sm text-stone-500">{job.companyProfile.name}</p>
          <p className="mt-2 text-xs text-stone-500">保存 {formatDateTime(savedAt)}</p>
          <div className="mt-3 grid gap-2 text-sm md:grid-cols-4">
            <SavedJobMeta label="単価" value={job.rate ?? "未設定"} />
            <SavedJobMeta label="稼働率" value={job.workload ?? "未設定"} />
            <SavedJobMeta label="契約期間" value={job.contractPeriod ?? "未設定"} />
            <SavedJobMeta label="勤務地" value={[job.location, job.remotePolicy].filter(Boolean).join(" / ") || "未設定"} />
          </div>
          {matched.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {matched.slice(0, 6).map((skill) => (
                <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800" key={skill}>
                  {skill}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {preferenceReasons.map((reason) => (
              <PreferenceReason reason={reason} key={`${job.id}-${reason.label}`} />
            ))}
          </div>
          {note && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-600">{note}</p>}
          <SavedJobPrepSheetCard prepSheet={prepSheet} />
        </div>
        <div className="grid gap-3">
          <div className={`rounded border px-3 py-2 ${nextStepClasses(nextStep.tone)}`}>
            <p className="text-xs font-medium opacity-80">次に進めること</p>
            <p className="mt-1 text-sm font-semibold">{nextStep.title}</p>
            <p className="mt-1 text-xs leading-5">{nextStep.description}</p>
          </div>
          <Link className="btn btn-primary" href={`/jobs/${job.id}`}>{appliedStatus ? "応募内容を見る" : "条件確認・応募準備"}</Link>
          {!appliedStatus && (
            <>
              <form action={saveJobForReview} className="rounded border border-stone-200 bg-stone-50 p-3">
                <input type="hidden" name="jobPostId" value={job.id} />
                <input type="hidden" name="returnTo" value="/freelancer/saved-jobs" />
                <TextArea
                  name="note"
                  label="検討メモ"
                  defaultValue={note}
                  maxLength={400}
                  placeholder="例: 稼働開始日、単価、面談で確認したい条件"
                />
                <button className="btn btn-secondary mt-3 w-full" type="submit">メモを保存</button>
              </form>
              {contractMissingItems.length > 0 && (
                <div className="rounded border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-900">面談前に確認したい条件</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {contractMissingItems.map((item) => (
                      <span className="rounded border border-amber-200 bg-white px-2 py-1 text-xs font-medium text-amber-900" key={item.key}>
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <form action={removeSavedJob}>
                <input type="hidden" name="jobPostId" value={job.id} />
                <input type="hidden" name="returnTo" value="/freelancer/saved-jobs" />
                <button className="btn btn-secondary w-full" type="submit">検討リストから外す</button>
              </form>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function PreferenceReason({ reason }: { reason: ReturnType<typeof visiblePreferenceReasons>[number] }) {
  const toneClasses = {
    neutral: "border-stone-200 bg-stone-50 text-stone-700",
    good: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
  };

  return (
    <div className={`rounded border px-3 py-2 ${toneClasses[reason.tone]}`}>
      <p className="text-xs font-semibold">{reason.label}</p>
      <p className="mt-1 text-xs leading-5 text-stone-600">{reason.detail}</p>
    </div>
  );
}

function SavedJobPrepSheetCard({ prepSheet }: { prepSheet: SavedJobPrepSheet }) {
  return (
    <div className="mt-4 rounded border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold">応募準備シート</h3>
        <p className="text-xs text-stone-500">提案文と面談前の確認に使うメモ</p>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <PrepSheetColumn
          empty="職務経歴と案件内容から、近い実績を1つ選んで書いてください。"
          items={prepSheet.applicationPoints}
          label="提案文で伝えること"
          tone="good"
        />
        <PrepSheetColumn
          empty="現時点で大きな確認点はありません。面談では役割と優先度を確認してください。"
          items={prepSheet.interviewChecks}
          label="面談で確認したいこと"
          tone="warn"
        />
        <PrepSheetColumn
          empty="応募に必要なプロフィールと書類は揃っています。"
          items={prepSheet.remainingTasks}
          label="応募前の残タスク"
          tone="neutral"
        />
      </div>
    </div>
  );
}

function PrepSheetColumn({
  empty,
  items,
  label,
  tone,
}: {
  empty: string;
  items: string[];
  label: string;
  tone: "neutral" | "good" | "warn";
}) {
  const toneClasses = {
    neutral: "border-stone-200 bg-white text-stone-700",
    good: "border-emerald-200 bg-white text-emerald-900",
    warn: "border-amber-200 bg-white text-amber-900",
  };

  return (
    <div className={`rounded border p-3 ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold">{label}</p>
      {items.length > 0 ? (
        <ul className="mt-2 grid gap-1.5 text-xs leading-5 text-stone-700">
          {items.slice(0, 4).map((item) => (
            <li className="break-words" key={item}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-5 text-stone-600">{empty}</p>
      )}
    </div>
  );
}

function PrepStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-stone-600">{detail}</p>
    </div>
  );
}

function SavedJobMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 truncate font-semibold">{value}</p>
    </div>
  );
}

function buildSavedJobPrepSheet({
  matched,
  skillGaps,
  contractMissingLabels,
  missingReadinessLabels,
  availableFrom,
  availability,
  desiredRate,
  remotePreference,
}: {
  matched: string[];
  skillGaps: string[];
  contractMissingLabels: string[];
  missingReadinessLabels: string[];
  availableFrom?: string | null;
  availability?: string | null;
  desiredRate?: string | null;
  remotePreference?: string | null;
}): SavedJobPrepSheet {
  const applicationPoints = [
    matched.length > 0 ? `一致スキル: ${matched.slice(0, 4).join("、")}` : "近い実績を職務経歴から1つ選ぶ",
    availableFrom || availability ? `稼働開始・稼働量: ${[availableFrom, availability].filter(Boolean).join(" / ")}` : "",
    desiredRate ? `契約・支払い条件: ${desiredRate}を目安に相談` : "",
    remotePreference ? `企業とのやりとり: ${remotePreference}` : "",
  ].filter(Boolean);
  const interviewChecks = [
    ...skillGaps.slice(0, 3).map((skill) => `${skill}の期待範囲`),
    ...contractMissingLabels.slice(0, 3).map((label) => `${label}の詳細`),
  ];
  const remainingTasks = missingReadinessLabels.map((label) => `${label}を登録`);

  return {
    applicationPoints,
    interviewChecks,
    remainingTasks,
  };
}

function buildSavedJobNextStep({
  applicationOpen,
  applied,
  contractMissingLabel,
  missingReadinessLabel,
  note,
  score,
}: {
  applicationOpen: boolean;
  applied: boolean;
  contractMissingLabel?: string;
  missingReadinessLabel?: string;
  note?: string | null;
  score: number;
}): SavedJobNextStep {
  if (applied) {
    return {
      title: "企業とのやりとりを確認",
      description: "応募内容と選考状況を確認し、面談調整へ進めます。",
      tone: "good",
    };
  }
  if (!applicationOpen) {
    return {
      title: "受付状況を確認",
      description: "応募受付が止まっているため、再開後に応募できるか確認してください。",
      tone: "warn",
    };
  }
  if (missingReadinessLabel) {
    return {
      title: `${missingReadinessLabel}を登録`,
      description: "応募前にプロフィールと提出書類を揃えると、すぐ提案文へ進めます。",
      tone: "warn",
    };
  }
  if (contractMissingLabel) {
    return {
      title: `${contractMissingLabel}を確認`,
      description: "検討メモに質問を残してから応募すると、面談で条件を確認しやすくなります。",
      tone: "neutral",
    };
  }
  if (!note) {
    return {
      title: "検討メモを残す",
      description: "応募理由、確認したい条件、希望する進め方を短く整理できます。",
      tone: "neutral",
    };
  }
  return {
    title: score >= 70 ? "応募文を仕上げる" : "条件確認・応募準備",
    description: "案件詳細で一致点と確認事項を見ながら、企業へ送る提案文を整えます。",
    tone: score >= 70 ? "good" : "neutral",
  };
}

function nextStepClasses(tone: SavedJobNextStep["tone"]) {
  const classes = {
    neutral: "border-stone-200 bg-stone-50 text-stone-700",
    good: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return classes[tone];
}
