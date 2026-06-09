import { saveCompanyProfile } from "@/lib/actions";
import { requireCompanyUser } from "@/lib/page-guards";
import { Shell, TopNav, PageHeader, Card, TextField, TextArea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CompanyProfilePage() {
  const { user, companyUser } = await requireCompanyUser({ include: { companyProfile: true } });
  const company = companyUser.companyProfile;
  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-4xl px-5 py-8">
        <PageHeader title="企業プロフィール" />
        <Card className="mt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="font-semibold">Flow Link確認ステータス</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                入力内容は自己申告として公開されます。確認済みにするには、Flow Linkが公開Webサイト、連絡先、契約・支払い方針の根拠を別途確認します。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ReviewBadge label="会社情報" reviewedAt={company.flowLinkReviewedCompanyAt} />
              <ReviewBadge label="支払い条件" reviewedAt={company.flowLinkReviewedPaymentAt} />
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
            <EvidenceItem done={Boolean(company.websiteUrl)} label="公開Webサイト所有" detail="会社名と公開Webサイトが一致していること" />
            <EvidenceItem done={Boolean(company.contactTeam)} label="業務用連絡窓口" detail="担当チーム、契約・面談の連絡責任者が分かること" />
            <EvidenceItem done={Boolean(company.description)} label="会社説明" detail="事業内容、募集背景、案件との関係が説明されていること" />
            <EvidenceItem done={Boolean(company.paymentPolicy)} label="請求・支払い方針" detail="締め日、支払い時期、契約主体、確認窓口が分かること" />
          </div>
          {(company.flowLinkReviewedCompanyScope || company.flowLinkReviewedPaymentScope) && (
            <dl className="mt-4 grid gap-3 rounded border border-stone-200 bg-stone-50 p-3 text-sm">
              <ReviewScope label="確認済み会社情報" value={company.flowLinkReviewedCompanyScope} />
              <ReviewScope label="確認済み支払い条件" value={company.flowLinkReviewedPaymentScope} />
            </dl>
          )}
        </Card>
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

function ReviewBadge({ label, reviewedAt }: { label: string; reviewedAt?: Date | null }) {
  return (
    <span
      className={`rounded border px-2 py-1 text-xs font-medium ${
        reviewedAt ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {label}: {reviewedAt ? "確認済み" : "未確認"}
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
