import Link from "next/link";
import { saveScreeningNote, screenApplication } from "@/lib/actions";
import { requireCompanyUser } from "@/lib/page-guards";
import { prisma } from "@/lib/prisma";
import { getFreelancerReadiness } from "@/lib/readiness";
import { applicationStatusLabel, buildScreeningPassedHandoffMessage, formatDateTime, matchedSkills, parseSkills, skillMatchPercent } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, StatusBadge, TextArea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, companyUser } = await requireCompanyUser({ include: { companyProfile: true } });
  const application = await prisma.jobApplication.findFirst({
    where: { id, jobPost: { companyProfileId: companyUser.companyProfileId } },
    include: {
      jobPost: true,
      freelancerProfile: { include: { careerHistory: true, documents: true } },
      notes: { orderBy: { createdAt: "desc" }, include: { companyUser: { include: { user: true } } } },
      interviewThread: true,
    },
  });
  if (!application) {
    return <Shell><TopNav sessionRole={user.role} /><div className="mx-auto max-w-4xl px-5 py-8"><Card>応募情報が見つかりません。</Card></div></Shell>;
  }
  const readiness = getFreelancerReadiness(application.freelancerProfile);
  const requiredSkills = parseSkills(application.jobPost.requiredSkills);
  const requiredSkillMatches = matchedSkills(application.jobPost.requiredSkills, application.freelancerProfile.skills);
  const matchedSkillSet = new Set(requiredSkillMatches.map((skill) => skill.toLowerCase()));
  const requiredSkillGaps = requiredSkills.filter((skill) => !matchedSkillSet.has(skill.toLowerCase()));
  const matchPercent = skillMatchPercent(application.jobPost.requiredSkills, application.freelancerProfile.skills);
  const hasStartSignal = Boolean(application.proposedStart || application.freelancerProfile.availableFrom || application.freelancerProfile.availability);
  const hasRateSignal = Boolean(application.freelancerProfile.desiredRate || application.jobPost.rate);
  const interviewDecisionItems = [
    {
      label: "必須スキル",
      value: requiredSkills.length > 0 ? `${requiredSkillMatches.length}/${requiredSkills.length}` : "未設定",
      done: requiredSkills.length === 0 || requiredSkillMatches.length > 0,
    },
    {
      label: "応募準備",
      value: `${readiness.percent}%`,
      done: readiness.isReady,
    },
    {
      label: "開始条件",
      value: application.proposedStart || application.freelancerProfile.availableFrom || application.freelancerProfile.availability || "未設定",
      done: hasStartSignal,
    },
    {
      label: "単価情報",
      value: application.freelancerProfile.desiredRate || application.jobPost.rate || "未設定",
      done: hasRateSignal,
    },
  ];
  const interviewDecisionCompleted = interviewDecisionItems.filter((item) => item.done).length;
  const interviewDecisionPercent = Math.round((interviewDecisionCompleted / interviewDecisionItems.length) * 100);
  const interviewPrepSheet = buildInterviewPrepSheet({
    freelancerName: application.freelancerProfile.fullName,
    jobTitle: application.jobPost.title,
    matchedSkills: requiredSkillMatches,
    skillGaps: requiredSkillGaps,
    proposalMessage: application.proposalMessage,
    proposedStart: application.proposedStart,
    contactPreference: application.contactPreference,
    availability: application.freelancerProfile.availability,
    desiredRate: application.freelancerProfile.desiredRate,
    jobRate: application.jobPost.rate,
    workload: application.jobPost.workload,
    contractPeriod: application.jobPost.contractPeriod,
    selectionFlow: application.jobPost.selectionFlow,
    contractTerms: application.jobPost.contractTerms,
  });
  const screeningRubric = buildScreeningRubric({
    freelancerName: application.freelancerProfile.fullName,
    jobTitle: application.jobPost.title,
    matchPercent,
    matchedSkills: requiredSkillMatches,
    skillGaps: requiredSkillGaps,
    readinessPercent: readiness.percent,
    hasCareerHistory: Boolean(application.freelancerProfile.careerHistory),
    documentCount: application.freelancerProfile.documents.length,
    hasProposal: Boolean(application.proposalMessage),
    proposedStart: application.proposedStart,
    contactPreference: application.contactPreference,
    availability: application.freelancerProfile.availability,
    desiredRate: application.freelancerProfile.desiredRate,
    jobRate: application.jobPost.rate,
    workload: application.jobPost.workload,
    contractTerms: application.jobPost.contractTerms,
  });
  const handoffMessageDraft = buildScreeningPassedHandoffMessage({
    companyName: companyUser.companyProfile.name,
    freelancerName: application.freelancerProfile.fullName,
    jobTitle: application.jobPost.title,
    proposedStart: application.proposedStart,
    contactPreference: application.contactPreference,
    selectionFlow: application.jobPost.selectionFlow,
    contractTerms: application.jobPost.contractTerms,
  });
  const handoffChecks = buildHandoffChecks({
    matchedSkillCount: requiredSkillMatches.length,
    requiredSkillCount: requiredSkills.length,
    hasProposal: Boolean(application.proposalMessage),
    hasStartSignal,
    hasContactSignal: Boolean(application.contactPreference),
    hasSelectionFlow: Boolean(application.jobPost.selectionFlow),
    hasContractTerms: Boolean(application.jobPost.contractTerms),
  });
  const handoffReadyCount = handoffChecks.filter((check) => check.done).length;
  const handoffReadyPercent = Math.round((handoffReadyCount / handoffChecks.length) * 100);

  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-6xl px-5 py-8">
        <PageHeader title={application.freelancerProfile.fullName} description={application.jobPost.title} />
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-5">
            <Card>
              <StatusBadge tone={application.status === "screening_passed" ? "good" : application.status === "screening_rejected" ? "bad" : "neutral"}>
                {applicationStatusLabel(application.status)}
              </StatusBadge>
              <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
                <Info label="希望職種" value={application.freelancerProfile.desiredOccupation} />
                <Info label="スキル" value={application.freelancerProfile.skills} />
                <Info label="経験年数" value={application.freelancerProfile.yearsOfExperience?.toString()} />
                <Info label="希望単価" value={application.freelancerProfile.desiredRate} />
                <Info label="稼働条件" value={application.freelancerProfile.availability} />
                <Info label="リモート希望" value={application.freelancerProfile.remotePreference} />
              </dl>
            </Card>
            <Card>
              <h2 className="font-semibold">応募時の提案</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                {application.proposalMessage ?? "応募メッセージは未登録です。"}
              </p>
              <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <SummaryInfo label="稼働開始目安" value={application.proposedStart} />
                <SummaryInfo label="連絡希望" value={application.contactPreference} />
              </dl>
            </Card>
            <Card>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="font-semibold">面談判断ルーブリック</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    応募者を同じ観点で確認し、面談へ進める理由と確認事項を企業内メモに残します。
                  </p>
                </div>
                <StatusBadge tone={screeningRubric.readyCount >= 4 ? "good" : screeningRubric.readyCount >= 3 ? "neutral" : "warn"}>
                  {screeningRubric.readyCount}/{screeningRubric.items.length}
                </StatusBadge>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {screeningRubric.items.map((item) => (
                  <RubricItem item={item} key={item.label} />
                ))}
              </div>
              <form action={saveScreeningNote} className="mt-4 grid gap-3">
                <input type="hidden" name="applicationId" value={application.id} />
                <TextArea
                  name="note"
                  label="判断メモ"
                  defaultValue={screeningRubric.note}
                  maxLength={2400}
                />
                <button className="btn btn-secondary" type="submit">判断メモを保存</button>
              </form>
            </Card>
            {(application.jobPost.selectionFlow || application.jobPost.contractTerms) && (
              <Card>
                <h2 className="font-semibold">選考・条件の確認</h2>
                <dl className="mt-4 grid gap-3 text-sm">
                  <SummaryInfo label="選考フロー" value={application.jobPost.selectionFlow} multiline />
                  <SummaryInfo label="契約・支払い条件" value={application.jobPost.contractTerms} multiline />
                </dl>
              </Card>
            )}
            <Card>
              <h2 className="font-semibold">職務経歴フォーム</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">{application.freelancerProfile.careerHistory?.summary ?? "未登録"}</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">{application.freelancerProfile.careerHistory?.workExperiences}</p>
            </Card>
            <Card>
              <h2 className="font-semibold">PDF書類</h2>
              <div className="mt-3 grid gap-2">
                {application.freelancerProfile.documents.map((doc) => (
                  <a className="text-sm font-semibold text-emerald-700" href={`/api/documents/${doc.id}`} target="_blank" key={doc.id}>
                    {doc.documentType === "resume" ? "履歴書" : "職務経歴書"}: {doc.originalFilename}
                  </a>
                ))}
                {application.freelancerProfile.documents.length === 0 && <p className="text-sm text-stone-600">PDFは未登録です。</p>}
              </div>
            </Card>
            <Card>
              <h2 className="font-semibold">企業内メモ</h2>
              <form action={saveScreeningNote} className="mt-4 grid gap-3">
                <input type="hidden" name="applicationId" value={application.id} />
                <TextArea name="note" label="メモ" />
                <button className="btn btn-secondary" type="submit">メモを追加</button>
              </form>
              <div className="mt-5 grid gap-3">
                {application.notes.map((note) => (
                  <div className="rounded border border-stone-200 p-3 text-sm" key={note.id}>
                    <p className="whitespace-pre-wrap">{note.note}</p>
                    <p className="mt-2 text-xs text-stone-500">{formatDateTime(note.createdAt)}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
          <div className="grid h-fit gap-5">
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">面談判断ブリーフ</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    応募者との面談判断に必要な一致点と確認点を整理します。
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold">{interviewDecisionPercent}%</p>
                  <p className="text-xs text-stone-500">
                    {interviewDecisionCompleted}/{interviewDecisionItems.length}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {interviewDecisionItems.map((item) => (
                  <FitSignal done={item.done} key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
              <div className="mt-4 grid gap-3">
                <SkillReview
                  empty="必須スキルが未設定です。職務経歴と応募提案から判断してください。"
                  label={`一致スキル${matchPercent === null ? "" : ` (${matchPercent}%)`}`}
                  skills={requiredSkillMatches}
                  tone="good"
                />
                <SkillReview
                  empty="必須スキルの未一致項目はありません。"
                  label="面談で確認したいギャップ"
                  skills={requiredSkillGaps.slice(0, 6)}
                  tone="warn"
                />
              </div>
            </Card>
            <Card>
              <h2 className="font-semibold">応募概要</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <SummaryInfo label="応募日時" value={formatDateTime(application.appliedAt)} />
                <SummaryInfo label="選考日時" value={formatDateTime(application.screenedAt)} />
                <SummaryInfo label="稼働条件" value={application.freelancerProfile.availability} />
                <SummaryInfo label="勤務地希望" value={application.freelancerProfile.preferredLocation} />
                <SummaryInfo label="稼働開始" value={application.freelancerProfile.availableFrom} />
                <SummaryInfo label="応募時の開始目安" value={application.proposedStart} />
                <SummaryInfo label="応募時の連絡希望" value={application.contactPreference} />
              </dl>
            </Card>
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">応募書類チェック</h2>
                  <p className="mt-1 text-sm text-stone-600">選考前に確認する情報の充足状況です。</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold">{readiness.percent}%</p>
                  <p className="text-xs text-stone-500">{readiness.completed}/{readiness.total}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {readiness.items.map((item) => (
                  <div
                    className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm ${
                      item.done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}
                    key={item.key}
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="text-xs font-semibold">{item.done ? "完了" : "未完了"}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h2 className="font-semibold">面談確認シート</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                面談で確認したい一致点、懸念点、契約・支払い条件を企業内メモとして残せます。
              </p>
              <form action={saveScreeningNote} className="mt-4 grid gap-3">
                <input type="hidden" name="applicationId" value={application.id} />
                <TextArea
                  name="note"
                  label="確認内容"
                  defaultValue={interviewPrepSheet}
                  maxLength={2400}
                />
                <button className="btn btn-secondary" type="submit">企業内メモに保存</button>
              </form>
            </Card>
            <Card>
              <h2 className="font-semibold">面談調整へ進める</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                書類選考OKにすると、面談チャットを作成し、下の初回連絡を企業名義で送信します。
              </p>
              <div className="mt-4 rounded border border-stone-200 bg-stone-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">初回連絡の確認</p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      応募者が次に動けるように、面談候補日時、確認したい条件、判断材料を送信前に揃えます。
                    </p>
                  </div>
                  <StatusBadge tone={handoffReadyPercent >= 80 ? "good" : handoffReadyPercent >= 60 ? "neutral" : "warn"}>
                    {handoffReadyPercent}%
                  </StatusBadge>
                </div>
                <div className="mt-3 grid gap-2">
                  {handoffChecks.map((check) => (
                    <HandoffCheckItem check={check} key={check.label} />
                  ))}
                </div>
              </div>
              <form action={screenApplication} className="mt-4 grid gap-3">
                <input type="hidden" name="applicationId" value={application.id} />
                <input type="hidden" name="status" value="screening_passed" />
                <TextArea
                  name="handoffMessage"
                  label="初回連絡文"
                  defaultValue={handoffMessageDraft}
                  maxLength={1600}
                />
                <label className="flex gap-2 rounded border border-emerald-100 bg-emerald-50/70 p-3 text-sm leading-6 text-stone-700">
                  <input className="mt-1 size-4 accent-emerald-700" name="handoffConfirmed" required type="checkbox" />
                  <span>
                    初回連絡文に、面談調整で必要な候補日時の依頼、契約・支払い条件、確認したい点が入っていることを確認しました。
                  </span>
                </label>
                <button className="btn btn-primary w-full" type="submit">書類選考OK・初回連絡を送る</button>
              </form>
            </Card>
            <Card>
              <h2 className="font-semibold">見送り</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">今回は面談へ進めない場合にステータスを更新します。</p>
              <div className="mt-4 grid gap-3">
                <form action={screenApplication}>
                  <input type="hidden" name="applicationId" value={application.id} />
                  <input type="hidden" name="status" value="screening_rejected" />
                  <button className="btn btn-danger w-full" type="submit">書類選考NG</button>
                </form>
                {application.interviewThread && <Link className="btn btn-secondary" href={`/interviews/${application.interviewThread.id}`}>面談チャット</Link>}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function FitSignal({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm ${
        done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="text-right text-xs font-semibold">{value}</span>
    </div>
  );
}

function SkillReview({
  label,
  skills,
  tone,
  empty,
}: {
  label: string;
  skills: string[];
  tone: "good" | "warn";
  empty: string;
}) {
  const chipClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <div>
      <p className="text-xs font-medium text-stone-500">{label}</p>
      {skills.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span className={`rounded border px-2 py-1 text-xs font-medium ${chipClass}`} key={skill}>
              {skill}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-600">{empty}</p>
      )}
    </div>
  );
}

type RubricItem = {
  label: string;
  grade: "確認済み" | "追加確認" | "未確認";
  detail: string;
  questions: string[];
};

function RubricItem({ item }: { item: RubricItem }) {
  const tone =
    item.grade === "確認済み"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : item.grade === "追加確認"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-stone-200 bg-stone-50 text-stone-700";

  return (
    <div className={`rounded border p-3 text-sm ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">{item.label}</p>
        <span className="shrink-0 rounded bg-white/70 px-2 py-1 text-xs font-semibold">{item.grade}</span>
      </div>
      <p className="mt-2 leading-6 text-stone-700">{item.detail}</p>
      {item.questions.length > 0 && (
        <ul className="mt-2 grid gap-1.5 text-stone-700">
          {item.questions.map((question) => (
            <li className="flex gap-2" key={question}>
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-60" />
              <span>{question}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type HandoffCheck = {
  label: string;
  detail: string;
  done: boolean;
};

function HandoffCheckItem({ check }: { check: HandoffCheck }) {
  return (
    <div
      className={`rounded border px-3 py-2 text-sm ${
        check.done ? "border-emerald-200 bg-white text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{check.label}</span>
        <span className="text-xs font-semibold">{check.done ? "確認済み" : "要確認"}</span>
      </div>
      <p className="mt-1 leading-6 text-stone-600">{check.detail}</p>
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

function SummaryInfo({ label, value, multiline }: { label: string; value?: string | null; multiline?: boolean }) {
  return (
    <div className="rounded border border-stone-200 bg-stone-50 p-3">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className={`mt-1 break-words font-semibold ${multiline ? "whitespace-pre-wrap leading-6" : ""}`}>{value || "未設定"}</dd>
    </div>
  );
}

function buildInterviewPrepSheet({
  freelancerName,
  jobTitle,
  matchedSkills,
  skillGaps,
  proposalMessage,
  proposedStart,
  contactPreference,
  availability,
  desiredRate,
  jobRate,
  workload,
  contractPeriod,
  selectionFlow,
  contractTerms,
}: {
  freelancerName: string;
  jobTitle: string;
  matchedSkills: string[];
  skillGaps: string[];
  proposalMessage?: string | null;
  proposedStart?: string | null;
  contactPreference?: string | null;
  availability?: string | null;
  desiredRate?: string | null;
  jobRate?: string | null;
  workload?: string | null;
  contractPeriod?: string | null;
  selectionFlow?: string | null;
  contractTerms?: string | null;
}) {
  return [
    `面談確認シート: ${freelancerName} / ${jobTitle}`,
    "",
    "応募内容で評価したい点",
    `- 一致スキル: ${matchedSkills.length > 0 ? matchedSkills.join("、") : "職務経歴と提案文から確認"}`,
    `- 応募時の提案: ${proposalMessage || "未登録"}`,
    "",
    "面談で確認する点",
    `- スキルの確認: ${skillGaps.length > 0 ? skillGaps.slice(0, 6).join("、") : "必須スキルの不足項目なし"}`,
    `- 稼働開始目安: ${proposedStart || "応募者に確認"}`,
    `- 稼働条件: ${availability || workload || "応募者に確認"}`,
    `- 連絡希望: ${contactPreference || "面談チャットで確認"}`,
    "",
    "契約・支払い条件",
    `- 単価: ${desiredRate || jobRate || "面談で確認"}`,
    `- 契約期間: ${contractPeriod || "面談で確認"}`,
    `- 契約・支払い条件: ${contractTerms || "面談で確認"}`,
    "",
    "次の案内",
    `- 選考フロー: ${selectionFlow || "面談で説明"}`,
    "- 面談後の判断期限:",
  ].join("\n");
}

function buildScreeningRubric({
  freelancerName,
  jobTitle,
  matchPercent,
  matchedSkills,
  skillGaps,
  readinessPercent,
  hasCareerHistory,
  documentCount,
  hasProposal,
  proposedStart,
  contactPreference,
  availability,
  desiredRate,
  jobRate,
  workload,
  contractTerms,
}: {
  freelancerName: string;
  jobTitle: string;
  matchPercent: number | null;
  matchedSkills: string[];
  skillGaps: string[];
  readinessPercent: number;
  hasCareerHistory: boolean;
  documentCount: number;
  hasProposal: boolean;
  proposedStart?: string | null;
  contactPreference?: string | null;
  availability?: string | null;
  desiredRate?: string | null;
  jobRate?: string | null;
  workload?: string | null;
  contractTerms?: string | null;
}) {
  const hasStartCondition = Boolean(proposedStart || availability);
  const hasRateCondition = Boolean(desiredRate || jobRate);
  const hasContractCondition = Boolean(workload && contractTerms);
  const items: RubricItem[] = [
    {
      label: "スキル適合",
      grade: matchPercent === null ? "追加確認" : matchPercent >= 60 ? "確認済み" : matchedSkills.length > 0 ? "追加確認" : "未確認",
      detail:
        matchPercent === null
          ? "案件の必須スキルが未設定です。職務経歴と提案文から担当範囲を確認してください。"
          : `必須スキル一致は${matchPercent}%です。一致: ${matchedSkills.length > 0 ? matchedSkills.slice(0, 5).join("、") : "未確認"}`,
      questions:
        skillGaps.length > 0
          ? [`未一致項目（${skillGaps.slice(0, 4).join("、")}）に近い経験や補完方法を確認する`]
          : ["初回に任せたい業務で、どの経験を活かせるか確認する"],
    },
    {
      label: "実績・書類",
      grade: readinessPercent >= 80 && hasCareerHistory && documentCount >= 2 ? "確認済み" : readinessPercent >= 60 ? "追加確認" : "未確認",
      detail: `応募準備は${readinessPercent}%です。職務経歴${hasCareerHistory ? "あり" : "未登録"}、PDF ${documentCount}/2。`,
      questions: [
        hasCareerHistory ? "直近プロジェクトの役割、成果、担当範囲を確認する" : "職務経歴の不足分を面談前に共有できるか確認する",
      ],
    },
    {
      label: "提案内容",
      grade: hasProposal ? "確認済み" : "未確認",
      detail: hasProposal ? "応募時の提案が登録されています。案件への貢献内容を面談で深掘りできます。" : "応募時の提案が未登録です。",
      questions: ["最初の2週間で期待する成果と、応募者が担える範囲をすり合わせる"],
    },
    {
      label: "稼働・連絡",
      grade: hasStartCondition && contactPreference ? "確認済み" : hasStartCondition || contactPreference ? "追加確認" : "未確認",
      detail: `開始目安: ${proposedStart || availability || "未設定"} / 連絡希望: ${contactPreference || "未設定"}`,
      questions: ["面談候補日時、開始時期、週あたりの稼働量を確認する"],
    },
    {
      label: "契約・支払い条件",
      grade: hasRateCondition && hasContractCondition ? "確認済み" : hasRateCondition || hasContractCondition ? "追加確認" : "未確認",
      detail: `単価: ${desiredRate || jobRate || "未設定"} / 稼働量: ${workload || "未設定"} / 条件: ${contractTerms || "未設定"}`,
      questions: ["契約期間、支払い条件、稼働開始後の確認サイクルを面談前に整理する"],
    },
  ];
  const readyCount = items.filter((item) => item.grade === "確認済み").length;
  const note = [
    `面談判断ルーブリック: ${freelancerName} / ${jobTitle}`,
    "",
    ...items.flatMap((item) => [
      `【${item.label}】${item.grade}`,
      item.detail,
      ...item.questions.map((question) => `- ${question}`),
      "",
    ]),
    "判断",
    "- 面談へ進める理由:",
    "- 面談前に依頼すること:",
    "- 見送りの場合の理由:",
  ].join("\n");

  return { items, note, readyCount };
}

function buildHandoffChecks({
  matchedSkillCount,
  requiredSkillCount,
  hasProposal,
  hasStartSignal,
  hasContactSignal,
  hasSelectionFlow,
  hasContractTerms,
}: {
  matchedSkillCount: number;
  requiredSkillCount: number;
  hasProposal: boolean;
  hasStartSignal: boolean;
  hasContactSignal: boolean;
  hasSelectionFlow: boolean;
  hasContractTerms: boolean;
}): HandoffCheck[] {
  return [
    {
      label: "判断材料",
      detail:
        requiredSkillCount === 0
          ? "必須スキルが未設定のため、職務経歴と応募時の提案をもとに確認します。"
          : `必須スキル ${matchedSkillCount}/${requiredSkillCount} 件を確認しています。`,
      done: requiredSkillCount === 0 || matchedSkillCount > 0,
    },
    {
      label: "応募時の提案",
      detail: "初回連絡前に、応募者がこの案件で伝えた貢献内容を確認します。",
      done: hasProposal,
    },
    {
      label: "開始条件",
      detail: "稼働開始目安や稼働条件を、面談で確認する前提として整理します。",
      done: hasStartSignal,
    },
    {
      label: "企業とのやりとり",
      detail: "連絡希望が未設定の場合は、初回連絡文で候補日時を複数依頼します。",
      done: hasContactSignal,
    },
    {
      label: "選考フロー",
      detail: "面談回数や次の判断タイミングを応募者へ案内できる状態にします。",
      done: hasSelectionFlow,
    },
    {
      label: "契約・支払い条件",
      detail: "単価、契約期間、支払い条件の確認漏れを面談前に減らします。",
      done: hasContractTerms,
    },
  ];
}
