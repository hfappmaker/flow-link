import { sendInterviewMessage, sendInterviewTimeOptions, submitInteractionFeedback } from "@/lib/actions";
import { getInterviewThreadForPage } from "@/lib/page-guards";
import { getFreelancerReadiness } from "@/lib/readiness";
import { formatDateTime, formatOpenings, matchedSkills, parseSkills } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, SelectField, TextArea, TextField, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, thread } = await getInterviewThreadForPage(id);

  if (!thread) {
    return <Shell><TopNav sessionRole={user.role} /><div className="mx-auto max-w-4xl px-5 py-8"><Card>このチャットは閲覧できません。</Card></div></Shell>;
  }
  const proposedMessages = thread.messages.filter((message) => message.messageType === "proposed_time" && message.proposedAt);
  const latestProposed = proposedMessages.at(-1);
  const latestProposedOptions = thread.status === "scheduled" ? [] : proposedMessages.slice(-3);
  const olderProposedCount = Math.max(0, proposedMessages.length - latestProposedOptions.length);
  const hasMeetingUrl = Boolean(thread.meetingUrl);
  const freelancer = thread.jobApplication.freelancerProfile;
  const jobPost = thread.jobApplication.jobPost;
  const company = jobPost.companyProfile;
  const readiness = getFreelancerReadiness(freelancer);
  const requiredSkillMatches = matchedSkills(jobPost.requiredSkills, freelancer.skills);
  const isCompanySender = thread.jobApplication.jobPost.companyProfile.users.some((companyUser) => companyUser.userId === user.id);
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
      detail: jobPost.contractTerms ? "企業が契約・支払い条件を公開しています。" : "契約・支払い条件が未設定です。",
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
  const coordinationSteps = [
    {
      label: "候補日時",
      detail: latestProposed?.proposedAt ? formatDateTime(latestProposed.proposedAt) : "候補を提案してください",
      done: proposedMessages.length > 0 || Boolean(thread.scheduledAt),
    },
    {
      label: "面談日時",
      detail: thread.scheduledAt ? formatDateTime(thread.scheduledAt) : "候補日時から確定してください",
      done: Boolean(thread.scheduledAt),
    },
    {
      label: "会議URL",
      detail: thread.meetingUrl ?? "確定後に共有してください",
      done: Boolean(thread.meetingUrl),
    },
    {
      label: "条件確認",
      detail: jobPost.contractTerms ? "契約・支払い条件を確認できます" : "面談で支払い条件を確認してください",
      done: Boolean(jobPost.contractTerms),
    },
  ];
  const nextCoordinationStep = coordinationSteps.find((step) => !step.done);
  const nextAction =
    thread.status === "scheduled"
      ? hasMeetingUrl
        ? "面談日時と会議URLが揃っています。必要があれば補足だけ送ってください。"
        : "面談日時は確定済みです。会議URLを共有してください。"
      : proposedMessages.length > 0
        ? "候補日時を確認し、承諾するか別候補を提案してください。"
        : "最初の候補日時を提案してください。";
  const meetingBrief = buildMeetingBrief({
    freelancer,
    jobPost,
    companyName: company.name,
    matchedSkills: requiredSkillMatches,
    proposedStart: thread.jobApplication.proposedStart,
    contactPreference: thread.jobApplication.contactPreference,
    scheduledAt: thread.scheduledAt,
    meetingUrl: thread.meetingUrl,
  });
  const preparationPlan = buildInterviewPreparationPlan({
    isCompanySender,
    scheduledAt: thread.scheduledAt,
    meetingUrl: thread.meetingUrl,
    proposedMessageCount: proposedMessages.length,
    contractTerms: jobPost.contractTerms,
    selectionFlow: jobPost.selectionFlow,
    proposedStart: thread.jobApplication.proposedStart,
    contactPreference: thread.jobApplication.contactPreference,
    readinessPercent: readiness.percent,
    documentCount: freelancer.documents.length,
    hasCareerHistory: Boolean(freelancer.careerHistory),
    requiredSkillCount: parseSkills(jobPost.requiredSkills).length,
    matchedSkillCount: requiredSkillMatches.length,
    openQuestions: meetingBrief.openQuestions,
  });
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
    agenda: meetingBrief.agenda,
    openQuestions: meetingBrief.openQuestions,
  });
  const timeOptionNote = buildTimeOptionNote({
    isCompanySender,
    jobTitle: jobPost.title,
    proposedStart: thread.jobApplication.proposedStart,
    contactPreference: thread.jobApplication.contactPreference,
    openQuestions: meetingBrief.openQuestions,
  });
  const postInterviewPlan = buildPostInterviewPlan({
    isCompanySender,
    companyName: company.name,
    freelancerName: freelancer.fullName,
    jobTitle: jobPost.title,
    scheduledAt: thread.scheduledAt,
    meetingUrl: thread.meetingUrl,
    selectionFlow: jobPost.selectionFlow,
    contractTerms: jobPost.contractTerms,
    rate: jobPost.rate,
    desiredRate: freelancer.desiredRate,
    workload: jobPost.workload,
    availability: freelancer.availability,
    proposedStart: thread.jobApplication.proposedStart,
    contactPreference: thread.jobApplication.contactPreference,
    openQuestions: meetingBrief.openQuestions,
  });
  const existingFeedback = thread.jobApplication.interactionFeedback[0] ?? null;
  const feedbackTarget = isCompanySender ? freelancer.fullName : company.name;
  const feedbackEligible = Boolean(thread.scheduledAt);

  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-6xl px-5 py-8">
        <PageHeader title="面談日程調整チャット" description={`${thread.jobApplication.jobPost.title} / ${thread.jobApplication.freelancerProfile.fullName}`} />
        <Card className="mt-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_240px] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={thread.status === "scheduled" ? "good" : "warn"}>
                  {thread.status === "scheduled" ? "面談日時確定" : "面談調整中"}
                </StatusBadge>
                <StatusBadge tone={hasMeetingUrl ? "good" : "neutral"}>{hasMeetingUrl ? "会議URL共有済み" : "会議URL未共有"}</StatusBadge>
              </div>
              <h2 className="mt-4 text-xl font-semibold">面談調整ボード</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                次に必要な作業は「{nextCoordinationStep?.label ?? "最終確認"}」です。候補日時、会議URL、契約・支払い条件を揃えてから面談に進んでください。
              </p>
            </div>
            <div className="rounded border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-medium text-stone-500">面談前の準備</p>
              <p className="mt-1 text-3xl font-semibold">{dealReadinessPercent}%</p>
              <p className="mt-1 text-sm text-stone-600">
                {completedDealChecks}/{directDealChecks.length}項目完了
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {coordinationSteps.map((step, index) => (
              <CoordinationStep detail={step.detail} done={step.done} index={index + 1} key={step.label} label={step.label} />
            ))}
          </div>
        </Card>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
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
                  className={`rounded border p-3 text-sm ${message.senderUserId === user.id ? "border-emerald-200 bg-emerald-50" : "border-stone-200 bg-white"}`}
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
                  <h2 className="font-semibold">面談準備タスク</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    {preparationPlan.description}
                  </p>
                </div>
                <StatusBadge tone={preparationPlan.completed === preparationPlan.total ? "good" : "warn"}>
                  {preparationPlan.completed}/{preparationPlan.total}
                </StatusBadge>
              </div>
              <div className="mt-4 grid gap-2">
                {preparationPlan.tasks.map((task) => (
                  <PreparationTaskItem
                    detail={task.detail}
                    done={task.done}
                    key={task.label}
                    label={task.label}
                    owner={task.owner}
                  />
                ))}
              </div>
              {preparationPlan.focusQuestions.length > 0 && (
                <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-900">面談で先に確認すること</p>
                  <div className="mt-2 grid gap-2">
                    {preparationPlan.focusQuestions.map((question) => (
                      <p className="text-sm leading-6 text-amber-900" key={question}>
                        {question}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">面談前の確認</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    企業とフリーランスが、面談前に相手情報・条件・信頼材料を同じ画面で確認できます。
                  </p>
                </div>
                <StatusBadge tone={thread.status === "scheduled" ? "good" : "neutral"}>
                  {thread.status === "scheduled" ? "日程確定" : "確認中"}
                </StatusBadge>
              </div>

              <dl className="mt-4 grid gap-3 text-sm">
                <SummaryRow label="企業" value={company.name} />
                <SummaryRow label="フリーランス" value={`${freelancer.fullName}${freelancer.desiredOccupation ? ` / ${freelancer.desiredOccupation}` : ""}`} />
                <SummaryRow label="連絡先" value={thread.messages.length > 0 ? "このチャットで調整中" : "このチャットで調整開始"} />
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
                  <p className="text-xs font-medium text-stone-500">応募時の提案</p>
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
                    <h2 className="font-semibold">選考・条件の確認</h2>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      面談前に、選考の流れと契約条件を確認できます。
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
                  <h2 className="font-semibold">面談前の準備状況</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    面談前に、双方で揃える情報を確認できます。
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

            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">面談ブリーフ</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    面談前に確認する議題と未決事項を、応募内容と案件条件から整理します。
                  </p>
                </div>
                <StatusBadge tone={meetingBrief.openQuestions.length === 0 ? "good" : "warn"}>
                  {meetingBrief.openQuestions.length === 0 ? "確認済み" : `${meetingBrief.openQuestions.length}件確認`}
                </StatusBadge>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <p className="text-xs font-medium text-stone-500">推奨アジェンダ</p>
                  <div className="mt-2 grid gap-2">
                    {meetingBrief.agenda.map((item, index) => (
                      <BriefItem index={index + 1} key={item} text={item} />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-stone-500">面談で決めること</p>
                  <div className="mt-2 grid gap-2">
                    {meetingBrief.openQuestions.map((question) => (
                      <OpenQuestion key={question} text={question} />
                    ))}
                    {meetingBrief.openQuestions.length === 0 && (
                      <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">
                        主要な条件は揃っています。面談では最終確認と開始手続きに集中できます。
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">面談後の確認</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    面談が終わったあとに、条件確認、判断期限、次の連絡を迷わず進めるための整理です。
                  </p>
                </div>
                <StatusBadge tone={postInterviewPlan.completed === postInterviewPlan.total ? "good" : "warn"}>
                  {postInterviewPlan.completed}/{postInterviewPlan.total}
                </StatusBadge>
              </div>
              <div className="mt-4 grid gap-2">
                {postInterviewPlan.items.map((item) => (
                  <PostInterviewItem detail={item.detail} done={item.done} key={item.label} label={item.label} />
                ))}
              </div>
              <form action={sendInterviewMessage} className="mt-4 grid gap-3">
                <input type="hidden" name="threadId" value={thread.id} />
                <input type="hidden" name="messageType" value="text" />
                <TextArea
                  name="body"
                  label="面談後に送る確認文"
                  defaultValue={postInterviewPlan.followUpMessage}
                  maxLength={1600}
                />
                <button className="btn btn-secondary" type="submit">確認文を送る</button>
              </form>
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">やりとり後のフィードバック</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    {feedbackTarget}とのFlow Link上の面談・調整について、公開集計用の評価と非公開メモを分けて残します。
                  </p>
                </div>
                <StatusBadge tone={feedbackEligible ? "good" : "neutral"}>
                  {existingFeedback ? "送信済み" : feedbackEligible ? "入力可" : "面談後"}
                </StatusBadge>
              </div>
              {feedbackEligible ? (
                <form action={submitInteractionFeedback} className="mt-4 grid gap-4">
                  <input type="hidden" name="threadId" value={thread.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField name="followThroughRating" label="返信・フォロー" defaultValue={existingFeedback?.followThroughRating?.toString() ?? "4"}>
                      <option value="5">5 とても安定していた</option>
                      <option value="4">4 概ね安定していた</option>
                      <option value="3">3 ふつう</option>
                      <option value="2">2 不安があった</option>
                      <option value="1">1 大きな不安があった</option>
                    </SelectField>
                    <SelectField name="collaborationRating" label="協働しやすさ" defaultValue={existingFeedback?.collaborationRating?.toString() ?? "4"}>
                      <option value="5">5 とても進めやすい</option>
                      <option value="4">4 進めやすい</option>
                      <option value="3">3 ふつう</option>
                      <option value="2">2 進めにくい点がある</option>
                      <option value="1">1 大きく進めにくい</option>
                    </SelectField>
                  </div>
                  <label className="flex gap-2 rounded border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-700">
                    <input
                      className="mt-1 size-4 accent-emerald-700"
                      name="interactionCompleted"
                      type="checkbox"
                      defaultChecked={existingFeedback?.interactionCompleted ?? true}
                    />
                    <span>面談または同等のやりとりが実際に完了しました。</span>
                  </label>
                  <SelectField name="wouldWorkAgain" label="今後またやりとりしたいか" defaultValue={existingFeedback?.wouldWorkAgain === true ? "yes" : existingFeedback?.wouldWorkAgain === false ? "no" : ""}>
                    <option value="">未選択</option>
                    <option value="yes">はい</option>
                    <option value="no">いいえ</option>
                  </SelectField>
                  <TextArea
                    name="privateNote"
                    label="非公開メモ"
                    defaultValue={existingFeedback?.privateNote}
                    maxLength={800}
                    placeholder="公開集計には出さない補足。個別の選考理由や個人情報は書かないでください。"
                  />
                  <label className="flex gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                    <input
                      className="mt-1 size-4 accent-amber-700"
                      name="needsModeration"
                      type="checkbox"
                      defaultChecked={existingFeedback?.moderationStatus === "reported"}
                    />
                    <span>公開集計から除外し、Flow Link確認が必要なフィードバックとして扱う。</span>
                  </label>
                  <p className="rounded border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-600">
                    フィードバックは参加者だけが送信できます。送信後14日間は編集できます。面談なしの見送りや応募前の印象は公開評価に使いません。非公開メモ、報告済み、非表示の内容は集計に含まれません。
                  </p>
                  <button className="btn btn-secondary" type="submit">{existingFeedback ? "フィードバックを更新" : "フィードバックを送信"}</button>
                </form>
              ) : (
                <p className="mt-4 rounded border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-600">
                  面談日時が確定したやりとりだけフィードバックできます。見送りのみ、または実際の相互作用がない応募は公開評価に使いません。
                </p>
              )}
            </Card>

            {proposedMessages.length > 0 && thread.status !== "scheduled" && (
              <Card>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">最新の候補日時</h2>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      直近に共有された候補から選ぶと、古い日程との取り違えを防げます。
                    </p>
                  </div>
                  <StatusBadge tone="warn">未確定</StatusBadge>
                </div>
                <div className="mt-3 grid gap-3">
                  {latestProposedOptions.map((message) => (
                    <form action={sendInterviewMessage} className="rounded border border-stone-200 p-3" key={message.id}>
                      <input type="hidden" name="threadId" value={thread.id} />
                      <input type="hidden" name="messageType" value="accepted_time" />
                      <input type="hidden" name="proposedAt" value={message.proposedAt!.toISOString()} />
                      <input type="hidden" name="body" value={`${formatDateTime(message.proposedAt)}で確定します。`} />
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{formatDateTime(message.proposedAt)}</p>
                          <p className="mt-1 text-xs text-stone-500">提案者: {message.sender.email}</p>
                        </div>
                        <StatusBadge tone={message.senderUserId === user.id ? "neutral" : "good"}>
                          {message.senderUserId === user.id ? "送信済み" : "返信する候補"}
                        </StatusBadge>
                      </div>
                      <button className="btn btn-secondary mt-3 w-full" type="submit">この日時で確定</button>
                    </form>
                  ))}
                </div>
                {olderProposedCount > 0 && (
                  <p className="mt-3 rounded border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-600">
                    以前の候補が{olderProposedCount}件あります。必要な場合はチャット履歴で確認できます。
                  </p>
                )}
              </Card>
            )}

            {thread.status !== "scheduled" && (
              <Card>
                <h2 className="font-semibold">候補日時をまとめて提案</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  面談可能な日時を複数出すと、相手がこの画面から選びやすくなります。
                </p>
                <form action={sendInterviewTimeOptions} className="mt-4 grid gap-4">
                  <input type="hidden" name="threadId" value={thread.id} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <TextField name="proposedAt1" label="候補1" type="datetime-local" />
                    <TextField name="proposedAt2" label="候補2" type="datetime-local" />
                    <TextField name="proposedAt3" label="候補3" type="datetime-local" />
                  </div>
                  <TextArea name="body" label="補足" defaultValue={timeOptionNote} maxLength={800} />
                  <button className="btn btn-secondary" type="submit">候補日時を送る</button>
                </form>
              </Card>
            )}

            <Card>
              <h2 className="font-semibold">メッセージを送る</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                応募情報と案件条件から、次に確認すべき内容を下書きしています。
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

function buildInterviewPreparationPlan({
  isCompanySender,
  scheduledAt,
  meetingUrl,
  proposedMessageCount,
  contractTerms,
  selectionFlow,
  proposedStart,
  contactPreference,
  readinessPercent,
  documentCount,
  hasCareerHistory,
  requiredSkillCount,
  matchedSkillCount,
  openQuestions,
}: {
  isCompanySender: boolean;
  scheduledAt: Date | null;
  meetingUrl: string | null;
  proposedMessageCount: number;
  contractTerms: string | null;
  selectionFlow: string | null;
  proposedStart: string | null;
  contactPreference: string | null;
  readinessPercent: number;
  documentCount: number;
  hasCareerHistory: boolean;
  requiredSkillCount: number;
  matchedSkillCount: number;
  openQuestions: string[];
}) {
  const roleText = isCompanySender ? "企業側で先に整える内容を上から確認できます。" : "応募者側で先に整える内容を上から確認できます。";
  const skillDone = requiredSkillCount === 0 || matchedSkillCount > 0;
  const tasks = [
    {
      label: "候補日時",
      detail: scheduledAt
        ? `${formatDateTime(scheduledAt)}で確定済みです。`
        : proposedMessageCount > 0
          ? "届いている候補日時を確認し、確定または別候補を返信してください。"
          : "面談可能な日時を3つほど共有してください。",
      done: Boolean(scheduledAt),
      owner: proposedMessageCount > 0 ? "双方" : isCompanySender ? "企業" : "応募者",
    },
    {
      label: "会議URL",
      detail: meetingUrl
        ? "会議URLは共有済みです。"
        : scheduledAt
          ? "面談日時が決まったため、会議URLを共有してください。"
          : "日程確定後に会議URLを共有してください。",
      done: Boolean(meetingUrl),
      owner: "企業",
    },
    {
      label: "応募者情報",
      detail:
        readinessPercent >= 100
          ? "プロフィール、職務経歴、PDF書類が揃っています。"
          : `応募準備は${readinessPercent}%です。職務経歴とPDF書類を面談前に確認してください。`,
      done: readinessPercent >= 100 && documentCount >= 2 && hasCareerHistory,
      owner: "応募者",
    },
    {
      label: "スキル確認",
      detail:
        requiredSkillCount === 0
          ? "必須スキルは未設定です。職務経歴と応募時の提案から確認してください。"
          : `${matchedSkillCount}/${requiredSkillCount}件の必須スキルがプロフィールと一致しています。`,
      done: skillDone,
      owner: "双方",
    },
    {
      label: "条件確認",
      detail:
        contractTerms && selectionFlow && proposedStart && contactPreference
          ? "契約・支払い条件、選考フロー、開始目安、連絡希望が揃っています。"
          : "契約・支払い条件、選考フロー、開始目安、連絡希望の不足分を面談で確認してください。",
      done: Boolean(contractTerms && selectionFlow && proposedStart && contactPreference),
      owner: "双方",
    },
  ];

  return {
    description: roleText,
    tasks,
    completed: tasks.filter((task) => task.done).length,
    total: tasks.length,
    focusQuestions: openQuestions.slice(0, 3),
  };
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
  agenda,
  openQuestions,
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
  agenda: string[];
  openQuestions: string[];
}) {
  const recipient = isCompanySender ? `${freelancerName}さん` : `${companyName} ご担当者様`;
  const sender = isCompanySender ? companyName : freelancerName;
  const intro = hasMessages
    ? `${jobTitle}の面談調整について、次の確認です。`
    : `${jobTitle}について、面談調整を進めさせてください。`;
  const skillLine =
    matchedSkills.length > 0
      ? `確認済みの一致スキル: ${matchedSkills.slice(0, 5).join("、")}`
      : "確認済みの一致スキル: 面談で職務経歴とあわせて確認";
  const startLine = `稼働開始目安: ${proposedStart || "面談で確認"}`;
  const contactLine = `連絡希望: ${contactPreference || "このチャットで調整"}`;
  const flowLine = `選考フロー: ${selectionFlow || "面談で確認"}`;
  const termsLine = `契約・支払い条件: ${contractTerms || "面談で確認"}`;
  const agendaLines = agenda.slice(0, 4).map((item, index) => `${index + 1}. ${item}`);
  const questionLines = openQuestions.length > 0
    ? openQuestions.slice(0, 4).map((item) => `- ${item}`)
    : ["- 主要条件は共有済みのため、面談で最終確認"];

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
    "面談アジェンダ:",
    ...agendaLines,
    "",
    "面談で決めたいこと:",
    ...questionLines,
    "",
    `次のアクション: ${nextAction}`,
    "",
    "この内容で問題なければ、候補日時または確認したい条件を返信してください。",
    sender,
  ].join("\n");
}

function buildTimeOptionNote({
  isCompanySender,
  jobTitle,
  proposedStart,
  contactPreference,
  openQuestions,
}: {
  isCompanySender: boolean;
  jobTitle: string;
  proposedStart: string | null;
  contactPreference: string | null;
  openQuestions: string[];
}) {
  const requestLine = isCompanySender
    ? "ご都合のよい日時があれば、この画面から確定してください。"
    : "企業側で調整しやすい日時があれば、この画面から確定をお願いします。";
  const questionLine = openQuestions.length > 0
    ? `面談で確認したいこと: ${openQuestions.slice(0, 3).join(" / ")}`
    : "面談で確認したいこと: 役割、条件、開始までの進め方";

  return [
    `${jobTitle}の面談候補です。`,
    `応募時の開始目安: ${proposedStart || "面談で確認"}`,
    `連絡希望: ${contactPreference || "このチャットで調整"}`,
    questionLine,
    requestLine,
  ].join("\n");
}

function buildPostInterviewPlan({
  isCompanySender,
  companyName,
  freelancerName,
  jobTitle,
  scheduledAt,
  meetingUrl,
  selectionFlow,
  contractTerms,
  rate,
  desiredRate,
  workload,
  availability,
  proposedStart,
  contactPreference,
  openQuestions,
}: {
  isCompanySender: boolean;
  companyName: string;
  freelancerName: string;
  jobTitle: string;
  scheduledAt: Date | null;
  meetingUrl: string | null;
  selectionFlow: string | null;
  contractTerms: string | null;
  rate: string | null;
  desiredRate: string | null;
  workload: string | null;
  availability: string | null;
  proposedStart: string | null;
  contactPreference: string | null;
  openQuestions: string[];
}) {
  const items = [
    {
      label: "面談実施条件",
      detail:
        scheduledAt && meetingUrl
          ? `${formatDateTime(scheduledAt)}の面談日時と会議URLが揃っています。`
          : "面談日時と会議URLを揃えてから、面談後の判断に進んでください。",
      done: Boolean(scheduledAt && meetingUrl),
    },
    {
      label: "契約・支払い条件",
      detail: contractTerms || "支払いサイト、請求方法、契約期間、更新条件を面談後に確認してください。",
      done: Boolean(contractTerms),
    },
    {
      label: "報酬・稼働条件",
      detail: `単価: ${rate || desiredRate || "確認が必要"} / 稼働: ${workload || availability || "確認が必要"}`,
      done: Boolean((rate || desiredRate) && (workload || availability)),
    },
    {
      label: "次の判断期限",
      detail: selectionFlow || "面談後いつまでに結果連絡するか、次の確認文で明確にしてください。",
      done: Boolean(selectionFlow),
    },
    {
      label: "企業とのやりとり",
      detail: contactPreference || "面談後の連絡手段と返信目安をこのチャットで確認してください。",
      done: Boolean(contactPreference),
    },
  ];
  const unresolvedItems = items.filter((item) => !item.done).map((item) => item.label);
  const recipient = isCompanySender ? `${freelancerName}さん` : `${companyName} ご担当者様`;
  const sender = isCompanySender ? companyName : freelancerName;
  const decisionLine = isCompanySender
    ? "面談後の判断について、確認したい条件と次の進め方を共有します。"
    : "面談後の検討に向けて、確認したい条件と次の進め方を共有します。";
  const unresolvedLine =
    unresolvedItems.length > 0
      ? unresolvedItems.join("、")
      : "主要条件は揃っています。面談後は最終意思確認と開始手続きに進めます。";
  const questionLines = openQuestions.length > 0
    ? openQuestions.slice(0, 4).map((question) => `- ${question}`)
    : ["- 面談で確認した内容に相違がないか", "- 参画可否の判断期限", "- 開始までに必要な手続き"];

  return {
    items,
    completed: items.filter((item) => item.done).length,
    total: items.length,
    followUpMessage: [
      recipient,
      "",
      `${jobTitle}の面談について、ありがとうございます。`,
      decisionLine,
      "",
      `面談日時: ${scheduledAt ? formatDateTime(scheduledAt) : "未確定"}`,
      `稼働開始目安: ${proposedStart || "面談後に確認"}`,
      `報酬・稼働条件: ${rate || desiredRate || "確認が必要"} / ${workload || availability || "確認が必要"}`,
      `契約・支払い条件: ${contractTerms || "確認が必要"}`,
      `次の判断期限: ${selectionFlow || "面談後に確認"}`,
      "",
      `未確認の項目: ${unresolvedLine}`,
      "面談後に確認したいこと:",
      ...questionLines,
      "",
      "上記を確認したうえで、次に進めるかどうかをこのチャットで共有してください。",
      sender,
    ].join("\n"),
  };
}

function buildMeetingBrief({
  freelancer,
  jobPost,
  companyName,
  matchedSkills,
  proposedStart,
  contactPreference,
  scheduledAt,
  meetingUrl,
}: {
  freelancer: {
    desiredOccupation: string | null;
    desiredRate: string | null;
    availability: string | null;
    availableFrom: string | null;
    remotePreference: string | null;
  };
  jobPost: {
    title: string;
    rate: string | null;
    workload: string | null;
    contractPeriod: string | null;
    selectionFlow: string | null;
    contractTerms: string | null;
    location: string | null;
    remotePolicy: string | null;
  };
  companyName: string;
  matchedSkills: string[];
  proposedStart: string | null;
  contactPreference: string | null;
  scheduledAt: Date | null;
  meetingUrl: string | null;
}) {
  const workingStyle = [jobPost.location, jobPost.remotePolicy].filter(Boolean).join(" / ");
  const agenda = [
    `${companyName}が${jobPost.title}で任せたい役割と成果物を確認`,
    matchedSkills.length > 0
      ? `一致スキル (${matchedSkills.slice(0, 5).join("、")}) と近い実績を確認`
      : "必須スキルと職務経歴の近さを確認",
    `稼働開始と稼働量を確認 (${proposedStart || freelancer.availableFrom || freelancer.availability || "未設定"})`,
    `報酬と契約期間を確認 (${jobPost.rate || freelancer.desiredRate || "単価未設定"} / ${jobPost.contractPeriod || "期間未設定"})`,
  ];

  const openQuestions = [
    !scheduledAt ? "面談日時を確定する" : null,
    scheduledAt && !meetingUrl ? "会議URLを共有する" : null,
    !jobPost.contractTerms ? "支払いサイト、請求方法、契約主体を確認する" : null,
    !jobPost.selectionFlow ? "面談後の判断期限と次ステップを確認する" : null,
    !jobPost.rate && !freelancer.desiredRate ? "報酬レンジを確認する" : null,
    !jobPost.workload && !freelancer.availability ? "週の稼働日数または稼働率を確認する" : null,
    !workingStyle && !freelancer.remotePreference ? "リモート可否、出社頻度、稼働場所を確認する" : null,
    !contactPreference ? "面談後の連絡手段と返信目安を確認する" : null,
  ].filter((item): item is string => Boolean(item));

  return { agenda, openQuestions };
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

function PostInterviewItem({ label, detail, done }: { label: string; detail: string; done: boolean }) {
  return (
    <div
      className={`rounded border px-3 py-2 text-sm ${
        done ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-stone-200 bg-white text-stone-800"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{label}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${done ? "bg-white/80 text-emerald-800" : "bg-stone-100 text-stone-600"}`}>
          {done ? "確認済み" : "面談後に確認"}
        </span>
      </div>
      <p className="mt-1 break-words leading-6 text-stone-600">{detail}</p>
    </div>
  );
}

function PreparationTaskItem({
  label,
  detail,
  done,
  owner,
}: {
  label: string;
  detail: string;
  done: boolean;
  owner: string;
}) {
  return (
    <div
      className={`rounded border px-3 py-2 text-sm ${
        done ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-stone-200 bg-white text-stone-800"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{label}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${done ? "bg-white/80 text-emerald-800" : "bg-stone-100 text-stone-600"}`}>
          {done ? "完了" : owner}
        </span>
      </div>
      <p className="mt-1 leading-6 text-stone-600">{detail}</p>
    </div>
  );
}

function CoordinationStep({ index, label, detail, done }: { index: number; label: string; detail: string; done: boolean }) {
  return (
    <div
      className={`rounded border p-3 text-sm ${
        done ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-stone-200 bg-white text-stone-800"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded bg-white text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
          {index}
        </span>
        <StatusBadge tone={done ? "good" : "warn"}>{done ? "完了" : "未完了"}</StatusBadge>
      </div>
      <p className="mt-3 font-semibold">{label}</p>
      <p className="mt-1 break-words leading-6 text-stone-600">{detail}</p>
    </div>
  );
}

function BriefItem({ index, text }: { index: number; text: string }) {
  return (
    <div className="flex gap-3 rounded border border-stone-200 bg-stone-50 p-3 text-sm">
      <span className="grid size-6 shrink-0 place-items-center rounded bg-emerald-700 text-xs font-semibold text-white">{index}</span>
      <p className="leading-6 text-stone-700">{text}</p>
    </div>
  );
}

function OpenQuestion({ text }: { text: string }) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
      {text}
    </div>
  );
}
