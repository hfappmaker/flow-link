import { auth } from "@/lib/auth";
import { sendInterviewMessage } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { getFreelancerReadiness } from "@/lib/readiness";
import { formatDateTime, formatOpenings, skillPreview } from "@/lib/utils";
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
  const matchedSkills = getMatchedSkills(jobPost.requiredSkills, freelancer.skills);
  const nextAction =
    thread.status === "scheduled"
      ? hasMeetingUrl
        ? "面談日時と会議URLが揃っています。必要があれば補足だけ送ってください。"
        : "面談日時は確定済みです。会議URLを共有してください。"
      : proposedMessages.length > 0
        ? "候補日時を確認し、承諾するか別候補を提案してください。"
        : "最初の候補日時を提案してください。";

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

              {matchedSkills.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-stone-500">必須スキルとの一致</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {matchedSkills.map((skill) => (
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
              <h2 className="font-semibold">送信</h2>
              <form action={sendInterviewMessage} className="mt-4 grid gap-4">
                <input type="hidden" name="threadId" value={thread.id} />
                <SelectField name="messageType" label="種別" defaultValue="text">
                  <option value="text">テキスト</option>
                  <option value="proposed_time">候補日時の提案</option>
                  <option value="accepted_time">候補日時の承諾</option>
                  <option value="meeting_url">会議URL</option>
                </SelectField>
                <TextField name="proposedAt" label="候補/確定日時" type="datetime-local" />
                <TextArea name="body" label="本文またはURL" />
                <button className="btn btn-primary" type="submit">送信</button>
              </form>
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-stone-200 bg-stone-50 p-3">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-semibold">{value}</dd>
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

function getMatchedSkills(requiredSkills: string | null, freelancerSkills: string | null | undefined) {
  const freelancerSkillSet = new Set(skillPreview(freelancerSkills, 20).map((skill) => skill.toLowerCase()));
  return skillPreview(requiredSkills, 20).filter((skill) => freelancerSkillSet.has(skill.toLowerCase()));
}
