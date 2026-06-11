import { saveCompanyProfile, submitCompanyVerificationRequest } from "@/lib/actions";
import { requireCompanyUser } from "@/lib/page-guards";
import { buildTrustConfidence, COMPANY_VERIFICATION_RENEWAL_DAYS, formatDateTime, latestVerificationRequest, type CompanyVerificationKindText } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, TextField, TextArea, StatusBadge } from "@/components/ui";
import { CompanyVerificationForm } from "./verification-form";

export const dynamic = "force-dynamic";

export default async function CompanyProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ verification?: string }>;
}) {
  const params = await searchParams;
  const { user, companyUser } = await requireCompanyUser({
    include: {
      companyProfile: {
        include: {
          verificationRequests: {
            orderBy: { createdAt: "desc" },
            take: 6,
          },
        },
      },
    },
  });
  const company = companyUser.companyProfile;
  const confidence = buildTrustConfidence({ company, job: {} });
  const companyRequest = latestVerificationRequest(company.verificationRequests, "company_identity");
  const paymentRequest = latestVerificationRequest(company.verificationRequests, "payment_policy");
  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-4xl px-5 py-8">
        <PageHeader title="企業プロフィール" />
        {params.verification === "submitted" && (
          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            確認リクエストを送信しました。確認中の項目は、フリーランス側で「確認リクエスト中」と表示されます。
          </div>
        )}
        {params.verification === "missing-payment-policy-evidence" && (
          <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="alert">
            支払い・契約方針確認リクエストを送信するには、契約条件の根拠、請求・支払い方針の根拠、外部支払い・不審依頼への対応方針を入力してください。
            フリーランスが契約・支払い期待値とFlow Link外の支払いリスクを応募前に判断できるようにするため必要です。
          </div>
        )}
        <Card className="mt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="font-semibold">Flow Link確認ステータス</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                入力内容は自己申告として公開されます。確認済みにするには、Flow Linkへ公開Webサイト、連絡先、契約・支払い方針の根拠を提出してください。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={confidence.tone}>{confidence.label}</StatusBadge>
              <ReviewBadge label="会社情報" reviewedAt={company.flowLinkReviewedCompanyAt} requestStatus={companyRequest?.status} />
              <ReviewBadge label="支払い条件" reviewedAt={company.flowLinkReviewedPaymentAt} requestStatus={paymentRequest?.status} />
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
            <EvidenceItem done={Boolean(company.websiteUrl)} label="公開Webサイト所有" detail="会社名と公開Webサイトが一致していること" />
            <EvidenceItem done={Boolean(company.contactTeam)} label="業務用連絡窓口" detail="担当チーム、契約・面談の連絡責任者が分かること" />
            <EvidenceItem done={Boolean(company.description)} label="会社説明" detail="事業内容、募集背景、案件との関係が説明されていること" />
            <EvidenceItem done={Boolean(company.paymentPolicy)} label="請求・支払い方針" detail="締め日、支払い時期、契約主体、確認窓口が分かること" />
          </div>
          <div className="mt-4 rounded border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-600">
            確認済みの根拠は{COMPANY_VERIFICATION_RENEWAL_DAYS}日を目安に更新確認が必要です。期限切れ、却下、追加根拠が必要な場合は、求人側で「更新確認が必要」または「再提出が必要」として表示されます。
          </div>
          {(company.flowLinkReviewedCompanyScope || company.flowLinkReviewedPaymentScope) && (
            <dl className="mt-4 grid gap-3 rounded border border-stone-200 bg-stone-50 p-3 text-sm">
              <ReviewScope label="確認済み会社情報" value={company.flowLinkReviewedCompanyScope} />
              <ReviewScope label="確認済み支払い条件" value={company.flowLinkReviewedPaymentScope} />
            </dl>
          )}
        </Card>
        <Card className="mt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="font-semibold">フリーランスに表示される信頼状態</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                Flow Link確認済み、確認リクエスト中、自己申告、未記載、期限切れ、再提出が必要、を分けて表示します。支払い保証や法務確認ではありません。
              </p>
            </div>
            <StatusBadge tone={confidence.tone}>信頼スコア {confidence.score}%</StatusBadge>
          </div>
          <div className="mt-4 grid gap-2">
            {confidence.items.slice(0, 3).map((item) => (
              <FreelancerPreviewItem detail={item.detail} key={item.label} label={item.label} status={item.status} />
            ))}
          </div>
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            外部支払い、Flow Link外の請求誘導、根拠書類と求人内容の不一致が報告された場合は安全確認の対象になります。確認中または危険と判断された会社の案件では、影響を受けるフリーランスへ状況説明と次の確認事項を案内します。
          </div>
        </Card>
        <Card className="mt-6">
          <h2 className="font-semibold">確認リクエストを送信</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            会社実在性と支払い・契約方針は別々に確認されます。支払い・契約方針の確認には、契約条件、請求・支払いの根拠、外部支払い依頼への対応方針が必要です。
          </p>
          <CompanyVerificationForm
            action={submitCompanyVerificationRequest}
            defaultContactEvidence={company.contactTeam}
            defaultKind={params.verification === "missing-payment-policy-evidence" ? "payment_policy" : "company_identity"}
            defaultPaymentEvidence={company.paymentPolicy}
            defaultPublicEvidenceUrl={company.websiteUrl}
          />
        </Card>
        {company.verificationRequests.length > 0 && (
          <Card className="mt-6">
            <h2 className="font-semibold">確認リクエスト履歴</h2>
            <div className="mt-4 grid gap-3">
              {company.verificationRequests.map((request) => (
                <RequestHistoryItem key={request.id} request={request} />
              ))}
            </div>
          </Card>
        )}
        <Card className="mt-6">
          <form action={saveCompanyProfile} className="grid gap-4">
            <TextField name="name" label="企業名" defaultValue={company.name} required />
            <TextArea
              name="description"
              label="会社情報"
              defaultValue={company.description}
              placeholder="事業内容、主要サービス、案件を募集している背景"
            />
            <TextField name="websiteUrl" label="公開Webサイト" defaultValue={company.websiteUrl} />
            <TextArea
              name="contactTeam"
              label="担当チーム・連絡窓口"
              defaultValue={company.contactTeam}
              maxLength={600}
              placeholder="例: 開発部の業務委託採用担当が、面談調整と契約条件の確認を行います"
            />
            <TextField
              name="operatingArea"
              label="所在地・稼働エリア"
              defaultValue={company.operatingArea}
              maxLength={240}
              placeholder="例: 東京都 / 全国リモート"
            />
            <TextArea
              name="paymentPolicy"
              label="請求・支払い方針"
              defaultValue={company.paymentPolicy}
              maxLength={600}
              placeholder="例: 月末締め翌月末払い。契約条件は面談後に個別確認します"
            />
            <div className="rounded border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-600">
              保存した内容は応募前の「応募前に確認できる情報」に自己申告として表示されます。Flow Link確認済みの表示は、公開Webサイト、業務用連絡窓口、請求・支払い方針などの根拠確認後に別ステータスとして表示されます。
            </div>
            <button className="btn btn-primary" type="submit">保存</button>
          </form>
        </Card>
      </div>
    </Shell>
  );
}

function ReviewBadge({ label, requestStatus, reviewedAt }: { label: string; requestStatus?: string | null; reviewedAt?: Date | null }) {
  const pending = requestStatus === "submitted";
  return (
    <span
      className={`rounded border px-2 py-1 text-xs font-medium ${
        reviewedAt
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : pending
            ? "border-stone-200 bg-stone-50 text-stone-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {label}: {reviewedAt ? "確認済み" : pending ? "確認中" : "未着手"}
    </span>
  );
}

function EvidenceItem({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className={`rounded border px-3 py-2 ${done ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-stone-900">{label}</p>
        <span className="text-xs font-semibold text-stone-600">{done ? "入力済み" : "要入力"}</span>
      </div>
      <p className="mt-1 leading-6 text-stone-600">{detail}</p>
    </div>
  );
}

function ReviewScope({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap leading-6 text-stone-700">{value}</dd>
    </div>
  );
}

function FreelancerPreviewItem({
  detail,
  label,
  status,
}: {
  detail: string;
  label: string;
  status: "confirmed" | "pending" | "selfReported" | "missing" | "stale" | "rejected";
}) {
  const statusLabels = {
    confirmed: "Flow Link確認済み",
    pending: "確認リクエスト中",
    selfReported: "自己申告",
    missing: "未記載",
    stale: "更新確認が必要",
    rejected: "再提出が必要",
  };
  const statusClasses = {
    confirmed: "border-emerald-200 bg-emerald-50 text-emerald-900",
    pending: "border-stone-200 bg-stone-50 text-stone-800",
    selfReported: "border-stone-200 bg-stone-50 text-stone-800",
    missing: "border-amber-200 bg-amber-50 text-amber-900",
    stale: "border-amber-200 bg-amber-50 text-amber-900",
    rejected: "border-red-200 bg-red-50 text-red-900",
  };
  return (
    <div className={`rounded border px-3 py-2 text-sm ${statusClasses[status]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-stone-900">{label}</p>
        <span className="text-right text-xs font-semibold">{statusLabels[status]}</span>
      </div>
      <p className="mt-1 leading-6 text-stone-600">{detail}</p>
    </div>
  );
}

function RequestHistoryItem({
  request,
}: {
  request: {
    kind: CompanyVerificationKindText;
    status: string;
    evidenceSummary: string;
    reasonCode?: string | null;
    reviewedAt?: Date | null;
    expiresAt?: Date | null;
    createdAt: Date;
  };
}) {
  const kindLabels = {
    company_identity: "会社情報・公開Web確認",
    payment_policy: "支払い・契約方針確認",
  };
  const statusLabels: Record<string, string> = {
    submitted: "提出済み",
    confirmed: "確認済み",
    rejected: "再提出が必要",
    needs_renewal: "更新確認が必要",
  };
  const tone = request.status === "confirmed" ? "good" : request.status === "rejected" ? "bad" : request.status === "needs_renewal" ? "warn" : "neutral";
  return (
    <div className="rounded border border-stone-200 bg-stone-50 p-3 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold">{kindLabels[request.kind]}</p>
        <StatusBadge tone={tone}>{statusLabels[request.status] ?? request.status}</StatusBadge>
      </div>
      <p className="mt-2 leading-6 text-stone-600">{request.evidenceSummary}</p>
      <dl className="mt-2 grid gap-2 text-xs text-stone-500 sm:grid-cols-3">
        <div>提出: {formatDateTime(request.createdAt)}</div>
        <div>確認: {formatDateTime(request.reviewedAt)}</div>
        <div>期限: {formatDateTime(request.expiresAt)}</div>
      </dl>
      {request.reasonCode && <p className="mt-2 text-xs font-medium text-amber-800">理由コード: {request.reasonCode}</p>}
    </div>
  );
}
