import Link from "next/link";
import { auth } from "@/lib/auth";
import { saveScreeningNote, screenApplication } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { getFreelancerReadiness } from "@/lib/readiness";
import { applicationStatusLabel, buildScreeningPassedHandoffMessage, formatDateTime, matchedSkills, parseSkills, skillMatchPercent } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, StatusBadge, TextArea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const companyUser = await prisma.companyUser.findUnique({
    where: { userId: session!.user.id },
    include: { companyProfile: true },
  });
  const application = await prisma.jobApplication.findFirst({
    where: { id, jobPost: { companyProfileId: companyUser!.companyProfileId } },
    include: {
      jobPost: true,
      freelancerProfile: { include: { careerHistory: true, documents: true } },
      notes: { orderBy: { createdAt: "desc" }, include: { companyUser: { include: { user: true } } } },
      interviewThread: true,
    },
  });
  if (!application) {
    return <Shell><TopNav sessionRole={session?.user?.role} /><div className="mx-auto max-w-4xl px-5 py-8"><Card>応募情報が見つかりません。</Card></div></Shell>;
  }
  const readiness = getFreelancerReadiness(application.freelancerProfile);
  const requiredSkills = parseSkills(application.jobPost.requiredSkills);
  const requiredSkillMatches = matchedSkills(application.jobPost.requiredSkills, application.freelancerProfile.skills);
  const matchedSkillSet = new Set(requiredSkillMatches.map((skill) => skill.toLowerCase()));
  const requiredSkillGaps = requiredSkills.filter((skill) => !matchedSkillSet.has(skill.toLowerCase()));
  const matchPercent = skillMatchPercent(application.jobPost.requiredSkills, application.freelancerProfile.skills);
  const hasStartSignal = Boolean(application.proposedStart || application.freelancerProfile.availableFrom || application.freelancerProfile.availability);
  const hasRateSignal = Boolean(application.freelancerProfile.desiredRate || application.jobPost.rate);
  const directFitItems = [
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
  const directFitCompleted = directFitItems.filter((item) => item.done).length;
  const directFitPercent = Math.round((directFitCompleted / directFitItems.length) * 100);
  const handoffMessageDraft = buildScreeningPassedHandoffMessage({
    companyName: companyUser!.companyProfile.name,
    freelancerName: application.freelancerProfile.fullName,
    jobTitle: application.jobPost.title,
    proposedStart: application.proposedStart,
    contactPreference: application.contactPreference,
    selectionFlow: application.jobPost.selectionFlow,
    contractTerms: application.jobPost.contractTerms,
  });

  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
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
              <h2 className="font-semibold">応募時の直接提案</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                {application.proposalMessage ?? "応募メッセージは未登録です。"}
              </p>
              <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <SummaryInfo label="稼働開始目安" value={application.proposedStart} />
                <SummaryInfo label="連絡希望" value={application.contactPreference} />
              </dl>
            </Card>
            {(application.jobPost.selectionFlow || application.jobPost.contractTerms) && (
              <Card>
                <h2 className="font-semibold">直接契約の前提</h2>
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
                  <h2 className="font-semibold">直接選考ブリーフ</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    仲介担当の補足なしで、応募者との面談判断に必要な一致点と確認点を整理します。
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold">{directFitPercent}%</p>
                  <p className="text-xs text-stone-500">
                    {directFitCompleted}/{directFitItems.length}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {directFitItems.map((item) => (
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
              <h2 className="font-semibold">直接面談へ進める</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                書類選考OKにすると、面談チャットを作成し、下の初回連絡を企業名義で送信します。
              </p>
              <form action={screenApplication} className="mt-4 grid gap-3">
                <input type="hidden" name="applicationId" value={application.id} />
                <input type="hidden" name="status" value="screening_passed" />
                <TextArea
                  name="handoffMessage"
                  label="初回連絡文"
                  defaultValue={handoffMessageDraft}
                  maxLength={1600}
                />
                <button className="btn btn-primary w-full" type="submit">書類選考OK・直接連絡を送る</button>
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
