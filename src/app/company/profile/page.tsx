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
              入力した内容は応募前の「応募前に確認できる情報」に表示されます。Flow Linkが企業や支払いを確認済みであることを示すものではありません。
            </div>
            <button className="btn btn-primary" type="submit">保存</button>
          </form>
        </Card>
      </div>
    </Shell>
  );
}
