import { auth } from "@/lib/auth";
import { sendInterviewMessage } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { getFreelancerReadiness } from "@/lib/readiness";
import { formatDateTime, formatOpenings, matchedSkills } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, SelectField, TextArea, TextField, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const thread = await prisma.interviewThread.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" }, include: { sender: true } },
      jobApplication: {
        include: {
          freelancerProfile: { include: { careerHistory: true, documents: true } },
          jobPost: { include: { companyProfile: { include: { users: true } } } },
        },
      },
    },
  });
  const canView =
    thread &&
    (thread.jobApplication.freelancerProfile.userId === session!.user.id ||
      thread.jobApplication.jobPost.companyProfile.users.some((user) => user.userId === session!.user.id));

  if (!thread || !canView) {
    return <Shell><TopNav sessionRole={session?.user?.role} /><div className="mx-auto max-w-4xl px-5 py-8"><Card>このチャットは閲覧できません。</Card></div></Shell>;
  }
  const proposedMessages = thread.messages.filter((message) => message.messageType === "proposed_time" && message.proposedAt);
  const latestProposed = proposedMessages.at(-1);
  const hasMeetingUrl = Boolean(thread.meetingUrl);
  const freelancer = thread.jobApplication.freelancerProfile;
  const jobPost = thread.jobApplication.jobPost;
  const company = jobPost.companyProfile;
  const readiness = getFreelancerReadiness(freelancer);
  const requiredSkillMatches = matchedSkills(jobPost.requiredSkills, freelancer.skills);
  const isCompanySender = thread.jobApplication.jobPost.companyProfile.users.some((user) => user.userId === session!.user.id);
  const directDealChecks = [
    {
      label: "双方の基本情報",
      detail: company.websiteUrl ? "企業サイトとフリーランスプロフィールを確認できます。" : "企業サイトが未登録です。",
      done: Boolean(company.websiteUrl && freelancer.fullName),
    },
    {
      label: "応募時の提案条件",
      detail:
        thread.jobApplication.proposedStart && thread.jobApplication.contactPreference
          ? "開始目安と連絡希望が応募時に共有されています。"
          : "開始目安または連絡希望が未設定です。",
      done: Boolean(thread.jobApplication.proposedStart && thread.jobApplication.contactPreference),
    },
    {
      label: "契約・支払い条件",
      detail: jobPost.contractTerms ? "企業が直接契約の前提を公開しています。" : "契約・支払い条件が未設定です。",
      done: Boolean(jobPost.contractTerms),
    },
    {
      label: "面談日時",
      detail: thread.scheduledAt ? `${formatDateTime(thread.scheduledAt)}で確定済みです。` : "候補日時の提案または承諾が必要です。",
      done: Boolean(thread.scheduledAt),
    },
    {
      label: "会議URL",
      detail: thread.meetingUrl ? "会議URLが共有されています。" : "確定後に会議URLを共有してください。",
      done: Boolean(thread.meetingUrl),
    },
  ];
  const completedDealChecks = directDealChecks.filter((item) => item.done).length;
  const dealReadinessPercent = Math.round((completedDealChecks / directDealChecks.length) * 100);
  const nextAction =
    thread.status === "scheduled"
      ? hasMeetingUrl
        ? "面談日時と会議URLが揃っています。必要があれば補足だけ送ってください。"
        : "面談日時は確定済みです。会議URLを共有してください。"
      : proposedMessages.length > 0
        ? "候補日時を確認し、承諾するか別候補を提案してください。"
        : "最初の候補日時を提案してください。";
  const starterMessage = buildDirectStarterMessage({
    isCompanySender,
    companyName: company.name,
    freelancerName: freelancer.fullName,
    jobTitle: jobPost.title,
    proposedStart: thread.jobApplication.proposedStart,
    contactPreference: thread.jobApplication.contactPreference,
    matchedSkills: requiredSkillMatches,
    selectionFlow: jobPost.selectionFlow,
    contractTerms: jobPost.contractTerms,
    hasMessages: thread.messages.length > 0,
    nextAction,
  });

  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-6xl px-5 py-8">
        <PageHeader title="面談日程調整チャット" description={`${thread.jobApplication.jobPost.title} / ${thread.jobApplication.freelancerProfile.fullName}`} />
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
          <Card>
            <div className="mb-5 flex flex-wrap gap-2">
              <StatusBadge tone={thread.status === "scheduled" ? "good" : "neutral"}>{thread.status === "scheduled" ? "日程確定" : "調整中"}</StatusBadge>
              {thread.scheduledAt && <StatusBadge tone="good">{formatDateTime(thread.scheduledAt)}</StatusBadge>}
              {thread.meetingUrl && <a className="text-sm font-semibold text-emerald-700" href={thread.meetingUrl} target="_blank">会議URL</a>}
            </div>
            <div className="grid gap-3">
              {thread.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded border p-3 text-sm ${message.senderUserId === session!.user.id ? "border-emerald-200 bg-emerald-50" : "border-stone-200 bg-white"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{message.sender.email}</span>
                    <span className="text-xs text-stone-500">{formatDateTime(message.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap leading-6">{message.body}</p>
                  {message.proposedAt && <p className="mt-2 text-xs text-stone-600">候補: {formatDateTime(message.proposedAt)}</p>}
                </div>
              ))}
              {thread.messages.length === 0 && <p className="text-sm text-stone-600">まだメッセージはありません。</p>}
            </div>
          </Card>
          <div className="grid h-fit gap-5">
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">直接進行ハンドオフ</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    企業とフリーランスが、面談前に相手情報・条件・信頼材料を同じ画面で確認できます。
                  </p>
                </div>
                <StatusBadge tone="good">仲介なし</StatusBadge>
              </div>

              <dl className="mt-4 grid gap-3 text-sm">
                <SummaryRow label="企業" value={company.name} />
                <SummaryRow label="フリーランス" value={`${freelancer.fullName}${freelancer.desiredOccupation ? ` / ${freelancer.desiredOccupation}` : ""}`} />
                <SummaryRow label="連絡先" value={thread.messages.length > 0 ? "このチャットで直接調整中" : "このチャットで直接調整開始"} />
                {company.websiteUrl && (
                  <div className="rounded border border-stone-200 bg-stone-50 p-3">
                    <dt className="text-xs text-stone-500">企業サイト</dt>
                    <dd className="mt-1 break-words font-semibold">
                      <a className="text-emerald-700" href={company.websiteUrl} target="_blank">
                        {company.websiteUrl}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-4 grid gap-2">
                <TrustSignal label="プロフィール充足" value={`${readiness.percent}%`} done={readiness.isReady} />
                <TrustSignal label="PDF書類" value={`${freelancer.documents.length}/2件`} done={freelancer.documents.length >= 2} />
                <TrustSignal label="職務経歴フォーム" value={freelancer.careerHistory ? "登録済み" : "未登録"} done={Boolean(freelancer.careerHistory)} />
              </div>

              {requiredSkillMatches.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-stone-500">必須スキルとの一致</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {requiredSkillMatches.map((skill) => (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800" key={skill}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {thread.jobApplication.proposalMessage && (
                <div className="mt-4 rounded border border-stone-200 bg-stone-50 p-3">
                  <p className="text-xs font-medium text-stone-500">応募時の直接提案</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{thread.jobApplication.proposalMessage}</p>
                </div>
              )}
            </Card>

            <Card>
              <h2 className="font-semibold">案件条件</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <SummaryRow label="単価" value={jobPost.rate ?? "未設定"} />
                <SummaryRow label="稼働率" value={jobPost.workload ?? "未設定"} />
                <SummaryRow label="契約期間" value={jobPost.contractPeriod ?? "未設定"} />
                <SummaryRow label="勤務地/リモート" value={[jobPost.location, jobPost.remotePolicy].filter(Boolean).join(" / ") || "未設定"} />
                <SummaryRow label="募集人数" value={formatOpenings(jobPost.openings)} />
              </dl>
            </Card>

            {(jobPost.selectionFlow || jobPost.contractTerms) && (
              <Card>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">直接契約チェック</h2>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      面談前に、仲介なしで合意する流れと契約条件を確認できます。
                    </p>
                  </div>
                  <StatusBadge tone="good">公開済み</StatusBadge>
                </div>
                <dl className="mt-4 grid gap-3 text-sm">
                  <SummaryRow label="選考フロー" value={jobPost.selectionFlow ?? "未設定"} multiline />
                  <SummaryRow label="契約・支払い条件" value={jobPost.contractTerms ?? "未設定"} multiline />
                </dl>
              </Card>
            )}

            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">直接成約レディネス</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    面談から直接契約へ進む前に、双方で揃える情報を確認できます。
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold">{dealReadinessPercent}%</p>
                  <p className="text-xs text-stone-500">
                    {completedDealChecks}/{directDealChecks.length}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {directDealChecks.map((item) => (
                  <DealReadinessItem detail={item.detail} done={item.done} key={item.label} label={item.label} />
                ))}
              </div>
            </Card>

            <Card>
              <h2 className="font-semibold">次のアクション</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">{nextAction}</p>
              <dl className="mt-4 grid gap-3 text-sm">
                <SummaryRow label="最新候補" value={latestProposed?.proposedAt ? formatDateTime(latestProposed.proposedAt) : "未提案"} />
                <SummaryRow label="確定日時" value={thread.scheduledAt ? formatDateTime(thread.scheduledAt) : "未確定"} />
                <SummaryRow label="会議URL" value={thread.meetingUrl ?? "未共有"} />
                <SummaryRow label="応募時の開始目安" value={thread.jobApplication.proposedStart ?? "未設定"} />
                <SummaryRow label="応募時の連絡希望" value={thread.jobApplication.contactPreference ?? "未設定"} />
              </dl>
            </Card>

            {proposedMessages.length > 0 && thread.status !== "scheduled" && (
              <Card>
                <h2 className="font-semibold">候補日時</h2>
                <div className="mt-3 grid gap-3">
                  {proposedMessages.map((message) => (
                    <form action={sendInterviewMessage} className="rounded border border-stone-200 p-3" key={message.id}>
                      <input type="hidden" name="threadId" value={thread.id} />
                      <input type="hidden" name="messageType" value="accepted_time" />
                      <input type="hidden" name="proposedAt" value={message.proposedAt!.toISOString()} />
                      <input type="hidden" name="body" value={`${formatDateTime(message.proposedAt)}で確定します。`} />
                      <p className="text-sm font-semibold">{formatDateTime(message.proposedAt)}</p>
                      <button className="btn btn-secondary mt-3 w-full" type="submit">この日時で確定</button>
                    </form>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <h2 className="font-semibold">直接連絡を送る</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                応募情報と案件条件から、仲介担当なしで次に確認すべき内容を下書きしています。
              </p>
              <form action={sendInterviewMessage} className="mt-4 grid gap-4">
                <input type="hidden" name="threadId" value={thread.id} />
                <SelectField name="messageType" label="種別" defaultValue="text">
                  <option value="text">テキスト</option>
                  <option value="proposed_time">候補日時の提案</option>
                  <option value="accepted_time">候補日時の承諾</option>
                  <option value="meeting_url">会議URL</option>
                </SelectField>
                <TextField name="proposedAt" label="候補/確定日時" type="datetime-local" />
                <TextArea name="body" label="本文またはURL" defaultValue={starterMessage} />
                <button className="btn btn-primary" type="submit">送信</button>
              </form>
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function buildDirectStarterMessage({
  isCompanySender,
  companyName,
  freelancerName,
  jobTitle,
  proposedStart,
  contactPreference,
  matchedSkills,
  selectionFlow,
  contractTerms,
  hasMessages,
  nextAction,
}: {
  isCompanySender: boolean;
  companyName: string;
  freelancerName: string;
  jobTitle: string;
  proposedStart?: string | null;
  contactPreference?: string | null;
  matchedSkills: string[];
  selectionFlow?: string | null;
  contractTerms?: string | null;
  hasMessages: boolean;
  nextAction: string;
}) {
  const recipient = isCompanySender ? `${freelancerName}さん` : `${companyName} ご担当者様`;
  const sender = isCompanySender ? companyName : freelancerName;
  const intro = hasMessages
    ? `${jobTitle}の面談調整について、次の確認です。`
    : `${jobTitle}について、仲介なしで直接面談調整を進めさせてください。`;
  const skillLine =
    matchedSkills.length > 0
      ? `確認済みの一致スキル: ${matchedSkills.slice(0, 5).join("、")}`
      : "確認済みの一致スキル: 面談で職務経歴とあわせて確認";
  const startLine = `稼働開始目安: ${proposedStart || "面談で確認"}`;
  const contactLine = `連絡希望: ${contactPreference || "このチャットで調整"}`;
  const flowLine = `選考フロー: ${selectionFlow || "面談で確認"}`;
  const termsLine = `契約・支払い条件: ${contractTerms || "面談で確認"}`;

  return [
    recipient,
    "",
    intro,
    "",
    skillLine,
    startLine,
    contactLine,
    flowLine,
    termsLine,
    "",
    `次のアクション: ${nextAction}`,
    "",
    "この内容で問題なければ、候補日時または確認したい条件を返信してください。",
    sender,
  ].join("\n");
}

function SummaryRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="rounded border border-stone-200 bg-stone-50 p-3">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className={`mt-1 break-words font-semibold ${multiline ? "whitespace-pre-wrap leading-6" : ""}`}>{value}</dd>
    </div>
  );
}

function TrustSignal({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm ${
        done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="text-xs font-semibold">{value}</span>
    </div>
  );
}

function DealReadinessItem({ label, detail, done }: { label: string; detail: string; done: boolean }) {
  return (
    <div
      className={`rounded border px-3 py-2 text-sm ${
        done ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{label}</span>
        <span className="text-xs font-semibold">{done ? "完了" : "要確認"}</span>
      </div>
      <p className="mt-1 leading-6 text-stone-600">{detail}</p>
    </div>
  );
}
